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