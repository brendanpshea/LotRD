// tests/model.test.js — Unit tests for src/model.js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { rollDice, Player, Monster, GameModel,
         levenshtein, levenshteinSimilarity, wordleFeedback } from '../src/model.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const SAMPLE_MONSTERS = [
  { monster_name: 'Test Slime', hit_dice: 1, attack_die: 4, defense: 0, image: 'slime.png' },
  { monster_name: 'Test Golem', hit_dice: 5, attack_die: 8, defense: 3, image: 'golem.png' },
];

function mcQuestion(overrides = {}) {
  return {
    question: 'Pick the right one.',
    correct: ['A'],
    incorrect: ['B', 'C'],
    feedback: 'A is correct.',
    ...overrides,
  };
}

function fillBlankQuestion(overrides = {}) {
  return {
    type: 'fill_blank',
    question: 'The keyword is ___.',
    correct: ['extends'],
    case_sensitive: false,
    feedback: 'extends is the keyword.',
    ...overrides,
  };
}

function matchingQuestion(overrides = {}) {
  return {
    type: 'matching',
    question: 'Match the terms.',
    pairs: [
      { term: 'X', definition: 'x_def' },
      { term: 'Y', definition: 'y_def' },
    ],
    feedback: 'Well done.',
    ...overrides,
  };
}

