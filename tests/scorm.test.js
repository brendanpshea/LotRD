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
function boot({ lmsStore = {}, local = {}, catalogFails = false, readyState = 'complete' } = {}) {
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
      readyState,
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

  it('restores before the game can draw its menu', () => {
    // The shim is a classic script placed ahead of the game's module script, so
    // whatever it does while being evaluated is finished before the game starts.
    // Anything it defers — to DOMContentLoaded, or past its own catalog fetch —
    // races the game's menu, which reads localStorage the moment ITS catalog
    // fetch lands. Losing that race paints every cleared set as "not started" on
    // a browser whose storage came back empty (Safari discards storage for
    // embedded frames; so does a new device), and the student replays the set.
    const t0 = Date.parse('2026-09-01T00:00:00Z');
    const lms = {
      'cmi.suspend_data': JSON.stringify({ v: 2, sets: [[setId(1), 1, t0 / 1000]] }),
    };
    // As in the shipped page: still parsing, DOMContentLoaded not yet fired.
    const b = boot({ lmsStore: lms, local: {}, readyState: 'loading' });
    // No settle(): this is the state the game's constructor would see.
    assert.ok(b.storage.getItem(`lotrd_done_${setId(1)}`), 'completion not restored in time');
    const rec = JSON.parse(b.storage.getItem(`lotrd_tier_${setId(1)}`));
    assert.equal(rec.tier, 1);
    assert.equal(Date.parse(rec.apprenticeAt), t0, 'the timestamp gates the Journeyman trial');
  });

  it('never writes a zero score', async () => {
    // Republishing a package can hand every student a fresh attempt. One whose
    // browser storage is also empty then computes 0% — and writing that would
    // replace the grade they had earned under the previous version.
    const lms = {};
    const { shim, storage } = boot({ lmsStore: lms, local: {} });
    await settle();
    shim().forceReport();
    assert.ok(!('cmi.core.score.raw' in lms), `wrote ${lms['cmi.core.score.raw']}`);

    // ...but the first real credit is reported as usual.
    const t0 = Date.parse('2026-09-01T00:00:00Z');
    storage.setItem(`lotrd_done_${setId(1)}`, doneRec(t0));
    storage.setItem(`lotrd_tier_${setId(1)}`, tierRec(1, t0));
    shim().forceReport();
    assert.equal(lms['cmi.core.score.raw'], '7');   // 0.8 of 1 set in 12
  });

  it('leaves an unreadable suspend_data alone rather than blanking it', async () => {
    // Truncated by the LMS, say. The restore cannot use it, but it is still the
    // only record of what the student cleared, and a person could read it.
    const broken = '{"v":2,"sets":[["set_01.json",2,17';
    const lms = { 'cmi.suspend_data': broken };
    const { shim } = boot({ lmsStore: lms, local: {} });
    await settle();
    shim().forceReport();
    assert.equal(lms['cmi.suspend_data'], broken);
  });

  it('does not let a stale browser roll back a rank earned on another device', async () => {
    // Laptop cleared the set (Apprentice). The phone later passed the Journeyman
    // trial, so the LMS holds rank 2. Back on the laptop, its own older record
    // must give way — otherwise the trial shows as still owed and the next sync
    // writes rank 1 over the LMS copy.
    const t0 = Date.parse('2026-09-01T00:00:00Z');
    const t1 = Date.parse('2026-09-05T00:00:00Z');
    const lms = {
      'cmi.suspend_data': JSON.stringify({ v: 2, sets: [[setId(1), 2, t0 / 1000, t1 / 1000]] }),
    };
    const laptop = {
      [`lotrd_done_${setId(1)}`]: doneRec(t0),
      [`lotrd_tier_${setId(1)}`]: JSON.stringify({ tier: 1, apprenticeAt: new Date(t0).toISOString() }),
    };
    const { shim, storage } = boot({ lmsStore: lms, local: laptop });
    await settle();
    shim().forceReport();

    const rec = JSON.parse(storage.getItem(`lotrd_tier_${setId(1)}`));
    assert.equal(rec.tier, 2);
    assert.equal(Date.parse(rec.journeymanAt), t1, 'this timestamp gates the Master trial');
    assert.equal(Date.parse(rec.apprenticeAt), t0);
    assert.match(lms['cmi.suspend_data'], /\["set_01\.json",2,/, 'LMS copy must not regress');
  });

  it('lets a rank earned in this browser overwrite an older LMS copy', async () => {
    const t0 = Date.parse('2026-09-01T00:00:00Z');
    const lms = {
      'cmi.suspend_data': JSON.stringify({ v: 2, sets: [[setId(1), 1, t0 / 1000]] }),
    };
    const local = {
      [`lotrd_done_${setId(1)}`]: doneRec(t0),
      [`lotrd_tier_${setId(1)}`]: tierRec(3, t0),
    };
    const { shim, storage } = boot({ lmsStore: lms, local });
    await settle();
    shim().forceReport();
    assert.equal(JSON.parse(storage.getItem(`lotrd_tier_${setId(1)}`)).tier, 3);
    assert.match(lms['cmi.suspend_data'], /\["set_01\.json",3,/);
  });

  it('carries player level and a half-finished set to a second device', async () => {
    const pos = { h: 'abc123', r: '12-49,3,7', m: '3,7', c: 20, w: 4, t: 1789000000 };
    const lms = {};
    const phone = boot({ lmsStore: lms, local: {
      lotrd_player_level: JSON.stringify({ level: 4, xp: 55, revive_charges: 2 }),
      [`lotrd_pos_${setId(2)}`]: JSON.stringify(pos),
    } });
    await settle();
    phone.shim().forceReport();

    const laptop = boot({ lmsStore: lms, local: {}, readyState: 'loading' });
    // Synchronously, like the set restore: the game reads these at startup too.
    assert.deepEqual(JSON.parse(laptop.storage.getItem('lotrd_player_level')),
      { level: 4, xp: 55, revive_charges: 2 });
    assert.deepEqual(JSON.parse(laptop.storage.getItem(`lotrd_pos_${setId(2)}`)), pos);
  });

  it('keeps whichever half-finished position is newer', async () => {
    const older = { h: 'abc123', r: '5-49', m: '', c: 5, w: 0, t: 1789000000 };
    const newer = { h: 'abc123', r: '30-49', m: '', c: 30, w: 0, t: 1789090000 };
    const asRow = p => [setId(2), p.h, p.r, p.m, p.c, p.w, p.t];

    // LMS is ahead of this browser → the browser takes the LMS copy.
    const behind = boot({
      lmsStore: { 'cmi.suspend_data': JSON.stringify({ v: 2, sets: [], pos: [asRow(newer)] }) },
      local: { [`lotrd_pos_${setId(2)}`]: JSON.stringify(older) },
    });
    assert.equal(JSON.parse(behind.storage.getItem(`lotrd_pos_${setId(2)}`)).r, '30-49');

    // This browser is ahead of the LMS → it keeps its own, and publishes it.
    const lms = { 'cmi.suspend_data': JSON.stringify({ v: 2, sets: [], pos: [asRow(older)] }) };
    const ahead = boot({ lmsStore: lms, local: { [`lotrd_pos_${setId(2)}`]: JSON.stringify(newer) } });
    await settle();
    ahead.shim().forceReport();
    assert.equal(JSON.parse(ahead.storage.getItem(`lotrd_pos_${setId(2)}`)).r, '30-49');
    assert.equal(JSON.parse(lms['cmi.suspend_data']).pos[0][2], '30-49');
  });

  it('drops a half-finished position once the set has been cleared anywhere', async () => {
    // Phone left set 2 half done; the laptop then finished it. The phone's stale
    // position must neither come back from the LMS nor be written back to it.
    const t0 = Date.parse('2026-09-10T00:00:00Z');
    const stale = [setId(2), 'abc123', '30-49', '', 30, 0, 1789000000];
    const lms = { 'cmi.suspend_data': JSON.stringify({
      v: 2, sets: [[setId(2), 1, t0 / 1000]], pos: [stale],
    }) };
    const phone = boot({ lmsStore: lms, local: {
      [`lotrd_pos_${setId(2)}`]: JSON.stringify({ h: 'abc123', r: '30-49', m: '', c: 30, w: 0, t: 1789000000 }),
    } });
    await settle();
    phone.shim().forceReport();
    assert.ok(!('pos' in JSON.parse(lms['cmi.suspend_data'])));

    const fresh = boot({ lmsStore: { 'cmi.suspend_data': JSON.stringify({
      v: 2, sets: [[setId(2), 1, t0 / 1000]], pos: [stale],
    }) }, local: {} });
    assert.equal(fresh.storage.getItem(`lotrd_pos_${setId(2)}`), null);
  });

  it('takes the higher player level in either direction', async () => {
    const lvl = (level, xp) => JSON.stringify({ level, xp, revive_charges: 0 });
    const lmsAhead = boot({
      lmsStore: { 'cmi.suspend_data': JSON.stringify({ v: 2, sets: [], lvl: [5, 10, 1] }) },
      local: { lotrd_player_level: lvl(3, 90) },
    });
    assert.equal(JSON.parse(lmsAhead.storage.getItem('lotrd_player_level')).level, 5);

    const lms = { 'cmi.suspend_data': JSON.stringify({ v: 2, sets: [], lvl: [3, 90, 0] }) };
    const localAhead = boot({ lmsStore: lms, local: { lotrd_player_level: lvl(5, 10) } });
    await settle();
    localAhead.shim().forceReport();
    assert.equal(JSON.parse(localAhead.storage.getItem('lotrd_player_level')).level, 5);
    assert.deepEqual(JSON.parse(lms['cmi.suspend_data']).lvl, [5, 10, 0]);
  });

  it('sheds half-finished positions before it sheds any credit', async () => {
    // Every set cleared AND an absurdly long position for each of them would not
    // fit. Positions are a convenience; ranks are the grade.
    const t0 = Date.now();
    const local = { lotrd_player_level: JSON.stringify({ level: 9, xp: 1, revive_charges: 0 }) };
    for (let i = 1; i <= 6; i++) {
      local[`lotrd_done_${setId(i)}`] = doneRec(t0);
      local[`lotrd_tier_${setId(i)}`] = tierRec(3, t0);
    }
    const sprawl = Array.from({ length: 200 }, (_, i) => i * 2).join(',');
    for (let i = 7; i <= SET_COUNT; i++) {
      local[`lotrd_pos_${setId(i)}`] = JSON.stringify({ h: 'abc123', r: sprawl, m: '', c: 0, w: 0, t: 1 });
    }
    const lms = {};
    const { shim } = boot({ lmsStore: lms, local });
    await settle();
    shim().forceReport();
    const payload = lms['cmi.suspend_data'];
    assert.ok(payload.length <= 4096, `payload is ${payload.length} chars`);
    const data = JSON.parse(payload);
    assert.equal(data.sets.length, 6, 'no cleared set may be dropped to make room');
    assert.deepEqual(data.lvl, [9, 1, 0]);
    assert.ok(!('pos' in data));
  });

  it('writes a payload an older copy of the shim can still read', async () => {
    // A browser may run a cached older shim against data a newer one wrote. The
    // old reader looks for { v: 2, sets } and must find exactly that.
    const t0 = Date.parse('2026-09-01T00:00:00Z');
    const lms = {};
    const { shim } = boot({ lmsStore: lms, local: {
      [`lotrd_done_${setId(1)}`]: doneRec(t0),
      [`lotrd_tier_${setId(1)}`]: tierRec(1, t0),
      lotrd_player_level: JSON.stringify({ level: 2, xp: 5, revive_charges: 1 }),
    } });
    await settle();
    shim().forceReport();
    const data = JSON.parse(lms['cmi.suspend_data']);
    assert.equal(data.v, 2);
    assert.equal(data.sets[0][0], setId(1));
  });

  it('marks the session as suspended from the start, not only at unload', async () => {
    // Browsers block or drop network calls made while a page is being torn down,
    // and an LMS frame is torn down by its parent. If "suspend" is only ever set
    // in the unload handler it may never reach the LMS, which is then free to
    // open a fresh attempt next launch — with empty suspend_data.
    const lms = {};
    boot({ lmsStore: lms, local: {} });
    await settle();
    assert.equal(lms['cmi.core.exit'], 'suspend');
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
