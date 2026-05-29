// tests/util.test.js — spaced-review schedule helpers
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  REVIEW_INTERVALS_DAYS,
  reviewIntervalForStage,
  reviewDue,
  advanceReviewStage,
} from '../src/util.js';

const DAY = 86400000;
const T0 = Date.parse('2026-01-01T00:00:00.000Z');

describe('spaced review schedule', () => {
  it('interval grows with stage and clamps at the last bucket', () => {
    assert.equal(reviewIntervalForStage(0), 2);
    assert.equal(reviewIntervalForStage(1), 7);
    assert.equal(reviewIntervalForStage(2), 21);
    assert.equal(reviewIntervalForStage(3), 60);
    assert.equal(reviewIntervalForStage(99), 60); // clamp
    assert.equal(reviewIntervalForStage(-5), 2);  // clamp low
  });

  it('a never-reviewed set is due once the first interval passes after completion', () => {
    const completedAt = new Date(T0).toISOString();
    // Stage 0 → 2-day interval.
    assert.equal(reviewDue(null, completedAt, T0 + 1 * DAY).due, false);
    assert.equal(reviewDue(null, completedAt, T0 + 2 * DAY).due, true);
  });

  it('uses lastReviewedAt and the stage interval once reviewed', () => {
    const completedAt = new Date(T0).toISOString();
    const rec = { stage: 1, lastReviewedAt: new Date(T0 + 10 * DAY).toISOString() };
    // Stage 1 → 7-day interval, anchored at the review (not completion).
    assert.equal(reviewDue(rec, completedAt, T0 + 16 * DAY).due, false);
    assert.equal(reviewDue(rec, completedAt, T0 + 17 * DAY).due, true);
  });

  it('is never due without a valid anchor timestamp', () => {
    assert.equal(reviewDue(null, undefined, T0).due, false);
    assert.equal(reviewDue(null, 'not-a-date', T0).due, false);
  });

  it('advanceReviewStage steps up and clamps to schedule length', () => {
    assert.equal(advanceReviewStage(0), 1);
    assert.equal(advanceReviewStage(2), 3);
    assert.equal(advanceReviewStage(REVIEW_INTERVALS_DAYS.length), REVIEW_INTERVALS_DAYS.length);
    assert.equal(advanceReviewStage(undefined), 1);
  });
});
