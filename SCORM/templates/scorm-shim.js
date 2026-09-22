/* SCORM 1.2 shim for Loop of the Recursive Dragon.
 *
 * - Discovers the LMS API.
 * - Mirrors completed-set IDs AND mastery-tier records into cmi.suspend_data
 *   so progress (including the tier timestamps that gate rank trials)
 *   survives across devices. Also carries the player's level and the position
 *   reached in any half-finished set, so a set begun on a phone can be picked
 *   up on a laptop. Students routinely use several devices: browser storage is
 *   a cache, and the LMS is the record.
 * - Reports score = sum of per-set tier credit / total sets * 100:
 *   Apprentice (first clear) 80%, Journeyman 90%, Master 100% of a set's
 *   credit. Credit only ever rises, so the reported score stays monotonic.
 *   Sets completed before the tier system existed count as Master
 *   (grandfathered) so no student's score drops on upgrade.
 * - Renders a "Course progress" banner so students see live progress
 *   without waiting on the LMS gradebook view.
 * - Assumes the session will be interrupted. The LMS logs students out mid-set,
 *   connections drop, phones freeze tabs. The game keeps saving to localStorage
 *   through all of that, so the one thing this shim must never do is BELIEVE the
 *   LMS holds something it does not: the next launch may be on a device with
 *   empty storage, where the LMS copy is all there is. Hence: nothing counts as
 *   saved until the LMS confirms it; anything unconfirmed is retried on every
 *   tick; a lost connection is re-established when possible; and the banner says
 *   plainly, while the tab is still open, when progress is not getting through.
 *
 * If no LMS API is ever reachable (e.g. running locally), the game runs normally
 * and the banner says progress is being kept in this browser only.
 */
