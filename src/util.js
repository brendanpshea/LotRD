export function shuffle(items) {
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// ─── Spaced-review schedule (expanding intervals) ───────────────────────────
// A cleared set becomes "due" again after an interval that grows with each
// completed review. Pure helpers so the schedule math is unit-testable apart
// from the controller's localStorage/DOM wiring.

export const REVIEW_INTERVALS_DAYS = [2, 7, 21, 60];
const MS_PER_DAY = 86400000;

/** The interval (in days) that applies at a given review stage (0 = never reviewed). */
export function reviewIntervalForStage(stage) {
    const i = Math.min(Math.max(stage | 0, 0), REVIEW_INTERVALS_DAYS.length - 1);
    return REVIEW_INTERVALS_DAYS[i];
}

/**
 * Whether a cleared set is due for spaced review.
 * @param {{stage?:number, lastReviewedAt?:string}|null} reviewRec – prior review record
 * @param {string} completedAtIso – original completion timestamp (fallback anchor)
 * @param {number} now – epoch ms (injectable for tests)
 * @returns {{due:boolean, stage:number, intervalDays:number}}
 */
export function reviewDue(reviewRec, completedAtIso, now = Date.now()) {
    const stage = reviewRec?.stage ?? 0;
    const intervalDays = reviewIntervalForStage(stage);
    const anchor = Date.parse(reviewRec?.lastReviewedAt ?? completedAtIso ?? "");
    if (!Number.isFinite(anchor)) return { due: false, stage, intervalDays };
    return { due: now >= anchor + intervalDays * MS_PER_DAY, stage, intervalDays };
}

/** The next stage after completing a review (clamped to the schedule length). */
export function advanceReviewStage(stage) {
    return Math.min((stage ?? 0) + 1, REVIEW_INTERVALS_DAYS.length);
}

// ─── Storage health ──────────────────────────────────────────────────────────
// Every localStorage call in this app is wrapped in a try/catch, which keeps the
// game playable when storage is blocked — but silently. A student can then finish
// a whole set and watch it vanish. These helpers let the app notice and say so.

export const STORAGE_OK = "ok";
/** Storage exists but is refusing writes — usually a full quota. */
export const STORAGE_FULL = "full";
/** No usable storage: private browsing, or an LMS iframe with storage partitioned. */
export const STORAGE_UNAVAILABLE = "unavailable";

/**
 * Probe whether progress can actually be persisted, by writing and reading back.
 * Presence of the API is not enough: Safari's private mode and third-party frame
 * partitioning both expose localStorage and then throw (or silently drop) on write.
 */
export function probeStorage(store) {
  const target = store ?? (typeof localStorage !== "undefined" ? localStorage : null);
  if (!target) return STORAGE_UNAVAILABLE;
  const key = "__lotrd_probe__";
  try {
    target.setItem(key, "1");
    const readBack = target.getItem(key);
    target.removeItem(key);
    if (readBack !== "1") return STORAGE_UNAVAILABLE;
    return STORAGE_OK;
  } catch (err) {
    // A quota error means storage works but is full — a different message, and a
    // recoverable one, so it is worth distinguishing from being blocked outright.
    const name = err?.name || "";
    const quota = name === "QuotaExceededError" ||
      name === "NS_ERROR_DOM_QUOTA_REACHED" || err?.code === 22;
    return quota ? STORAGE_FULL : STORAGE_UNAVAILABLE;
  }
}

/** Student-facing explanation of a non-OK storage state. */
export function storageWarningText(state, { inLms = false } = {}) {
  if (state === STORAGE_FULL) {
    return "⚠ Your browser's storage is full, so progress may not save. " +
      "Clearing space for this site should fix it.";
  }
  if (state === STORAGE_UNAVAILABLE) {
    return "⚠ This browser is blocking saved data, so your progress will NOT be kept. " +
      (inLms
        ? "Try opening this activity in a new tab or window, or switch browsers, before working through a set."
        : "Turn off private browsing, or allow site data for this page, before working through a set.");
  }
  return "";
}

// ─── Mastery tiers (Apprentice → Journeyman → Master) ────────────────────────
// A set's first full clear earns Apprentice rank (partial gradebook credit).
// A short "rank trial" — half the set, weighted toward past misses — upgrades
// the rank, but only after a real-time waiting period, forcing the spaced
// re-encounters that make the material stick. Credit only ever goes UP, so
// the SCORM score stays monotonic. Pure helpers here; localStorage/SCORM
// wiring lives in the controller and the SCORM shim.

export const TIER_NONE = 0;
export const TIER_APPRENTICE = 1;
export const TIER_JOURNEYMAN = 2;
export const TIER_MASTER = 3;

export const TIER_NAMES  = ["", "Apprentice", "Journeyman", "Master"];
export const TIER_BADGES = ["", "🥉", "🥈", "🥇"];
/** Fraction of a set's gradebook credit earned at each tier. */
export const TIER_CREDIT = [0, 0.8, 0.9, 1.0];

/** Days after the FIRST CLEAR before the Journeyman trial unlocks. */
export const JOURNEYMAN_WAIT_DAYS = 3;
/** Days after COMPLETING JOURNEYMAN before the Master trial unlocks. */
export const MASTER_WAIT_DAYS = 7;

/**
 * Hard ceiling on a rank trial, regardless of set size. Trials are the only
 * route to full credit, so they have to stay short enough that students
 * actually sit down for them — a trial that scales to half of a 50-question
 * set becomes a second full run and gets skipped. The cap costs nothing in
 * coverage: the sample is miss-weighted, so trimming it drops the questions
 * the student has never gotten wrong first.
 */
export const TRIAL_MAX_QUESTIONS = 18;

/**
 * The grade the SCORM shim reports to the LMS, recomputed in-app so a student
 * can see the same number the gradebook gets — and, in the browser build where
 * there is no LMS at all, so the number means something on its own.
 *
 * Every playable set is worth an equal share of 100%; a set pays out its share
 * scaled by the rank it has been carried to. The shim keeps its own copy of
 * this arithmetic (it can't import a module), and a test pins the two together.
 *
 * @param {Array<{topic?:string, sets?:Array<{id?:string, review?:boolean, tier?:number, status?:{type?:string}}>}>} catalog
 *        The catalog after the controller has decorated it with per-set status and tier.
 * @returns {{percent:number, credit:number, totalSets:number, clearedSets:number,
 *            tierCounts:number[], topics:Array<object>}}
 */
export function computeCourseGrade(catalog) {
  const tierCounts = [0, 0, 0, 0];
  const topics = [];
  let credit = 0;
  let totalSets = 0;
  let clearedSets = 0;

  for (const topic of (catalog || [])) {
    const sets = (topic.sets || []).filter(entry => !entry.review && entry.id);
    if (sets.length === 0) continue;
    const topicCounts = [0, 0, 0, 0];
    let topicCredit = 0;

    for (const entry of sets) {
      const cleared = entry.status?.type === "complete";
      const tier = cleared ? clampTier(entry.tier) : TIER_NONE;
      topicCounts[tier]++;
      topicCredit += TIER_CREDIT[tier];
      if (tier > TIER_NONE) clearedSets++;
    }

    for (let t = 0; t < tierCounts.length; t++) tierCounts[t] += topicCounts[t];
    credit += topicCredit;
    totalSets += sets.length;
    topics.push({
      topic: topic.topic || "Other",
      totalSets: sets.length,
      credit: topicCredit,
      // Share of the whole grade this topic is currently contributing.
      percentOfWhole: topicCredit,
      percentOfTopic: Math.round((topicCredit / sets.length) * 100),
      tierCounts: topicCounts,
    });
  }

  for (const t of topics) {
    t.percentOfWhole = totalSets > 0 ? (t.credit / totalSets) * 100 : 0;
  }

  return {
    percent: totalSets > 0 ? Math.round((credit / totalSets) * 100) : 0,
    credit,
    totalSets,
    clearedSets,
    tierCounts,
    topics,
  };
}

function clampTier(tier) {
  const t = typeof tier === "number" ? Math.floor(tier) : TIER_APPRENTICE;
  if (!Number.isFinite(t) || t < TIER_APPRENTICE) return TIER_APPRENTICE;
  return Math.min(t, TIER_MASTER);
}

/**
 * When (and whether) the next rank trial is available.
 * @param {{tier?:number, apprenticeAt?:string, journeymanAt?:string}|null} tierRec
 * @param {number} now – epoch ms (injectable for tests)
 * @returns {{nextTier:number, availableAt:number, due:boolean}|null}
 *          null when there is no next tier (not cleared yet, or already Master)
 */
export function nextTierInfo(tierRec, now = Date.now()) {
    const tier = tierRec?.tier ?? TIER_NONE;
    if (tier < TIER_APPRENTICE || tier >= TIER_MASTER) return null;
    const anchorIso = tier === TIER_APPRENTICE ? tierRec.apprenticeAt : tierRec.journeymanAt;
    const waitDays  = tier === TIER_APPRENTICE ? JOURNEYMAN_WAIT_DAYS : MASTER_WAIT_DAYS;
    const anchor = Date.parse(anchorIso ?? "");
    if (!Number.isFinite(anchor)) return null;
    const availableAt = anchor + waitDays * MS_PER_DAY;
    return { nextTier: tier + 1, availableAt, due: now >= availableAt };
}

/**
 * Sample the questions for a rank trial: about half the set (capped at
 * TRIAL_MAX_QUESTIONS), taking every question the student has historically
 * missed first (most-missed leading), then filling the remainder at random.
 * NPC teaching scenes never appear in a trial — they are first-exposure
 * scaffolding, and trials are pure retrieval.
 * @param {object[]} questions   – the set's full question array
 * @param {Object<string,number>} missCounts – question text → historical miss count
 */
export function sampleTrialQuestions(questions, missCounts = {}) {
    const pool = (questions || []).filter(q => q && q.type !== "npc_demo");
    const size = Math.min(Math.ceil(pool.length / 2), TRIAL_MAX_QUESTIONS);
    const missed = shuffle(pool.filter(q => (missCounts[q.question] || 0) > 0))
        .sort((a, b) => (missCounts[b.question] || 0) - (missCounts[a.question] || 0));
    const rest = shuffle(pool.filter(q => !(missCounts[q.question] > 0)));
    return shuffle([...missed, ...rest].slice(0, size));
}