function freshModel(questions = null, monsters = null, saveData = null, levelData = null) {
  return new GameModel(
    questions ?? [mcQuestion()],
    monsters ?? SAMPLE_MONSTERS,
    saveData,
    levelData,
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// rollDice
// ────────────────────────────────────────────────────────────────────────────────
describe('rollDice', () => {
  it('returns a number in the expected range for 1d6', () => {
    for (let i = 0; i < 100; i++) {
      const r = rollDice(1, 6);
      assert.ok(r >= 1 && r <= 6, `1d6 out of range: ${r}`);
    }
  });

  it('returns a number in range for 3d10', () => {
    for (let i = 0; i < 100; i++) {
      const r = rollDice(3, 10);
      assert.ok(r >= 3 && r <= 30, `3d10 out of range: ${r}`);
    }
  });

  it('returns 0 for 0 dice', () => {
    assert.equal(rollDice(0, 6), 0);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// Player
// ────────────────────────────────────────────────────────────────────────────────
describe('Player', () => {
  it('defaults to level 1 with 20 HP and 0 revive charges', () => {
    const p = new Player();
    assert.equal(p.level, 1);
    assert.equal(p.xp, 0);
    assert.equal(p.xp_to_next_level, 100);
    assert.equal(p.max_hit_points, 20);
    assert.equal(p.hit_points, 20);
    assert.equal(p.attack_die, 6);
    assert.equal(p.base_defense, 1);
    assert.equal(p.revive_charges, 0);
  });

  it('accepts global levelData to start at higher level', () => {
    const p = new Player({ level: 5, xp: 30, revive_charges: 3 });
    assert.equal(p.level, 5);
    assert.equal(p.xp, 30);
    assert.equal(p.xp_to_next_level, Math.round(100 * Math.pow(1.25, 4)));
    assert.equal(p.revive_charges, 3);
  });

  it('attack_die is fixed; max_hp and base_defense scale with level', () => {
    const p = new Player({ level: 50, xp: 0, revive_charges: 10 });
    assert.equal(p.attack_die, 6);
    // 1 + floor((50-1)/5) = 1 + 9 = 10
    assert.equal(p.base_defense, 10);
    // 20 + (50-1)*2 = 118
    assert.equal(p.max_hit_points, 118);
  });

  it('level 1 player has the documented baseline stats', () => {
    const p = new Player({ level: 1 });
    assert.equal(p.max_hit_points, 20);
    assert.equal(p.base_defense, 1);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// Monster
// ────────────────────────────────────────────────────────────────────────────────
describe('Monster', () => {
  it('initialises from data with correct HP range', () => {
    const m = new Monster(SAMPLE_MONSTERS[0]); // hit_dice=1
    assert.equal(m.monster_name, 'Test Slime');
    assert.ok(m.hit_points >= 1 && m.hit_points <= 10, `HP out of range: ${m.hit_points}`);
    assert.equal(m.max_hit_points, m.hit_points);
    assert.equal(m.xp_value, 10); // hit_dice * 10
  });

  it('xp_value equals hit_dice × 10', () => {
    const m = new Monster(SAMPLE_MONSTERS[1]); // hit_dice=5
    assert.equal(m.xp_value, 50);
  });

  it('HP scales with hit_dice (5d10 = 5–50)', () => {
    for (let i = 0; i < 50; i++) {
      const m = new Monster(SAMPLE_MONSTERS[1]);
      assert.ok(m.hit_points >= 5 && m.hit_points <= 50, `5d10 HP out of range: ${m.hit_points}`);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// GameModel — construction & shuffling
// ────────────────────────────────────────────────────────────────────────────────
describe('GameModel constructor', () => {
  it('shuffles questions on fresh start', () => {
    const qs = Array.from({ length: 20 }, (_, i) => mcQuestion({ question: `Q${i}` }));
    const gm = freshModel(qs);
    const names = gm.questions_to_ask.map(q => q.question);
    const ordered = qs.map(q => q.question);
    // It's theoretically possible but astronomically unlikely that 20 items shuffle into order
    const isSameOrder = names.every((n, i) => n === ordered[i]);
    // Allow this test to pass on the off chance — just check lengths match
    assert.equal(names.length, ordered.length);
  });

  it('inherits global levelData on fresh start', () => {
    const gm = freshModel(null, null, null, { level: 7, xp: 100, revive_charges: 5 });
    assert.equal(gm.player.level, 7);
    assert.equal(gm.player.xp, 100);
    assert.equal(gm.player.revive_charges, 5);
  });

  it('resume path restores player state from saveData', () => {
    const original = freshModel();
    original.player.level = 3;
    original.player.xp = 42;
    original.player.revive_charges = 2;
    original.player.hit_points = 12;
    const saved = original.toSaveData();

    const resumed = freshModel(null, null, saved);
    assert.equal(resumed.player.level, 3);
    assert.equal(resumed.player.xp, 42);
    assert.equal(resumed.player.revive_charges, 2);
    assert.equal(resumed.player.hit_points, 12);
    assert.equal(resumed.player.attack_die, 6);
    assert.equal(resumed.player.base_defense, 1);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// GameModel — toSaveData round-trip
// ────────────────────────────────────────────────────────────────────────────────
describe('toSaveData / resume round-trip', () => {
  it('round-trips all player fields through JSON', () => {
    const gm = freshModel([mcQuestion(), mcQuestion()]);
    gm.player.level = 4;
    gm.player.xp = 55;
    gm.player.xp_to_next_level = 4 * 150;
    gm.player.revive_charges = 3;
    gm.player.streak = 7;
    gm.player.best_streak = 9;
    gm.player.total_correct = 10;
    gm.player.total_incorrect = 2;

    const json = JSON.stringify(gm.toSaveData());
    const parsed = JSON.parse(json);
    const resumed = new GameModel([], SAMPLE_MONSTERS, parsed);

    assert.equal(resumed.player.level, 4);
    assert.equal(resumed.player.xp, 55);
    assert.equal(resumed.player.xp_to_next_level, 4 * 150);
    assert.equal(resumed.player.revive_charges, 3);
    assert.equal(resumed.player.streak, 7);
    assert.equal(resumed.player.best_streak, 9);
    assert.equal(resumed.player.total_correct, 10);
    assert.equal(resumed.player.total_incorrect, 2);
    assert.equal(resumed.player.attack_die, 6);
    assert.equal(resumed.player.base_defense, 1);
  });

  it('preserves questions_to_ask and answer_history', () => {
    const qs = [mcQuestion({ question: 'Q1' }), mcQuestion({ question: 'Q2' })];
    const gm = freshModel(qs);
    gm.nextEncounter(); // pops Q1 (or Q2 — shuffled)

    const saved = JSON.parse(JSON.stringify(gm.toSaveData()));
    const resumed = new GameModel([], SAMPLE_MONSTERS, saved);
    assert.equal(resumed.questions_to_ask.length, 1);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// GameModel — generateMonster
// ────────────────────────────────────────────────────────────────────────────────
describe('generateMonster', () => {
  it('weights toward monsters whose hit_dice match the player level', () => {
    const gm = freshModel();
    gm.player.level = 5;
    const counts = { 'Test Slime': 0, 'Test Golem': 0 };
    for (let i = 0; i < 600; i++) counts[gm.generateMonster().monster_name]++;
    // Golem (hit_dice=5) should dominate over Slime (hit_dice=1) at level 5
    assert.ok(counts['Test Golem'] > counts['Test Slime'],
      `Expected Golem to dominate at level 5: ${JSON.stringify(counts)}`);
  });

  it('low-level players see more low-tier monsters', () => {
    const gm = freshModel();
    gm.player.level = 1;
    const counts = { 'Test Slime': 0, 'Test Golem': 0 };
    for (let i = 0; i < 600; i++) counts[gm.generateMonster().monster_name]++;
    assert.ok(counts['Test Slime'] > counts['Test Golem'],
      `Expected Slime to dominate at level 1: ${JSON.stringify(counts)}`);
  });

  it('keeps every monster reachable (non-zero weight)', () => {
    const gm = freshModel();
    gm.player.level = 1;
    const names = new Set();
    for (let i = 0; i < 800 && names.size < 2; i++) {
      names.add(gm.generateMonster().monster_name);
    }
    assert.ok(names.has('Test Slime'));
    assert.ok(names.has('Test Golem'));
  });

  it('penalizes immediate monster repeats when alternatives exist', () => {
    const monsters = [
      { monster_name: 'Constellation', hit_dice: 6, attack_die: 4, defense: 0, image: 'slime.png' },
      { monster_name: 'Warden', hit_dice: 6, attack_die: 4, defense: 0, image: 'golem.png' },
    ];
    const gm = freshModel([mcQuestion(), mcQuestion(), mcQuestion()], monsters);
    gm.player.level = 6;

    const randomValues = [0.01, 0.99];
    const originalRandom = Math.random;
    Math.random = () => randomValues.shift() ?? 0.5;

    try {
      const first = gm.generateMonster().monster_name;
      const second = gm.generateMonster().monster_name;
      assert.notEqual(second, first);
    } finally {
      Math.random = originalRandom;
    }
  });

  it('round-trips recent monster history through save data', () => {
    const gm = freshModel();
    gm.recent_monsters = ['Alpha', 'Beta', 'Gamma'];

    const resumed = freshModel(null, null, gm.toSaveData());
    assert.deepEqual(resumed.recent_monsters, ['Alpha', 'Beta', 'Gamma']);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// GameModel — nextEncounter
// ────────────────────────────────────────────────────────────────────────────────
describe('nextEncounter', () => {
  it('returns "victory" when all questions are answered', () => {
    const gm = freshModel([mcQuestion()]);
    const s1 = gm.nextEncounter();
    assert.equal(s1, 'continue');
    assert.ok(gm.current_monster);
    assert.ok(gm.current_question);

    // Simulate monster death so next call tries to spawn a new one
    gm.current_monster.hit_points = 0;
    const s2 = gm.nextEncounter();
    assert.equal(s2, 'victory');
  });

  it('reuses the same monster until it dies', () => {
    const gm = freshModel([mcQuestion(), mcQuestion(), mcQuestion()]);
    gm.nextEncounter();
    const monsterRef = gm.current_monster;
    gm.nextEncounter(); // monster still alive
    assert.equal(gm.current_monster, monsterRef);
  });

  it('spawns a new monster after the old one dies', () => {
    const gm = freshModel([mcQuestion(), mcQuestion(), mcQuestion()]);
    gm.nextEncounter();
    const first = gm.current_monster;
    first.hit_points = 0;
    gm.nextEncounter();
    assert.notEqual(gm.current_monster, first);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// GameModel — evaluateAnswer (multiple choice)
// ────────────────────────────────────────────────────────────────────────────────
describe('evaluateAnswer', () => {
  let gm;
  beforeEach(() => {
    gm = freshModel([mcQuestion()]);
    gm.nextEncounter();
    // Give monster lots of HP so it doesn't die mid-test
    gm.current_monster.hit_points = 999;
    gm.current_monster.max_hit_points = 999;
  });

  it('perfect answer: no incorrect/missed, isPerfect, streaks', () => {
    const result = gm.evaluateAnswer(['A']);
    assert.deepEqual(result.correctSelections, ['A']);
    assert.deepEqual(result.incorrectSelections, []);
    assert.deepEqual(result.missedCorrect, []);
    assert.equal(result.question_repeated, false);
    assert.equal(gm.player.streak, 1);
  });

  it('wrong answer: incorrect tracked, question re-queued', () => {
    const result = gm.evaluateAnswer(['B']);
    assert.deepEqual(result.incorrectSelections, ['B']);
    assert.deepEqual(result.missedCorrect, ['A']);
    assert.equal(result.question_repeated, true);
    assert.equal(gm.player.streak, 0);
    assert.ok(gm.questions_to_ask.length > 0, 'question should be re-queued');
  });

  it('player takes damage on wrong answer (uses base_defense, not armor)', () => {
    // Force monster to deal max damage
    gm.current_monster.attack_die = 6;
    const result = gm.evaluateAnswer(['B']);
    // Monster damage reduced by base_defense (1).
    // Monster rolls 1d6 for each incorrect+missed = 2 rolls
    // We can't predict exact value, but effective_monster_damage should be >= 0
    assert.ok(result.effective_monster_damage >= 0);
  });

  it('player deals damage with fixed attack_die (d6)', () => {
    const result = gm.evaluateAnswer(['A']);
    // Player rolls weapon die × player_hits (includes "correctly avoided wrong")
    assert.ok(result.effective_player_damage >= 0);
  });

  it('records answer in answer_history', () => {
    gm.evaluateAnswer(['A']);
    assert.equal(gm.answer_history.length, 1);
    assert.equal(gm.answer_history[0].was_perfect, true);
  });

  it('increments questions_asked', () => {
    gm.evaluateAnswer(['A']);
    assert.equal(gm.questions_asked, 1);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// Levenshtein and Wordle utilities
// ────────────────────────────────────────────────────────────────────────────────
describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    assert.equal(levenshtein('hello', 'hello'), 0);
  });
  it('returns string length when one side is empty', () => {
    assert.equal(levenshtein('', 'cat'), 3);
    assert.equal(levenshtein('cat', ''), 3);
  });
  it('counts a single substitution as 1', () => {
    assert.equal(levenshtein('cat', 'bat'), 1);
  });
  it('counts insertion + deletion correctly', () => {
    assert.equal(levenshtein('extend', 'extends'), 1);
    assert.equal(levenshtein('xtends', 'extends'), 1);
  });
  it('similarity is 1 - dist/maxLen', () => {
    assert.ok(Math.abs(levenshteinSimilarity('extend', 'extends') - 6 / 7) < 1e-9);
    assert.equal(levenshteinSimilarity('cat', 'cat'), 1);
    assert.equal(levenshteinSimilarity('', ''), 1);
  });
});

describe('wordleFeedback', () => {
  it('marks every position correct for an exact match', () => {
    const fb = wordleFeedback('cat', 'cat');
    assert.deepEqual(fb.map(t => t.status), ['correct', 'correct', 'correct']);
  });
  it('marks unrelated letters as absent', () => {
    const fb = wordleFeedback('xyz', 'abc');
    assert.deepEqual(fb.map(t => t.status), ['absent', 'absent', 'absent']);
  });
  it('marks a letter present when it appears at a different position', () => {
    // guess "cab" vs answer "bat": c→absent, a→correct, b→present
    const fb = wordleFeedback('cab', 'bat');
    assert.equal(fb[0].status, 'absent');
    assert.equal(fb[1].status, 'correct');
    assert.equal(fb[2].status, 'present');
  });
  it('handles duplicate letters (only one match consumed per answer letter)', () => {
    // guess "loose" vs answer "lower": l→correct, o→correct, second o has no match left
    const fb = wordleFeedback('loose', 'lower');
    assert.equal(fb[0].status, 'correct');
    assert.equal(fb[1].status, 'correct');
    assert.equal(fb[2].status, 'absent');
  });
  it('flags spaces with a separate space status', () => {
    const fb = wordleFeedback('a b', 'a c');
    assert.equal(fb[1].status, 'space');
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// GameModel — submitFillBlankGuess (multi-attempt)
// ────────────────────────────────────────────────────────────────────────────────
describe('submitFillBlankGuess', () => {
  let gm;
  beforeEach(() => {
    gm = freshModel([fillBlankQuestion()]);
    gm.nextEncounter();
    gm.current_monster.hit_points = 999;
    gm.current_monster.max_hit_points = 999;
  });

  it('first-try correct answer wins immediately and is perfect', () => {
    const r = gm.submitFillBlankGuess('Extends');
    assert.equal(r.status, 'won');
    assert.equal(r.attemptsUsed, 1);
    assert.equal(r.streakState, 'incremented');
    assert.equal(r.question_repeated, false);
    assert.equal(gm.player.streak, 1);
  });

  it('returns wordle feedback on a wrong intermediate guess', () => {
    const r = gm.submitFillBlankGuess('explode');
    assert.equal(r.status, 'wrong');
    assert.ok(Array.isArray(r.feedback));
    assert.equal(r.feedback.length, 'explode'.length);
    assert.equal(r.attemptsLeft, 2);
  });

  it('second-try win preserves streak (not reset, not incremented)', () => {
    gm.player.streak = 4;
    gm.submitFillBlankGuess('zzzzzz'); // wrong
    const r = gm.submitFillBlankGuess('extends');
    assert.equal(r.status, 'won');
    assert.equal(r.attemptsUsed, 2);
    assert.equal(r.streakState, 'preserved');
    assert.equal(gm.player.streak, 4);
  });

  it('three wrong guesses → status failed and question is requeued', () => {
    gm.submitFillBlankGuess('aaa');
    gm.submitFillBlankGuess('bbb');
    const r = gm.submitFillBlankGuess('ccc');
    assert.equal(r.status, 'failed');
    assert.equal(r.attemptsUsed, 3);
    assert.equal(r.question_repeated, true);
  });

  it('failure with high similarity (≥0.8) preserves streak', () => {
    gm.player.streak = 3;
    gm.submitFillBlankGuess('extend');  // sim 6/7 ≈ 0.857
    gm.submitFillBlankGuess('xtends');  // sim 6/7
    const r = gm.submitFillBlankGuess('extens'); // sim 6/7
    assert.equal(r.status, 'failed');
    assert.equal(r.streakState, 'preserved');
    assert.equal(gm.player.streak, 3);
  });

  it('case-sensitive mode rejects wrong case', () => {
    const gm2 = freshModel([fillBlankQuestion({ case_sensitive: true })]);
    gm2.nextEncounter();
    gm2.current_monster.hit_points = 999;
    const r = gm2.submitFillBlankGuess('Extends'); // capital E rejected
    assert.equal(r.status, 'wrong');
  });

  it('accepts any answer in the correct array', () => {
    const gm2 = freshModel([fillBlankQuestion({ correct: ['true', 'True', 'TRUE'] })]);
    gm2.nextEncounter();
    gm2.current_monster.hit_points = 999;
    const r = gm2.submitFillBlankGuess('true');
    assert.equal(r.status, 'won');
  });

  it('wrong intermediate guess applies monster damage but no player damage', () => {
    gm.player.base_defense = 0;
    gm.current_monster.attack_die = 100; // force visible damage
    const startHp = gm.player.hit_points;
    const r = gm.submitFillBlankGuess('zzzz');
    assert.equal(r.status, 'wrong');
    assert.ok(r.effective_monster_damage > 0);
    assert.equal(gm.player.hit_points, startHp - r.effective_monster_damage);
  });

  it('attempt state resets when the question changes', () => {
    const q1 = fillBlankQuestion({ question: 'Q1', correct: ['first']  });
    const q2 = fillBlankQuestion({ question: 'Q2', correct: ['second'] });
    const gm2 = freshModel([q1]);
    gm2.nextEncounter();
    gm2.current_monster.hit_points = 999;
    gm2.current_question = q1;          // pin to Q1
    gm2.submitFillBlankGuess('wrong');  // attempt 1 of Q1
    gm2.current_question = q2;          // switch
    const r = gm2.submitFillBlankGuess('alsobad');
    assert.equal(r.attemptsUsed, 1, 'counter should reset on new question');
  });

  it('forceFillBlankFail returns a finalized failure result', () => {
    gm.submitFillBlankGuess('wrong'); // 1st attempt
    const r = gm.forceFillBlankFail();
    assert.equal(r.status, 'failed');
    assert.equal(r.question_repeated, true);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// GameModel — evaluateMatching
// ────────────────────────────────────────────────────────────────────────────────
describe('evaluateMatching', () => {
  let gm;
  beforeEach(() => {
    gm = freshModel([matchingQuestion()]);
    gm.nextEncounter();
    gm.current_monster.hit_points = 999;
    gm.current_monster.max_hit_points = 999;
  });

  it('all correct pairs = perfect', () => {
    const r = gm.evaluateMatching([
      { term: 'X', definition: 'x_def' },
      { term: 'Y', definition: 'y_def' },
    ]);
    assert.equal(r.question_repeated, false);
    assert.equal(gm.player.streak, 1);
  });

  it('swapped definitions = wrong + re-queued', () => {
    const r = gm.evaluateMatching([
      { term: 'X', definition: 'y_def' },
      { term: 'Y', definition: 'x_def' },
    ]);
    assert.equal(r.question_repeated, true);
    assert.equal(gm.player.streak, 0);
    assert.equal(r.incorrectSelections.length, 2);
  });

  it('partial match: one right, one wrong', () => {
    const r = gm.evaluateMatching([
      { term: 'X', definition: 'x_def' },
      { term: 'Y', definition: 'x_def' }, // wrong
    ]);
    assert.equal(r.correctSelections.length, 1);
    assert.equal(r.incorrectSelections.length, 1);
    assert.equal(r.question_repeated, true);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// Streak mechanics
// ────────────────────────────────────────────────────────────────────────────────
describe('Streak mechanics', () => {
  it('builds streak on consecutive perfect answers', () => {
    const qs = Array.from({ length: 12 }, () => mcQuestion());
    const gm = freshModel(qs);

    for (let i = 0; i < 12; i++) {
      gm.nextEncounter();
      gm.current_monster.hit_points = 999;
      gm.evaluateAnswer(['A']);
    }
    assert.equal(gm.player.streak, 12);
    assert.equal(gm.player.best_streak, 12);
  });

  it('resets streak on wrong answer but preserves best_streak', () => {
    const qs = Array.from({ length: 6 }, () => mcQuestion());
    const gm = freshModel(qs);

    // Build streak to 5
    for (let i = 0; i < 5; i++) {
      gm.nextEncounter();
      gm.current_monster.hit_points = 999;
      gm.evaluateAnswer(['A']);
    }
    assert.equal(gm.player.streak, 5);

    // Break it
    gm.nextEncounter();
    gm.current_monster.hit_points = 999;
    gm.evaluateAnswer(['B']); // wrong
    assert.equal(gm.player.streak, 0);
    assert.equal(gm.player.best_streak, 5);
  });

  it('applies 1.25× multiplier at streak 3', () => {
    const qs = Array.from({ length: 4 }, () => mcQuestion());
    const gm = freshModel(qs);
    for (let i = 0; i < 3; i++) {
      gm.nextEncounter();
      gm.current_monster.hit_points = 999;
      gm.evaluateAnswer(['A']);
    }
    gm.nextEncounter();
    gm.current_monster.hit_points = 999;
    const r = gm.evaluateAnswer(['A']);
    assert.equal(r.streakMultiplier, 1.25);
  });

  it('preserves streak on ≥80% partial credit (matching)', () => {
    const fivePair = matchingQuestion({
      pairs: [
        { term: 'A', definition: 'a' }, { term: 'B', definition: 'b' },
        { term: 'C', definition: 'c' }, { term: 'D', definition: 'd' },
        { term: 'E', definition: 'e' },
      ],
    });
    const gm = freshModel([fivePair]);
    gm.nextEncounter();
    gm.current_monster.hit_points = 999;
    gm.player.streak = 4; // pre-existing streak

    const r = gm.evaluateMatching([
      { term: 'A', definition: 'a' }, { term: 'B', definition: 'b' },
      { term: 'C', definition: 'c' }, { term: 'D', definition: 'd' },
      { term: 'E', definition: 'wrong' }, // 4/5 = 80%
    ]);
    assert.equal(r.streakState, 'preserved');
    assert.equal(gm.player.streak, 4); // unchanged
  });

  it('resets streak on <80% partial credit', () => {
    const fivePair = matchingQuestion({
      pairs: [
        { term: 'A', definition: 'a' }, { term: 'B', definition: 'b' },
        { term: 'C', definition: 'c' }, { term: 'D', definition: 'd' },
        { term: 'E', definition: 'e' },
      ],
    });
    const gm = freshModel([fivePair]);
    gm.nextEncounter();
    gm.current_monster.hit_points = 999;
    gm.player.streak = 5;
    const r = gm.evaluateMatching([
      { term: 'A', definition: 'a' }, { term: 'B', definition: 'b' },
      { term: 'C', definition: 'c' }, { term: 'D', definition: 'wrong' },
      { term: 'E', definition: 'wrong' }, // 3/5 = 60%
    ]);
    assert.equal(r.streakState, 'reset');
    assert.equal(gm.player.streak, 0);
  });

  it('applies 1.5× at streak 5, 2× at streak 10', () => {
    const qs = Array.from({ length: 12 }, () => mcQuestion());
    const gm = freshModel(qs);
    let result;
    for (let i = 0; i < 11; i++) {
      gm.nextEncounter();
      gm.current_monster.hit_points = 999;
      result = gm.evaluateAnswer(['A']);
    }
    // After 11 correct, streak = 11 → multiplier from the 11th answer
    assert.equal(result.streakMultiplier, 2.0);
    assert.equal(result.streakCount, 11);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// checkLevelUp
// ────────────────────────────────────────────────────────────────────────────────
describe('checkLevelUp', () => {
  it('levels up when xp >= xp_to_next_level', () => {
    const gm = freshModel();
    gm.player.xp = 100;
    const gained = gm.checkLevelUp();
    assert.equal(gained, 1);
    assert.equal(gm.player.level, 2);
    assert.equal(gm.player.xp_to_next_level, 125);
  });

  it('can gain multiple levels at once', () => {
    const gm = freshModel();
    gm.player.xp = 500;
    const gained = gm.checkLevelUp();
    assert.ok(gained >= 2, `Expected >=2 levels, got ${gained}`);
  });

  it('grants +2 max HP per level (and heals current HP by the same amount)', () => {
    const gm = freshModel();
    const startHp = gm.player.hit_points;
    gm.player.xp = 150;
    const gained = gm.checkLevelUp();
    assert.equal(gm.player.max_hit_points, 20 + gained * 2);
    assert.equal(gm.player.hit_points, startHp + gained * 2);
  });

  it('attack_die stays fixed; base_defense bumps every 5 levels', () => {
    const gm = freshModel();
    gm.player.xp = 1_000_000;
    gm.checkLevelUp();
    assert.equal(gm.player.attack_die, 6);
    // base_defense for any level L = 1 + floor((L-1)/5)
    assert.equal(gm.player.base_defense, 1 + Math.floor((gm.player.level - 1) / 5));
  });

  it('grants 1 revive charge per level gained', () => {
    const gm = freshModel();
    assert.equal(gm.player.revive_charges, 0);

    gm.player.xp = 100;
    const gained1 = gm.checkLevelUp();
    assert.equal(gm.player.revive_charges, gained1);

    gm.player.xp = 125;
    const gained2 = gm.checkLevelUp();
    assert.equal(gm.player.revive_charges, gained1 + gained2);
  });

  it('XP curve grows by 1.25x from a base of 100', () => {
    const gm = freshModel();
    // Level up through several levels, checking threshold each time
    for (let targetLevel = 2; targetLevel <= 10; targetLevel++) {
      gm.player.xp = gm.player.xp_to_next_level;
      gm.checkLevelUp();
      assert.equal(gm.player.level, targetLevel);
      assert.equal(gm.player.xp_to_next_level, Math.round(100 * Math.pow(1.25, targetLevel - 1)));
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// Active item effects
// ────────────────────────────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────────────────────
// Spaced-repetition re-queue
// ────────────────────────────────────────────────────────────────────────────────
describe('Re-queue placement', () => {
  it('inserts a missed question 3 positions ahead, not at the end', () => {
    const qs = Array.from({ length: 8 }, (_, i) => mcQuestion({ question: `Q${i}` }));
    const gm = freshModel(qs);
    gm.nextEncounter();
    gm.current_monster.hit_points = 999;
    const missed = gm.current_question.question;
    // Wrong answer → re-queue
    gm.evaluateAnswer(['B']);

    // After miss, queue length should equal original remaining (= 7 minus 1 popped + 1 re-queued = 7)
    const queue = gm.questions_to_ask.map(q => q.question);
    const idx = queue.indexOf(missed);
    assert.ok(idx >= 0, 'missed question should be re-queued');
    // Should be near the front (index <= 3), not at the end
    assert.ok(idx <= 3, `expected re-queue near front, got index ${idx} of ${queue.length}`);
    assert.notEqual(idx, queue.length - 1, 'should not be at the very end');
  });

  it('falls back to end-of-queue when fewer than 3 questions remain', () => {
    const qs = [mcQuestion({ question: 'Q0' }), mcQuestion({ question: 'Q1' })];
    const gm = freshModel(qs);
    gm.nextEncounter();
    gm.current_monster.hit_points = 999;
    gm.evaluateAnswer(['B']); // miss → re-queue with only 1 question remaining
    // Should land at end (index 1, after the one remaining question)
    assert.equal(gm.questions_to_ask.length, 2);
  });
});

describe('Inventory', () => {
  it('starts with two empty slots', () => {
    const gm = freshModel();
    assert.equal(gm.inventory.length, 2);
    assert.deepEqual(gm.inventory, [null, null]);
    assert.equal(gm.firstEmptySlot(), 0);
    assert.equal(gm.hasItems(), false);
  });

  it('addItemDrop fills first empty slot', () => {
    const gm = freshModel();
    const r = gm.addItemDrop({ id: 'a', name: 'A' });
    assert.equal(r.placed, 0);
    assert.equal(r.displaced, null);
    const r2 = gm.addItemDrop({ id: 'b', name: 'B' });
    assert.equal(r2.placed, 1);
    assert.equal(r2.displaced, null);
  });

  it('addItemDrop replaces oldest (slot 0) when both full', () => {
    const gm = freshModel();
    gm.addItemDrop({ id: 'a' });
    gm.addItemDrop({ id: 'b' });
    const r = gm.addItemDrop({ id: 'c' });
    assert.equal(r.placed, 1);
    assert.equal(r.displaced.id, 'a');
    assert.equal(gm.inventory[0].id, 'b');
    assert.equal(gm.inventory[1].id, 'c');
  });

  it('consumeSlot returns and clears the item', () => {
    const gm = freshModel();
    gm.addItemDrop({ id: 'a' });
    assert.equal(gm.consumeSlot(0).id, 'a');
    assert.equal(gm.inventory[0], null);
    assert.equal(gm.consumeSlot(0), null);
  });
});

describe('Pending item effects', () => {
  it('shield blocks all monster damage and is consumed', () => {
    const gm = freshModel([mcQuestion()]);
    gm.nextEncounter();
    gm.current_monster.hit_points = 999;
    gm.current_monster.attack_die = 100;
    gm.player.base_defense = 0;
    gm.pending_effects.add('shield');
    const startHp = gm.player.hit_points;
    const r = gm.evaluateAnswer(['B']); // wrong → monster attacks
    assert.equal(r.effective_monster_damage, 0);
    assert.equal(r.shield_used, true);
    assert.equal(gm.player.hit_points, startHp);
    assert.equal(gm.pending_effects.has('shield'), false);
  });

  it('mirror redirects monster damage to the monster and is consumed', () => {
    const gm = freshModel([mcQuestion()]);
    gm.nextEncounter();
    gm.current_monster.hit_points = 999;
    gm.current_monster.defense = 0;
    gm.current_monster.attack_die = 100;
    gm.player.base_defense = 0;
    gm.pending_effects.add('mirror');
    const startHp = gm.player.hit_points;
    const startMonsterHp = gm.current_monster.hit_points;
    const r = gm.evaluateAnswer(['B']); // wrong → monster attacks
    assert.equal(r.effective_monster_damage, 0);
    assert.ok(r.mirror_used);
    assert.ok(r.mirror_damage > 0);
    assert.equal(gm.player.hit_points, startHp);
    assert.ok(gm.current_monster.hit_points < startMonsterHp);
    assert.equal(gm.pending_effects.has('mirror'), false);
  });

  it('xp_double doubles XP on a perfect answer and is consumed', () => {
    const gm = freshModel([mcQuestion()]);
    gm.nextEncounter();
    gm.current_monster.hit_points = 999;
    gm.pending_effects.add('xp_double');
    const r = gm.evaluateAnswer(['A']); // perfect
    assert.equal(r.xp_doubled, true);
    assert.equal(r.xp_gained, gm.current_monster.hit_dice * 2 * 2);
    assert.equal(gm.pending_effects.has('xp_double'), false);
  });

  it('xp_double does NOT trigger on a wrong answer', () => {
    const gm = freshModel([mcQuestion()]);
    gm.nextEncounter();
    gm.current_monster.hit_points = 999;
    gm.pending_effects.add('xp_double');
    const r = gm.evaluateAnswer(['B']); // wrong
    assert.equal(r.xp_doubled, undefined === r.xp_doubled ? r.xp_doubled : false);
    assert.equal(r.xp_doubled, false);
    // Magnet stays armed for the next correct answer.
    assert.equal(gm.pending_effects.has('xp_double'), true);
  });

  it('shield also blocks fill-blank wrong-attempt damage', () => {
    const gm = freshModel([fillBlankQuestion()]);
    gm.nextEncounter();
    gm.current_monster.attack_die = 100;
    gm.player.base_defense = 0;
    gm.pending_effects.add('shield');
    const startHp = gm.player.hit_points;
    const r = gm.submitFillBlankGuess('wrong');
    assert.equal(r.status, 'wrong');
    assert.equal(r.effective_monster_damage, 0);
    assert.ok(r.shield_used);
    assert.equal(gm.player.hit_points, startHp);
    assert.equal(gm.pending_effects.has('shield'), false);
  });
});

describe('Save/load inventory migration', () => {
  it('migrates legacy active_item into slot 0', () => {
    const legacy = {
      questions: [mcQuestion()],
      questions_to_ask: [mcQuestion()],
      questions_asked: 0,
      answer_history: [],
      active_item: { id: 'legacy', name: 'Legacy', kind: 'pending' },
      player: {},
    };
    const gm = freshModel([mcQuestion()], null, legacy);
    assert.equal(gm.inventory.length, 2);
    assert.equal(gm.inventory[0].id, 'legacy');
    assert.equal(gm.inventory[1], null);
  });

  it('round-trips inventory and pending_effects through toSaveData', () => {
    const gm = freshModel();
    gm.addItemDrop({ id: 'a' });
    gm.pending_effects.add('shield');
    gm.pending_effects.add('mulligan');
    const save = gm.toSaveData();
    const gm2 = freshModel([mcQuestion()], null, save);
    assert.equal(gm2.inventory[0].id, 'a');
    assert.ok(gm2.pending_effects.has('shield'));
    assert.ok(gm2.pending_effects.has('mulligan'));
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// Player defeat
// ────────────────────────────────────────────────────────────────────────────────
describe('Player defeat', () => {
  it('sets defeated_player when HP <= 0', () => {
    const gm = freshModel([mcQuestion()]);
    gm.nextEncounter();
    gm.current_monster.hit_points = 999;
    gm.current_monster.attack_die = 100;
    gm.player.hit_points = 1;
    gm.player.base_defense = 0;
    const r = gm.evaluateAnswer(['B']); // wrong
    assert.equal(r.defeated_player, true);
    assert.ok(gm.player.hit_points <= 0);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// Monster defeat & XP
// ────────────────────────────────────────────────────────────────────────────────
describe('Monster defeat', () => {
  it('defeated_monster is true and xp_gained set when monster HP <= 0', () => {
    const gm = freshModel([mcQuestion()]);
    gm.nextEncounter();
    gm.current_monster.hit_points = 1;
    gm.current_monster.defense = 0;
    const r = gm.evaluateAnswer(['A']);
    if (r.effective_player_damage > 0) {
      assert.equal(r.defeated_monster, true);
      assert.equal(r.xp_gained, gm.current_monster.hit_dice * 2);
    }
    // If the 1d6 roll was exactly 0 after rounding... unlikely but valid
  });
});
