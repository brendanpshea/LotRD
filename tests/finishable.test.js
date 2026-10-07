// tests/finishable.test.js — every shipped set can actually be finished.
//
// Answer-key validation proves each question is individually gradeable; this
// proves the run as a whole terminates. A set that never reaches a terminal
// screen — because a question requeues forever, or the boss queue never drains —
// would be unclearable, and a student could never earn credit for it.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameModel } from '../src/model.js';

const url = p => new URL(p, import.meta.url);
const readJSON = p => JSON.parse(readFileSync(url(p), 'utf-8'));

const MONSTERS = readJSON('../assets/monsters.json');
const SET_FILES = readJSON('../question_sets/index.json');

/** Answer the question on screen, correctly or deliberately wrongly. */
function answer(gm, correct) {
  const q = gm.current_question;
  switch (q.type || 'multiple_choice') {
    case 'fill_blank':
    case 'code_trace': {
      const cloze = gm.getFillBlankCloze();
      const good = cloze ? cloze.words[cloze.blankIndex] : q.correct[0];
      return gm.submitFillBlankGuess(correct ? good : ' nope');
    }
    case 'code_line':
      return gm.submitCodeLineGuess(correct ? q.correct[0] : 'nope()', { confirmed: true });
    case 'dynamic_numeric': {
      const meta = gm.getDynamicNumericMeta();
      return gm.submitDynamicNumericGuess(String(correct ? meta.expected : meta.expected + 7777));
    }
    case 'cloze': {
      const good = q.blanks.map(b => b.accept[0]);
      return gm.evaluateCloze(correct ? good : good.map(() => 'nope'));
    }
    case 'ordering':
      return gm.evaluateOrdering(correct ? q.items : [...q.items].reverse());
    case 'code_write':
      // The reference solution passes every test; a body that returns a value no
      // problem asks for fails every one of them.
      return gm.evaluateCodeWrite(correct ? q.solution : 'return "not the answer"');
    case 'sql_write': {
      // A query is graded in SQLite before the model sees it (and that the
      // reference query really passes is proved in sql-problems.test.js). What
      // matters here is what the run does with a pass and with a fail.
      const row = { call: 'The rows shown', passed: correct, detail: correct ? '1 row, as expected' : 'not the rows expected' };
      return gm.evaluateSqlWrite(correct ? q.solution : 'SELECT 0', { ok: true, error: null, results: [row], passed: correct ? 1 : 0, total: 1 });
    }
    case 'matching': {
      const pairs = q.pairs.map(p => ({ term: p.term, definition: p.definition }));
      if (correct) return gm.evaluateMatching(pairs);
      return gm.evaluateMatching(
        pairs.map((p, i) => ({ term: p.term, definition: pairs[(i + 1) % pairs.length].definition })));
    }
    default: {
      const wrong = (q.incorrect || []).slice(0, 1);
      return gm.evaluateAnswer(correct ? q.correct : (wrong.length ? wrong : ['nope']));
    }
  }
}

/**
 * Play a set start to finish.
 * @param style 'perfect' — every answer right.
 *              'miss-once' — every question missed once, then answered right, which
 *              is what actually drives the retrieval boss.
 */
function playSet(questions, style, { invincible = false } = {}) {
  const gm = new GameModel(questions, MONSTERS, null,
    { level: 5, xp: 0, revive_charges: 0 }, { sequential: true });
  const missed = new Set();
  let status = gm.nextEncounter();
  let sawBoss = false;

  // Generous but finite: a 50-question set that misses everything once should
  // settle in a few hundred turns. Anything near this ceiling is a runaway loop.
  const MAX_TURNS = 20000;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (status === 'boss_start') sawBoss = true;
    if (status === 'victory' || status === 'no_questions') {
      return { outcome: status, turns: turn, sawBoss: sawBoss || gm.boss_done };
    }
    assert.ok(gm.current_question, `run stalled with no question after ${turn} turns`);

    if (gm.current_question.type === 'npc_demo') {
      status = gm.nextEncounter();
      continue;
    }

    const key = gm.current_question.question;
    const beCorrect = style === 'perfect' || missed.has(key);
    if (!beCorrect) missed.add(key);
    answer(gm, beCorrect);

    // Combat survival is a separate concern; this test is about termination, so
    // the player is kept alive to prove the QUEUE drains rather than the HP bar.
    if (invincible) gm.player.hit_points = gm.player.max_hit_points;
    if (gm.player.hit_points <= 0) return { outcome: 'player_died', turns: turn, sawBoss };

    status = gm.nextEncounter();
  }
  return { outcome: 'INFINITE_LOOP', turns: MAX_TURNS, sawBoss };
}

describe('Every question set is finishable', () => {
  for (const file of SET_FILES) {
    const questions = readJSON(`../question_sets/${file}`);

    it(`${file} — a clean run reaches the end`, () => {
      // Two terminal states count as finishing, and both record completion:
      // 'victory' (the last monster fell) and 'no_questions' (the queue drained
      // while a monster was still standing).
      const r = playSet(questions, 'perfect');
      assert.ok(r.outcome === 'victory' || r.outcome === 'no_questions',
        `ended as ${r.outcome} after ${r.turns} turns`);
    });

    it(`${file} — a run that misses everything once still ends`, () => {
      // Missed questions requeue until answered, and feed the retrieval boss.
      // If either could loop forever, this is where it would show up.
      const r = playSet(questions, 'miss-once', { invincible: true });
      assert.ok(r.outcome === 'victory' || r.outcome === 'no_questions',
        `ended as ${r.outcome} after ${r.turns} turns`);
      assert.ok(r.sawBoss, 'a run with misses should face the retrieval boss');
    });
  }
});
