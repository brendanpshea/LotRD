// tests/scorm.test.js — the SCORM shim's grade-preservation guarantees.
//
// The shim runs as a plain script inside the LMS frame, so it is exercised here
// the way an LMS runs it: evaluated in a sandbox against a stubbed SCORM 1.2 API
// and a stubbed localStorage. Every case below is a way a student's real grade
// could be destroyed in the wild — a dropped connection, a new laptop, a cleared
// browser — and each one has bitten somebody's SCORM package before.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const src = await readFile(
  new URL('../SCORM/templates/scorm-shim.js', import.meta.url), 'utf8');

const SET_COUNT = 12;
const setId = i => `set_${String(i).padStart(2, '0')}.json`;
const doneRec = ms => JSON.stringify({ completedAt: new Date(ms).toISOString(), score_pct: 100 });
const tierRec = (tier, ms) => JSON.stringify({
  tier,
  apprenticeAt: new Date(ms).toISOString(),
  journeymanAt: new Date(ms).toISOString(),
  masterAt: new Date(ms).toISOString(),
});

/** Boot the shim in a sandbox. Returns handles on the fake LMS and browser. */
function boot({ lmsStore = {}, local = {}, catalogFails = false } = {}) {
  const storage = {
    _d: { ...local },
    getItem(k) { return k in this._d ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
  };
  const api = {
    LMSInitialize: () => 'true',
    LMSFinish: () => 'true',
    LMSGetValue: k => (k in lmsStore ? lmsStore[k] : ''),
    LMSSetValue: (k, v) => { lmsStore[k] = String(v); return 'true'; },
    LMSCommit: () => 'true',
    LMSGetLastError: () => '0',
  };
  const win = { API: api, localStorage: storage, addEventListener: () => {}, setInterval: () => 0 };
  win.parent = win;
  win.self = win;
  const quiet = { warn: () => {}, log: () => {}, error: () => {} };
  const ctx = vm.createContext({
    window: win, localStorage: storage, console: quiet, setInterval: () => 0,
    Date, JSON, Math, Number, Array, Object, String, Boolean, isNaN, parseInt, parseFloat,
    document: {
      readyState: 'complete',
      addEventListener: () => {},
      createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
      body: { appendChild() {}, style: {} },
      hidden: false,
    },
    getComputedStyle: () => ({ paddingTop: '0px' }),
    fetch: async () => {
      if (catalogFails) throw new Error('network down');
      return {
        json: async () => [{
          topic: 'T',
          sets: Array.from({ length: SET_COUNT }, (_, i) => ({ id: setId(i + 1) })),
        }],
      };
    },
  });
  vm.runInContext(src, ctx);
  return { ctx, lmsStore, storage, shim: () => ctx.window.LotrdScorm };
}

/** The shim's start() is async; let its microtasks drain. */
const settle = () => new Promise(r => setTimeout(r, 20));

describe('SCORM shim never loses a grade', () => {
  it('does not zero the gradebook when the catalog fetch fails', async () => {
    // A dropped connection inside the LMS frame leaves totalSets at 0, which would
    // otherwise compute as 0% and overwrite a real score.
    const lms = { 'cmi.core.score.raw': '75' };
    const { shim } = boot({ lmsStore: lms, catalogFails: true });
    await settle();
    shim().forceReport();
    assert.equal(lms['cmi.core.score.raw'], '75');
    assert.ok(!('cmi.suspend_data' in lms), 'must not blank suspend_data either');
  });

  it('keeps the standing grade when local storage is empty', async () => {
    // A new laptop, a cleared browser, or a failed restore: locally the student
    // looks like 0%, but credit only ever rises, so the LMS value wins.
    const lms = { 'cmi.core.score.raw': '58', 'cmi.suspend_data': '' };
    const { shim } = boot({ lmsStore: lms, local: {} });
    await settle();
    shim().forceReport();
    assert.ok(Number(lms['cmi.core.score.raw']) >= 58,
      `score fell to ${lms['cmi.core.score.raw']}`);
  });

  it('syncs a rank-up even when the rounded percent does not move', async () => {
    // Journeyman -> Master on set 4 of 12 is 33% before and after. Gating the
    // sync on the score would strand the timestamps that gate the next trial.
    const t0 = Date.parse('2026-01-01T00:00:00Z');
    const local = {};
    for (let i = 1; i <= 4; i++) {
      local[`lotrd_done_${setId(i)}`] = doneRec(t0);
      local[`lotrd_tier_${setId(i)}`] = tierRec(i === 4 ? 2 : 3, t0);
    }
    const lms = {};
    const { shim, storage } = boot({ lmsStore: lms, local });
    await settle();
    shim().forceReport();
    const before = lms['cmi.suspend_data'];
    const pctBefore = lms['cmi.core.score.raw'];

    storage.setItem(`lotrd_tier_${setId(4)}`, tierRec(3, t0));
    shim().forceReport();

    assert.equal(lms['cmi.core.score.raw'], pctBefore, 'precondition: percent is unchanged');
    assert.notEqual(lms['cmi.suspend_data'], before, 'suspend_data must still be rewritten');
    assert.match(lms['cmi.suspend_data'], /\["set_04\.json",3/);
  });

  it('keeps suspend_data inside the SCORM 1.2 4096-character limit', async () => {
    // Past the limit an LMS typically truncates silently, which corrupts the JSON
    // and loses every set at once.
    const t0 = Date.now();
    const local = {};
    for (let i = 1; i <= SET_COUNT; i++) {
      local[`lotrd_done_${setId(i)}`] = doneRec(t0);
      local[`lotrd_tier_${setId(i)}`] = tierRec(3, t0);
    }
    const lms = {};
    const { shim } = boot({ lmsStore: lms, local });
    await settle();
    shim().forceReport();
    const payload = lms['cmi.suspend_data'] || '';
    assert.ok(payload.length > 0 && payload.length <= 4096,
      `payload is ${payload.length} chars`);
    assert.equal(JSON.parse(payload).sets.length, SET_COUNT);
  });

  it('carries score and per-set ranks to a second device', async () => {
    const t0 = Date.parse('2026-02-01T00:00:00Z');
    const local = {};
    for (let i = 1; i <= 3; i++) {
      local[`lotrd_done_${setId(i)}`] = doneRec(t0);
      local[`lotrd_tier_${setId(i)}`] = tierRec(i, t0);
    }
    const lms = {};
    const a = boot({ lmsStore: lms, local });
    await settle();
    a.shim().forceReport();
    const scoreA = lms['cmi.core.score.raw'];

    const b = boot({ lmsStore: lms, local: {} });   // same LMS record, empty browser
    await settle();
    b.shim().forceReport();

    assert.equal(lms['cmi.core.score.raw'], scoreA);
    const restored = JSON.parse(b.storage.getItem(`lotrd_tier_${setId(3)}`));
    assert.equal(restored.tier, 3);
    assert.equal(Date.parse(restored.apprenticeAt), t0, 'timestamps gate the next trial');
  });

  it('still restores payloads written in the older millisecond format', async () => {
    const t0 = Date.parse('2026-03-01T00:00:00Z');
    const lms = {
      'cmi.suspend_data': JSON.stringify({ v: 2, sets: [[setId(1), 3, t0, t0, t0]] }),
    };
    const b = boot({ lmsStore: lms, local: {} });
    await settle();
    const rec = JSON.parse(b.storage.getItem(`lotrd_tier_${setId(1)}`));
    assert.equal(Date.parse(rec.apprenticeAt), t0);
  });

  it('exits as "suspend" so the LMS keeps the data for the next session', async () => {
    // Rank trials unlock days later. A normal exit invites the LMS to close the
    // attempt and hand back a clean one, losing the timestamps that gate them.
    const lms = {};
    const { shim, ctx } = boot({ lmsStore: lms, local: {} });
    await settle();
    let exitValue = null;
    const realSet = ctx.window.API.LMSSetValue;
    ctx.window.API.LMSSetValue = (k, v) => {
      if (k === 'cmi.core.exit') exitValue = v;
      return realSet(k, v);
    };
    shim().finishSession();
    assert.equal(exitValue, 'suspend');
  });

  it('still restores the v1 legacy array of completed set ids', async () => {
    const lms = { 'cmi.suspend_data': JSON.stringify([setId(1), setId(2)]) };
    const b = boot({ lmsStore: lms, local: {} });
    await settle();
    // Pre-tier completions are grandfathered at Master so nobody's score drops.
    assert.equal(JSON.parse(b.storage.getItem(`lotrd_tier_${setId(1)}`)).tier, 3);
  });
});
