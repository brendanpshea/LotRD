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

  // ---------- LMS discovery ----------
  function findApi(win) {
    let depth = 0;
    let cur = win;
    while (cur && depth < 20) {
      if (cur.API) return cur.API;
      if (cur === cur.parent) break;
      cur = cur.parent;
      depth++;
    }
    if (win.opener && win.opener.API) return win.opener.API;
    return null;
  }

  // Not const: some LMS players put their API in place after the content frame
  // has started loading, so discovery is retried until it succeeds.
  let api = findApi(window);
  let initialized = false;

  function hasLms() {
    if (!api) { try { api = findApi(window); } catch (_) {} }
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

  function lmsFinish() {
    if (!api || !initialized) return;
    markSuspended();
    try { api.LMSCommit(""); } catch (_) {}
    try { api.LMSFinish(""); } catch (_) {}
    initialized = false;
  }

  // ---------- catalog & progress ----------
  let totalSets = 0;
  let playableIds = [];

  async function loadCatalog() {
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
    sent = ok(lmsCall("LMSCommit", "")) && sent;
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

    if (initialized) {
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
    if (syncState === "synced" || totalSets === 0) return false;
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
    return bannerEl;
  }

  function clockTime(ms) {
    const d = new Date(ms);
    return d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function updateBanner(pct) {
    const el = ensureBanner();
    const done = completedCount();
    const progress = `Course score: ${pct}%  ·  ${done} of ${totalSets} sets cleared`;

    // The warning has to be actionable: say where the progress IS safe, and what
    // to do. A student who closes this tab and opens the activity on another
    // device is the one who loses work; one who reopens it in THIS browser loses
    // nothing, because the next launch pushes everything the LMS is missing.
    let text, alarm = false;
    if (syncState === "synced") {
      text = `${progress}  ·  ✓ saved to D2L — rank up cleared sets for full credit`;
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

  function connect() {
    if (!lmsInit()) return false;
    // Read the standing grade BEFORE anything local is consulted, so it can act as
    // a floor even if the catalog fetch or the suspend_data restore fails.
    scoreFloor = Math.max(scoreFloor, readLmsScore());
    restoreFromSuspendData();
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
      report();
      // A page headed for the back/forward cache may be resumed; leave it connected.
      if (!ev || !ev.persisted) lmsFinish();
    });
    window.addEventListener("pageshow", (ev) => { if (ev && ev.persisted) report(); });
    // beforeunload can be cancelled ("Leave site?" → Stay), so the session is NOT
    // finished here — a finished session turns every later save into a silent
    // no-op. While something is unsaved, it is also the last chance to say so.
    window.addEventListener("beforeunload", (ev) => {
      report();
      if (hasUnsavedProgress() && ev && ev.preventDefault) {
        ev.preventDefault();
        ev.returnValue = "";
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
