// tests/stage.test.js — the battle stage's choreography (src/stage.js): what a
// round of combat, or an item, looks like as a sequence of beats.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planTurn, planItem, sfxFor, BEAT } from '../src/stage.js';
import { SFX } from '../src/sound.js';
import { ITEMS } from '../src/items.js';

/** A round's result with nothing in it; override what happened. */
const round = (over = {}) => ({
  effective_player_damage: 0, effective_monster_damage: 0,
  defeated_monster: false, defeated_player: false,
  shield_used: false, mirror_used: false, mirror_damage: 0, adrenaline_used: false,
  streakMultiplier: 1, question_repeated: false, ...over,
});

/** The beats as "who act", in time order, so a sequence reads at a glance. */
const story = plan => [...plan.beats].sort((a, b) => a.at - b.at).map(b => `${b.who} ${b.act}`);
const item = id => ITEMS.find(i => i.id === id);

describe('a round of combat', () => {
  it('is nothing to show when nobody was hurt', () => {
    assert.deepEqual(planTurn(round()), { beats: [], end: 0 });
  });

  it('a right answer: the hero strikes and the monster reels', () => {
    const plan = planTurn(round({ effective_player_damage: 5 }));
    assert.deepEqual(story(plan), ['hero attack', 'monster hit']);
    assert.equal(plan.beats[1].text, '-5');
    assert.equal(plan.beats[1].at, BEAT.strike, 'the blow lands partway into the lunge');
    assert.ok(plan.end >= BEAT.attack);
  });

  it('a wrong answer that still chips: the hero strikes first, then takes the counter', () => {
    const plan = planTurn(round({ effective_player_damage: 2, effective_monster_damage: 3 }));
    assert.deepEqual(story(plan), ['hero attack', 'monster hit', 'monster attack', 'hero hit']);
    assert.equal(plan.beats.find(b => b.act === 'hit' && b.who === 'hero').text, '-3');
  });

  it('a killing blow: the monster counters first, so it is not swinging after it falls', () => {
    const plan = planTurn(round({ effective_player_damage: 9, effective_monster_damage: 2, defeated_monster: true }));
    assert.deepEqual(story(plan), ['monster attack', 'hero hit', 'hero attack', 'monster vanish']);
  });

  it('a defeat: the hero goes down last, and stays down', () => {
    const plan = planTurn(round({ effective_monster_damage: 8, defeated_player: true }));
    assert.deepEqual(story(plan), ['monster attack', 'hero hit', 'hero down']);
  });

  it('when both fall, the hero lands the last blow before going down', () => {
    const plan = planTurn(round({ effective_player_damage: 4, effective_monster_damage: 8,
      defeated_monster: true, defeated_player: true }));
    assert.deepEqual(story(plan), ['monster attack', 'hero hit', 'hero attack', 'monster vanish', 'hero down']);
  });

  it('a revive: down, then back up', () => {
    const plan = planTurn(round({ effective_monster_damage: 8, revived: true }));
    assert.deepEqual(story(plan), ['monster attack', 'hero hit', 'hero down', 'hero revive']);
  });

  it('a Firewall Shard takes the blow instead of the hero', () => {
    assert.deepEqual(story(planTurn(round({ shield_used: true }))), ['monster attack', 'hero block']);
  });

  it('a Stack Mirror sends the blow back, and can fell the monster with it', () => {
    assert.deepEqual(story(planTurn(round({ mirror_used: true, mirror_damage: 4 }))),
      ['monster attack', 'hero reflect', 'monster hit']);
    assert.deepEqual(story(planTurn(round({ mirror_used: true, mirror_damage: 4, defeated_monster: true }))),
      ['monster attack', 'hero reflect', 'monster vanish']);
  });

  it('a streak or Adrenaline Rush charges the hero\'s attack', () => {
    assert.equal(planTurn(round({ effective_player_damage: 5, streakMultiplier: 1.5 })).beats[0].charged, true);
    assert.equal(planTurn(round({ effective_player_damage: 5, adrenaline_used: true })).beats[0].charged, true);
    assert.equal(planTurn(round({ effective_player_damage: 5 })).beats[0].charged, false);
  });

  it('a drop pops out of the monster after it falls, and only if it fell', () => {
    const drop = item('debug_elixir');
    const fell = planTurn(round({ effective_player_damage: 9, defeated_monster: true }), { drop });
    const popped = fell.beats.find(b => b.act === 'drop');
    assert.equal(popped.text, drop.emoji);
    assert.ok(popped.at > fell.beats.find(b => b.act === 'vanish').at);
    assert.ok(!planTurn(round({ effective_player_damage: 2 }), { drop }).beats.some(b => b.act === 'drop'));
  });

  it('a win gives HP back once the monster is gone', () => {
    const plan = planTurn(round({ effective_player_damage: 9, defeated_monster: true, healed: 5 }));
    assert.deepEqual(story(plan), ['hero attack', 'monster vanish', 'hero glow']);
    const heal = plan.beats.find(b => b.act === 'glow');
    assert.equal(heal.text, '+5');
    assert.ok(heal.at > plan.beats.find(b => b.act === 'vanish').at);
    assert.ok(plan.end > heal.at);
  });

  it('the dragon takes a blow when a concept is mastered, not from dice', () => {
    // Its defense is Infinity, so damage is always 0; and its HP is a count, not a number to float.
    const mastered = planTurn(round({ question_repeated: false }), { boss: true });
    assert.deepEqual(story(mastered), ['hero attack', 'monster hit']);
    assert.equal(mastered.beats[1].text, null);
    const missed = planTurn(round({ question_repeated: true, effective_monster_damage: 3 }), { boss: true });
    assert.deepEqual(story(missed), ['monster attack', 'hero hit']);
  });

  it('a wrong guess with tries left: only the monster moves', () => {
    const plan = planTurn(round({ effective_monster_damage: 3, effective_player_damage: 2 }), { strike: false });
    assert.deepEqual(story(plan), ['monster attack', 'hero hit']);
  });

  it('every beat is over by the end', () => {
    const plan = planTurn(round({ effective_player_damage: 4, effective_monster_damage: 8,
      defeated_monster: true, revived: true }), { drop: item('mulligan') });
    for (const b of plan.beats) assert.ok(b.at < plan.end, `${b.who} ${b.act} at ${b.at} after ${plan.end}`);
  });
});

