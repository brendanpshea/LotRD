// tests/util.test.js — spaced-review schedule helpers
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  REVIEW_INTERVALS_DAYS,
  reviewIntervalForStage,
  reviewDue,
  advanceReviewStage,
  TIER_APPRENTICE, TIER_JOURNEYMAN, TIER_MASTER, TIER_CREDIT,
  JOURNEYMAN_WAIT_DAYS, MASTER_WAIT_DAYS, TRIAL_MAX_QUESTIONS,
  nextTierInfo, sampleTrialQuestions,
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

describe('mastery tiers', () => {
  const iso = ms => new Date(ms).toISOString();

  it('credit rises with tier and tops out at 100%', () => {
    assert.equal(TIER_CREDIT[TIER_APPRENTICE], 0.8);
    assert.equal(TIER_CREDIT[TIER_JOURNEYMAN], 0.9);
    assert.equal(TIER_CREDIT[TIER_MASTER], 1.0);
    for (let t = 1; t < TIER_CREDIT.length; t++) {
      assert.ok(TIER_CREDIT[t] > TIER_CREDIT[t - 1], 'credit must be strictly increasing');
    }
  });

  it('journeyman trial unlocks 3 days after the first clear', () => {
    const rec = { tier: TIER_APPRENTICE, apprenticeAt: iso(T0) };
    const before = nextTierInfo(rec, T0 + (JOURNEYMAN_WAIT_DAYS * DAY) - 1);
    const after  = nextTierInfo(rec, T0 + JOURNEYMAN_WAIT_DAYS * DAY);
    assert.equal(before.nextTier, TIER_JOURNEYMAN);
    assert.equal(before.due, false);
    assert.equal(after.due, true);
    assert.equal(after.availableAt, T0 + JOURNEYMAN_WAIT_DAYS * DAY);
  });

  it('master trial unlocks 7 days after COMPLETING journeyman (not after first clear)', () => {
    const rec = {
      tier: TIER_JOURNEYMAN,
      apprenticeAt: iso(T0),
      journeymanAt: iso(T0 + 5 * DAY),
    };
    const info = nextTierInfo(rec, T0 + 5 * DAY);
    assert.equal(info.nextTier, TIER_MASTER);
    // Anchored at journeymanAt, not apprenticeAt.
    assert.equal(info.availableAt, T0 + (5 + MASTER_WAIT_DAYS) * DAY);
    assert.equal(nextTierInfo(rec, T0 + 11 * DAY).due, false);
    assert.equal(nextTierInfo(rec, T0 + 12 * DAY).due, true);
  });

  it('returns null when there is no next tier or no usable anchor', () => {
    assert.equal(nextTierInfo(null), null);
    assert.equal(nextTierInfo({ tier: 0 }), null);
    assert.equal(nextTierInfo({ tier: TIER_MASTER, journeymanAt: iso(T0) }), null);
    assert.equal(nextTierInfo({ tier: TIER_APPRENTICE }), null);           // no timestamp
    assert.equal(nextTierInfo({ tier: TIER_JOURNEYMAN, apprenticeAt: iso(T0) }), null); // wrong anchor missing
  });
});

describe('sampleTrialQuestions', () => {
  const q = (text, type) => ({ question: text, ...(type ? { type } : {}) });
  const pool = [
    q('q1'), q('q2'), q('q3'), q('q4'), q('q5'), q('q6'),
    q('demo scene', 'npc_demo'),
  ];

  it('samples about half the real questions and never an NPC scene', () => {
    for (let i = 0; i < 20; i++) {
      const sample = sampleTrialQuestions(pool, {});
      assert.equal(sample.length, 3); // ceil(6/2), scene excluded
      assert.ok(sample.every(x => x.type !== 'npc_demo'));
    }
  });

  it('includes historically missed questions first', () => {
    for (let i = 0; i < 20; i++) {
      const sample = sampleTrialQuestions(pool, { q4: 2, q6: 1, q1: 3 });
      const texts = sample.map(x => x.question).sort();
      assert.deepEqual(texts, ['q1', 'q4', 'q6']);
    }
  });

  it('caps a large set at TRIAL_MAX_QUESTIONS instead of taking half', () => {
    const big = Array.from({ length: 50 }, (_, i) => q(`b${i}`));
    const sample = sampleTrialQuestions(big, {});
    assert.equal(sample.length, TRIAL_MAX_QUESTIONS,
      'a 50-question set must not produce a 25-question trial');
    assert.equal(new Set(sample.map(x => x.question)).size, TRIAL_MAX_QUESTIONS,
      'the capped sample must not repeat questions');
  });

  it('still takes half when half is under the cap', () => {
    const small = Array.from({ length: 20 }, (_, i) => q(`s${i}`));
    assert.equal(sampleTrialQuestions(small, {}).length, 10);
  });

  it('the cap keeps missed questions and drops never-missed ones first', () => {
    const big = Array.from({ length: 50 }, (_, i) => q(`b${i}`));
    const misses = Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [`b${i}`, 12 - i]));
    const texts = new Set(sampleTrialQuestions(big, misses).map(x => x.question));
    for (let i = 0; i < 12; i++) {
      assert.ok(texts.has(`b${i}`), `capped trial dropped missed question b${i}`);
    }
  });

  it('misses beyond the sample size keep the most-missed ones', () => {
    const misses = { q1: 1, q2: 5, q3: 2, q4: 4, q5: 3, q6: 1 };
    const sample = sampleTrialQuestions(pool, misses);
    assert.equal(sample.length, 3);
    const texts = new Set(sample.map(x => x.question));
    assert.ok(texts.has('q2') && texts.has('q4') && texts.has('q5'),
      `expected the three most-missed, got ${[...texts].join(', ')}`);
  });
});
