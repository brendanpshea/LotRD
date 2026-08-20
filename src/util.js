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
 * Sample the questions for a rank trial: about half the set, taking every
 * question the student has historically missed first (most-missed leading),
 * then filling the remainder at random. NPC teaching scenes never appear in
 * a trial — they are first-exposure scaffolding, and trials are pure retrieval.
 * @param {object[]} questions   – the set's full question array
 * @param {Object<string,number>} missCounts – question text → historical miss count
 */
export function sampleTrialQuestions(questions, missCounts = {}) {
    const pool = (questions || []).filter(q => q && q.type !== "npc_demo");
    const size = Math.ceil(pool.length / 2);
    const missed = shuffle(pool.filter(q => (missCounts[q.question] || 0) > 0))
        .sort((a, b) => (missCounts[b.question] || 0) - (missCounts[a.question] || 0));
    const rest = shuffle(pool.filter(q => !(missCounts[q.question] > 0)));
    return shuffle([...missed, ...rest].slice(0, size));
}