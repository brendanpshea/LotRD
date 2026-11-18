// Power-ups are earned by what the student did, never dropped at random.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rewardForTurn, rewardForScene, earlierMisses, nextStreakReward, HARD_TYPES } from '../src/rewards.js';
import { findItemById } from '../src/items.js';

const turn = over => ({ perfect: true, streak: 1, questionType: 'multiple_choice', misses: 0, killed: false,
  fightDamage: 3, hpBeforeHeal: 20, maxHp: 20, boss: false, ...over });

describe('rewardForTurn', () => {
  it('earns nothing for an ordinary right answer, or for a kill with damage taken', () => {
    assert.equal(rewardForTurn(turn({})), null);
    assert.equal(rewardForTurn(turn({ killed: true, fightDamage: 5, streak: 2 })), null);
  });

  it('pays streaks at 3, 5 and every 10', () => {
    assert.equal(rewardForTurn(turn({ streak: 3 })).item, 'adrenaline_rush');
    assert.equal(rewardForTurn(turn({ streak: 5 })).item, 'xp_magnet');
    assert.ok(['logic_bomb', 'stack_mirror'].includes(rewardForTurn(turn({ streak: 10 })).item));
    assert.ok(rewardForTurn(turn({ streak: 20 })));
    assert.equal(rewardForTurn(turn({ streak: 4 })), null);
    assert.equal(rewardForTurn(turn({ streak: 3 })).reason, '3 in a row');
  });

  it('pays for getting right what was missed: a heal after one miss, a mulligan after two', () => {
    assert.equal(rewardForTurn(turn({ misses: 1 })).item, 'debug_elixir');
    assert.equal(rewardForTurn(turn({ misses: 2 })).item, 'mulligan');
    assert.equal(rewardForTurn(turn({ misses: 1, perfect: false })), null);
  });

  it('pays once a set for a hard question right first time', () => {
    for (const type of HARD_TYPES) assert.equal(rewardForTurn(turn({ questionType: type })).item, 'heart_container');
    assert.equal(rewardForTurn(turn({ questionType: 'code_line' }), { heart: true }), null);
    assert.equal(rewardForTurn(turn({ questionType: 'code_line', misses: 1 })).item, 'debug_elixir');
    assert.equal(rewardForTurn(turn({ questionType: 'code_line' })).once, 'heart');
  });

  it('pays for a fight without a scratch, and for one won from the brink', () => {
    assert.equal(rewardForTurn(turn({ killed: true, fightDamage: 0, streak: 2 })).item, 'firewall_shard');
    assert.equal(rewardForTurn(turn({ killed: true, hpBeforeHeal: 5, maxHp: 20, perfect: false })).item, 'restore_point');
    assert.equal(rewardForTurn(turn({ killed: true, hpBeforeHeal: 6, maxHp: 20, perfect: false })), null);
    assert.equal(rewardForTurn(turn({ killed: false, hpBeforeHeal: 2, maxHp: 20, perfect: false })), null);
  });

  it('gives one reward a turn, the rarest that applies', () => {
    assert.ok(['logic_bomb', 'stack_mirror'].includes(
      rewardForTurn(turn({ streak: 10, killed: true, fightDamage: 0, misses: 1 })).item));
    assert.equal(rewardForTurn(turn({ streak: 3, killed: true, fightDamage: 0 })).item, 'adrenaline_rush');
  });

  it('pays an everyday reward once a fight, and a milestone whenever it is reached', () => {
    const paid = { fight_paid: true };
    assert.equal(rewardForTurn(turn({ streak: 3 }), paid), null);
    assert.equal(rewardForTurn(turn({ misses: 1 }), paid), null);
    assert.equal(rewardForTurn(turn({ killed: true, fightDamage: 0 }), paid), null);
    assert.equal(rewardForTurn(turn({ streak: 5 }), paid).item, 'xp_magnet');
    assert.ok(rewardForTurn(turn({ streak: 10 }), paid));
    assert.equal(rewardForTurn(turn({ questionType: 'ordering' }), paid).item, 'heart_container');
    assert.equal(rewardForTurn(turn({ streak: 3 })).perFight, true);
    assert.equal(rewardForTurn(turn({ streak: 5 })).perFight, undefined);
  });

  it('earns nothing against the dragon', () => {
    assert.equal(rewardForTurn(turn({ streak: 10, boss: true })), null);
  });

  it('names only items that exist, each with a reason', () => {
    const cases = [turn({ streak: 3 }), turn({ streak: 5 }), turn({ streak: 10 }), turn({ misses: 1 }), turn({ misses: 2 }),
      turn({ questionType: 'ordering' }), turn({ killed: true, fightDamage: 0 }), turn({ killed: true, hpBeforeHeal: 1, perfect: false })];
    for (const c of cases) {
      for (const random of [() => 0, () => 0.99]) {
        const r = rewardForTurn(c, {}, random);
        assert.ok(findItemById(r.item), `no such item: ${r.item}`);
        assert.ok(r.reason.length > 3);
      }
    }
  });
});

describe('rewardForScene', () => {
  it('pays once a set for every check right, and not for a skipped scene or one with no checks', () => {
    assert.equal(rewardForScene({ checks: 2, right: 2 }).item, 'phoenix_feather');
    assert.equal(rewardForScene({ checks: 2, right: 1 }), null);
    assert.equal(rewardForScene({ checks: 0, right: 0 }), null);
    assert.equal(rewardForScene({ checks: 2, right: 2, skipped: true }), null);
    assert.equal(rewardForScene({ checks: 2, right: 2 }, { feather: true }), null);
  });
});

describe('earlierMisses', () => {
  it('counts misses of the same question before its latest answer, by template when it has one', () => {
    const h = [
      { question: 'A', was_perfect: false }, { question: 'B', was_perfect: true },
      { question: 'A', was_perfect: false }, { question: 'A', was_perfect: true },
    ];
    assert.equal(earlierMisses(h, h[3]), 2);
    assert.equal(earlierMisses(h, h[1]), 0);
    const d = [{ question: '2+2', template: '{{a}}+{{b}}', was_perfect: false }, { question: '3+4', template: '{{a}}+{{b}}', was_perfect: true }];
    assert.equal(earlierMisses(d, d[1]), 1);
  });
});

describe('nextStreakReward', () => {
  it('says how far the next milestone is', () => {
    assert.deepEqual(nextStreakReward(1), { more: 2, item: 'adrenaline_rush' });
    assert.deepEqual(nextStreakReward(3), { more: 2, item: 'xp_magnet' });
    assert.equal(nextStreakReward(7).more, 3);
    assert.equal(nextStreakReward(10).more, 10);
    assert.equal(nextStreakReward(14).more, 6);
  });
});
