/* SCORM 1.2 shim for Loop of the Recursive Dragon.
 *
 * - Discovers the LMS API.
 * - Mirrors completed-set IDs AND mastery-tier records into cmi.suspend_data
 *   so progress (including the tier timestamps that gate rank trials)
 *   survives across devices.
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

  function lmsFinish() {
    if (!api || !initialized) return;
    // "suspend" tells the LMS this is a pause, not a finished attempt, so
    // suspend_data survives to the next launch. Students come back days later for
    // rank trials, and the default exit ("" = normal) invites an LMS to close the
    // attempt and start the next one clean — which would discard the tier
    // timestamps that gate those trials.
    try { api.LMSSetValue("cmi.core.exit", "suspend"); } catch (_) {}
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
  // v2: { v: 2, sets: [[id, tier, apprenticeMs, journeymanMs, masterMs], ...] }
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
      const tierKey = TIER_PREFIX + id;
      if (!localStorage.getItem(tierKey)) {
        const rec = { tier: tier, apprenticeAt: msToIso(aMs), restored: true };
        if (tier >= 2) rec.journeymanAt = msToIso(jMs);
        if (tier >= 3) rec.masterAt = msToIso(mMs);
        localStorage.setItem(tierKey, JSON.stringify(rec));
      }
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

  // SCORM 1.2 guarantees only 4096 characters of suspend_data, and an LMS that
  // exceeds it usually truncates silently — which would corrupt the JSON and lose
  // every set at once. Timestamps are stored in seconds rather than milliseconds,
  // and trailing zero timestamps are dropped, to buy headroom; if a payload still
  // will not fit, the highest-ranked sets are kept and the rest are dropped rather
  // than writing nothing at all.
  const SUSPEND_LIMIT = 4000;

  function encodeSets(sets) {
    return JSON.stringify({
      v: 2,
      sets: sets.map(function (s) {
        const row = [s[0], s[1], Math.floor(s[2] / 1000), Math.floor(s[3] / 1000), Math.floor(s[4] / 1000)];
        while (row.length > 2 && !row[row.length - 1]) row.pop();
        return row;
      }),
    });
  }

  function writeSets(sets) {
    let payload = encodeSets(sets);
    if (payload.length > SUSPEND_LIMIT) {
      // Highest rank first: a dropped Master costs more credit than a dropped Apprentice.
      const ordered = sets.slice().sort(function (a, b) { return b[1] - a[1]; });
      const kept = [];
      for (const entry of ordered) {
        const next = kept.concat([entry]);
        if (encodeSets(next).length > SUSPEND_LIMIT) break;
        kept.push(entry);
      }
      console.warn("[scorm-shim] suspend_data over " + SUSPEND_LIMIT +
        " chars; syncing " + kept.length + " of " + sets.length + " sets");
      payload = encodeSets(kept);
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
      const sets = buildSuspendSets();
      const encoded = encodeSets(sets || []);
      const scoreChanged = pct !== lastReportedPct;
      const stateChanged = encoded !== lastSuspendPayload;
      if (!scoreChanged && !stateChanged) return;

      if (scoreChanged) {
        lmsCall("LMSSetValue", "cmi.core.score.min", "0");
        lmsCall("LMSSetValue", "cmi.core.score.max", "100");
        lmsCall("LMSSetValue", "cmi.core.score.raw", String(pct));
        lmsCall("LMSSetValue", "cmi.core.lesson_status",
          pct >= 100 ? "completed" : "incomplete");
      }
      if (stateChanged) {
        writeSets(sets || []);
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
  async function start() {
    if (hasLms) lmsInit();
    // Read the standing grade BEFORE anything local is consulted, so it can act as
    // a floor even if the catalog fetch or the suspend_data restore fails.
    if (hasLms) scoreFloor = readLmsScore();
    await loadCatalog();
    restoreFromSuspendData();
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
