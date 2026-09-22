// tests/scorm.test.js — the SCORM shim's grade-preservation guarantees.
//
// The shim runs as a plain script inside the LMS frame, so it is exercised here
// the way an LMS runs it: evaluated in a sandbox against a stubbed SCORM 1.2 API
// and a stubbed localStorage. Every case below is a way a student's real grade
// could be destroyed in the wild — a dropped connection, a new laptop, a cleared
// browser — and each one has bitten somebody's SCORM package before.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { boot, settle, SET_COUNT, setId, doneRec, tierRec } from './helpers/scorm-sandbox.js';

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

// ────────────────────────────────────────────────────────────────────────────────
// A session does not end cleanly. The LMS logs the student out mid-set, the wifi
// drops, the phone freezes the tab. Through all of it the game keeps saving to
// localStorage — so the danger is the shim BELIEVING the LMS has something it
// does not, because the next launch may be on a device where localStorage is
// empty and the LMS copy is all there is.
describe('SCORM shim survives an interrupted session', () => {
  const t0 = Date.parse('2026-09-10T00:00:00Z');
  const clearSet = (storage, i, tier = 1) => {
    storage.setItem(`lotrd_done_${setId(i)}`, doneRec(t0));
    storage.setItem(`lotrd_tier_${setId(i)}`, tierRec(tier, t0));
  };

  it('retries a write the LMS refused, until it lands', async () => {
    // The D2L session expired during a long set; the clear that follows is
    // refused. Nothing changes locally after that, so a shim that only writes on
    // change never tries again — and the credit exists in one browser only.
    const lms = {};
    const b = boot({ lmsStore: lms });
    await settle();
    b.control.down = true;
    clearSet(b.storage, 1);
    b.shim().forceReport();
    assert.ok(!('cmi.core.score.raw' in lms), 'precondition: the LMS refused it');

    b.control.down = false;                  // connection back; nothing new happened locally
    b.shim().forceReport();
    assert.equal(lms['cmi.core.score.raw'], '7');
    assert.match(lms['cmi.suspend_data'], /set_01\.json/);
  });

  it('treats an API that throws the same as one that refuses', async () => {
    const lms = {};
    const b = boot({ lmsStore: lms });
    await settle();
    b.control.throws = true;
    clearSet(b.storage, 1);
    b.shim().forceReport();
    b.control.throws = false;
    b.shim().forceReport();
    assert.equal(lms['cmi.core.score.raw'], '7');
  });

  it('tells the student, in the moment, when progress is not reaching the LMS', async () => {
    // The only time anything can be done about it is while the tab is still open.
    const b = boot({});
    await settle();
    assert.match(b.banner().textContent, /saved to D2L/i);

    b.control.down = true;
    clearSet(b.storage, 1);
    b.shim().forceReport();
    assert.match(b.banner().textContent, /not (been )?saved to D2L/i);
    assert.match(b.banner().textContent, /this browser/i, 'must say where the data IS safe');
    assert.equal(b.banner().attrs.role, 'alert');
    assert.equal(b.shim().syncState(), 'failing');

    b.control.down = false;
    b.shim().forceReport();
    assert.match(b.banner().textContent, /saved to D2L/i);
    assert.doesNotMatch(b.banner().textContent, /not (been )?saved/i);
    assert.equal(b.shim().syncState(), 'synced');
  });

  it('does not raise the score floor on a write that never landed', async () => {
    const lms = {};
    const b = boot({ lmsStore: lms });
    await settle();
    b.control.down = true;
    clearSet(b.storage, 1);
    b.shim().forceReport();
    b.control.down = false;
    // The credit turns out not to exist locally after all (storage cleared mid-session).
    b.storage.removeItem(`lotrd_done_${setId(1)}`);
    b.storage.removeItem(`lotrd_tier_${setId(1)}`);
    b.shim().forceReport();
    assert.ok(!('cmi.core.score.raw' in lms), 'a floor was invented from an unconfirmed write');
  });

  it('keeps trying when the catalog fetch fails at launch', async () => {
    // One dropped request at startup used to disable syncing for the whole session.
    const lms = {};
    const b = boot({ lmsStore: lms, catalogFails: true, local: {
      [`lotrd_done_${setId(1)}`]: doneRec(t0), [`lotrd_tier_${setId(1)}`]: tierRec(1, t0),
    } });
    await settle();
    b.shim().forceReport();                  // a tick while still offline: retries, fails again
    await settle();
    assert.ok(!('cmi.core.score.raw' in lms));

    b.control.catalogFails = false;
    b.shim().forceReport();                  // the next tick retries, and this time it loads…
    await settle();
    assert.equal(lms['cmi.core.score.raw'], '7', '…and reports without waiting for another tick');
  });

  it('connects late when the LMS was not ready at launch, and restores then', async () => {
    const lms = { 'cmi.suspend_data': JSON.stringify({ v: 2, sets: [[setId(1), 2, t0 / 1000, t0 / 1000]] }) };
    const b = boot({ lmsStore: lms, control: { initFails: true } });
    await settle();
    assert.equal(b.storage.getItem(`lotrd_done_${setId(1)}`), null, 'precondition: not connected yet');
    assert.match(b.banner().textContent, /not (been )?saved to D2L|not connected/i);

    b.control.initFails = false;
    b.shim().forceReport();
    assert.ok(b.storage.getItem(`lotrd_done_${setId(1)}`), 'late connection must still restore');
    assert.ok(b.dispatched.includes('lotrd-progress-restored'),
      'the game has already drawn its menu and has to be told to redraw it');
  });

  it('finds an LMS API that appears after the page has loaded', async () => {
    const lms = {};
    const b = boot({ lmsStore: lms, control: { noApi: true }, local: {
      [`lotrd_done_${setId(1)}`]: doneRec(t0), [`lotrd_tier_${setId(1)}`]: tierRec(1, t0),
    } });
    await settle();
    b.control.noApi = false;
    b.shim().forceReport();
    assert.equal(lms['cmi.core.score.raw'], '7');
  });

  it('survives looking for the LMS past a frame on another domain', async () => {
    // Reading anything on a cross-origin window throws. The first search ran with
    // no guard as the script loaded, so if the API was not there yet and the walk
    // reached such a frame, the whole shim died: no banner saying progress was not
    // reaching D2L, no retries, no finish — the silent failure it exists to prevent.
    const lms = {};
    const b = boot({ lmsStore: lms, control: { noApi: true }, crossOriginParent: true });
    await settle();
    assert.ok(b.shim(), 'the shim did not load');
    assert.match(b.banner().textContent, /Not connected to D2L/);
    b.control.noApi = false;
    clearSet(b.storage, 1);
    b.shim().forceReport();
    assert.equal(lms['cmi.core.score.raw'], '7');
  });

  it('never lets a late restore lower what the student earned while disconnected', async () => {
    // Played offline for a while, then the LMS came back holding older data.
    const lms = { 'cmi.core.score.raw': '7',
      'cmi.suspend_data': JSON.stringify({ v: 2, sets: [[setId(1), 1, t0 / 1000]] }) };
    const b = boot({ lmsStore: lms, control: { initFails: true } });
    await settle();
    clearSet(b.storage, 1, 2);               // Journeyman earned while disconnected
    clearSet(b.storage, 2, 1);
    b.control.initFails = false;
    b.shim().forceReport();
    assert.equal(JSON.parse(b.storage.getItem(`lotrd_tier_${setId(1)}`)).tier, 2);
    assert.equal(lms['cmi.core.score.raw'], '14');   // (0.9 + 0.8) / 12
  });

  it('finishes the session when the page is left, by whichever event arrives', async () => {
    // Found in the live course: after an update that stopped calling LMSFinish on
    // beforeunload, and skipped it on pagehide whenever the browser said the page
    // might be cached, no student's score reached the gradebook for days and
    // nothing crossed from one browser to another. Some LMS players send the data
    // to their server only on LMSFinish, whatever LMSCommit answered.
    for (const leave of [b => b.fire('beforeunload', { preventDefault() {} }),
                         b => b.fire('pagehide', { persisted: true }),
                         b => b.fire('pagehide', { persisted: false })]) {
      const b = boot({});
      await settle();
      leave(b);
      assert.ok(b.calls.includes('finish'), 'the LMS was never told the session ended');
    }
  });

  it('finishes once when the page is left, in the order browsers send the events', async () => {
    // beforeunload, then pagehide. pagehide used to find the session beforeunload
    // had just finished, open a new one, write everything again and finish that:
    // a second session per exit, possibly a new attempt, and the record of how
    // the first one ended overwritten.
    const b = boot({});
    await settle();
    clearSet(b.storage, 1);
    b.shim().forceReport();
    b.calls.length = 0;
    b.fire('beforeunload', { preventDefault() {} });
    b.fire('pagehide', { persisted: false });
    assert.deepEqual(b.calls.filter(c => c !== 'commit'), ['finish']);
    assert.match(b.storage.getItem('lotrd_scorm_last_exit'), /"because":"beforeunload"/);
  });

  it('still finishes on the way out after staying past a "Leave site?"', async () => {
    const lms = {};
    const b = boot({ lmsStore: lms });
    await settle();
    b.fire('beforeunload', { preventDefault() {} });   // finished; the page around us cancelled it
    clearSet(b.storage, 1);
    b.shim().forceReport();                             // they stayed, and cleared a set
    b.calls.length = 0;
    b.fire('pagehide', { persisted: false });
    assert.ok(b.calls.includes('finish'), 'the session opened after staying was never finished');
    assert.equal(lms['cmi.core.score.raw'], '7');
  });

  it('saves to an LMS that keeps nothing until LMSFinish', async () => {
    const lms = {};
    const chrome = boot({ lmsStore: lms, control: { persistOnFinish: true } });
    await settle();
    clearSet(chrome.storage, 1);
    chrome.shim().forceReport();
    assert.ok(!('cmi.core.score.raw' in lms), 'precondition: this LMS has kept nothing yet');
    chrome.fire('pagehide', { persisted: true });      // navigating away inside the LMS

    const firefox = boot({ lmsStore: lms, control: { persistOnFinish: true }, local: {} });
    assert.ok(firefox.storage.getItem(`lotrd_done_${setId(1)}`), 'the set cleared in one browser did not reach the other');
    await settle();
    assert.match(firefox.banner().textContent, /Course score: 7%/);
  });

  it('carries on if the student stays after all: a finished session is reopened', async () => {
    // "Leave site?" → Stay. The session was finished a moment ago; the next save
    // has to reconnect rather than silently go nowhere.
    const lms = {};
    const b = boot({ lmsStore: lms });
    await settle();
    b.fire('beforeunload', { preventDefault() {} });
    clearSet(b.storage, 1);
    b.shim().forceReport();
    assert.equal(lms['cmi.core.score.raw'], '7');
  });

  it('does not finish the session while it is asking the student not to leave', async () => {
    // Unsaved progress raises "Leave site?". If they stay, the connection that is
    // about to be needed for the retry should still be there.
    const b = boot({});
    await settle();
    b.control.down = true;
    clearSet(b.storage, 1);
    b.shim().forceReport();
    b.calls.length = 0;
    b.fire('beforeunload', { preventDefault() {} });
    assert.ok(!b.calls.includes('finish'));
  });

  it('can say what the LMS told it, for a bug report', async () => {
    const lms = { 'cmi.core.entry': 'resume', 'cmi.core.score.raw': '27' };
    const b = boot({ lmsStore: lms });
    await settle();
    clearSet(b.storage, 1);
    b.shim().forceReport();
    const d = b.shim().diagnose();
    assert.equal(d.atLaunch.entry, 'resume');
    assert.equal(d.atLaunch.score, '27');
    assert.equal(d.lastWrite.commit, 'true');
    assert.equal(d.connected, true);
    assert.ok('build' in d && 'finishes' in d && 'previousExit' in d);
  });

  it('reconnects when the page comes back from the back/forward cache', async () => {
    const lms = {};
    const b = boot({ lmsStore: lms });
    await settle();
    b.fire('pagehide', { persisted: false });
    assert.ok(b.calls.includes('finish'));
    b.fire('pageshow', { persisted: true });
    clearSet(b.storage, 1);
    b.shim().forceReport();
    assert.equal(lms['cmi.core.score.raw'], '7', 'writes after a bfcache restore were dropped');
  });

  it('flushes when the tab is hidden, which on a phone is often the last event there is', async () => {
    const lms = {};
    const b = boot({ lmsStore: lms });
    await settle();
    clearSet(b.storage, 1);
    b.ctx.document.hidden = true;
    b.fire('doc:visibilitychange', {});
    assert.equal(lms['cmi.core.score.raw'], '7');
  });

  it('asks before leaving only while something is unsaved', async () => {
    const b = boot({});
    await settle();
    const clean = { preventDefault() { this.prevented = true; } };
    b.fire('beforeunload', clean);
    assert.ok(!clean.prevented, 'must not nag when everything is saved');

    b.control.down = true;
    clearSet(b.storage, 1);
    b.shim().forceReport();
    const dirty = { preventDefault() { this.prevented = true; } };
    b.fire('beforeunload', dirty);
    assert.ok(dirty.prevented, 'leaving now would strand the credit in this browser');
  });
});
