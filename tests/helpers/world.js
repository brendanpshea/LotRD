// tests/helpers/world.js — a student, several devices, one LMS.
//
// The data-loss tests need the REAL game and the REAL shim working together,
// because the bugs that lose students' work live in the seam between them: the
// shim tests used to hand-write the records the game was supposed to produce,
// the game tests stubbed the shim, and a change to either side could break the
// pair while both suites stayed green.
//
// Here nothing in that seam is faked. A Device is a browser profile (its own
// localStorage). Launching one boots the real shim against the shared fake LMS,
// exactly as opening the activity in D2L would, and hands back a Session in
// which the real GameController plays real runs — saving, completing, recording
// ranks — through the same code paths a click takes. Only the DOM-facing edges
// (rendering, sound, the dragon's one-liners) are stubbed.
import { GameController } from '../../src/controller.js';
import { GameModel } from '../../src/model.js';
import { questionSetFingerprint, nextTierInfo } from '../../src/util.js';
import { boot, makeStorage, setId, SET_COUNT } from './scorm-sandbox.js';

export { setId, SET_COUNT };

const MONSTERS = [
  { monster_name: 'Test Slime', hit_dice: 1, attack_die: 4, defense: 0, image: 'slime.png' },
];

export const QUESTIONS_PER_SET = 6;

/** A small authored set: a teaching scene, then multiple-choice questions. */
export function questionsFor(id) {
  const qs = [{ type: 'npc_demo', question: `${id}: a mentor explains.`, npc: 'ada', lines: ['Hello.'] }];
  for (let i = 1; i <= QUESTIONS_PER_SET; i++) {
    qs.push({ question: `${id} — question ${i}?`, correct: ['A'], incorrect: ['B', 'C'] });
  }
  return qs;
}

const noop = () => {};
const silent = new Proxy({}, { get: () => noop });

/** Let the shim's async start (its catalog fetch) finish. */
// (setImmediate, not setTimeout: nothing here waits on a clock, and Windows rounds
// every timeout up to ~15 ms, which the random walk would pay a thousand times.)
const drain = async () => { for (let i = 0; i < 4; i++) await new Promise(r => setImmediate(r)); };

/** The LMS: one student's record, shared by every device they use, and fallible. */
export class Lms {
  /**
   * @param {{single?: string, student?: string}} options – `single`: this activity
   *   is a single-set package for that set. `student`: who is logged in to D2L.
   */
  constructor({ single = null, student = 'student-1' } = {}) {
    this.store = {};
    this.control = {};
    this.single = single;
    this.student = student;
    this.store['cmi.core.student_id'] = student;
  }
  goDown() { this.control.down = true; }
  comeBack() { this.control.down = false; }
  /** A republished package: the LMS hands the student a clean attempt. Still them. */
  startFreshAttempt() {
    for (const k of Object.keys(this.store)) delete this.store[k];
    this.store['cmi.core.student_id'] = this.student;
  }

  get score() {
    const n = parseInt(this.store['cmi.core.score.raw'], 10);
    return Number.isFinite(n) ? n : 0;
  }
  get data() {
    try { return JSON.parse(this.store['cmi.suspend_data'] || '{}'); } catch (_) { return {}; }
  }
  /** Map of set id → rank, as the LMS knows it. */
  get ranks() {
    const out = {};
    for (const row of this.data.sets || []) out[row[0]] = row[1];
    return out;
  }
  positionOf(id) { return (this.data.pos || []).find(row => row[0] === id) || null; }
}

/** One browser profile. Its storage survives launches until something wipes it. */
export class Device {
  constructor(lms, name = 'device') {
    this.lms = lms;
    this.name = name;
    this.storage = makeStorage();
  }

  /** Safari closing, a classroom machine resetting its profile, "clear site data". */
  wipeStorage() { this.storage.clear(); }

  /** The same browser, with a different student logged in to D2L: a lab or library PC. */
  usedBy(lms, name = this.name) {
    const other = new Device(lms, name);
    other.storage = this.storage;
    return other;
  }

