// tests/dataloss.test.js — STUDENTS NEVER LOSE WORK THEY HAVE DONE.
//
// That sentence is the requirement, and this file is its enforcement. It has
// regressed more than once, each time because the behaviour depended on several
// parts agreeing (the game's saves, the SCORM shim, the LMS, the browser's
// storage) and nothing tested them together.
//
// So these tests are written as the things that happen to students, not as unit
// checks: they switch browsers, D2L logs them out mid-set, the wifi drops, a
// phone discards the tab, Safari empties its storage, a laptop that was last
// used a week ago comes back with stale data. Every scenario runs the REAL game
// code and the REAL shim against one fake LMS (tests/helpers/world.js).
//
// What counts as "work", in order of how much it matters:
//   1. A completed problem set, and the rank earned on it.   ← never, ever lost
//   2. The grade in the LMS.                                  ← never goes down
//   3. Progress inside a half-finished set.
//
// The one loss that cannot be prevented is stated as a test too, at the bottom,
// so that it stays the ONLY one: work done while the LMS was unreachable, in a
// browser whose storage is then destroyed before the student reopens the
// activity there. At that point no copy exists anywhere. The mitigation — a red
// banner, at the time, telling the student to stay in that browser — is tested.
//
// IF YOU CHANGE how anything is saved, synced or restored: add the scenario
// here first. If one of these fails, a student somewhere is about to redo work.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Lms, Device, daysPass, rng, setId, questionsFor, QUESTIONS_PER_SET } from './helpers/world.js';

const A = setId(1), B = setId(2), C = setId(3);
const APPRENTICE = 1, JOURNEYMAN = 2;

/** Assert a device shows a set as cleared — the only state that is not "lost". */
function assertCleared(session, id, message) {
  const entry = session.menu(id);
  assert.equal(entry.status.type, 'complete',
    `${message || id}: menu shows "${entry.status.type}" — to the student this set is gone`);
  return entry;
}

