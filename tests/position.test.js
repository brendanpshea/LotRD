// tests/position.test.js — carrying a half-finished set between devices.
//
// Students play on a phone, a classroom machine and a laptop, and the full save
// (every question object, HP, inventory) is far too big to leave the browser. A
// "position" is the portable residue of a run: question NUMBERS for what remains
// and what was missed, plus the tally. These tests cover the three places that
// can go wrong: the encoding, rebuilding a run from it, and deciding when a
// position from elsewhere should beat this browser's own save.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { GameController } from '../src/controller.js';
import { GameModel } from '../src/model.js';
import {
  encodeIndexList, decodeIndexList, questionSetFingerprint, levelAhead,
} from '../src/util.js';

const MONSTERS = [
  { monster_name: 'Test Slime', hit_dice: 1, attack_die: 4, defense: 0, image: 'slime.png' },
];

/** Ten MC questions with an NPC scene in front, like an authored set. */
function questionSet() {
  const qs = [{ type: 'npc_demo', question: 'A mentor explains.', npc: 'ada', lines: ['Hello.'] }];
  for (let i = 1; i <= 10; i++) {
    qs.push({ question: `Question ${i}?`, correct: ['A'], incorrect: ['B', 'C'] });
  }
  return qs;
}

/** Answer the question in play; combat is neutralised so only the queue matters. */
function answer(gm, right) {
  if (gm.current_monster) {
    gm.current_monster.hit_points = 999;
    gm.current_monster.defense = 0;
  }
  gm.player.hit_points = 999;
  gm.evaluateAnswer([right ? 'A' : 'B']);
}

/** Advance through `plan` (true = right, false = wrong), skipping NPC scenes. */
function play(gm, plan) {
  for (const right of plan) {
    gm.nextEncounter();
    while (gm.current_question?.type === 'npc_demo') {
      gm.current_question = null;
      gm.nextEncounter();
    }
    answer(gm, right);
  }
}

function fakeStorage(initial = {}) {
  return {
    _d: { ...initial },
    getItem(k) { return k in this._d ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
  };
}

function useStorage(store) {
  Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true, writable: true });
}

/** A controller off the prototype, wired for saving and resuming only. */
function stubController(setId, questions, model = null) {
  const c = Object.create(GameController.prototype);
  c._setName = setId;
  c._setFingerprint = questionSetFingerprint(questions);
  c._isReview = false;
  c._storageState = 'ok';
  c._renderStorageWarning = () => {};
  c.model = model;
  return c;
}

// ────────────────────────────────────────────────────────────────────────────────
describe('index list encoding', () => {
  it('collapses the long tail of a run in authored order', () => {
    const remaining = [...Array(38).keys()].map(i => i + 12).concat([3, 7]);
    assert.equal(encodeIndexList(remaining), '12-49,3,7');
  });

  it('round-trips order and repeats exactly', () => {
    for (const list of [[], [0], [4, 5], [4, 5, 6], [9, 2, 3, 4, 2, 10, 11], [0, 1, 2, 0, 1, 2]]) {
      assert.deepEqual(decodeIndexList(encodeIndexList(list), 50), list);
    }
  });

  it('rejects anything it does not fully understand', () => {
    // This arrives from another device by way of the LMS. A half-parsed list
    // would resume the student somewhere arbitrary, so it is all or nothing.
    for (const bad of ['1,,2', '5-3', 'abc', '1-', '-4', '3,50', '1.5', ' 1', null, undefined, 12]) {
      assert.equal(decodeIndexList(bad, 50), null, `accepted ${JSON.stringify(bad)}`);
    }
  });

  it('rejects a list no real run could have produced', () => {
    const absurd = Array(300).fill('0-9').join(',');
    assert.equal(decodeIndexList(absurd, 10), null);
  });
});