(function () {
  "use strict";

  const COMPLETION_PREFIX = "lotrd_done_";
  const TIER_PREFIX = "lotrd_tier_";
  const POSITION_PREFIX = "lotrd_pos_";
  const LEVEL_KEY = "lotrd_player_level";
  const TIER_CREDIT = [0, 0.8, 0.9, 1.0];
  const TIER_MASTER = 3;
  const POLL_MS = 3000;
  const EXIT_KEY = "lotrd_scorm_last_exit";

  // A SINGLE-SET package: one problem set, worth full credit when it is cleared.
  // SCORM/build.py writes the set's id into the page. There are no ranks, trials or
  // spacing in this mode — credit is one fact, written once as 100, and the rules
  // that already protect a grade (never write a zero, never go below what the LMS
  // holds) are all it needs. See tests/scorm-single.test.js.
  const SINGLE = (typeof window.LOTRD_SINGLE_SET === "string" && window.LOTRD_SINGLE_SET) || null;
  // Stamped by SCORM/build.py, so a bug report can say which package it came from.
  const BUILD = "{{BUILD}}";

  // ---------- LMS discovery ----------
  // Reading anything on a window from another domain throws, and the walk up the
  // frames can reach one (D2L's own pages around its player; D2L inside Teams).
  // An unguarded read here, as the script loaded, used to kill the whole shim —
  // no banner, no retries, no finish — so each read is guarded and the walk goes on.
  function apiOf(win) {
    try { return win.API || null; } catch (_) { return null; }
  }

  function findApi(win) {
    let depth = 0;
    let cur = win;
    while (cur && depth < 20) {
      const found = apiOf(cur);
      if (found) return found;
      let parent = null;
      try { parent = cur.parent; } catch (_) {}
      if (!parent || parent === cur) break;
      cur = parent;
      depth++;
    }
    let opener = null;
    try { opener = win.opener; } catch (_) {}
    return opener ? apiOf(opener) : null;
  }

  // Not const: some LMS players put their API in place after the content frame
  // has started loading, so discovery is retried until it succeeds.
  let api = findApi(window);
  let initialized = false;

  function hasLms() {
    if (!api) api = findApi(window);
    return !!api;
  }

  function lmsCall(name, ...args) {
    if (!api || !initialized) return "";
    try { return api[name](...args); } catch (_) { return ""; }
  }

  /** SCORM 1.2 says "true"; some players return a real boolean. Anything else —
   *  "false", "", undefined, a throw caught by lmsCall — is a failure. */
  function ok(result) { return result === "true" || result === true; }

  function lmsInit() {
    if (!hasLms()) return false;
    try {
      initialized = ok(api.LMSInitialize(""));
      return initialized;
    } catch (_) { return false; }
  }

  // "suspend" tells the LMS this is a pause, not a finished attempt, so
  // suspend_data survives to the next launch. Students come back days later for
  // rank trials, and the default exit ("" = normal) invites an LMS to close the
  // attempt and start the next one clean — which would discard the tier
  // timestamps that gate those trials.
  function markSuspended() {
    lmsCall("LMSSetValue", "cmi.core.exit", "suspend");
  }

  // Every exit calls LMSFinish. This is not politeness: some LMS players answer
  // "true" to every SetValue and Commit and only send the data to their server on
  // LMSFinish. A build of this shim that skipped it — on beforeunload, because
  // leaving can be cancelled, and on pagehide whenever the browser said the page
  // might be cached — sent nothing to the live course's gradebook for days, while
  // its banner said "saved". A session finished too early costs a reconnect (see
  // connect()); a session never finished can cost everything.
  let finishes = 0;
  // True from a beforeunload that finished the session until anything reconnects.
  let finishedByBeforeunload = false;

  function lmsFinish(because) {
    if (!api || !initialized) return;
    markSuspended();
    let commit = "", finish = "";
    try { commit = String(api.LMSCommit("")); } catch (e) { commit = "threw: " + e; }
    try { finish = String(api.LMSFinish("")); } catch (e) { finish = "threw: " + e; }
    initialized = false;
    finishes++;
    try {
      localStorage.setItem(EXIT_KEY, JSON.stringify({
        at: new Date().toISOString(), because: because || "?", commit: commit, finish: finish,
        error: lastLmsError(),
      }));
    } catch (_) {}
  }

  // ---------- whose progress is in this browser? ----------
  // D2L serves every student's copy of the activity from the same address, so on
  // a lab or library PC they all share one localStorage. Nothing in it said whose
  // it was: the next student to open the activity there had the last one's
  // cleared sets merged into their own D2L record, and — since a grade is never
  // lowered — kept that credit for good. So the browser's progress is tagged with
  // the student it belongs to, and set aside (never deleted: it may be the only
  // copy of work D2L did not receive) when someone else connects.
  const OWNER_KEY = "lotrd_learner";
  const STASH_PREFIX = "lotrd_stash_";
  // Settings and diagnostics belong to the browser, not the student. The save-data
  // version must stay put: without it the game's start-up housekeeping would
  // purge the saves of whichever student's progress is being put back.
  const BROWSER_KEYS = [OWNER_KEY, EXIT_KEY, "lotrd_sound", "lotrd_save_data_version"];
  // Set when another student's progress could not be set aside: this session then
  // neither restores into nor reports from a browser holding someone else's work.
  let foreignProgress = false;

  /** A digest of the LMS's learner id. Only this is stored, never the id itself. */
  function learnerTag(id) {
    let a = 0x811c9dc5, b = 0x01000193 ^ 0x9e3779b9;
    for (let i = 0; i < id.length; i++) {
      const c = id.charCodeAt(i);
      a = Math.imul(a ^ c, 0x01000193) >>> 0;
      b = Math.imul(b ^ c, 0x85ebca6b) >>> 0;
    }
    return ("0000000" + a.toString(16)).slice(-8) + ("0000000" + b.toString(16)).slice(-8);
  }

  function isLearnerKey(key) {
    return key.indexOf("lotrd_") === 0 && key.indexOf(STASH_PREFIX) !== 0 && BROWSER_KEYS.indexOf(key) < 0;
  }

  /**
   * Store a student's set-aside progress. If the browser's storage is full, the
   * oldest copy set aside for some OTHER student is dropped to make room: it is a
   * spare, of progress normally already in that student's D2L record, whereas
   * failing here would leave this one's in the way of the student now connecting.
   */
  function writeStash(tag, payload) {
    for (;;) {
      try { localStorage.setItem(STASH_PREFIX + tag, payload); return true; } catch (_) {}
      let oldestKey = null, oldestAt = Infinity;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || key.indexOf(STASH_PREFIX) !== 0 || key === STASH_PREFIX + tag) continue;
        const at = (readJson(key) || {}).t || 0;
        if (at < oldestAt) { oldestAt = at; oldestKey = key; }
      }
      if (!oldestKey) return false;
      console.warn("[scorm-shim] storage full; dropping the oldest set-aside progress");
      localStorage.removeItem(oldestKey);
    }
  }

  /**
   * Make this browser's progress the connecting student's own. Returns false when
   * another student's progress is here and could not be moved out of the way.
   */
  function adoptLearner(studentId) {
    if (!studentId) return true;      // an LMS that does not say: nothing to tell apart
    const tag = learnerTag(studentId);
    try {
      const owner = localStorage.getItem(OWNER_KEY);
      if (owner === tag) return true;
      if (owner) {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && isLearnerKey(key)) keys.push(key);
        }
        if (keys.length > 0) {
          const stash = { t: Date.now(), d: {} };
          for (const key of keys) stash.d[key] = localStorage.getItem(key);
          if (!writeStash(owner, JSON.stringify(stash))) return false;
          for (const key of keys) localStorage.removeItem(key);
        }
      }
      // No owner recorded: progress saved before browsers were told apart. It is
      // claimed by the first student to connect — almost always the one whose
      // browser it is.
      const mine = readJson(STASH_PREFIX + tag);
      if (mine && mine.d && typeof mine.d === "object") {
        for (const key of Object.keys(mine.d)) {
          if (isLearnerKey(key) && typeof mine.d[key] === "string") localStorage.setItem(key, mine.d[key]);
        }
        localStorage.removeItem(STASH_PREFIX + tag);
      }
      localStorage.setItem(OWNER_KEY, tag);
      return true;
    } catch (_) {
      // Storage unusable (blocked, private mode): then it holds no one's progress.
      return true;
    }
  }

  // ---------- catalog & progress ----------
  let totalSets = 0;
  let playableIds = [];

  async function loadCatalog() {
    if (SINGLE) {
      // The package knows its one set without asking: one less request that can
      // fail, and no way for another set in the catalog to dilute the grade.
      playableIds = [SINGLE];
      totalSets = 1;
      return;
    }
    try {
      const res = await fetch("question_sets/catalog.json", { cache: "no-store" });
      const catalog = await res.json();
      const ids = [];
      for (const topic of catalog) {
        for (const entry of (topic.sets || [])) {
          if (!entry.review && entry.id) ids.push(entry.id);
        }
      }
      playableIds = ids;
      totalSets = ids.length;
    } catch (e) {
      console.warn("[scorm-shim] catalog load failed", e);
    }
  }

  function completedCount() {
    let n = 0;
    for (const id of playableIds) {
      try {
        if (localStorage.getItem(COMPLETION_PREFIX + id)) n++;
      } catch (_) {}
    }
    return n;
  }

  function readJson(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  /** 0 = not cleared, 1..3 = Apprentice/Journeyman/Master. */
  function tierForSet(id) {
    if (SINGLE) {
      // All or nothing: cleared is full credit, whatever rank the game recorded.
      try { return localStorage.getItem(COMPLETION_PREFIX + id) ? TIER_MASTER : 0; } catch (_) { return 0; }
    }
    const rec = readJson(TIER_PREFIX + id);
    const t = rec && typeof rec.tier === "number" ? Math.floor(rec.tier) : 0;
    if (t >= 1) return Math.min(t, TIER_MASTER);
    // Cleared before the tier system existed: grandfathered at Master so the
    // gradebook score never drops on upgrade.
    try {
      if (localStorage.getItem(COMPLETION_PREFIX + id)) return TIER_MASTER;
    } catch (_) {}
    return 0;
  }

  function progressPercent() {
    if (totalSets === 0) return 0;
    let credit = 0;
    for (const id of playableIds) {
      credit += TIER_CREDIT[tierForSet(id)] || 0;
    }
    return Math.round((credit / totalSets) * 100);
  }

  // ---------- suspend_data sync ----------
  // v1 (legacy): a JSON array of completed set IDs.
  // v2: { v: 2, sets: [[id, tier, apprenticeS, journeymanS, masterS], ...],
  //       lvl: [level, xp, reviveCharges],                        (optional)
  //       pos: [[id, fingerprint, remaining, missed, correct, incorrect, savedS], ...] }
  // lvl and pos were added later and are optional; a reader that predates them
  // ignores them, so the version number did not need to move.
  function msToIso(ms) {
    return new Date(ms > 0 ? ms : 0).toISOString();
  }

  function isoToMs(iso) {
    const ms = Date.parse(iso || "");
    return Number.isFinite(ms) ? ms : 0;
  }

  /** Timestamps used to be written in ms and are now written in seconds. */
  function toMs(value) {
    const n = Number(value) || 0;
    if (n <= 0) return 0;
    return n < 1e11 ? n * 1000 : n;
  }

  function restoreSet(id, tier, aMs, jMs, mMs) {
    try {
      const doneKey = COMPLETION_PREFIX + id;
      if (!localStorage.getItem(doneKey)) {
        localStorage.setItem(doneKey, JSON.stringify({
          completedAt: msToIso(aMs),
          score_pct: 100,
          level: 0,
          restored: true,
        }));
      }
      // Whichever side holds the higher rank wins. Students move between a phone,
      // a classroom machine and a laptop, so a browser that already has a record
      // is often a STALE one: a rank earned elsewhere since its last visit must
      // replace it. Keeping the local record regardless would show the trial as
      // still owed, and the next sync would write the lower rank back to the LMS.
      const tierKey = TIER_PREFIX + id;
      const local = readJson(tierKey);
      const localTier = local && typeof local.tier === "number" ? Math.floor(local.tier) : 0;
      if (localTier < tier) {
        const rec = Object.assign({}, local || {}, { tier: tier, restored: true });
        if (!rec.apprenticeAt) rec.apprenticeAt = msToIso(aMs);
        if (tier >= 2) rec.journeymanAt = msToIso(jMs);
        if (tier >= 3) rec.masterAt = msToIso(mMs);
        localStorage.setItem(tierKey, JSON.stringify(rec));
      }
    } catch (_) {}
  }

  /** XP resets at each level, so "further along" compares level first. */
  function levelAhead(aLevel, aXp, bLevel, bXp) {
    return aLevel !== bLevel ? aLevel > bLevel : aXp > bXp;
  }

  function restoreLevel(row) {
    if (!Array.isArray(row)) return;
    const level = Math.floor(row[0]) || 0;
    const xp = Math.floor(row[1]) || 0;
    if (level < 1) return;
    const local = readJson(LEVEL_KEY);
    const localLevel = local && Math.floor(local.level) || 0;
    const localXp = local && Math.floor(local.xp) || 0;
    if (!levelAhead(level, xp, localLevel, localXp)) return;
    try {
      localStorage.setItem(LEVEL_KEY, JSON.stringify({
        level: level, xp: xp, revive_charges: Math.max(Math.floor(row[2]) || 0, 0),
      }));
    } catch (_) {}
  }

  /**
   * A half-finished set's position. Newest wins: the game writes one beside every
   * save, stamped with the time, so the LMS copy is only worth having when it is
   * later than this browser's — meaning the student carried the set further on
   * another device. The game decides what to do with it (see controller.js).
   */
  function restorePosition(row) {
    if (!Array.isArray(row) || typeof row[0] !== "string" ||
        typeof row[1] !== "string" || typeof row[2] !== "string") return;
    const id = row[0];
    const savedAt = Math.floor(row[6]) || 0;
    try {
      if (localStorage.getItem(COMPLETION_PREFIX + id)) return;   // already cleared
      const local = readJson(POSITION_PREFIX + id);
      if (local && (Math.floor(local.t) || 0) >= savedAt) return;
      localStorage.setItem(POSITION_PREFIX + id, JSON.stringify({
        h: row[1], r: row[2], m: typeof row[3] === "string" ? row[3] : "",
        c: Math.floor(row[4]) || 0, w: Math.floor(row[5]) || 0, t: savedAt,
      }));
    } catch (_) {}
  }

  /**
   * Merge what the LMS holds into this browser. With `setsOnly`, just the cleared
   * sets and their ranks: that form is used mid-session, where restoring a
   * position or a level could resurrect a run the student has since ended.
   */
  function restoreFromSuspendData(setsOnly) {
    if (!initialized) return;
    const raw = lmsCall("LMSGetValue", "cmi.suspend_data");
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        // Legacy format: completion implies full (grandfathered) credit.
        for (const id of data) restoreSet(id, TIER_MASTER, 0, 0, 0);
        return;
      }
      if (data && data.v === 2 && Array.isArray(data.sets)) {
        for (const entry of data.sets) {
          if (!Array.isArray(entry) || typeof entry[0] !== "string") continue;
          const tier = Math.min(Math.max(Math.floor(entry[1]) || 0, 1), TIER_MASTER);
          restoreSet(entry[0], tier, toMs(entry[2]), toMs(entry[3]), toMs(entry[4]));
        }
      }
      if (data && data.v === 2 && !setsOnly) {
        restoreLevel(data.lvl);
        // After the sets: a position for a set that has since been cleared is stale.
        if (Array.isArray(data.pos)) data.pos.forEach(restorePosition);
      }
    } catch (_) {}
  }

  /** The rows that describe every cleared set, or null when there is no LMS. */
  function buildSuspendSets() {
    const sets = [];
    for (const id of playableIds) {
      const done = readJson(COMPLETION_PREFIX + id);
      if (!done) continue;
      let rec = readJson(TIER_PREFIX + id);
      if (!rec || typeof rec.tier !== "number" || rec.tier < 1) {
        // Legacy completion with no tier record: carry the grandfathered
        // Master rank across devices too.
        const at = isoToMs(done.completedAt);
        rec = { tier: TIER_MASTER, apprenticeAt: msToIso(at), journeymanAt: msToIso(at), masterAt: msToIso(at) };
      }
      sets.push([
        id,
        Math.min(Math.floor(rec.tier), TIER_MASTER),
        isoToMs(rec.apprenticeAt),
        isoToMs(rec.journeymanAt),
        isoToMs(rec.masterAt),
      ]);
    }
    return sets;
  }

  /** [level, xp, reviveCharges], or null while there is nothing to say. */
  function buildLevel() {
    const rec = readJson(LEVEL_KEY);
    const level = rec && Math.floor(rec.level) || 0;
    const xp = rec && Math.floor(rec.xp) || 0;
    if (level < 1 || (level === 1 && xp === 0)) return null;
    return [level, xp, Math.max(Math.floor(rec.revive_charges) || 0, 0)];
  }

  /** One row per half-finished set. Cleared sets are skipped: their run is over. */
  function buildPositions() {
    const rows = [];
    for (const id of playableIds) {
      const rec = readJson(POSITION_PREFIX + id);
      if (!rec || typeof rec.h !== "string" || typeof rec.r !== "string") continue;
      try { if (localStorage.getItem(COMPLETION_PREFIX + id)) continue; } catch (_) {}
      rows.push([id, rec.h, rec.r, typeof rec.m === "string" ? rec.m : "",
        Math.floor(rec.c) || 0, Math.floor(rec.w) || 0, Math.floor(rec.t) || 0]);
    }
    return rows;
  }

  /** Everything worth syncing, or null when there is no LMS. */
  function buildState() {
    return { sets: buildSuspendSets() || [], level: buildLevel(), positions: buildPositions() };
  }

  function isEmptyState(state) {
    return state.sets.length === 0 && !state.level && state.positions.length === 0;
  }

  // SCORM 1.2 guarantees only 4096 characters of suspend_data, and an LMS that
  // exceeds it usually truncates silently — which would corrupt the JSON and lose
  // every set at once. Timestamps are stored in seconds rather than milliseconds,
  // and trailing zero timestamps are dropped, to buy headroom. If a payload still
  // will not fit, things are shed in order of what they cost the student: first
  // the half-finished positions (a convenience), then the lowest-ranked sets
  // (credit) — rather than writing nothing at all.
  const SUSPEND_LIMIT = 4000;

  function encodeState(state) {
    const out = {
      v: 2,
      sets: state.sets.map(function (s) {
        const row = [s[0], s[1], Math.floor(s[2] / 1000), Math.floor(s[3] / 1000), Math.floor(s[4] / 1000)];
        while (row.length > 2 && !row[row.length - 1]) row.pop();
        return row;
      }),
    };
    if (state.level) out.lvl = state.level;
    if (state.positions.length > 0) out.pos = state.positions;
    return JSON.stringify(out);
  }

  function writeState(state) {
    let payload = encodeState(state);
    if (payload.length > SUSPEND_LIMIT && state.positions.length > 0) {
      console.warn("[scorm-shim] suspend_data over " + SUSPEND_LIMIT +
        " chars; not syncing half-finished sets");
      state = { sets: state.sets, level: state.level, positions: [] };
      payload = encodeState(state);
    }
    if (payload.length > SUSPEND_LIMIT) {
      // Highest rank first: a dropped Master costs more credit than a dropped Apprentice.
      const ordered = state.sets.slice().sort(function (a, b) { return b[1] - a[1]; });
      const kept = [];
      const fits = function (sets) {
        return encodeState({ sets: sets, level: state.level, positions: [] }).length <= SUSPEND_LIMIT;
      };
      for (const entry of ordered) {
        if (!fits(kept.concat([entry]))) break;
        kept.push(entry);
      }
      console.warn("[scorm-shim] suspend_data over " + SUSPEND_LIMIT +
        " chars; syncing " + kept.length + " of " + state.sets.length + " sets");
      payload = encodeState({ sets: kept, level: state.level, positions: [] });
    }
    return ok(lmsCall("LMSSetValue", "cmi.suspend_data", payload));
  }

  // ---------- score reporting ----------
  // What the LMS has CONFIRMED, as opposed to what was last attempted. A refused
  // or dropped write leaves these untouched, so the next tick sees the same
  // difference and tries again — a shim that records what it sent, rather than
  // what arrived, stops retrying at exactly the moment it matters.
  let confirmedPct = -1;
  let confirmedPayload = null;
  // Highest score the LMS has ever held for this student. Credit only ever rises
  // by design, so a locally computed value BELOW this one means local data is
  // missing (cleared storage, a fresh device, a failed restore) — never that the
  // student lost credit. Reporting it would wipe a real grade, so we don't.
  let scoreFloor = 0;

  // "synced"  – the LMS has confirmed everything there is to say.
  // "failing" – the LMS is there but something has not got through.
  // "local"   – no LMS connection at all (yet); this browser is the only copy.
  // "foreign" – connected, but this browser holds another student's progress
  //             that could not be set aside; nothing is read or reported.
  let syncState = "local";
  let failingSince = 0;
  let failures = 0;

  function readLmsScore() {
    const raw = lmsCall("LMSGetValue", "cmi.core.score.raw");
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 0;
  }

  function setSyncState(next) {
    if (next === "failing" && syncState !== "failing") failingSince = Date.now();
    if (next !== "failing") failures = 0;
    syncState = next;
  }

  function owes(pct, encoded) {
    return pct !== confirmedPct || encoded !== confirmedPayload;
  }

  /** Push whatever the LMS has not confirmed. Returns true when nothing is owed. */
  function pushToLms(pct) {
    let state = buildState();
    let encoded = encodeState(state);
    if (!owes(pct, encoded)) return true;

    // About to overwrite the LMS copy — with a picture of the world taken when
    // this tab launched. If the student has since cleared a set on another
    // device while this tab sat open, that picture is missing it, and writing it
    // would erase the set from the LMS. So look first, and fold in any cleared
    // set or higher rank found there. An LMS that answers reads from a copy made
    // at launch makes this a no-op; one that reads through makes it a merge.
    restoreFromSuspendData(true);
    scoreFloor = Math.max(scoreFloor, readLmsScore());
    pct = Math.max(progressPercent(), scoreFloor);
    state = buildState();
    encoded = encodeState(state);

    // suspend_data has to be checked independently of the score: a rank-up can
    // leave the ROUNDED percentage unchanged (Journeyman→Master on set 4 of 12
    // stays 33%), and gating the sync on the score would silently strand the
    // tier timestamps that gate the next trial.
    const scoreOwed = pct !== confirmedPct;
    const stateOwed = encoded !== confirmedPayload;
    if (!scoreOwed && !stateOwed) return true;

    let sent = true;
    if (scoreOwed) {
      // A zero is never written. 0% here means "this browser and this attempt
      // know of no credit", which is also exactly what a student with real
      // credit looks like when the LMS hands out a fresh attempt (a republished
      // package) to a browser with empty storage — and there a written zero
      // would replace a grade they earned. Someone who has truly cleared
      // nothing simply shows no score yet.
      if (pct > 0) {
        sent = ok(lmsCall("LMSSetValue", "cmi.core.score.min", "0")) && sent;
        sent = ok(lmsCall("LMSSetValue", "cmi.core.score.max", "100")) && sent;
        sent = ok(lmsCall("LMSSetValue", "cmi.core.score.raw", String(pct))) && sent;
      }
      sent = ok(lmsCall("LMSSetValue", "cmi.core.lesson_status",
        pct >= 100 ? "completed" : "incomplete")) && sent;
    }
    // Same reasoning for the state: an empty one says nothing, and would
    // overwrite a payload the restore could not parse but a person still could.
    if (stateOwed && !isEmptyState(state)) sent = writeState(state) && sent;
    const commit = lmsCall("LMSCommit", "");
    sent = ok(commit) && sent;
    lastWrite = { at: new Date().toISOString(), percent: pct, commit: String(commit), allAccepted: sent, error: lastLmsError() };
    if (!sent) return false;

    confirmedPct = pct;
    confirmedPayload = encoded;
    scoreFloor = Math.max(scoreFloor, pct);
    return true;
  }

  let catalogLoading = false;

  function report() {
    // A failed catalog fetch (dropped connection inside the LMS frame) leaves
    // totalSets at 0, which would compute as 0% and overwrite the gradebook with
    // a zero. There is nothing meaningful to report until the catalog is loaded —
    // so keep asking for it: one dropped request at launch must not switch
    // syncing off for the rest of the session.
    if (totalSets === 0) {
      if (!catalogLoading) {
        catalogLoading = true;
        loadCatalog().then(function () { catalogLoading = false; if (totalSets > 0) report(); });
      }
      return;
    }

    // Not connected — never was, or the session was finished under us (bfcache).
    if (!initialized) connect();

    const computed = progressPercent();
    const pct = Math.max(computed, scoreFloor);
    if (computed < scoreFloor) {
      console.warn("[scorm-shim] computed " + computed + "% but the LMS holds " +
        scoreFloor + "%; keeping the higher score");
    }

    if (initialized && foreignProgress) {
      setSyncState("foreign");
    } else if (initialized) {
      if (pushToLms(pct)) {
        setSyncState("synced");
      } else {
        setSyncState("failing");
        failures++;
        console.warn("[scorm-shim] the LMS did not confirm the last save (attempt " + failures + ")");
        // An LMS that has dropped the session refuses everything until it is
        // initialised again. One that merely lost the network refuses to be
        // initialised twice — in which case the existing session is still the
        // one to keep using, so a refusal here must not disconnect us.
        if (failures % 3 === 0) { initialized = false; if (!connect()) initialized = true; }
      }
    } else {
      setSyncState("local");
    }

    updateBanner(pct);
  }

  /** True while something earned here exists nowhere but this browser. */
  function hasUnsavedProgress() {
    if (syncState === "synced" || syncState === "foreign" || totalSets === 0) return false;
    const state = buildState();
    return !isEmptyState(state) && encodeState(state) !== confirmedPayload;
  }

  // ---------- banner UI ----------
  let bannerEl = null;
  let basePadding = 0;

  function ensureBanner() {
    if (bannerEl) return bannerEl;
    bannerEl = document.createElement("div");
    bannerEl.id = "scorm-progress-banner";
    bannerEl.setAttribute("role", "status");
    bannerEl.setAttribute("aria-live", "polite");
    bannerEl.style.cssText = [
      "position:fixed", "top:0", "left:0", "right:0",
      "z-index:9999",
      "background:#1a1a1a", "color:#ffd86b",
      "border-bottom:1px solid #444",
      "font-family:monospace", "font-size:13px",
      "padding:6px 12px", "text-align:center",
      "letter-spacing:0.5px",
    ].join(";");
    basePadding = parseInt(getComputedStyle(document.body).paddingTop) || 0;
    document.body.appendChild(bannerEl);
    addDetailsButton();
    return bannerEl;
  }

  // A small button that shows diagnose() as text that can be copied into an email.
  // "My progress isn't saving" cannot be acted on; this can.
  function addDetailsButton() {
    const button = document.createElement("button");
    const panel = document.createElement("pre");
    button.type = "button";
    button.textContent = "ⓘ sync details";
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", "scorm-sync-details");
    button.style.cssText = "position:fixed;bottom:6px;right:6px;z-index:9999;font:12px monospace;" +
      "background:#1a1a1a;color:#ffd86b;border:1px solid #666;border-radius:4px;padding:4px 8px;cursor:pointer";
    panel.id = "scorm-sync-details";
    panel.hidden = true;
    panel.setAttribute("tabindex", "0");
    panel.setAttribute("aria-label", "Sync details, for a bug report");
    panel.style.cssText = "position:fixed;bottom:40px;right:6px;left:6px;max-height:60vh;overflow:auto;z-index:9999;" +
      "margin:0;font:12px monospace;white-space:pre-wrap;word-break:break-word;background:#111;color:#eee;" +
      "border:1px solid #666;border-radius:4px;padding:10px";
    button.onclick = function () {
      panel.hidden = !panel.hidden;
      button.setAttribute("aria-expanded", String(!panel.hidden));
      if (!panel.hidden) {
        report();
        panel.textContent = "Copy everything in this box into your message.\n\n" + JSON.stringify(diagnose(), null, 1);
        if (panel.focus) panel.focus();
      }
    };
    document.body.appendChild(button);
    document.body.appendChild(panel);
  }

  function clockTime(ms) {
    const d = new Date(ms);
    return d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function updateBanner(pct) {
    const el = ensureBanner();
    const done = completedCount();
    const progress = SINGLE
      ? (pct >= 100 ? "✓ Complete — full credit" : "Not yet complete — clear this set for full credit")
      : `Course score: ${pct}%  ·  ${done} of ${totalSets} sets cleared`;

    // The warning has to be actionable: say where the progress IS safe, and what
    // to do. A student who closes this tab and opens the activity on another
    // device is the one who loses work; one who reopens it in THIS browser loses
    // nothing, because the next launch pushes everything the LMS is missing.
    let text, alarm = false;
    if (syncState === "synced") {
      text = SINGLE
        ? `${progress}${pct >= 100 ? "  ·  sent to D2L" : ""}`
        : `${progress}  ·  ✓ saved to D2L — rank up cleared sets for full credit`;
    } else if (syncState === "foreign") {
      alarm = true;
      text = `⚠ This browser's storage is full of another student's progress, so yours is NOT being ` +
        `saved to D2L here. Please open this activity in a different browser or on another device.`;
    } else if (syncState === "failing") {
      alarm = true;
      text = `⚠ Your progress has NOT been saved to D2L since ${clockTime(failingSince)}. ` +
        `It is safe in this browser. Keep this tab open while we retry. ` +
        `If this message stays, reopen this activity from D2L using this same browser and device.`;
    } else {
      // Inside a frame with no API is an LMS that has not provided one, not
      // someone previewing the package from disk.
      const inLms = hasLms() || window.parent !== window;
      alarm = inLms;
      text = inLms
        ? `⚠ Not connected to D2L — your progress is NOT being saved to D2L. ` +
          `It is safe in this browser. Reopen this activity from D2L using this same browser and device.`
        : `${progress}  ·  not connected to D2L (progress is kept in this browser only)`;
    }
    if (el.textContent !== text) el.textContent = text;
    // role=alert interrupts a screen reader; role=status waits its turn.
    el.setAttribute("role", alarm ? "alert" : "status");
    el.setAttribute("aria-live", alarm ? "assertive" : "polite");
    el.style.background = alarm ? "#7a1f1f" : "#1a1a1a";
    el.style.color = alarm ? "#ffffff" : "#ffd86b";
    // The warning wraps to several lines on a phone; keep it off the game.
    const height = el.offsetHeight || 30;
    document.body.style.paddingTop = (basePadding + height) + "px";
  }

  // ---------- main ----------
  // Runs while this script is being evaluated, NOT from start(). The page loads
  // this shim as a classic script ahead of the game's module script, so work done
  // here is finished before the game exists. The restore used to wait for
  // DOMContentLoaded and then for the catalog fetch, by which time the game had
  // already drawn its menu from an empty localStorage: every set the student had
  // cleared showed as "not started", and they replayed it. The SCORM 1.2 API is
  // synchronous and the restore does not need the catalog, so nothing forces the
  // wait.
  //
  // It also runs again, from report(), whenever there is no live connection: the
  // LMS was not ready at launch, dropped the session, or the page came back from
  // the back/forward cache after the session had been finished. Restoring is a
  // merge (higher rank, further level, newer position wins), so reconnecting
  // after a stretch of offline play cannot lower anything earned meanwhile.
  let connectedOnce = false;
  let atLaunch = null;
  let lastWrite = null;

  function lastLmsError() {
    if (!api) return "";
    try { return String(api.LMSGetLastError()) + " " + String(api.LMSGetErrorString ? api.LMSGetErrorString(api.LMSGetLastError()) : ""); }
    catch (_) { return "?"; }
  }

  /**
   * What the LMS has said to this shim, in its own words. It exists because every
   * test of this file runs against a stand-in LMS, and the real one is where it
   * has gone wrong: when a student or instructor reports lost progress, this is
   * what turns "it isn't saving" into something that can be diagnosed.
   */
  function diagnose() {
    let previousExit = null;
    try { previousExit = JSON.parse(localStorage.getItem(EXIT_KEY) || "null"); } catch (_) {}
    return {
      build: BUILD,
      singleSet: SINGLE,
      apiFound: !!api,
      connected: initialized,
      syncState: syncState,
      atLaunch: atLaunch,
      lastWrite: lastWrite,
      localPercent: totalSets ? progressPercent() : null,
      scoreFloor: scoreFloor,
      setsInCatalog: totalSets,
      finishes: finishes,
      previousExit: previousExit,
      browser: (typeof navigator !== "undefined" && navigator.userAgent) || "",
    };
  }

  function connect() {
    if (!lmsInit()) return false;
    finishedByBeforeunload = false;      // a live session again: the next exit must finish it
    if (!atLaunch) {
      const suspend = String(lmsCall("LMSGetValue", "cmi.suspend_data") || "");
      atLaunch = {
        entry: String(lmsCall("LMSGetValue", "cmi.core.entry")),
        status: String(lmsCall("LMSGetValue", "cmi.core.lesson_status")),
        score: String(lmsCall("LMSGetValue", "cmi.core.score.raw")),
        suspendChars: suspend.length,
        suspendSets: (suspend.match(/\.json/g) || []).length,
        // Whether the LMS is tracking this session at all. D2L does not log SCORM
        // attempts properly for an instructor, or under "View as Learner": every
        // launch then comes back ab-initio and empty, which looks exactly like
        // lost progress. Only WHETHER a learner was identified is kept, never who.
        mode: String(lmsCall("LMSGetValue", "cmi.core.lesson_mode")),
        credit: String(lmsCall("LMSGetValue", "cmi.core.credit")),
        learnerIdentified: String(lmsCall("LMSGetValue", "cmi.core.student_id") || "").length > 0,
      };
    }
    // Before anything local is read or merged: make sure it is this student's.
    foreignProgress = !adoptLearner(String(lmsCall("LMSGetValue", "cmi.core.student_id") || ""));
    // Read the standing grade BEFORE anything local is consulted, so it can act as
    // a floor even if the catalog fetch or the suspend_data restore fails.
    scoreFloor = Math.max(scoreFloor, readLmsScore());
    if (!foreignProgress) restoreFromSuspendData();
    // Said now rather than only at unload: a frame being torn down by its parent
    // cannot count on a last network call getting out.
    markSuspended();
    lmsCall("LMSCommit", "");
    // A new session confirms nothing about the old one.
    confirmedPct = -1;
    confirmedPayload = null;
    if (scriptEvaluated && !connectedOnce) {
      // The game drew its menu before this restore happened; ask it to redraw.
      try { window.dispatchEvent(new Event("lotrd-progress-restored")); } catch (_) {}
    }
    connectedOnce = true;
    return true;
  }

  async function start() {
    await loadCatalog();
    report();
    setInterval(report, POLL_MS);
    window.addEventListener("storage", report);
    // Hidden is the last event a phone reliably delivers before freezing or
    // discarding a tab, so it is a flush point as much as "visible" is.
    document.addEventListener("visibilitychange", report);
    window.addEventListener("online", report);
    window.addEventListener("pagehide", (ev) => {
      // Browsers send beforeunload first. If that already finished the session and
      // nothing has reconnected since, there is nothing new to send — and report()
      // would open a second session only to write the same values and finish again.
      if (finishedByBeforeunload) return;
      report();
      // Finished even when the browser says the page may be kept in its back/forward
      // cache: if it does come back, pageshow reconnects. See lmsFinish().
      lmsFinish("pagehide" + (ev && ev.persisted ? " (cached)" : ""));
    });
    window.addEventListener("pageshow", (ev) => { if (ev && ev.persisted) report(); });
    window.addEventListener("beforeunload", (ev) => {
      report();
      if (hasUnsavedProgress() && ev && ev.preventDefault) {
        // The last chance to say so. If they stay, the retry needs the connection,
        // so this is the one exit that does not finish the session.
        ev.preventDefault();
        ev.returnValue = "";
        return;
      }
      // beforeunload can be cancelled by the page around us; if the student does
      // stay, the next save finds the session closed and reconnects.
      if (initialized) {
        lmsFinish("beforeunload");
        finishedByBeforeunload = true;
      }
    });
  }

  // Expose for debugging / in-game use.
  window.LotrdScorm = {
    progressPercent,
    completedCount: () => completedCount(),
    totalSets: () => totalSets,
    hasLms: () => hasLms(),
    syncState: () => syncState,
    diagnose,
    forceReport: report,
    finishSession: lmsFinish,
  };

  let scriptEvaluated = false;
  connect();
  scriptEvaluated = true;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