// ════════════════════════════════════════════════════════════════════════════════
describe('a completed problem set is never lost', () => {
  it('survives a switch to a browser that has never seen the game', async () => {
    const lms = new Lms();
    const laptop = await new Device(lms, 'laptop').launch();
    laptop.open(A).finish();
    const clearedAt = laptop.menu(A).status.completedAt;
    laptop.close();

    const phone = await new Device(lms, 'phone').launch();
    assert.equal(phone.menuAtStartup(A).status.type, 'complete',
      'the first menu drawn showed the set as not cleared: the restore came too late');
    const entry = assertCleared(phone, A);
    assert.equal(entry.tier, APPRENTICE);
    assert.equal(entry.status.completedAt.slice(0, 19), clearedAt.slice(0, 19),
      'the timestamp gates the rank trial; a reset clock makes the student wait again');
    assert.equal(lms.score, 7);
  });

  it('survives the browser emptying its storage (Safari does, for embedded frames)', async () => {
    const lms = new Lms();
    const phone = new Device(lms, 'phone');
    (await phone.launch()).open(A).finish().close();
    phone.wipeStorage();
    assertCleared(await phone.launch(), A);
  });

  it('survives the tab dying the instant the set is won — no unload, no next poll', async () => {
    const lms = new Lms();
    const phone = await new Device(lms, 'phone').launch();
    phone.open(A).finish();
    phone.kill();
    assertCleared(await new Device(lms, 'laptop').launch(), A);
  });

  it('survives D2L being unreachable at the moment of victory, once it returns', async () => {
    const lms = new Lms();
    const laptop = await new Device(lms, 'laptop').launch();
    laptop.open(A).play(3);
    lms.goDown();                               // session expired mid-set
    laptop.finish();
    assert.deepEqual(lms.ranks, {}, 'precondition: the LMS never received the clear');
    assert.match(laptop.banner, /NOT been saved to D2L/);

    lms.comeBack();
    laptop.tick();                              // the student does nothing; the poll retries
    assert.equal(lms.ranks[A], APPRENTICE);
    assertCleared(await new Device(lms, 'phone').launch(), A);
  });

  it('survives D2L staying down until the tab is gone, if the student returns to that browser', async () => {
    const lms = new Lms();
    const laptop = new Device(lms, 'laptop');
    const visit = await laptop.launch();
    lms.goDown();
    visit.open(A).finish();
    visit.kill();

    lms.comeBack();
    const back = await laptop.launch();         // same browser, days later
    assertCleared(back, A);
    assert.equal(lms.ranks[A], APPRENTICE, 'the launch must push what the LMS is missing');
    assertCleared(await new Device(lms, 'phone').launch(), A);
  });

  it('survives a whole session in which D2L never connected', async () => {
    const lms = new Lms();
    lms.control.initFails = true;
    const laptop = new Device(lms, 'laptop');
    const visit = await laptop.launch();
    assert.match(visit.banner, /NOT being saved to D2L|Not connected/i);
    visit.open(A).finish();
    visit.kill();

    lms.control.initFails = false;
    await laptop.launch();
    assert.equal(lms.ranks[A], APPRENTICE);
  });

  it('survives D2L not being ready at launch, connecting only part-way through the visit', async () => {
    // No second launch to fall back on: the tab dies, and the next device is new.
    const lms = new Lms();
    lms.control.initFails = true;
    const laptop = await new Device(lms, 'laptop').launch();
    laptop.open(A).play(2);
    lms.control.initFails = false;              // the LMS is ready now; the poll must notice
    laptop.tick();
    laptop.finish();
    laptop.kill();
    assertCleared(await new Device(lms, 'phone').launch(), A);
  });

  it('survives a dropped catalog request at launch', async () => {
    const lms = new Lms();
    lms.control.catalogFails = true;
    const laptop = await new Device(lms, 'laptop').launch();
    laptop.open(A).finish();
    lms.control.catalogFails = false;
    await laptop.settle();
    assert.equal(lms.ranks[A], APPRENTICE);
  });

  it('is not erased by a stale browser catching up', async () => {
    // The laptop knows about set A only. The phone then clears set B. When the
    // laptop next opens, its older picture of the world must not overwrite the
    // LMS — nor hide set B from the student sitting at the laptop.
    const lms = new Lms();
    const laptop = new Device(lms, 'laptop');
    (await laptop.launch()).open(A).finish().close();
    (await new Device(lms, 'phone').launch()).open(B).finish().close();

    const back = await laptop.launch();
    assertCleared(back, A);
    assertCleared(back, B, 'cleared on the phone');
    back.open(C).finish().close();
    assert.deepEqual(Object.keys(lms.ranks).sort(), [A, B, C]);
  });

  it('is not hidden by a half-finished save of the same set left on another device', async () => {
    // Started on the laptop, finished on the phone. The laptop still holds its
    // old in-progress save; offering "Resume — 4 left" there would be a lie.
    const lms = new Lms();
    const laptop = new Device(lms, 'laptop');
    (await laptop.launch()).open(A).play(2).close();
    (await new Device(lms, 'phone').launch()).open(A).finish().close();

    assertCleared(await laptop.launch(), A);
  });

  it('is not undone by replaying it and dying, or by abandoning the replay', async () => {
    const lms = new Lms();
    const laptop = new Device(lms, 'laptop');
    const visit = await laptop.launch();
    visit.open(A).finish();
    visit.open(A, { mode: 'new' }).play(2).die();
    assertCleared(visit, A, 'after dying in a replay');
    visit.open(A, { mode: 'new' }).play(1);
    visit.kill();

    assertCleared(await laptop.launch(), A, 'after abandoning a replay');
    assertCleared(await new Device(lms, 'phone').launch(), A, 'elsewhere');
    assert.equal(lms.score, 7);
  });

  it('survives the package being republished, which hands the student a clean LMS attempt', async () => {
    const lms = new Lms();
    const laptop = new Device(lms, 'laptop');
    (await laptop.launch()).open(A).finish().close();

    lms.startFreshAttempt();
    await laptop.launch();
    assert.equal(lms.ranks[A], APPRENTICE, 'the browser copy must repopulate the new attempt');
    assert.equal(lms.score, 7);
  });

  it('is never overwritten with a zero grade by a blank browser on a clean attempt', async () => {
    // Republished package, and the first device to open it is one with empty
    // storage. It knows of no credit — but D2L's gradebook still does, and a
    // written 0 would replace it.
    const lms = new Lms();
    (await new Device(lms, 'laptop').launch()).open(A).finish().close();
    lms.startFreshAttempt();
    const blank = await new Device(lms, 'library').launch();
    blank.tick();
    blank.close();
    assert.ok(!('cmi.core.score.raw' in lms.store),
      `wrote a score of ${lms.store['cmi.core.score.raw']} from a browser that knew nothing`);
  });

  it('never has a zero written over it by a browser that knows nothing', async () => {
    const lms = new Lms();
    (await new Device(lms, 'laptop').launch()).open(A).finish().close();
    lms.store['cmi.suspend_data'] = '';         // the LMS kept the grade but lost the detail
    const blank = await new Device(lms, 'library').launch();
    blank.tick();
    assert.equal(lms.score, 7);
  });

  it('keeps a rank earned in a trial, across devices and past a stale browser', async () => {
    const lms = new Lms();
    const laptop = new Device(lms, 'laptop');
    (await laptop.launch()).open(A).finish().close();

    const phone = new Device(lms, 'phone');
    await phone.launch();
    daysPass(phone, 4);                         // the Journeyman wait is three days
    const trial = await phone.launch();
    trial.openTrial(A).finish();
    assert.equal(trial.menu(A).tier, JOURNEYMAN);
    trial.kill();

    const back = await laptop.launch();         // still believes "Apprentice"
    assert.equal(back.menu(A).tier, JOURNEYMAN, 'the trial would be demanded a second time');
    back.open(B).finish().close();
    assert.equal(lms.ranks[A], JOURNEYMAN, 'the stale browser wrote the lower rank back');
    assert.equal(lms.score, 14);
  });

  it('is kept when two devices are open at once, if the LMS serves live values', async () => {
    // The laptop tab has been open since before the phone cleared set B. SCORM
    // 1.2 has no way to be told about that, so before the laptop writes it reads
    // what the LMS holds and merges. (Against an LMS that caches reads at launch
    // this cannot work — see the next test for what protects the student then.)
    const lms = new Lms();
    const laptop = await new Device(lms, 'laptop').launch();
    laptop.open(A).finish();

    const phone = new Device(lms, 'phone');
    (await phone.launch()).open(B).finish().close();

    laptop.open(C).finish();                    // writes, from a tab that never heard of B
    assert.deepEqual(Object.keys(lms.ranks).sort(), [A, B, C]);
    assert.equal(lms.score, 20);
  });

  it('is repaired by the device that earned it, when the LMS caches reads', async () => {
    const lms = new Lms();
    lms.control.cachedReads = true;
    const laptop = await new Device(lms, 'laptop').launch();
    laptop.open(A).finish();
    const phone = new Device(lms, 'phone');
    (await phone.launch()).open(B).finish().close();
    laptop.open(C).finish().close();            // clobbers B in the LMS: last writer wins

    await phone.launch();                       // the phone still has B, and says so
    assert.deepEqual(Object.keys(lms.ranks).sort(), [A, B, C]);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe('the grade in the LMS never goes down', () => {
  it('holds through every kind of launch', async () => {
    const lms = new Lms();
    const laptop = new Device(lms, 'laptop');
    const phone = new Device(lms, 'phone');
    let high = 0;
    const check = (when) => {
      assert.ok(lms.score >= high, `score fell from ${high} to ${lms.score} ${when}`);
      high = lms.score;
    };

    (await laptop.launch()).open(A).finish().close();            check('after clearing A');
    (await phone.launch()).tick();                               check('on a new device');
    (await phone.launch()).open(B).finish().close();             check('after clearing B on the phone');
    (await laptop.launch()).tick();                              check('on the stale laptop');
    phone.wipeStorage(); (await phone.launch()).tick();          check('after the phone lost its storage');
    lms.goDown(); (await laptop.launch()).tick(); lms.comeBack(); check('through an outage');
    (await new Device(lms, 'library').launch()).tick();          check('on a third device');
    assert.equal(high, 13);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe('progress inside a set is never lost', () => {
  it('carries to another browser, to the very question', async () => {
    const lms = new Lms();
    const phone = await new Device(lms, 'phone').launch();
    phone.open(A).play(3);
    const at = phone.currentQuestion;
    phone.close();

    const laptop = await new Device(lms, 'laptop').launch();
    assert.equal(laptop.menu(A).status.type, 'in_progress');
    assert.equal(laptop.open(A).currentQuestion, at);
  });

  it('survives the tab dying mid-set, with no chance to say goodbye', async () => {
    const lms = new Lms();
    const phone = await new Device(lms, 'phone').launch();
    phone.open(A).play(4);
    const at = phone.currentQuestion;
    phone.kill();
    assert.equal((await new Device(lms, 'laptop').launch()).open(A).currentQuestion, at);
  });

  it('keeps an answer given just before the cut-off, while the feedback was still on screen', async () => {
    const lms = new Lms();
    const phone = await new Device(lms, 'phone').launch();
    phone.open(A).play(2).answer(true);         // results screen showing; Continue never clicked
    phone.kill();

    const laptop = await new Device(lms, 'laptop').launch();
    assert.equal(laptop.open(A).currentQuestion, `${A} — question 4?`);
  });

  it('can still be finished after a cut-off on the last answer of the set', async () => {
    const lms = new Lms();
    const phone = new Device(lms, 'phone');
    const visit = await phone.launch();
    visit.open(A).play(QUESTIONS_PER_SET - 1).answer(true);
    visit.kill();

    const back = await phone.launch();
    assert.equal(back.menu(A).status.type, 'in_progress', 'the whole set would be owed again');
    back.open(A).finish();
    assertCleared(back, A);
  });

  it('survives a first visit to a new browser, whose start-up housekeeping purges old saves', async () => {
    // Found in a real browser: a new device has no save-version key, so the
    // game's start-up purge ran moments after the shim restored the position —
    // and the next sync then erased it from the LMS as well.
    const lms = new Lms();
    (await new Device(lms, 'phone').launch()).open(A).play(3).close();

    const laptop = await new Device(lms, 'laptop').launch();
    laptop.tick();
    assert.ok(lms.positionOf(A), 'the position was erased from the LMS by a device that merely looked');
    assert.equal(laptop.menu(A).status.type, 'in_progress');
  });

  it('survives D2L dropping out mid-set and coming back', async () => {
    const lms = new Lms();
    const phone = await new Device(lms, 'phone').launch();
    phone.open(A).play(1);
    lms.goDown();
    phone.play(3);
    const at = phone.currentQuestion;
    lms.comeBack();
    phone.tick();
    phone.kill();
    assert.equal((await new Device(lms, 'laptop').launch()).open(A).currentQuestion, at);
  });

  it('keeps the misses, so the retrieval boss still asks for them elsewhere', async () => {
    const lms = new Lms();
    const phone = await new Device(lms, 'phone').launch();
    phone.open(A).play(1, { right: false }).play(2);
    phone.kill();

    const laptop = await new Device(lms, 'laptop').launch();
    laptop.open(A);
    const boss = laptop.controller.model._buildBossQueue().map(q => q.question);
    assert.deepEqual(boss, [`${A} — question 1?`]);
  });

  it('carries the player level too, and never downward', async () => {
    const lms = new Lms();
    const phone = await new Device(lms, 'phone').launch();
    phone.open(A);
    phone.controller.model.player.xp += 500;    // a few levels' worth
    phone.controller.model.checkLevelUp();
    const level = phone.controller.model.player.level;
    assert.ok(level > 1);
    phone.play(1).close();

    const laptop = new Device(lms, 'laptop');
    const first = await laptop.launch();
    assert.equal(first.open(B).controller.model.player.level, level);
    first.close();
    assert.ok((await laptop.launch()).open(C).controller.model.player.level >= level);
  });

  it('survives the Back button on the results screen of the last question', async () => {
    // The run's ending is decided by Continue. A student who instead clicked
    // Back from that screen used to leave a save with nothing queued — which the
    // menu reads as nothing to resume — and had to play the whole set again.
    const lms = new Lms();
    const phone = await new Device(lms, 'phone').launch();
    phone.open(A).play(QUESTIONS_PER_SET - 1).answer(true).back();
    assert.equal(phone.menu(A).status.type, 'in_progress', 'the whole set would be owed again');
    phone.open(A).finish();
    assertCleared(phone, A);
  });

  it('survives the Back button there when a missed question still owes the retrieval boss', async () => {
    const lms = new Lms();
    const phone = await new Device(lms, 'phone').launch();
    phone.open(A).play(1, { right: false }).play(QUESTIONS_PER_SET - 1).answer(true).back();
    assert.equal(phone.menu(A).status.type, 'in_progress', 'the whole set would be owed again');
    phone.kill();
    const laptop = await new Device(lms, 'laptop').launch();
    laptop.open(A).finish();
    assertCleared(laptop, A);
  });

  it('starts the set over rather than resuming at the wrong question after the set is edited', async () => {
    // Guarded by a fingerprint of the question file. Not a loss: resuming a
    // position against different questions would be worse than restarting.
    const lms = new Lms();
    (await new Device(lms, 'phone').launch()).open(A).play(3).close();
    const laptop = await new Device(lms, 'laptop').launch();
    const pos = JSON.parse(laptop.device.storage.getItem(`lotrd_pos_${A}`));
    laptop.device.storage.setItem(`lotrd_pos_${A}`, JSON.stringify({ ...pos, h: 'edited' }));
    assert.equal(laptop.open(A).currentQuestion, `${A} — question 1?`);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe('any sequence of switches, outages and wiped browsers', () => {
  // A seeded random walk over everything above at once. Two invariants are
  // checked after every step, and a third at the end:
  //   • the LMS grade never falls, and the LMS never forgets a cleared set;
  //   • a device that launches while the LMS is up shows every set the LMS knows;
  //   • every set cleared in a browser that was not destroyed while unsynced is
  //     cleared everywhere, once each device has been opened again.
  const SETS = [setId(1), setId(2), setId(3), setId(4)];

  async function walk(seed) {
    const random = rng(seed);
    const pick = list => list[Math.floor(random() * list.length)];
    const lms = new Lms();
    const devices = ['laptop', 'phone', 'classroom'].map(n => new Device(lms, n));
    const owed = new Set();          // sets that must be cleared everywhere by the end
    const trail = [];
    let high = 0, known = [];

    const invariants = () => {
      assert.ok(lms.score >= high, `grade fell ${high} → ${lms.score}`);
      high = lms.score;
      const now = Object.keys(lms.ranks);
      for (const id of known) assert.ok(now.includes(id), `the LMS forgot ${id}`);
      known = now;
    };

    try {
      for (let step = 0; step < 24; step++) {
        const device = pick(devices);
        const act = pick(['clear', 'clear', 'dabble', 'outage', 'wipe', 'look']);
        trail.push(`${act}@${device.name}${lms.control.down ? ' (LMS down)' : ''}`);

        if (act === 'outage') {
          if (lms.control.down) lms.comeBack(); else lms.goDown();
          continue;
        }
        if (act === 'wipe') {
          // Only a browser with nothing unsynced may be destroyed: losing the sole
          // copy of unsynced work is the one loss nothing can prevent.
          const probe = await device.launch();
          probe.tick();
          if (!lms.control.down && probe.syncState === 'synced') device.wipeStorage();
          continue;
        }

        const session = await device.launch();
        if (!lms.control.down) {
          for (const id of Object.keys(lms.ranks)) {
            assert.equal(session.menuAtStartup(id).status.type, 'complete',
              `${id} on ${device.name}: not cleared in the first menu drawn`);
            assertCleared(session, id, `${id} on ${device.name}`);
          }
        }
        if (act === 'clear') {
          const id = pick(SETS);
          session.open(id, { mode: session.menu(id).status.type === 'complete' ? 'new' : 'resume' }).finish();
          assertCleared(session, id);
          owed.add(id);
        } else if (act === 'dabble') {
          const id = pick(SETS);
          if (session.menu(id).status.type !== 'complete') session.open(id).play(1 + Math.floor(random() * 3));
        }
        if (random() < 0.5) session.close(); else session.kill();
        invariants();
      }

      lms.comeBack();
      for (const device of devices) (await device.launch()).tick();   // everyone checks in once…
      for (const device of devices) {                                 // …and then everyone agrees
        const session = await device.launch();
        for (const id of owed) assertCleared(session, id, `${id} on ${device.name} at the end`);
      }
      for (const id of owed) assert.ok(lms.ranks[id] >= APPRENTICE, `the LMS never learned of ${id}`);
      invariants();
    } catch (err) {
      err.message = `seed ${seed}: ${err.message}\n  steps: ${trail.join(' → ')}`;
      throw err;
    }
  }

  it('never loses a cleared set or lowers the grade (60 random histories)', async () => {
    for (let seed = 1; seed <= 60; seed++) await walk(seed);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// Lab machines, library PCs, a sibling's laptop: several students, one browser.
// D2L serves every student's copy of the activity from the same address, so they
// share one localStorage. Progress found there belongs to whoever earned it —
// never to whoever happens to open the activity next.
describe('a computer that several students take turns at', () => {
  const alice = () => new Lms({ student: 'alice' });
  const bob = () => new Lms({ student: 'bob' });

  it('does not hand one student\'s cleared set to the next', async () => {
    const a = alice(), b = bob();
    const lab = new Device(a, 'lab');
    (await lab.launch()).open(A).finish().close();

    const bobAtLab = await lab.usedBy(b).launch();
    assert.equal(bobAtLab.menuAtStartup(A).status.type, 'not_started', 'Bob was shown Alice\'s set as his own');
    assert.equal(bobAtLab.menu(A).status.type, 'not_started');
    bobAtLab.tick();
    bobAtLab.close();
    assert.deepEqual(b.ranks, {}, 'Alice\'s set was written into Bob\'s D2L record');
    assert.ok(!('cmi.core.score.raw' in b.store), `Bob was given a grade of ${b.store['cmi.core.score.raw']}`);
  });

  it('does not hand over a half-finished set, or a level, either', async () => {
    const a = alice(), b = bob();
    const lab = new Device(a, 'lab');
    const visit = await lab.launch();
    visit.open(A).play(3);
    visit.controller.model.player.xp += 500;
    visit.controller.model.checkLevelUp();
    visit.play(1).close();

    const bobAtLab = await lab.usedBy(b).launch();
    assert.equal(bobAtLab.menu(A).status.type, 'not_started');
    assert.equal(bobAtLab.open(B).controller.model.player.level, 1);
    bobAtLab.close();
    assert.equal(b.positionOf(A), null);
    assert.equal(b.data.lvl?.[0] ?? 1, 1);
  });

  it('does not grade the next student for a single-set package the last one cleared', async () => {
    const a = new Lms({ single: A, student: 'alice' }), b = new Lms({ single: A, student: 'bob' });
    const lab = new Device(a, 'lab');
    (await lab.launch()).open(A).finish().close();
    assert.equal(a.score, 100);

    const bobAtLab = await lab.usedBy(b).launch();
    bobAtLab.tick();
    bobAtLab.close();
    assert.ok(!('cmi.core.score.raw' in b.store), `Bob was given ${b.store['cmi.core.score.raw']} for Alice's work`);
    assert.notEqual(b.store['cmi.core.lesson_status'], 'completed');
  });

  it('gives each student their own progress back as they take turns', async () => {
    const a = alice(), b = bob();
    const aliceAtLab = new Device(a, 'lab');
    const bobAtLab = aliceAtLab.usedBy(b);
    (await aliceAtLab.launch()).open(A).finish().close();
    (await bobAtLab.launch()).open(B).finish().close();

    const aliceBack = await aliceAtLab.launch();
    assertCleared(aliceBack, A);
    assert.equal(aliceBack.menu(B).status.type, 'not_started');
    aliceBack.close();
    const bobBack = await bobAtLab.launch();
    assertCleared(bobBack, B);
    assert.equal(bobBack.menu(A).status.type, 'not_started');
    bobBack.close();
    assert.deepEqual(Object.keys(a.ranks), [A]);
    assert.deepEqual(Object.keys(b.ranks), [B]);
  });

  it('keeps work the first student could not get to D2L, for when they return to that computer', async () => {
    // Set aside, not thrown away: in this browser it may be the only copy.
    const a = alice(), b = bob();
    const aliceAtLab = new Device(a, 'lab');
    const visit = await aliceAtLab.launch();
    a.goDown();
    visit.open(A).finish();
    visit.kill();

    const bobVisit = await aliceAtLab.usedBy(b).launch();
    bobVisit.open(B).play(2).close();

    a.comeBack();
    const aliceBack = await aliceAtLab.launch();
    assertCleared(aliceBack, A);
    assert.equal(a.ranks[A], APPRENTICE, 'the launch must push what Alice\'s record is missing');
    assert.deepEqual(b.ranks, {});
  });

  it('neither leaks nor deletes the last student\'s progress when storage is too full to set it aside', async () => {
    const a = alice(), b = bob();
    const lab = new Device(a, 'lab');
    const visit = await lab.launch();
    a.goDown();
    visit.open(A).finish();                     // only this browser has it
    visit.kill();
    const setItem = lab.storage.setItem.bind(lab.storage);
    lab.storage.setItem = (k, v) => {
      if (k.startsWith('lotrd_stash_')) throw new Error('QuotaExceededError');
      return setItem(k, v);
    };

    const bobAtLab = await lab.usedBy(b).launch();
    bobAtLab.tick();
    assert.match(bobAtLab.banner, /another student/);
    bobAtLab.close();
    assert.deepEqual(b.ranks, {}, 'Alice\'s set was written into Bob\'s record');
    assert.ok(!('cmi.core.score.raw' in b.store));

    lab.storage.setItem = setItem;
    a.comeBack();
    assertCleared(await lab.launch(), A);
    assert.equal(a.ranks[A], APPRENTICE);
  });

  it('still belongs to its student when it was saved before browsers were told apart', async () => {
    // Every browser in use today holds progress with no owner recorded. The first
    // student to open the activity there claims it: almost always the student
    // whose browser it is. (On a shared machine this is the one-time exception.)
    const a = alice();
    const laptop = new Device(a, 'laptop');
    (await laptop.launch()).open(A).finish().close();
    laptop.storage.removeItem('lotrd_learner');
    a.startFreshAttempt();                      // so only the browser knows about A

    const back = await laptop.launch();
    assertCleared(back, A);
    assert.equal(a.ranks[A], APPRENTICE);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// The other half of "the grade is right": credit only for what was actually done.
describe('the results screen is not a way around the run', () => {
  it('does not skip the retrieval boss on a double-click of Continue', async () => {
    const lms = new Lms();
    const phone = await new Device(lms, 'phone').launch();
    phone.open(A).play(1, { right: false }).play(QUESTIONS_PER_SET - 1).answer(true).next({ clicks: 2 });
    assert.equal(phone.lastStatus, 'boss_start', 'the second click answered for the boss');
    assert.notEqual(phone.menu(A).status.type, 'complete', 'cleared without facing the boss');
    assert.deepEqual(lms.ranks, {});
    phone.finish();
    assertCleared(phone, A);
  });

  it('counts a cleared set once, however Continue was clicked', async () => {
    const lms = new Lms();
    const phone = await new Device(lms, 'phone').launch();
    phone.open(A).play(QUESTIONS_PER_SET - 1).answer(true).next({ clicks: 2 });
    assertCleared(phone, A);
    const global = JSON.parse(phone.device.storage.getItem('lotrd_global'));
    assert.equal(global.sets_completed, 1);
  });

  it('does not let Back undo a game over', async () => {
    const lms = new Lms();
    const phone = await new Device(lms, 'phone').launch();
    phone.open(A).play(2).takeFatalHit().back();
    assert.notEqual(phone.menu(A).status.type, 'in_progress', 'Back from the death screen resumed the run');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe('the one loss that cannot be prevented', () => {
  it('is work done while D2L was unreachable, in a browser that is then destroyed — and the student was told', async () => {
    const lms = new Lms();
    const phone = new Device(lms, 'phone');
    const visit = await phone.launch();
    lms.goDown();
    visit.open(A).finish();

    // The mitigation: said plainly, at the only moment it can be acted on.
    assert.match(visit.banner, /NOT been saved to D2L/);
    assert.match(visit.banner, /safe in this browser/);
    assert.match(visit.banner, /same browser/);
    assert.equal(visit.sandbox.banner().attrs.role, 'alert');
    const leaving = { preventDefault() { this.asked = true; } };
    visit.sandbox.fire('beforeunload', leaving);
    assert.ok(leaving.asked, 'closing the tab now should raise "Leave site?"');

    visit.kill();
    phone.wipeStorage();
    lms.comeBack();
    const after = await new Device(lms, 'laptop').launch();
    assert.equal(after.menu(A).status.type, 'not_started',
      'if this ever passes as "complete", something is inventing credit');
  });
});

// Keeps the fixtures honest: the scenarios above only mean something if the fake
// question sets look like real ones to the game.
describe('fixtures', () => {
  it('give each set a teaching scene and the advertised number of questions', () => {
    const qs = questionsFor(A);
    assert.equal(qs[0].type, 'npc_demo');
    assert.equal(qs.filter(q => q.type !== 'npc_demo').length, QUESTIONS_PER_SET);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// A single-set package is worth full credit when its one set is cleared, and that
// is all it has to remember. Same real game, same real shim — a simpler promise.
describe('single-set package: full credit, once earned, stays earned', () => {
  const single = () => new Lms({ single: A });

  it('is 100 in the LMS the moment the set is cleared, and complete on any other device', async () => {
    const lms = single();
    (await new Device(lms, 'laptop').launch()).open(A).finish().close();
    assert.equal(lms.score, 100);
    assert.equal(lms.store['cmi.core.lesson_status'], 'completed');
    assertCleared(await new Device(lms, 'phone').launch(), A);
  });

  it('writes nothing at all until then, however much of the set has been done', async () => {
    const lms = single();
    const visit = await new Device(lms, 'laptop').launch();
    visit.open(A).play(QUESTIONS_PER_SET - 1);
    visit.close();
    assert.ok(!('cmi.core.score.raw' in lms.store), `wrote ${lms.store['cmi.core.score.raw']}`);
  });

  it('survives D2L being unreachable at the moment of victory', async () => {
    const lms = single();
    const laptop = await new Device(lms, 'laptop').launch();
    laptop.open(A).play(2);
    lms.goDown();
    laptop.finish();
    assert.ok(!('cmi.core.score.raw' in lms.store), 'precondition: the LMS refused it');
    lms.comeBack();
    laptop.tick();
    assert.equal(lms.score, 100);
  });

  it('is never lowered by a republished package opened first in a blank browser', async () => {
    // The gradebook still holds the 100. The new attempt and the blank browser
    // know nothing — and must therefore SAY nothing.
    const lms = single();
    (await new Device(lms, 'laptop').launch()).open(A).finish().close();
    lms.startFreshAttempt();
    const library = await new Device(lms, 'library').launch();
    library.tick();
    library.open(A).play(2);
    library.close();
    assert.ok(!('cmi.core.score.raw' in lms.store), `a fresh attempt wrote ${lms.store['cmi.core.score.raw']}`);
  });

  it('is put back by the browser that earned it, after a republish', async () => {
    const lms = single();
    const laptop = new Device(lms, 'laptop');
    (await laptop.launch()).open(A).finish().close();
    lms.startFreshAttempt();
    (await laptop.launch()).close();
    assert.equal(lms.score, 100);
  });

  it('is not undone by replaying for practice and dying', async () => {
    const lms = single();
    const laptop = new Device(lms, 'laptop');
    const visit = await laptop.launch();
    visit.open(A).finish();
    visit.open(A, { mode: 'new' }).play(1).die();
    visit.close();
    assert.equal(lms.score, 100);
    assert.equal(lms.store['cmi.core.lesson_status'], 'completed');
    assertCleared(await laptop.launch(), A);
  });

  it('still carries a half-finished set to another device, where the LMS allows it', async () => {
    const lms = single();
    const phone = await new Device(lms, 'phone').launch();
    phone.open(A).play(3);
    const at = phone.currentQuestion;
    phone.close();
    assert.equal((await new Device(lms, 'laptop').launch()).open(A).currentQuestion, at);
  });
});