describe('question set fingerprint', () => {
  it('is stable for the same questions', () => {
    assert.equal(questionSetFingerprint(questionSet()), questionSetFingerprint(questionSet()));
  });

  it('changes when questions are added, dropped, reordered or reworded', () => {
    const base = questionSetFingerprint(questionSet());
    const added = questionSet().concat([{ question: 'New?', correct: ['A'], incorrect: ['B'] }]);
    const dropped = questionSet().slice(0, -1);
    const reordered = questionSet(); [reordered[2], reordered[3]] = [reordered[3], reordered[2]];
    const reworded = questionSet(); reworded[4] = { ...reworded[4], question: 'Different?' };
    for (const [name, qs] of Object.entries({ added, dropped, reordered, reworded })) {
      assert.notEqual(questionSetFingerprint(qs), base, name);
    }
  });
});

describe('levelAhead', () => {
  it('compares level first, then XP within the level', () => {
    assert.ok(levelAhead({ level: 3, xp: 0 }, { level: 2, xp: 900 }));
    assert.ok(levelAhead({ level: 3, xp: 40 }, { level: 3, xp: 10 }));
    assert.ok(!levelAhead({ level: 3, xp: 10 }, { level: 3, xp: 10 }));
    assert.ok(!levelAhead(null, { level: 1, xp: 0 }));
    assert.ok(levelAhead({ level: 1, xp: 5 }, null));
  });
});