  /** Open the activity from D2L. */
  async launch() {
    const sandbox = boot({ lmsStore: this.lms.store, control: this.lms.control, storage: this.storage, readyState: 'loading', single: this.lms.single });
    const session = new Session(this, sandbox);
    // Same order as the page: the shim script is evaluated, THEN the game starts
    // (its constructor runs the save-version housekeeping), THEN DOMContentLoaded.
    session.use();
    Object.create(GameController.prototype)._applySaveDataVersion();
    // The game draws its first menu from whatever storage holds at about this
    // point — it does not wait for the shim's own asynchronous start. Anything
    // restored later than this is, to the student, a menu full of lost sets.
    session.storageAtStartup = makeStorage(this.storage._d);
    sandbox.fire('doc:DOMContentLoaded');
    await drain();
    return session;
  }
}

/** One visit: from opening the activity to the tab going away. */
export class Session {
  constructor(device, sandbox) {
    this.device = device;
    this.sandbox = sandbox;
    this.controller = null;
    this.lastStatus = null;
    this._continue = null;
  }

  /** Point the game's globals at this session's browser. Every action does this,
   *  so several devices can be alive in one test. */
  use() {
    Object.defineProperty(globalThis, 'localStorage', { value: this.device.storage, configurable: true, writable: true });
    globalThis.window = { LotrdScorm: this.sandbox.shim(), addEventListener: noop };
  }

  /** The shim's 3-second poll. */
  tick() { this.use(); this.sandbox.shim().forceReport(); }
  async settle() { await drain(); this.tick(); await drain(); }

  get syncState() { return this.sandbox.shim().syncState(); }
  get banner() { return this.sandbox.banner()?.textContent ?? ''; }

  /** What the main menu would show for a set. */
  menu(id) {
    this.use();
    return Object.create(GameController.prototype)._describeEntry({ id });
  }

  /** What the FIRST menu of this visit showed — the one drawn as the page loads. */
  menuAtStartup(id) {
    Object.defineProperty(globalThis, 'localStorage', { value: this.storageAtStartup, configurable: true, writable: true });
    try { return Object.create(GameController.prototype)._describeEntry({ id }); }
    finally { this.use(); }
  }

  _newController(id, { trial = null } = {}) {
    const c = Object.create(GameController.prototype);
    const questions = questionsFor(id);
    this.lastStatus = null;
    this._continue = null;
    Object.assign(c, {
      _setName: id, _setFingerprint: questionSetFingerprint(questions),
      _isReview: !!trial, _trialSetId: trial ? id : null, _trialTier: trial,
      _sharpenReviewId: null, _missRecordId: id, _storageState: 'ok',
      _renderStorageWarning: noop, _setInGame: noop, _renderEncounter: noop,
      _showWithDragon: render => render(null), showMainMenu: noop,
      sounds: silent,
    });
    c.ui = new Proxy({
      // The results screen: the student has NOT clicked Continue until we say so.
      showResults: (_data, _drop, afterResults) => { this._continue = afterResults; },
      showLevelUp: (_n, _rewards, next) => next(),
      showBossIntro: (_count, _line, next) => next(),
    }, { get: (target, key) => target[key] ?? noop });
    const real = c.showEncounterStatus.bind(c);
    c.showEncounterStatus = status => { this.lastStatus = status; real(status); };
    this.controller = c;
    return c;
  }

  /** Start a set fresh, or resume it if this browser (or the LMS) has it in progress. */
  open(id, { mode = 'resume' } = {}) {
    this.use();
    const c = this._newController(id);
    const questions = questionsFor(id);
    if (mode === 'new') c._clearSave();
    c.model = (mode === 'resume' && c._buildResumedModel(id, questions, MONSTERS))
      || new GameModel(questions, MONSTERS, null, c._loadGlobalLevel(), { sequential: true });
    c.startAdventure();
    this._skipScenes();
    return this;
  }

