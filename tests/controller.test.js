// tests/controller.test.js — Unit tests for the non-DOM logic in src/controller.js
//
// GameController's constructor wires up the DOM, so these tests build an
// instance off the prototype and inject a model plus minimal stubs for the
// collaborators the methods under test actually touch.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GameController } from '../src/controller.js';
import { GameModel } from '../src/model.js';
import { ITEMS } from '../src/items.js';

const MONSTERS = [
  { monster_name: 'Test Slime', hit_dice: 1, attack_die: 4, defense: 0, image: 'slime.png' },
];

function mcQuestion(overrides = {}) {
  return { question: 'Pick the right one.', correct: ['A'], incorrect: ['B', 'C'], ...overrides };
}

/** A controller with just enough wiring for the methods under test. */
function stubController(model) {
  const c = Object.create(GameController.prototype);
  c.model = model;
  c.messages = [];
  c.resolved = [];
  c.ui = {
    showFeedbackInline: msg => c.messages.push(msg),
    refreshHUD: () => {},
  };
  c.sounds = { correct: () => {}, incorrect: () => {}, levelUp: () => {}, monsterDefeated: () => {} };
  c.saveGame = () => {};
  c._resolveBattle = data => c.resolved.push(data);
  return c;
}

/** A model on a live encounter, with combat made deterministic. */
function encounterModel(questions = [mcQuestion()]) {
  const gm = new GameModel(questions, MONSTERS);
  gm.nextEncounter();
  gm.current_monster.hit_points = 999;
  gm.current_monster.max_hit_points = 999;
  gm.current_monster.defense = 0;
  gm.current_monster.attack_die = 8;
  gm.player.hit_points = 999;
  gm.player.max_hit_points = 999;
  gm.player.base_defense = 0;
  return gm;
}

// ────────────────────────────────────────────────────────────────────────────────
// Mulligan rollback
// ────────────────────────────────────────────────────────────────────────────────
describe('Mulligan rollback', () => {
  it('rewinds a wrong answer and lets the player retry the same question', () => {
    const gm = encounterModel();
    gm.pending_effects.add('mulligan');
    const inFlight = gm.current_question;   // the model shallow-copies question objects
    const c = stubController(gm);

    c._evaluateWithMulligan(() => gm.evaluateAnswer(['B']));

    assert.equal(c.resolved.length, 0, 'the turn should not resolve');
    assert.equal(gm.current_question, inFlight, 'the question should still be in play');
    assert.equal(gm.answer_history.length, 0);
    assert.equal(gm.questions_asked, 0);
    assert.equal(gm.pending_effects.has('mulligan'), false, 'the mulligan itself is spent');
    assert.ok(c.messages.some(m => m.includes('Mulligan')));
  });

  it('restores other armed items consumed by the rolled-back turn', () => {
    const gm = encounterModel();
    gm.pending_effects.add('mulligan');
    gm.pending_effects.add('shield');
    const c = stubController(gm);

    c._evaluateWithMulligan(() => gm.evaluateAnswer(['B'])); // wrong → monster hits, shield fires

    assert.ok(gm.pending_effects.has('shield'),
      'a shield burned on a rolled-back turn should be given back');
    assert.equal(gm.player.hit_points, 999, 'HP should be rewound too');
  });

  it('does not leave a duplicate concept in the boss queue', () => {
    const q1 = mcQuestion({ question: 'Boss-q' });
    const q2 = mcQuestion({ question: 'Other-q' });
    const gm = encounterModel([q1]);
    gm.boss_phase = true;
    gm.boss_queue = [q2];
    gm.current_question = q1;
    gm.pending_effects.add('mulligan');
    const c = stubController(gm);

    c._evaluateWithMulligan(() => gm.evaluateAnswer(['B'])); // wrong → requeues into boss_queue

    assert.deepEqual(gm.boss_queue.map(q => q.question), ['Other-q']);
    assert.equal(gm.current_question, q1);
  });

  it('lets a perfect answer through untouched', () => {
    const gm = encounterModel();
    gm.pending_effects.add('mulligan');
    const c = stubController(gm);

    c._evaluateWithMulligan(() => gm.evaluateAnswer(['A']));

    assert.equal(c.resolved.length, 1);
    assert.ok(gm.pending_effects.has('mulligan'), 'an unused mulligan stays armed');
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// Item activation
// ────────────────────────────────────────────────────────────────────────────────
describe('useItem', () => {
  const itemById = id => ({ ...ITEMS.find(i => i.id === id) });

  it('heals up to the missing HP and consumes the item', () => {
    const gm = encounterModel();
    gm.player.max_hit_points = 20;
    gm.player.hit_points = 16;
    gm.inventory[0] = itemById('debug_elixir'); // heals 6
    const c = stubController(gm);

    c.useItem(0);

    assert.equal(gm.player.hit_points, 20, 'heal is capped at max HP');
    assert.equal(gm.inventory[0], null);
  });

  it('keeps a heal item instead of wasting it at full HP', () => {
    const gm = encounterModel();
    gm.player.max_hit_points = 20;
    gm.player.hit_points = 20;
    gm.inventory[0] = itemById('debug_elixir');
    const c = stubController(gm);

    c.useItem(0);

    assert.ok(gm.inventory[0], 'the item should still be in the slot');
    assert.ok(c.messages.some(m => m.includes('full HP')));
  });

  it('arms a pending item rather than firing it immediately', () => {
    const gm = encounterModel();
    gm.inventory[1] = itemById('firewall_shard');
    const c = stubController(gm);

    c.useItem(1);

    assert.ok(gm.pending_effects.has('shield'));
    assert.equal(gm.inventory[1], null);
  });

  it('refuses the Logic Bomb during the boss fight', () => {
    const gm = encounterModel();
    gm.boss_phase = true;
    gm.inventory[0] = itemById('logic_bomb');
    const c = stubController(gm);

    c.useItem(0);

    assert.ok(gm.inventory[0], 'the bomb should not be consumed');
    assert.ok(gm.current_monster.hit_points > 0);
  });
});