describe('using an item', () => {
  it('a heal glows and shows what it restored', () => {
    const plan = planItem(item('debug_elixir'), { amount: 4 });
    assert.deepEqual(story(plan), ['hero glow']);
    assert.equal(plan.beats[0].text, '+4');
    assert.equal(plan.beats[0].tone, 'heal');
  });

  it('a Logic Bomb is thrown, and the monster falls to it', () => {
    const plan = planItem(item('logic_bomb'));
    assert.deepEqual(story(plan), ['hero throw', 'monster vanish']);
    assert.ok(plan.end > BEAT.throw + BEAT.vanish - 1, 'the next monster waits for this one to fall');
    assert.deepEqual(story(planItem(item('logic_bomb'), { healed: 5 })), ['hero throw', 'monster vanish', 'hero glow']);
  });

  it('an item armed for later glows with its own icon', () => {
    for (const id of ['firewall_shard', 'stack_mirror', 'xp_magnet', 'adrenaline_rush', 'mulligan']) {
      const plan = planItem(item(id));
      assert.equal(plan.beats[0].text, item(id).emoji, id);
    }
  });

  it('every item has something to show', () => {
    for (const i of ITEMS) assert.ok(planItem(i).end > 0, i.id);
  });
});

describe('what the stage sounds like', () => {
  const sounds = plan => [...plan.beats].sort((a, b) => a.at - b.at).map(sfxFor);

  it('every beat of every kind of round, and every item, makes a sound that exists', () => {
    const plans = [
      planTurn(round({ effective_player_damage: 2, effective_monster_damage: 3 })),
      planTurn(round({ effective_player_damage: 9, streakMultiplier: 1.5, defeated_monster: true, healed: 5 }),
        { drop: ITEMS[0] }),
      planTurn(round({ effective_monster_damage: 4, defeated_player: true, revived: true })),
      planTurn(round({ shield_used: true })),
      planTurn(round({ mirror_used: true, mirror_damage: 3 })),
      ...ITEMS.map(i => planItem(i, { healed: 4 })),
    ];
    for (const beat of plans.flatMap(p => p.beats)) {
      assert.ok(sfxFor(beat) in SFX, `${beat.who} ${beat.act} ${beat.tone ?? ''}: ${sfxFor(beat)}`);
    }
  });

  it('a partly right answer: the swing, the blow, the counter, the hurt', () => {
    assert.deepEqual(sounds(planTurn(round({ effective_player_damage: 2, effective_monster_damage: 3 }))),
      ['swing', 'hit', 'claw', 'hurt']);
  });

  it('a streak swings harder, a kill sounds its defeat and its drop, and a bomb is a boom', () => {
    const kill = planTurn(round({ effective_player_damage: 9, streakMultiplier: 1.5, defeated_monster: true }),
      { drop: ITEMS[0] });
    assert.deepEqual(sounds(kill), ['charged', 'defeat', 'drop']);
    assert.deepEqual(sounds(planItem(item('logic_bomb'))), ['throw', 'boom']);
  });
});
