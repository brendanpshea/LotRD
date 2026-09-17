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
 *
 * If no LMS API is reachable (e.g. running locally), the shim becomes a
 * no-op and the game runs normally.
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

  const api = findApi(window);
  const hasLms = !!api;
  let initialized = false;

  function lmsCall(name, ...args) {
    if (!api || !initialized) return "";
    try { return api[name](...args); } catch (_) { return ""; }
  }

  function lmsInit() {
    if (!api) return false;
    try {
      const ok = api.LMSInitialize("");
      initialized = ok === "true" || ok === true;
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

  function restoreFromSuspendData() {
    if (!hasLms) return;
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
      if (data && data.v === 2) {
        restoreLevel(data.lvl);
        // After the sets: a position for a set that has since been cleared is stale.
        if (Array.isArray(data.pos)) data.pos.forEach(restorePosition);
      }
    } catch (_) {}
  }

  /** The rows that describe every cleared set, or null when there is no LMS. */
  function buildSuspendSets() {
    if (!hasLms) return null;
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
    if (!hasLms) return null;
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
    lmsCall("LMSSetValue", "cmi.suspend_data", payload);
    return payload;
  }

  // ---------- score reporting ----------
  let lastReportedPct = -1;
  let lastSuspendPayload = null;
  // Highest score the LMS has ever held for this student. Credit only ever rises
  // by design, so a locally computed value BELOW this one means local data is
  // missing (cleared storage, a fresh device, a failed restore) — never that the
  // student lost credit. Reporting it would wipe a real grade, so we don't.
  let scoreFloor = 0;

  function readLmsScore() {
    const raw = lmsCall("LMSGetValue", "cmi.core.score.raw");
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 0;
  }

  function report() {
    // A failed catalog fetch (dropped connection inside the LMS frame) leaves
    // totalSets at 0, which would compute as 0% and overwrite the gradebook with
    // a zero. There is nothing meaningful to report until the catalog is loaded.
    if (totalSets === 0) return;

    const computed = progressPercent();
    const pct = Math.max(computed, scoreFloor);
    if (computed < scoreFloor) {
      console.warn("[scorm-shim] computed " + computed + "% but the LMS holds " +
        scoreFloor + "%; keeping the higher score");
    }

    if (hasLms) {
      // suspend_data has to be checked independently of the score: a rank-up can
      // leave the ROUNDED percentage unchanged (Journeyman→Master on set 4 of 12
      // stays 33%), and gating the sync on the score would silently strand the
      // tier timestamps that gate the next trial.
      const state = buildState();
      const encoded = encodeState(state);
      const scoreChanged = pct !== lastReportedPct;
      const stateChanged = encoded !== lastSuspendPayload;
      if (!scoreChanged && !stateChanged) return;

      if (scoreChanged) {
        // A zero is never written. 0% here means "this browser and this attempt
        // know of no credit", which is also exactly what a student with real
        // credit looks like when the LMS hands out a fresh attempt (a republished
        // package) to a browser with empty storage — and there a written zero
        // would replace a grade they earned. Someone who has truly cleared
        // nothing simply shows no score yet.
        if (pct > 0) {
          lmsCall("LMSSetValue", "cmi.core.score.min", "0");
          lmsCall("LMSSetValue", "cmi.core.score.max", "100");
          lmsCall("LMSSetValue", "cmi.core.score.raw", String(pct));
        }
        lmsCall("LMSSetValue", "cmi.core.lesson_status",
          pct >= 100 ? "completed" : "incomplete");
      }
      // Same reasoning for the state: an empty one says nothing, and would
      // overwrite a payload the restore could not parse but a person still could.
      if (stateChanged) {
        if (!isEmptyState(state)) writeState(state);
        lastSuspendPayload = encoded;
      }
      lmsCall("LMSCommit", "");
      scoreFloor = Math.max(scoreFloor, pct);
    } else if (pct === lastReportedPct) {
      return;
    }

    lastReportedPct = pct;
    updateBanner(pct);
  }

  // ---------- banner UI ----------
  let bannerEl = null;

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
    document.body.appendChild(bannerEl);
    document.body.style.paddingTop =
      (parseInt(getComputedStyle(document.body).paddingTop) || 0) + 30 + "px";
    return bannerEl;
  }

  function updateBanner(pct) {
    const el = ensureBanner();
    const done = completedCount();
    const lmsTag = hasLms ? "" : " (offline)";
    el.textContent =
      `Course score: ${pct}%  ·  ${done} of ${totalSets} sets cleared` +
      ` — rank up cleared sets for full credit${lmsTag}`;
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
  function connect() {
    if (!hasLms || !lmsInit()) return;
    // Read the standing grade BEFORE anything local is consulted, so it can act as
    // a floor even if the catalog fetch or the suspend_data restore fails.
    scoreFloor = readLmsScore();
    restoreFromSuspendData();
    // Said now rather than only at unload: a frame being torn down by its parent
    // cannot count on a last network call getting out.
    markSuspended();
    lmsCall("LMSCommit", "");
  }

  async function start() {
    await loadCatalog();
    report();
    setInterval(report, POLL_MS);
    window.addEventListener("storage", report);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) report();
    });
    window.addEventListener("pagehide", () => { report(); lmsFinish(); });
    window.addEventListener("beforeunload", () => { report(); lmsFinish(); });
  }

  // Expose for debugging / in-game use.
  window.LotrdScorm = {
    progressPercent,
    completedCount: () => completedCount(),
    totalSets: () => totalSets,
    hasLms: () => hasLms,
    forceReport: report,
    finishSession: lmsFinish,
  };

  connect();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
