// tests/scorm-single.test.js — a package that is ONE problem set, worth full credit.
//
// The multi-set packages build a grade up over weeks, through rank trials with
// waiting periods. That depends on the LMS remembering a student between visits,
// across devices, and across every update of the package — and in the live course
// each of those has failed at some point.
//
// A single-set package needs almost none of it. Credit is one fact: the set was
// cleared. It is written once, as 100, and nothing after that may lower it. There
// are no ranks, no trials and no spacing here; the website keeps those.
//
// The rules, each of which is a test below:
//   • nothing is written to the gradebook until the set is cleared;
//   • clearing it is worth 100 — not the 80 of an "Apprentice" first clear;
//   • a posted 100 is never lowered, by anything: a fresh attempt, an empty
//     browser, a replay that ends in death;
//   • the package knows only its own set, whatever else the catalog lists.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { boot, settle, setId, doneRec, tierRec } from './helpers/scorm-sandbox.js';

const SET = setId(4);
const t0 = Date.parse('2026-09-10T00:00:00Z');
const clear = (storage, id = SET) => {
  storage.setItem(`lotrd_done_${id}`, doneRec(t0));
  storage.setItem(`lotrd_tier_${id}`, JSON.stringify({ tier: 1, apprenticeAt: new Date(t0).toISOString() }));
};

describe('single-set package: all-or-nothing credit', () => {
  it('writes no score while the set is unfinished, however far the student has got', async () => {
    const lms = {};
    const b = boot({ lmsStore: lms, single: SET, local: {
      [`lotrd_pos_${SET}`]: JSON.stringify({ h: 'abc', r: '40-49', m: '3', c: 40, w: 2, t: 1789000000 }),
    } });
    await settle();
    b.shim().forceReport();
    assert.ok(!('cmi.core.score.raw' in lms), `wrote ${lms['cmi.core.score.raw']} for an unfinished set`);
    assert.equal(lms['cmi.core.lesson_status'], 'incomplete');
  });

  it('is worth 100 the moment the set is cleared, not the 80 of a first rank', async () => {
    const lms = {};
    const b = boot({ lmsStore: lms, single: SET });
    await settle();
    clear(b.storage);
    b.shim().forceReport();
    assert.equal(lms['cmi.core.score.raw'], '100');
    assert.equal(lms['cmi.core.lesson_status'], 'completed');
    assert.equal(b.shim().progressPercent(), 100);
  });

  it('counts only its own set, even if the catalog lists a dozen', async () => {
    // The sandbox catalog has twelve sets. Clearing a DIFFERENT one earns nothing
    // here, and clearing this one is the whole grade rather than a twelfth of it.
    const lms = {};
    const b = boot({ lmsStore: lms, single: SET });
    await settle();
    clear(b.storage, setId(1));
    b.shim().forceReport();
    assert.ok(!('cmi.core.score.raw' in lms));
    assert.equal(b.shim().totalSets(), 1);
  });

  it('does not lower a posted 100 on a fresh attempt in a browser that knows nothing', async () => {
    // A republished package, opened first on a library computer. Nothing local, a
    // blank attempt from the LMS — and a 100 sitting in the gradebook that a
    // written 0 (or anything else) would replace.
    const lms = {};
    const b = boot({ lmsStore: lms, single: SET, local: {} });
    await settle();
    b.shim().forceReport();
    b.fire('pagehide', { persisted: false });
    assert.ok(!('cmi.core.score.raw' in lms), 'wrote a score from a browser that knew nothing');
  });

  it('keeps 100 when the LMS still has it, whatever this browser thinks', async () => {
    const lms = { 'cmi.core.score.raw': '100', 'cmi.core.lesson_status': 'completed' };
    const b = boot({ lmsStore: lms, single: SET, local: {} });
    await settle();
    b.shim().forceReport();
    assert.equal(lms['cmi.core.score.raw'], '100');
    assert.equal(lms['cmi.core.lesson_status'], 'completed', 'a completed activity must not be reopened as incomplete');
  });

  it('is not undone by replaying the set for practice and leaving half-way', async () => {
    const lms = {};
    const b = boot({ lmsStore: lms, single: SET });
    await settle();
    clear(b.storage);
    b.shim().forceReport();
    b.storage.setItem(`lotrd_pos_${SET}`, JSON.stringify({ h: 'abc', r: '5-49', m: '', c: 5, w: 0, t: 1789090000 }));
    b.shim().forceReport();
    assert.equal(lms['cmi.core.score.raw'], '100');
    assert.equal(lms['cmi.core.lesson_status'], 'completed');
  });

  it('restores the clear on another device, where it again reads as 100', async () => {
    const lms = {};
    const laptop = boot({ lmsStore: lms, single: SET });
    await settle();
    clear(laptop.storage);
    laptop.shim().forceReport();

    const phone = boot({ lmsStore: lms, single: SET, local: {} });
    assert.ok(phone.storage.getItem(`lotrd_done_${SET}`), 'not restored before the game starts');
    await settle();
    assert.equal(phone.shim().progressPercent(), 100);
  });

  it('retries a clear the LMS refused, exactly as the multi-set package does', async () => {
    const lms = {};
    const b = boot({ lmsStore: lms, single: SET });
    await settle();
    b.control.down = true;
    clear(b.storage);
    b.shim().forceReport();
    assert.ok(!('cmi.core.score.raw' in lms));
    b.control.down = false;
    b.shim().forceReport();
    assert.equal(lms['cmi.core.score.raw'], '100');
  });

  it('says plainly where the student stands, and never mentions ranks', async () => {
    const b = boot({ single: SET });
    await settle();
    assert.match(b.banner().textContent, /not yet complete/i);
    assert.doesNotMatch(b.banner().textContent, /rank|%/i);
    clear(b.storage);
    b.shim().forceReport();
    assert.match(b.banner().textContent, /complete/i);
    assert.match(b.banner().textContent, /full credit/i);
    assert.doesNotMatch(b.banner().textContent, /rank/i);
  });

  it('reports which kind of package it is, for a bug report', async () => {
    const b = boot({ single: SET });
    await settle();
    assert.equal(b.shim().diagnose().singleSet, SET);
  });
});

describe('multi-set packages are unchanged by any of this', () => {
  it('a first clear is still worth 80% of one set', async () => {
    const lms = {};
    const b = boot({ lmsStore: lms });
    await settle();
    b.storage.setItem(`lotrd_done_${setId(1)}`, doneRec(t0));
    b.storage.setItem(`lotrd_tier_${setId(1)}`, tierRec(1, t0));
    b.shim().forceReport();
    assert.equal(lms['cmi.core.score.raw'], '7');
    assert.equal(b.shim().diagnose().singleSet, null);
  });
});
