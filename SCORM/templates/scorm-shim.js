/* SCORM 1.2 shim for Loop of the Recursive Dragon.
 *
 * - Discovers the LMS API.
 * - Mirrors completed-set IDs into cmi.suspend_data so progress survives
 *   across devices.
 * - Reports score = (completed sets / total sets) * 100 to the gradebook.
 * - Renders a "Course progress" banner so students see live progress
 *   without waiting on the LMS gradebook view.
 *
 * If no LMS API is reachable (e.g. running locally), the shim becomes a
 * no-op and the game runs normally.
 */
(function () {
  "use strict";

  const COMPLETION_PREFIX = "lotrd_done_";
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

  function progressPercent() {
    if (totalSets === 0) return 0;
    return Math.round((completedCount() / totalSets) * 100);
  }

  // ---------- suspend_data sync ----------
  function restoreFromSuspendData() {
    if (!hasLms) return;
    const raw = lmsCall("LMSGetValue", "cmi.suspend_data");
    if (!raw) return;
    try {
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) return;
      for (const id of list) {
        const key = COMPLETION_PREFIX + id;
        try {
          if (!localStorage.getItem(key)) {
            localStorage.setItem(key, JSON.stringify({
              completedAt: new Date(0).toISOString(),
              score_pct: 100,
              level: 0,
              restored: true,
            }));
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  function writeSuspendData() {
    if (!hasLms) return;
    const done = playableIds.filter(id => {
      try { return !!localStorage.getItem(COMPLETION_PREFIX + id); } catch (_) { return false; }
    });
    const json = JSON.stringify(done);
    if (json.length > 60000) return;
    lmsCall("LMSSetValue", "cmi.suspend_data", json);
  }

  // ---------- score reporting ----------
  let lastReportedPct = -1;

  function report() {
    const pct = progressPercent();
    if (pct === lastReportedPct) return;
    lastReportedPct = pct;
    if (hasLms) {
      lmsCall("LMSSetValue", "cmi.core.score.min", "0");
      lmsCall("LMSSetValue", "cmi.core.score.max", "100");
      lmsCall("LMSSetValue", "cmi.core.score.raw", String(pct));
      lmsCall("LMSSetValue", "cmi.core.lesson_status",
        pct >= 100 ? "completed" : "incomplete");
      writeSuspendData();
      lmsCall("LMSCommit", "");
    }
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
      `Course progress: ${pct}%  ·  ${done} of ${totalSets} sets complete${lmsTag}`;
  }

  // ---------- main ----------
  async function start() {
    if (hasLms) lmsInit();
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
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