// ────────────────────────────────────────────────────────────────────────────────
describe('a run rebuilt from its position', () => {
  it('picks up at the same question, with the same requeues ahead', () => {
    const phone = new GameModel(questionSet(), MONSTERS, null, null, { sequential: true });
    play(phone, [true, false, true, true]);           // Q2 missed → requeued 3 ahead
    const pos = phone.toPosition();

    const laptop = new GameModel(questionSet(), MONSTERS, null, null, { sequential: true, position: pos });
    assert.deepEqual(
      laptop.questions_to_ask.map(q => q.question),
      phone.questions_to_ask.map(q => q.question));
    assert.ok(laptop.questions_to_ask.some(q => q.question === 'Question 2?'), 'the requeue came along');
  });

  it('includes the question on screen when the student walked away', () => {
    // saveGame runs with a question in flight; it has already left the queue.
    const phone = new GameModel(questionSet(), MONSTERS, null, null, { sequential: true });
    play(phone, [true, true]);
    phone.nextEncounter();
    const inFlight = phone.current_question.question;
    const pos = phone.toPosition();
    const laptop = new GameModel(questionSet(), MONSTERS, null, null, { sequential: true, position: pos });
    assert.equal(laptop.questions_to_ask[0].question, inFlight);
  });

  it('keeps the misses, so the retrieval boss still has its questions', () => {
    const phone = new GameModel(questionSet(), MONSTERS, null, null, { sequential: true });
    play(phone, [false, true, false, true, true]);    // Q1 and Q3 missed
    const laptop = new GameModel(questionSet(), MONSTERS, null, null,
      { sequential: true, position: phone.toPosition() });

    const boss = laptop._buildBossQueue().map(q => q.question).sort();
    assert.deepEqual(boss, ['Question 1?', 'Question 3?']);
  });

  it('carries the tally, and does not re-count carried answers as new stats', () => {
    const phone = new GameModel(questionSet(), MONSTERS, null, null, { sequential: true });
    play(phone, [true, false, true]);
    const laptop = new GameModel(questionSet(), MONSTERS, null, null,
      { sequential: true, position: phone.toPosition() });

    assert.equal(laptop.player.total_correct, phone.player.total_correct);
    assert.equal(laptop.player.total_incorrect, phone.player.total_incorrect);
    assert.equal(laptop.stats_offset, laptop.answer_history.length,
      'lifetime stats were already counted on the phone');
    assert.ok(laptop.answer_history.every(h => h.carried));
  });

  it('can be finished, and finishing it is a real victory', () => {
    const phone = new GameModel(questionSet(), MONSTERS, null, null, { sequential: true });
    play(phone, Array(7).fill(true));
    const laptop = new GameModel(questionSet(), MONSTERS, null, null,
      { sequential: true, position: phone.toPosition() });
    play(laptop, Array(3).fill(true));
    laptop.current_monster.hit_points = 0;
    assert.equal(laptop.nextEncounter(), 'victory');
  });

  it('survives a second hop: phone → laptop → classroom', () => {
    const phone = new GameModel(questionSet(), MONSTERS, null, null, { sequential: true });
    play(phone, [true, false, true]);
    const laptop = new GameModel(questionSet(), MONSTERS, null, null,
      { sequential: true, position: phone.toPosition() });
    play(laptop, [true, true]);
    const classroom = new GameModel(questionSet(), MONSTERS, null, null,
      { sequential: true, position: laptop.toPosition() });

    assert.deepEqual(
      classroom.questions_to_ask.map(q => q.question),
      laptop.questions_to_ask.map(q => q.question));
    assert.deepEqual(classroom._buildBossQueue().map(q => q.question), ['Question 2?']);
  });

  it('still works from a save written before questions were numbered', () => {
    const old = new GameModel(questionSet(), MONSTERS, null, null, { sequential: true });
    play(old, [true, true]);
    const save = JSON.parse(JSON.stringify(old.toSaveData()));
    for (const q of [...save.questions, ...save.questions_to_ask]) delete q.source_index;

    const resumed = new GameModel(questionSet(), MONSTERS, save);
    assert.deepEqual(resumed.toPosition().remaining, old.toPosition().remaining);
  });

  it('has no position once nothing remains and nothing was missed', () => {
    const gm = new GameModel(questionSet(), MONSTERS, null, null, { sequential: true });
    play(gm, Array(10).fill(true));
    // A record like this, resumed elsewhere, would be an instant free victory.
    assert.equal(gm.toPosition(), null);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
describe('choosing what to resume from', () => {
  const SET = 'set_01.json';
  let store;
  beforeEach(() => { store = fakeStorage(); useStorage(store); });

  /** Play `plan` on a fresh "device", save, and return what it left in storage. */
  function playAndSave(plan, atMs) {
    const gm = new GameModel(questionSet(), MONSTERS, null, null, { sequential: true });
    play(gm, plan);
    gm.nextEncounter();
    const RealDate = Date;
    globalThis.Date = class extends RealDate {
      constructor(...a) { super(...(a.length ? a : [atMs])); }
      static now() { return atMs; }
    };
    try { stubController(SET, questionSet(), gm).saveGame(); } finally { globalThis.Date = RealDate; }
    return gm;
  }

  it('writes a position beside every save, small enough to travel', () => {
    playAndSave([true, false, true], Date.parse('2026-09-17T10:00:00Z'));
    const pos = store.getItem(`lotrd_pos_${SET}`);
    assert.ok(pos, 'no position written');
    assert.ok(pos.length < 120, `position is ${pos.length} chars`);
    assert.ok(store.getItem(`lotrd_save_${SET}`).length > pos.length * 10);
  });

  it('prefers this browser\'s own save when the position is not newer', () => {
    // Same device: the full save still has HP, inventory and the monster.
    const gm = playAndSave([true, true], Date.parse('2026-09-17T10:00:00Z'));
    gm.player.hit_points = 7;
    stubController(SET, questionSet(), gm).saveGame();

    const resumed = stubController(SET, questionSet())._buildResumedModel(SET, questionSet(), MONSTERS);
    assert.equal(resumed.player.hit_points, 7);
  });

  it('prefers a newer position from another device over a stale local save', () => {
    // Laptop stopped after 2 questions on Monday…
    playAndSave([true, true], Date.parse('2026-09-14T10:00:00Z'));
    // …the phone got to 6 on Wednesday, and the shim restored its position here.
    const laptopSave = store.getItem(`lotrd_save_${SET}`);
    const phoneStore = fakeStorage(); useStorage(phoneStore);
    playAndSave([true, true, true, true, true, true], Date.parse('2026-09-16T10:00:00Z'));
    const phonePos = phoneStore.getItem(`lotrd_pos_${SET}`);

    useStorage(store);
    store.setItem(`lotrd_save_${SET}`, laptopSave);
    store.setItem(`lotrd_pos_${SET}`, phonePos);

    const resumed = stubController(SET, questionSet())._buildResumedModel(SET, questionSet(), MONSTERS);
    assert.equal(resumed.questions_to_ask[0].question, 'Question 7?');
  });

  it('resumes from a position alone, on a device that has never seen the set', () => {
    playAndSave([true, true, true], Date.parse('2026-09-16T10:00:00Z'));
    store.removeItem(`lotrd_save_${SET}`);
    const resumed = stubController(SET, questionSet())._buildResumedModel(SET, questionSet(), MONSTERS);
    assert.equal(resumed.questions_to_ask[0].question, 'Question 4?');
  });

  it('ignores a position taken from a different version of the set', () => {
    playAndSave([true, true, true], Date.parse('2026-09-16T10:00:00Z'));
    store.removeItem(`lotrd_save_${SET}`);
    // The instructor has since inserted a question; the numbers no longer line up.
    const revised = questionSet();
    revised.splice(3, 0, { question: 'Inserted?', correct: ['A'], incorrect: ['B'] });
    const resumed = stubController(SET, revised)._buildResumedModel(SET, revised, MONSTERS);
    assert.equal(resumed, null, 'must start the set fresh rather than resume somewhere arbitrary');
  });

  it('falls back to the local save when a newer position cannot be used', () => {
    playAndSave([true, true], Date.parse('2026-09-14T10:00:00Z'));
    const pos = JSON.parse(store.getItem(`lotrd_pos_${SET}`));
    store.setItem(`lotrd_pos_${SET}`, JSON.stringify({ ...pos, r: '3-999', t: pos.t + 86400 }));
    const resumed = stubController(SET, questionSet())._buildResumedModel(SET, questionSet(), MONSTERS);
    assert.equal(resumed.questions_to_ask[0].question, 'Question 3?');
  });

  it('can resume a run that was left during the retrieval boss', () => {
    // The question queue is empty by then, which used to read as "nothing to
    // resume" — on the same device as much as across devices.
    const gm = new GameModel(questionSet(), MONSTERS, null, null, { sequential: true });
    play(gm, [false, false, ...Array(10).fill(true)]);   // Q1, Q2 missed, then all cleared
    assert.equal(gm.nextEncounter(), 'boss_start');
    const c = stubController(SET, questionSet(), gm);
    c.saveGame();

    const sameDevice = stubController(SET, questionSet())._buildResumedModel(SET, questionSet(), MONSTERS);
    assert.ok(sameDevice?.boss_phase, 'local boss save was not resumable');

    store.removeItem(`lotrd_save_${SET}`);             // …and on a device with only the position
    const elsewhere = stubController(SET, questionSet())._buildResumedModel(SET, questionSet(), MONSTERS);
    assert.equal(elsewhere.questions_to_ask.length, 0);
    assert.equal(elsewhere.nextEncounter(), 'boss_start', 'the dragon is faced again from the start');
    assert.equal(elsewhere.boss_queue.length + 1, 2);
  });

  it('does not purge a just-restored position on a browser\'s first visit', () => {
    // Found in a real browser: a new device has no save-version key, so the
    // version check purges in-progress keys at startup — right after the SCORM
    // shim has put the position there. The next sync then erased it from the
    // LMS too, so the set could never be picked up anywhere.
    const iterable = {
      ...fakeStorage({
        [`lotrd_pos_${SET}`]: '{"h":"x","r":"3-9","m":"","c":3,"w":0,"t":1}',
        [`lotrd_save_${SET}`]: '{"stale":true}',
      }),
      get length() { return Object.keys(this._d).length; },
      key(i) { return Object.keys(this._d)[i] ?? null; },
    };
    useStorage(iterable);
    stubController(SET, questionSet())._applySaveDataVersion();
    assert.ok(iterable.getItem(`lotrd_pos_${SET}`), 'position was purged');
    assert.equal(iterable.getItem(`lotrd_save_${SET}`), null, 'old full saves are still purged');
  });

  it('removes the position when the run ends', () => {
    const gm = playAndSave([true], Date.parse('2026-09-16T10:00:00Z'));
    stubController(SET, questionSet(), gm)._clearSave();
    assert.equal(store.getItem(`lotrd_pos_${SET}`), null);
  });

  it('does not let an old save drag a synced level back down', () => {
    // Saved at level 1; since then the player reached level 4 elsewhere.
    playAndSave([true, true], Date.parse('2026-09-14T10:00:00Z'));
    store.setItem('lotrd_player_level', JSON.stringify({ level: 4, xp: 30, revive_charges: 2 }));
    const resumed = stubController(SET, questionSet())._buildResumedModel(SET, questionSet(), MONSTERS);
    assert.equal(resumed.player.level, 4);
    assert.equal(resumed.player.xp, 30);
    assert.equal(resumed.player.max_hit_points, 26);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
describe('a session cut off without warning', () => {
  const SET = 'set_01.json';
  let store;
  beforeEach(() => { store = fakeStorage(); useStorage(store); });

  /** Answer the question in play through the controller, as a click would. */
  function submit(c, right) {
    c.ui = { showResults() {}, showFeedbackInline() {}, refreshHUD() {} };   // results screen never dismissed
    c.sounds = { correct() {}, incorrect() {}, monsterDefeated() {}, streakHit() {} };
    c.model.current_monster.hit_points = 999;
    c.model.current_monster.defense = 0;
    c.model.player.hit_points = 999;
    c.submitAnswer([right ? 'A' : 'B']);
  }

  function startedRun() {
    const gm = new GameModel(questionSet(), MONSTERS, null, null, { sequential: true });
    const c = stubController(SET, questionSet(), gm);
    gm.nextEncounter();                       // the NPC scene
    gm.current_question = null;
    gm.nextEncounter();                       // Question 1
    c.saveGame();
    return c;
  }

  it('keeps an answer even if the student never gets past the results screen', () => {
    // The longest pause in the loop is reading feedback. The save used to wait
    // for the Continue click after it.
    const c = startedRun();
    submit(c, true);
    const resumed = stubController(SET, questionSet())._buildResumedModel(SET, questionSet(), MONSTERS);
    assert.equal(resumed.questions_to_ask[0].question, 'Question 2?');
    assert.equal(resumed.player.total_correct, 1);
  });

  it('keeps a miss, and its requeue, the same way', () => {
    const c = startedRun();
    submit(c, false);
    const resumed = stubController(SET, questionSet())._buildResumedModel(SET, questionSet(), MONSTERS);
    assert.equal(resumed.questions_to_ask[0].question, 'Question 2?');
    assert.ok(resumed.questions_to_ask.some(q => q.question === 'Question 1?'));
    assert.equal(JSON.parse(store.getItem(`lotrd_pos_${SET}`)).m, '1');
  });

  it('does not strand the run when the cut-off comes after the very last answer', () => {
    // Nothing is queued once the last question is answered, and a save with
    // nothing queued reads as nothing to resume — the set would show as merely
    // "attempted" and all fifty questions would be owed again.
    const gm = new GameModel(questionSet(), MONSTERS, null, null, { sequential: true });
    play(gm, Array(9).fill(true));
    const c = stubController(SET, questionSet(), gm);
    gm.nextEncounter();                       // Question 10, the last
    c.saveGame();
    submit(c, true);

    const resumed = stubController(SET, questionSet())._buildResumedModel(SET, questionSet(), MONSTERS);
    assert.ok(resumed, 'the run could not be resumed at all');
    assert.equal(resumed.questions_to_ask[0].question, 'Question 10?');
  });

  it('pushes to the LMS at every save point rather than waiting for the next poll', () => {
    let pokes = 0;
    globalThis.window = { LotrdScorm: { forceReport: () => { pokes++; } } };
    try {
      const c = startedRun();
      assert.ok(pokes >= 1, 'saving did not poke the shim');
      const before = pokes;
      submit(c, true);
      assert.ok(pokes > before, 'answering did not poke the shim');
    } finally { delete globalThis.window; }
  });

  it('is unbothered by a shim that throws', () => {
    globalThis.window = { LotrdScorm: { forceReport: () => { throw new Error('LMS exploded'); } } };
    try { assert.doesNotThrow(() => startedRun()); } finally { delete globalThis.window; }
  });
});
