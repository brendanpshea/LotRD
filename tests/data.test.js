// tests/data.test.js — Validate all JSON data files (questions, monsters, catalog, index)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');

function loadJSON(relPath) {
  return JSON.parse(readFileSync(join(ROOT, relPath), 'utf-8'));
}

function getMultipleChoiceQuestions(questions) {
  return questions.filter(q => (q.type || 'multiple_choice') === 'multiple_choice');
}

function getAverageAnswerLength(answers) {
  if (answers.length === 0) return 0;
  return answers.reduce((sum, answer) => sum + answer.length, 0) / answers.length;
}

// Hard absolutes: words that almost always signal an absolutist claim regardless of
// surrounding context. Low false-positive rate — used for per-question giveaway detection.
const HARD_ABSOLUTE_PATTERN = /\b(always|never|forever|entirely|exclusively)\b/i;

// Broader cue list: includes context-dependent quantifiers and modals (every, all, only,
// must, cannot, none) that often signal absolutism but also appear in legitimate
// descriptive scope ("every two years", "all components"). Used for set-level rate
// comparisons where false positives wash out across many questions.
const CUE_WORD_PATTERN = /\b(always|never|forever|entirely|exclusively|every|all|none|only|must|cannot|can't)\b/i;

function countAbsoluteOrNegativeAnswers(answers) {
  return answers.filter(answer => CUE_WORD_PATTERN.test(answer));
}

function hasHardAbsolute(answer) {
  return HARD_ABSOLUTE_PATTERN.test(answer);
}

// ────────────────────────────────────────────────────────────────────────────────
// monsters.json
// ────────────────────────────────────────────────────────────────────────────────
describe('monsters.json', () => {
  const monsters = loadJSON('assets/monsters.json');

  it('is a non-empty array', () => {
    assert.ok(Array.isArray(monsters));
    assert.ok(monsters.length > 0);
  });

  it('every monster has required fields with correct types', () => {
    for (const m of monsters) {
      assert.ok(typeof m.monster_name === 'string' && m.monster_name.length > 0,
        `Missing/empty monster_name: ${JSON.stringify(m)}`);
      assert.ok(Number.isInteger(m.hit_dice) && m.hit_dice >= 1,
        `Invalid hit_dice for ${m.monster_name}: ${m.hit_dice}`);
      assert.ok(Number.isInteger(m.attack_die) && m.attack_die >= 1,
        `Invalid attack_die for ${m.monster_name}: ${m.attack_die}`);
      assert.ok(Number.isInteger(m.defense) && m.defense >= 0,
        `Invalid defense for ${m.monster_name}: ${m.defense}`);
      assert.ok(typeof m.image === 'string' && m.image.length > 0,
        `Missing image for ${m.monster_name}`);
    }
  });

  it('no duplicate monster names', () => {
    const names = monsters.map(m => m.monster_name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    assert.deepEqual(dupes, [], `Duplicate monster names: ${dupes.join(', ')}`);
  });

  it('every monster image file exists on disk', () => {
    const imgDir = join(ROOT, 'images', 'monsters');
    for (const m of monsters) {
      const imgPath = join(imgDir, m.image);
      assert.ok(existsSync(imgPath), `Missing image file: images/monsters/${m.image} (${m.monster_name})`);
    }
  });

  it('hit_dice range is 1–10', () => {
    for (const m of monsters) {
      assert.ok(m.hit_dice >= 1 && m.hit_dice <= 10,
        `${m.monster_name} hit_dice out of range (1-10): ${m.hit_dice}`);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// question_sets/index.json
// ────────────────────────────────────────────────────────────────────────────────
describe('question_sets/index.json', () => {
  const index = loadJSON('question_sets/index.json');

  it('is a non-empty array of strings', () => {
    assert.ok(Array.isArray(index) && index.length > 0);
    for (const id of index) {
      assert.ok(typeof id === 'string' && id.endsWith('.json'), `Bad entry: ${id}`);
    }
  });

  it('every listed file exists on disk', () => {
    for (const id of index) {
      const p = join(ROOT, 'question_sets', id);
      assert.ok(existsSync(p), `index.json references missing file: ${id}`);
    }
  });

  it('no duplicates', () => {
    const dupes = index.filter((id, i) => index.indexOf(id) !== i);
    assert.deepEqual(dupes, []);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// question_sets/catalog.json
// ────────────────────────────────────────────────────────────────────────────────
describe('question_sets/catalog.json', () => {
  const catalog = loadJSON('question_sets/catalog.json');
  const index = loadJSON('question_sets/index.json');
  const isReviewSet = set => set.review === true;

  it('is a non-empty array of topic objects', () => {
    assert.ok(Array.isArray(catalog) && catalog.length > 0);
    for (const topic of catalog) {
      assert.ok(typeof topic.topic === 'string' && topic.topic.length > 0);
      assert.ok(Array.isArray(topic.sets));
    }
  });

  it('every catalog set has required fields', () => {
    for (const topic of catalog) {
      for (const s of topic.sets) {
        assert.ok(typeof s.id === 'string', `Set missing id in topic "${topic.topic}"`);
        assert.ok(typeof s.title === 'string', `Set missing title: ${s.id}`);
        assert.ok(typeof s.description === 'string', `Set missing description: ${s.id}`);
        if (isReviewSet(s)) {
          assert.ok(Number.isInteger(s.sample_size) && s.sample_size > 0,
            `Bad sample_size for review set ${s.id}: ${s.sample_size}`);
          assert.ok(Array.isArray(s.sources) && s.sources.length > 0,
            `Review set ${s.id} must declare at least one source set`);
        } else {
          assert.ok(Number.isInteger(s.question_count) && s.question_count > 0,
            `Bad question_count for ${s.id}: ${s.question_count}`);
        }
      }
    }
  });

  it('every catalog set ID has a matching file on disk', () => {
    for (const topic of catalog) {
      for (const s of topic.sets) {
        if (isReviewSet(s)) {
          for (const src of s.sources) {
            const p = join(ROOT, 'question_sets', src);
            assert.ok(existsSync(p), `review set ${s.id} references missing source file: ${src}`);
          }
        } else {
          const p = join(ROOT, 'question_sets', s.id);
          assert.ok(existsSync(p), `catalog references missing file: ${s.id}`);
        }
      }
    }
  });

  it('every catalog set ID appears in index.json', () => {
    for (const topic of catalog) {
      for (const s of topic.sets) {
        if (isReviewSet(s)) {
          for (const src of s.sources) {
            assert.ok(index.includes(src), `review set "${s.id}" source "${src}" not in index.json`);
          }
        } else {
          assert.ok(index.includes(s.id), `catalog set "${s.id}" not in index.json`);
        }
      }
    }
  });

});

// ────────────────────────────────────────────────────────────────────────────────
// Individual question set files
// ────────────────────────────────────────────────────────────────────────────────
describe('Question set file validation', () => {
  const index = loadJSON('question_sets/index.json');

  for (const setId of index) {
    describe(setId, () => {
      const questions = loadJSON(`question_sets/${setId}`);

      it('is a non-empty array', () => {
        assert.ok(Array.isArray(questions) && questions.length > 0);
      });

      it('every question has required fields for its type', () => {
        for (let i = 0; i < questions.length; i++) {
          const q = questions[i];
          const label = `${setId}[${i}]`;

          assert.ok(typeof q.question === 'string' && q.question.length > 0,
            `${label}: missing/empty question text`);

          const type = q.type || 'multiple_choice';

          if (type === 'fill_blank') {
            assert.ok(Array.isArray(q.correct) && q.correct.length > 0,
              `${label}: fill_blank must have non-empty correct array`);
          } else if (type === 'code_trace') {
            assert.ok(Array.isArray(q.correct) && q.correct.length > 0,
              `${label}: code_trace must have non-empty correct array`);
            assert.ok(typeof q.code === 'string' && q.code.length > 0,
              `${label}: code_trace must have non-empty code string`);
          } else if (type === 'code_line') {
            assert.ok(Array.isArray(q.correct) && q.correct.length > 0,
              `${label}: code_line must have non-empty correct array`);
            for (const ans of q.correct) {
              assert.ok(typeof ans === 'string' && ans.length > 0,
                `${label}: code_line correct entries must be non-empty strings`);
            }
          } else if (type === 'matching') {
            assert.ok(Array.isArray(q.pairs) && q.pairs.length >= 2,
              `${label}: matching must have >= 2 pairs`);
            for (const pair of q.pairs) {
              assert.ok(typeof pair.term === 'string', `${label}: pair missing term`);
              assert.ok(typeof pair.definition === 'string', `${label}: pair missing definition`);
            }
          } else {
            // multiple choice (default)
            assert.ok(Array.isArray(q.correct) && q.correct.length > 0,
              `${label}: MC must have non-empty correct array`);
            assert.ok(Array.isArray(q.incorrect),
              `${label}: MC must have an incorrect array`);
          }
        }
      });

      it('no duplicate answer options within a single MC question', () => {
        for (let i = 0; i < questions.length; i++) {
          const q = questions[i];
          if (q.type && q.type !== 'multiple_choice') continue;
          const all = [...(q.correct || []), ...(q.incorrect || [])];
          const dupes = all.filter((a, idx) => all.indexOf(a) !== idx);
          assert.deepEqual(dupes, [],
            `${setId}[${i}]: duplicate answer options: ${dupes.join('; ')}`);
        }
      });

      it('no overlap between correct and incorrect arrays', () => {
        for (let i = 0; i < questions.length; i++) {
          const q = questions[i];
          if (q.type && q.type !== 'multiple_choice') continue;
          const correctSet = new Set(q.correct || []);
          const overlap = (q.incorrect || []).filter(x => correctSet.has(x));
          assert.deepEqual(overlap, [],
            `${setId}[${i}]: option in both correct AND incorrect: ${overlap.join('; ')}`);
        }
      });

    });
  }
});

describe('Question set quality heuristics', () => {
  const index = loadJSON('question_sets/index.json');

  it('flags extreme multi-answer shape uniformity within a set', () => {
    const flaggedSets = [];

    for (const setId of index) {
      const questions = loadJSON(`question_sets/${setId}`);
      const multiAnswerQuestions = getMultipleChoiceQuestions(questions)
        .filter(q => (q.correct || []).length > 1);

      if (multiAnswerQuestions.length < 8) continue;

      const shapeCounts = new Map();
      for (const q of multiAnswerQuestions) {
        const shape = `${(q.correct || []).length}/${(q.incorrect || []).length}`;
        shapeCounts.set(shape, (shapeCounts.get(shape) || 0) + 1);
      }

      const [dominantShape, dominantCount] = [...shapeCounts.entries()]
        .sort((left, right) => right[1] - left[1])[0];
      const dominantRatio = dominantCount / multiAnswerQuestions.length;

      if (dominantRatio === 1) {
        flaggedSets.push(
          `${setId}: ${dominantShape} appears ${dominantCount}/${multiAnswerQuestions.length} times (${Math.round(dominantRatio * 100)}%)`
        );
      }
    }

    assert.deepEqual(
      flaggedSets,
      [],
      `Extreme multi-answer uniformity detected:\n${flaggedSets.join('\n')}`
    );
  });

  it('flags sets where within-question correct/incorrect length ratio is biased on average', () => {
    // For each MC question, compute r = avg(correct length) / avg(incorrect length).
    // If the geometric mean of r across the set is far from 1.0, length predicts the answer.
    const flaggedSets = [];

    for (const setId of index) {
      const questions = loadJSON(`question_sets/${setId}`);
      const mcQuestions = getMultipleChoiceQuestions(questions);
      const logRatios = [];

      for (const q of mcQuestions) {
        const correct = q.correct || [];
        const incorrect = q.incorrect || [];
        if (correct.length === 0 || incorrect.length === 0) continue;
        const avgC = getAverageAnswerLength(correct);
        const avgI = getAverageAnswerLength(incorrect);
        if (avgC <= 0 || avgI <= 0) continue;
        // Skip questions whose answers are intrinsically short (commands, keywords, single tokens),
        // where character-count ratio isn't a meaningful predictive signal.
        if (Math.max(avgC, avgI) < 30) continue;
        logRatios.push(Math.log(avgC / avgI));
      }

      if (logRatios.length < 15) continue;

      const meanLog = logRatios.reduce((s, x) => s + x, 0) / logRatios.length;
      const geoMean = Math.exp(meanLog);

      if (Math.abs(meanLog) >= Math.log(1.50)) {
        const direction = geoMean > 1 ? 'correct longer than incorrect' : 'correct shorter than incorrect';
        flaggedSets.push(
          `${setId}: within-question geo-mean ratio ${geoMean.toFixed(2)}x (${direction}, n=${logRatios.length})`
        );
      }
    }

    assert.deepEqual(
      flaggedSets,
      [],
      `Within-question length bias detected:\n${flaggedSets.join('\n')}`
    );
  });

  it('flags sets where most questions have length predicting the answer in the same direction', () => {
    // Independent check: even if the geo-mean is moderate, a set is biased if the same
    // direction wins on most questions. Count questions where avgC/avgI > 1.25 vs < 0.80.
    const flaggedSets = [];

    for (const setId of index) {
      const questions = loadJSON(`question_sets/${setId}`);
      const mcQuestions = getMultipleChoiceQuestions(questions);
      let longerCorrect = 0;
      let shorterCorrect = 0;
      let total = 0;

      for (const q of mcQuestions) {
        const correct = q.correct || [];
        const incorrect = q.incorrect || [];
        if (correct.length === 0 || incorrect.length === 0) continue;
        const avgC = getAverageAnswerLength(correct);
        const avgI = getAverageAnswerLength(incorrect);
        if (avgC <= 0 || avgI <= 0) continue;
        if (Math.max(avgC, avgI) < 30) continue;
        total++;
        const ratio = avgC / avgI;
        if (ratio >= 1.25) longerCorrect++;
        else if (ratio <= 0.80) shorterCorrect++;
      }

      if (total < 15) continue;

      const dominant = Math.max(longerCorrect, shorterCorrect);
      const dominantRate = dominant / total;
      if (dominantRate >= 0.65 && dominant >= 10) {
        const direction = longerCorrect > shorterCorrect ? 'correct longer' : 'correct shorter';
        flaggedSets.push(
          `${setId}: ${dominant}/${total} questions skewed (${direction}, ${(dominantRate * 100).toFixed(0)}%)`
        );
      }
    }

    assert.deepEqual(
      flaggedSets,
      [],
      `Per-question length-direction bias detected:\n${flaggedSets.join('\n')}`
    );
  });

  it('flags MC questions where one option stands out by length (max/min ratio across all options)', () => {
    // Within-question spread: regardless of which option is correct, if one option is much
    // longer or shorter than the others, the test-taker can rule it in or out by length alone.
    const flagged = [];

    for (const setId of index) {
      const questions = loadJSON(`question_sets/${setId}`);
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (q.type && q.type !== 'multiple_choice') continue;
        const all = [...(q.correct || []), ...(q.incorrect || [])];
        if (all.length < 3) continue;
        const lens = all.map(a => a.length);
        const minLen = Math.min(...lens);
        const maxLen = Math.max(...lens);
        // Skip questions whose options are intrinsically short (commands, keywords, single tokens).
        if (maxLen < 30) continue;
        const ratio = minLen > 0 ? maxLen / minLen : Infinity;
        const gap = maxLen - minLen;
        if (ratio >= 3.0 && gap >= 40) {
          flagged.push(
            `${setId}[${i}]: option lengths span ${minLen}-${maxLen} chars (${ratio.toFixed(2)}x)`
          );
        }
      }
    }

    assert.deepEqual(
      flagged,
      [],
      `Per-question option-length spread detected:\n${flagged.join('\n')}`
    );
  });

  it('flags individual single-answer MC questions where the correct option is much shorter than every distractor', () => {
    const flagged = [];

    for (const setId of index) {
      const questions = loadJSON(`question_sets/${setId}`);
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (q.type && q.type !== 'multiple_choice') continue;
        if (!q.correct || q.correct.length !== 1) continue;
        const incs = q.incorrect || [];
        if (incs.length < 2) continue;

        const correctLen = q.correct[0].length;
        const minIncorrectLen = Math.min(...incs.map(a => a.length));
        const ratio = correctLen > 0 ? minIncorrectLen / correctLen : 0;
        const gap = minIncorrectLen - correctLen;

        if (ratio >= 2.0 && gap >= 20) {
          flagged.push(
            `${setId}[${i}]: correct ${correctLen} chars vs shortest distractor ${minIncorrectLen} chars (${ratio.toFixed(2)}x)`
          );
        }
      }
    }

    assert.deepEqual(
      flagged,
      [],
      `Per-question short-correct bias detected:\n${flagged.join('\n')}`
    );
  });

  it('flags individual MC questions where cue words appear in distractors but not in any correct answer', () => {
    // Per-question giveaway: if 2+ distractors contain absolute/universal cue words and
    // no correct answer does, the test-taker can rule them out by phrasing alone.
    const flagged = [];

    for (const setId of index) {
      const questions = loadJSON(`question_sets/${setId}`);
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (q.type && q.type !== 'multiple_choice') continue;
        const correct = q.correct || [];
        const incorrect = q.incorrect || [];
        if (correct.length === 0 || incorrect.length < 2) continue;

        const cueInCorrect = correct.filter(hasHardAbsolute).length;
        const cueInIncorrect = incorrect.filter(hasHardAbsolute).length;

        if (cueInCorrect === 0 && cueInIncorrect >= 2) {
          flagged.push(
            `${setId}[${i}]: ${cueInIncorrect}/${incorrect.length} distractors use hard absolutes, 0/${correct.length} correct`
          );
        }
      }
    }

    assert.deepEqual(
      flagged,
      [],
      `Per-question cue-word giveaway detected:\n${flagged.join('\n')}`
    );
  });

  it('flags sets where wrong answers overuse absolute quantifiers or negations', () => {
    const flaggedSets = [];

    for (const setId of index) {
      const questions = loadJSON(`question_sets/${setId}`);
      const mcQuestions = getMultipleChoiceQuestions(questions);
      const correctAnswers = mcQuestions.flatMap(q => q.correct || []);
      const incorrectAnswers = mcQuestions.flatMap(q => q.incorrect || []);

      if (correctAnswers.length < 20 || incorrectAnswers.length < 40) continue;

      const flaggedCorrectAnswers = countAbsoluteOrNegativeAnswers(correctAnswers);
      const flaggedIncorrectAnswers = countAbsoluteOrNegativeAnswers(incorrectAnswers);
      const correctRate = flaggedCorrectAnswers.length / correctAnswers.length;
      const incorrectRate = flaggedIncorrectAnswers.length / incorrectAnswers.length;
      const rateGap = incorrectRate - correctRate;

      if (flaggedIncorrectAnswers.length >= 8 && incorrectRate >= 0.15 && rateGap >= 0.12) {
        flaggedSets.push(
          `${setId}: incorrect ${flaggedIncorrectAnswers.length}/${incorrectAnswers.length} (${(incorrectRate * 100).toFixed(1)}%) vs correct ${flaggedCorrectAnswers.length}/${correctAnswers.length} (${(correctRate * 100).toFixed(1)}%)`
        );
      }
    }

    assert.deepEqual(
      flaggedSets,
      [],
      `Absolute/negative cue-word bias detected:\n${flaggedSets.join('\n')}`
    );
  });
});