  /** Start the rank trial that is due for a cleared set. */
  openTrial(id) {
    this.use();
    const probe = Object.create(GameController.prototype);
    const next = nextTierInfo(probe._loadTier(id));
    if (!next?.due) throw new Error(`no trial due for ${id}`);
    const c = this._newController(id, { trial: next.nextTier });
    const sample = questionsFor(id).filter(q => q.type !== 'npc_demo').slice(0, 3);
    c.model = new GameModel(sample, MONSTERS, null, c._loadGlobalLevel());
    c.startAdventure();
    return this;
  }

  _skipScenes() {
    const c = this.controller;
    while (c.model.current_question?.type === 'npc_demo') c.completeNpcScene();
  }

  get currentQuestion() { return this.controller?.model?.current_question?.question ?? null; }
  get finished() { return this.lastStatus === 'victory' || this.lastStatus === 'no_questions'; }

  /** Submit an answer. Leaves the results screen up: Continue is a separate act. */
  answer(right = true) {
    this.use();
    const m = this.controller.model;
    if (m.current_monster) { m.current_monster.defense = 0; if (!m.current_monster.is_boss) m.current_monster.hit_points = 999; }
    m.player.hit_points = 999;
    this.controller.submitAnswer([right ? 'A' : 'B']);
    return this;
  }

  /** Click Continue on the results screen — `clicks: 2` for a double-click or a held Enter. */
  next({ clicks = 1 } = {}) {
    this.use();
    const go = this._continue;
    this._continue = null;
    if (go) for (let i = 0; i < clicks; i++) go();
    if (!this.finished) this._skipScenes();
    return this;
  }

  /** The in-game Back button: save and return to the menu, from wherever the student is. */
  back() {
    this.use();
    this.controller.leaveToMenu();
    this._continue = null;
    return this;
  }

  /** Answer `count` questions, clicking through each results screen. */
  play(count, { right = true } = {}) {
    for (let i = 0; i < count && !this.finished; i++) this.answer(right).next();
    return this;
  }

  /** Play to the end of the run, boss included. */
  finish() {
    for (let guard = 0; guard < 500 && !this.finished; guard++) this.answer(true).next();
    if (!this.finished) throw new Error('run did not finish');
    return this;
  }

  /** Let the character die, which ends the run. */
  die() {
    this.takeFatalHit();
    this.next();
    return this;
  }

  /** Answer wrongly until the character dies. The results screen is left up. */
  takeFatalHit() {
    this.use();
    const m = this.controller.model;
    m.player.revive_charges = 0;
    m.player.hit_points = 1;
    m.player.base_defense = 0;
    m.current_monster.attack_die = 1000;
    m.current_monster.hit_points = 999999;
    for (let i = 0; i < 50 && m.player.hit_points > 0; i++) {
      this.controller.submitAnswer(['B']);
      if (m.player.hit_points > 0) this.next();
    }
    return this;
  }

  /** Leave properly: navigate away, close the tab. Unload events fire. */
  close() {
    this.use();
    this.sandbox.fire('doc:visibilitychange');
    this.sandbox.fire('pagehide', { persisted: false });
  }

  /** The tab is simply gone — crash, battery, the OS discarding it. No events, no
   *  further ticks. Whatever was not already saved stays unsaved. */
  kill() { /* deliberately nothing */ }
}

/** Age every rank timestamp in a browser, so a waiting period has passed. */
export function daysPass(device, days) {
  const shift = iso => new Date(Date.parse(iso) - days * 86400000).toISOString();
  for (const key of Object.keys(device.storage._d)) {
    if (!key.startsWith('lotrd_tier_') && !key.startsWith('lotrd_done_')) continue;
    const rec = JSON.parse(device.storage._d[key]);
    for (const field of ['apprenticeAt', 'journeymanAt', 'masterAt', 'completedAt']) {
      if (rec[field]) rec[field] = shift(rec[field]);
    }
    device.storage._d[key] = JSON.stringify(rec);
  }
}

/** Small seeded PRNG (mulberry32), so a failing random walk can be replayed. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
