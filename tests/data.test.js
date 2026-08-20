// tests/data.test.js — Validate all JSON data files (questions, monsters, catalog, index)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pickClozeBlank, evaluateDynamicExpression, tokenize } from '../src/model.js';
import { runTestCases, parseSignature, fromJson, pyRepr } from '../src/pytiny.js';

const ROOT = join(import.meta.dirname, '..');
const MAX_TYPED_ANSWER_CHARS = 12;
// code_line asks the student to PRODUCE a line of code, where a complete short
// statement is the point of the exercise — a SQL SELECT cannot reach its FROM
// clause inside 12 tokenized characters. The other typed types stay at 12:
// they ask for a term or an output, where brevity is a fair expectation.
const MAX_TYPED_CODE_LINE_CHARS = 20;

function maxTypedCharsFor(type) {
  return type === 'code_line' ? MAX_TYPED_CODE_LINE_CHARS : MAX_TYPED_ANSWER_CHARS;
}

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

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeCodeTraceAnswer(answer) {
  return String(answer ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.replace(/[\t ]+$/g, ''))
    .join('\n')
    .replace(/^(?:\n)+|(?:\n)+$/g, '');
}

function enumerateDynamicValues(spec, label) {
  if (Array.isArray(spec.values)) return spec.values.slice();

  const min = Number(spec.min);
  const max = Number(spec.max);
  const step = 'step' in spec ? Number(spec.step) : 1;
  const values = [];

  for (let value = min; value <= max + 1e-12; value += step) {
    values.push(Number.isInteger(min) && Number.isInteger(step)
      ? Math.round(value)
      : Number(value.toFixed(12)));
    assert.ok(values.length <= 10000,
      `${label}: variable range expands to more than 10,000 values`);
  }

  return values;
}

function expandDynamicAssignments(variables, label) {
  const entries = Object.entries(variables || {})
    .map(([name, spec]) => [name, enumerateDynamicValues(spec, `${label}.${name}`)]);

  const assignments = [];

  function walk(index, current) {
    if (index === entries.length) {
      assignments.push({ ...current });
      assert.ok(assignments.length <= 100000,
        `${label}: dynamic_numeric expands to more than 100,000 combinations`);
      return;
    }

    const [name, values] = entries[index];
    for (const value of values) {
      current[name] = value;
      walk(index + 1, current);
    }
  }

  walk(0, {});
  return assignments;
}

function trimNumericString(text) {
  return text
    .replace(/\.0+(?=e|$)/i, '')
    .replace(/(\.\d*?[1-9])0+(?=e|$)/i, '$1')
    .replace(/\.e/i, 'e')
    .replace(/e\+/i, 'e');
}

function shortestAcceptedNumericText(expected, toleranceAbs) {
  const candidates = new Set([String(expected)]);

  if (Number.isInteger(expected)) {
    candidates.add(String(Math.trunc(expected)));
  }

  for (let decimals = 0; decimals <= 8; decimals++) {
    candidates.add(Number(expected).toFixed(decimals).replace(/\.0+$|(?<=\.\d*?)0+$/g, '').replace(/\.$/, ''));
  }

  if (expected !== 0) {
    for (let decimals = 0; decimals <= 6; decimals++) {
      candidates.add(trimNumericString(Number(expected).toExponential(decimals)));
    }
  }

  let best = null;

  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed = Number(candidate);
    if (!Number.isFinite(parsed)) continue;
    if (Math.abs(parsed - expected) > toleranceAbs + 1e-12) continue;

    if (!best || candidate.length < best.length || (candidate.length === best.length && candidate < best.text)) {
      best = { text: candidate, length: candidate.length };
    }
  }

  return best || { text: String(expected), length: String(expected).length };
}

function getTypedAnswerRequirement(q, label) {
  if (q.type === 'fill_blank') {
    const canonical = q.correct?.[0] || '';
    const cloze = pickClozeBlank(canonical, () => 0);

    if (cloze) {
      const blank = cloze.words[cloze.blankIndex];
      return {
        requiredChars: blank.length,
        detail: `auto-cloze requires only "${blank}" from "${canonical}"`,
      };
    }

    const shortest = (q.correct || []).reduce((best, answer) => {
      const candidate = String(answer ?? '').trim();
      return !best || candidate.length < best.text.length ? { text: candidate } : best;
    }, null);

    return {
      requiredChars: shortest?.text.length || 0,
      detail: `shortest accepted answer is "${shortest?.text || ''}"`,
    };
  }

  if (q.type === 'code_line') {
    const shortest = (q.correct || []).reduce((best, answer) => {
      const tokenText = tokenize(String(answer ?? ''), q.language).join('');
      return !best || tokenText.length < best.text.length
        ? { text: tokenText, raw: String(answer ?? '') }
        : best;
    }, null);

    return {
      requiredChars: shortest?.text.length || 0,
      detail: `shortest tokenized answer is "${shortest?.text || ''}" from "${shortest?.raw || ''}"`,
    };
  }

  if (q.type === 'code_trace') {
    const shortest = (q.correct || []).reduce((best, answer) => {
      const normalized = normalizeCodeTraceAnswer(answer);
      return !best || normalized.length < best.text.length ? { text: normalized } : best;
    }, null);

    return {
      requiredChars: shortest?.text.length || 0,
      detail: `normalized output is "${shortest?.text || ''}"`,
    };
  }

  if (q.type === 'cloze') {
    // The student types every blank, so the binding constraint is the blank
    // with the longest shortest-accepted answer.
    let worst = { requiredChars: 0, detail: '' };
    for (const [i, b] of (q.blanks || []).entries()) {
      const shortest = (b.accept || []).reduce((best, a) => {
        const t = String(a ?? '').trim();
        return !best || t.length < best.length ? t : best;
      }, null) ?? '';
      if (shortest.length > worst.requiredChars) {
        worst = { requiredChars: shortest.length, detail: `blank ${i + 1} shortest accepted is "${shortest}"` };
      }
    }
    return worst;
  }

  if (q.type === 'dynamic_numeric') {
    const assignments = expandDynamicAssignments(q.variables, label);
    let worst = { length: 0, text: '', expected: null, vars: null };

    for (const vars of assignments) {
      const derived = {};
      for (const [name, expr] of Object.entries(q.derived || {})) {
        derived[name] = evaluateDynamicExpression(expr, { ...vars, ...derived });
      }

      const expected = evaluateDynamicExpression(q.answer.expr, { ...vars, ...derived });
      const shortest = shortestAcceptedNumericText(expected, Number(q.answer?.tolerance_abs ?? 0));
      if (shortest.length > worst.length) {
        worst = { length: shortest.length, text: shortest.text, expected, vars };
      }
    }

    return {
      requiredChars: worst.length,
      detail: `worst-case numeric input is "${worst.text}" for ${JSON.stringify(worst.vars)}`,
    };
  }

  return null;
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
// assets/npcs.json — the mentors who teach npc_demo scenes
// ────────────────────────────────────────────────────────────────────────────────
describe('assets/npcs.json', () => {
  const npcs = loadJSON('assets/npcs.json');

  it('is a non-empty array with the required fields', () => {
    assert.ok(Array.isArray(npcs) && npcs.length > 0);
    for (const n of npcs) {
      assert.ok(typeof n.id === 'string' && /^[a-z0-9_-]+$/.test(n.id),
        `bad npc id: ${n.id}`);
      assert.ok(typeof n.name === 'string' && n.name.length > 0, `${n.id}: missing name`);
      assert.ok(typeof n.portrait === 'string' && n.portrait.length > 0, `${n.id}: missing portrait`);
      assert.ok(n.pronouns && n.pronouns.subject && n.pronouns.object,
        `${n.id}: missing pronouns`);
    }
  });

  it('no duplicate ids', () => {
    const ids = npcs.map(n => n.id);
    assert.deepEqual(ids.filter((x, i) => ids.indexOf(x) !== i), []);
  });

  it('every portrait file exists on disk', () => {
    for (const n of npcs) {
      assert.ok(existsSync(join(ROOT, n.portrait)),
        `missing portrait file for ${n.id}: ${n.portrait}`);
    }
  });

  it('every npc_demo names a mentor in the roster', () => {
    const ids = new Set(npcs.map(n => n.id));
    const index = loadJSON('question_sets/index.json');
    const bad = [];
    for (const setId of index) {
      for (const q of loadJSON(`question_sets/${setId}`)) {
        if (q.type !== 'npc_demo') continue;
        if (!ids.has(String(q.npc || '').toLowerCase())) {
          bad.push(`${setId}: scene "${q.question}" names unknown mentor ${JSON.stringify(q.npc)}`);
        }
      }
    }
    assert.deepEqual(bad, [], `unresolvable mentors:\n${bad.join('\n')}`);
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
        if (s.intro != null) {
          assert.ok(typeof s.intro === 'object' && !Array.isArray(s.intro),
            `intro must be an object: ${s.id}`);
          if (s.intro.story != null) {
            assert.ok(typeof s.intro.story === 'string' && s.intro.story.length > 0,
              `intro.story must be a non-empty string: ${s.id}`);
          }
          if (s.intro.objectives != null) {
            assert.ok(Array.isArray(s.intro.objectives) && s.intro.objectives.length > 0
              && s.intro.objectives.every(o => typeof o === 'string' && o.length > 0),
              `intro.objectives must be a non-empty array of strings: ${s.id}`);
          }
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

  it('question_count matches the number of questions on disk', () => {
    // The main menu advertises this number, so a stale count is visible to
    // students the moment a set gains or loses a question. NPC teaching
    // scenes are interludes, not questions — they don't count.
    const mismatches = [];
    for (const topic of catalog) {
      for (const s of topic.sets) {
        if (isReviewSet(s)) continue;
        const p = join(ROOT, 'question_sets', s.id);
        if (!existsSync(p)) continue;
        const actual = loadJSON(`question_sets/${s.id}`)
          .filter(q => q.type !== 'npc_demo').length;
        if (actual !== s.question_count) {
          mismatches.push(`${s.id}: catalog says ${s.question_count}, file has ${actual}`);
        }
      }
    }
    assert.deepEqual(mismatches, [], `stale question_count:\n${mismatches.join('\n')}`);
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
          } else if (type === 'dynamic_numeric') {
            assert.ok(q.variables && typeof q.variables === 'object' && !Array.isArray(q.variables),
              `${label}: dynamic_numeric must have a variables object`);
            assert.ok(Object.keys(q.variables || {}).length > 0,
              `${label}: dynamic_numeric must define at least one variable`);

            for (const [name, spec] of Object.entries(q.variables || {})) {
              assert.ok(spec && typeof spec === 'object' && !Array.isArray(spec),
                `${label}: variable ${name} must be an object`);
              if (Array.isArray(spec.values)) {
                assert.ok(spec.values.length > 0,
                  `${label}: variable ${name}.values must be non-empty`);
                for (const value of spec.values) {
                  assert.ok(isFiniteNumber(value),
                    `${label}: variable ${name}.values entries must be finite numbers`);
                }
              } else {
                assert.ok(isFiniteNumber(spec.min) && isFiniteNumber(spec.max),
                  `${label}: variable ${name} must define numeric min/max or values[]`);
                if ('step' in spec) {
                  assert.ok(isFiniteNumber(spec.step) && spec.step > 0,
                    `${label}: variable ${name}.step must be a positive number`);
                }
              }
            }

            if ('derived' in q) {
              assert.ok(q.derived && typeof q.derived === 'object' && !Array.isArray(q.derived),
                `${label}: derived must be an object when present`);
              for (const [name, expr] of Object.entries(q.derived || {})) {
                assert.ok(typeof expr === 'string' && expr.length > 0,
                  `${label}: derived expression ${name} must be a non-empty string`);
              }
            }

            assert.ok(q.answer && typeof q.answer === 'object' && !Array.isArray(q.answer),
              `${label}: dynamic_numeric must have an answer object`);
            assert.ok(typeof q.answer?.expr === 'string' && q.answer.expr.length > 0,
              `${label}: dynamic_numeric answer.expr must be a non-empty string`);
            if ('tolerance_abs' in (q.answer || {})) {
              assert.ok(isFiniteNumber(q.answer.tolerance_abs) && q.answer.tolerance_abs >= 0,
                `${label}: dynamic_numeric answer.tolerance_abs must be a non-negative number`);
            }
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
          } else if (type === 'ordering') {
            assert.ok(Array.isArray(q.items) && q.items.length >= 3,
              `${label}: ordering must have >= 3 items`);
            for (const item of q.items) {
              assert.ok(typeof item === 'string' && item.length > 0,
                `${label}: ordering items must be non-empty strings`);
            }
            const dupeItems = q.items.filter((it, idx) => q.items.indexOf(it) !== idx);
            assert.deepEqual(dupeItems, [],
              `${label}: ordering items must be unique (bank buttons are keyed by text)`);
          } else if (type === 'cloze') {
            assert.ok(Array.isArray(q.blanks) && q.blanks.length >= 2,
              `${label}: cloze must have >= 2 blanks (use fill_blank for one)`);
            assert.ok(q.blanks.length <= 4,
              `${label}: cloze should have at most 4 blanks`);
            for (const [bi, b] of q.blanks.entries()) {
              assert.ok(b && typeof b === 'object' && !Array.isArray(b),
                `${label}: blank ${bi + 1} must be an object`);
              assert.ok(Array.isArray(b.accept) && b.accept.length > 0,
                `${label}: blank ${bi + 1} needs a non-empty accept array`);
              for (const a of b.accept) {
                assert.ok(typeof a === 'string' && a.length > 0,
                  `${label}: blank ${bi + 1} accept entries must be non-empty strings`);
              }
            }
            // Every blank needs a placeholder, and every placeholder a blank —
            // otherwise a blank is ungradeable or an input renders with no spec.
            const refs = [...q.question.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map(m => Number(m[1]));
            assert.ok(refs.length > 0, `${label}: cloze question needs {{1}}-style placeholders`);
            for (const r of refs) {
              assert.ok(r >= 1 && r <= q.blanks.length,
                `${label}: placeholder {{${r}}} has no matching entry in blanks[]`);
            }
            for (let bi = 1; bi <= q.blanks.length; bi++) {
              assert.ok(refs.includes(bi),
                `${label}: blanks[${bi - 1}] has no {{${bi}}} placeholder in the question`);
            }
          } else if (type === 'code_write') {
            assert.ok(typeof q.signature === 'string' && /^def\s+\w+\s*\(.*\)\s*:$/.test(q.signature.trim()),
              `${label}: code_write needs a signature line like "def add(a, b):"`);
            assert.ok(Array.isArray(q.tests) && q.tests.length >= 3,
              `${label}: code_write needs at least 3 test cases`);
            for (const [ti, t] of q.tests.entries()) {
              assert.ok(t && typeof t === 'object' && !Array.isArray(t),
                `${label}: test ${ti + 1} must be an object`);
              assert.ok(Array.isArray(t.args),
                `${label}: test ${ti + 1} needs an args array (use [] for none)`);
              assert.ok('expect' in t,
                `${label}: test ${ti + 1} needs an expect value`);
            }
            const { params } = parseSignature(q.signature);
            for (const [ti, t] of q.tests.entries()) {
              assert.equal(t.args.length, params.length,
                `${label}: test ${ti + 1} passes ${t.args.length} arguments but ` +
                `${q.signature.trim()} takes ${params.length}`);
            }
            assert.ok(typeof q.solution === 'string' && q.solution.trim().length > 0,
              `${label}: code_write needs a reference solution — it is what the student ` +
              `is shown afterwards, and what proves the test table is satisfiable`);
            assert.ok(/\breturn\b/.test(q.solution),
              `${label}: the reference solution never returns anything`);
            if ('hint' in q) {
              assert.ok(typeof q.hint === 'string' && q.hint.trim().length > 0,
                `${label}: hint must be a non-empty string when present`);
              // A hint is a nudge the student opens when stuck. Past a couple of
              // sentences it stops being a nudge and becomes the answer.
              assert.ok(q.hint.length <= 240,
                `${label}: hint is ${q.hint.length} chars — keep it under 240`);
              assert.ok(!q.hint.includes('\n'),
                `${label}: hint should be a single line`);
            }
            if ('starter' in q) {
              assert.ok(typeof q.starter === 'string',
                `${label}: starter must be a string when present`);
            }
          } else if (type === 'npc_demo') {
            // `question` doubles as the scene title and its identity key.
            assert.ok(Array.isArray(q.steps) && q.steps.length > 0,
              `${label}: npc_demo must have a non-empty steps array`);
            for (const step of q.steps) {
              assert.ok(typeof step.say === 'string' && step.say.length > 0,
                `${label}: every npc_demo step needs non-empty say text`);
              if ('beats' in step) {
                // Beats are the authored breakdown the scene is revealed by —
                // one spoken line or one code listing at a time.
                assert.ok(Array.isArray(step.beats) && step.beats.length > 0,
                  `${label}: beats must be a non-empty array when present`);
                for (const [bi, b] of step.beats.entries()) {
                  const hasSay = typeof b.say === 'string' && b.say.length > 0;
                  const hasCode = typeof b.code === 'string' && b.code.length > 0;
                  assert.ok(hasSay !== hasCode,
                    `${label}: beat ${bi + 1} must carry exactly one of say or code`);
                  if (hasSay) {
                    assert.ok(b.say.length <= 320,
                      `${label}: beat ${bi + 1} is ${b.say.length} chars — split it so the ` +
                      `student is not handed a wall of text in one reveal`);
                  }
                }
              }
              if (step.check) {
                assert.ok(typeof step.check.prompt === 'string' && step.check.prompt.length > 0,
                  `${label}: npc_demo check needs a prompt`);
                assert.ok(typeof step.check.answer === 'string' && step.check.answer.length > 0,
                  `${label}: npc_demo check needs an answer`);
                assert.ok(Array.isArray(step.check.wrong) && step.check.wrong.length >= 1,
                  `${label}: npc_demo check needs at least one wrong option`);
                assert.ok(!step.check.wrong.includes(step.check.answer),
                  `${label}: npc_demo check answer must not appear in wrong[]`);
              }
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

      it('no duplicate question text within the set', () => {
        // Question text is the key for answer history, the session review, the
        // progress bar and the retrieval-boss queue — duplicates collide there.
        const seen = new Map();
        const dupes = [];
        questions.forEach((q, i) => {
          const text = q.question;
          if (seen.has(text)) dupes.push(`${setId}[${seen.get(text)}] and [${i}]: "${text}"`);
          else seen.set(text, i);
        });
        assert.deepEqual(dupes, [], `duplicate question text:\n${dupes.join('\n')}`);
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

      it(`keeps required typed answers at ${MAX_TYPED_ANSWER_CHARS} chars (${MAX_TYPED_CODE_LINE_CHARS} for code_line) or fewer`, () => {
        const flagged = [];

        for (let i = 0; i < questions.length; i++) {
          const q = questions[i];
          if (!['fill_blank', 'dynamic_numeric', 'code_trace', 'code_line', 'cloze'].includes(q.type)) continue;

          const label = `${setId}[${i}]`;
          const requirement = getTypedAnswerRequirement(q, label);
          if (!requirement) continue;
          const limit = maxTypedCharsFor(q.type);
          if (requirement.requiredChars <= limit) continue;

          flagged.push(
            `${label}: ${q.type} requires ${requirement.requiredChars} typed chars (limit ${limit}). ${requirement.detail}`
          );
        }

        assert.deepEqual(
          flagged,
          [],
          `Typed-answer prompts exceed their limit:\n${flagged.join('\n')}`
        );
      });

    });
  }
});

describe('Numeric answers cannot be lifted straight from the stem', () => {
  // A dynamic_numeric question may accept arithmetic in the answer box, so the
  // student can type 7 * 7 * 7 rather than doing the multiplication by hand.
  // That is only safe while the stem does not already contain an expression
  // worth the answer -- otherwise it can be pasted back and the grader does the
  // work. This checks the real thing rather than guessing from wording: it
  // renders each stem with its own variables and evaluates every arithmetic
  // run inside it.
  const index = loadJSON('question_sets/index.json');
  const ARITH = /[-+*/%(). \d]*\d[-+*/%(). \d]*/g;

  it('no stem contains arithmetic equal to its own answer', () => {
    const flagged = [];

    for (const setId of index) {
      const questions = loadJSON(`question_sets/${setId}`);
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (q.type !== 'dynamic_numeric') continue;
        if (q.allow_expression === false) continue;   // author opted out

        const stemTemplate = q.question_template || q.question;
        for (const vars of expandDynamicAssignments(q.variables, `${setId}[${i}]`).slice(0, 60)) {
          const derived = {};
          for (const [name, expr] of Object.entries(q.derived || {})) {
            derived[name] = evaluateDynamicExpression(expr, { ...vars, ...derived });
          }
          const scope = { ...vars, ...derived };
          const expected = evaluateDynamicExpression(q.answer.expr, scope);
          const tol = Number(q.answer.tolerance_abs ?? 0);

          const rendered = stemTemplate.replace(
            /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g,
            (m, key) => (key in scope ? String(scope[key]) : m));

          for (const run of rendered.match(ARITH) || []) {
            // Trim sentence punctuation the scan swept up ("... w2 = -1.").
            const text = run.trim().replace(/[.\s]+$/, '');
            // Only a genuine binary operation counts as "the arithmetic is on
            // screen". A bare number, or a negative one, is not something the
            // student can paste to avoid the work.
            if (!/\d\s*[-+*/%]+\s*\(*\s*-?\s*\d/.test(text)) continue;
            let value;
            try { value = evaluateDynamicExpression(text.replace(/\s+/g, ''), {}); }
            catch (_) { continue; }
            if (Number.isFinite(value) && Math.abs(value - expected) <= tol) {
              flagged.push(`${setId}[${i}]: stem contains "${text.trim()}" which equals the answer ` +
                `(${expected}). Set "allow_expression": false, or reword the stem.`);
              break;
            }
          }
          if (flagged.length && flagged[flagged.length - 1].startsWith(`${setId}[${i}]`)) break;
        }
      }
    }

    assert.deepEqual(flagged, [],
      `Answer can be lifted from the stem:\n${flagged.join('\n')}`);
  });
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

  it('flags sets where the correct option is the longest (or shortest) far more often than chance', () => {
    // The ratio tests above ask "how much longer", which stays quiet when the correct answer wins
    // by only a few characters. But a test-taker doesn't measure ratios — they pick the option that
    // looks longest. With four options that should be right 25% of the time. A set well above that
    // is answerable by rank alone, and one well below it has simply been over-corrected.
    const MIN_QUESTIONS = 15;
    const MAX_RATE = 0.45;
    const flaggedSets = [];

    for (const setId of index) {
      const questions = loadJSON(`question_sets/${setId}`);
      let total = 0;
      let longest = 0;
      let shortest = 0;

      for (const q of questions) {
        if (q.type && q.type !== 'multiple_choice') continue;
        const correct = q.correct || [];
        const incorrect = q.incorrect || [];
        // Only single-answer questions have one unambiguous "the correct option" to rank.
        if (correct.length !== 1 || incorrect.length < 2) continue;
        const correctLen = correct[0].length;
        const incorrectLens = incorrect.map(a => a.length);
        total++;
        // Strictly longest: a tie gives the rank-guesser no signal to act on.
        if (correctLen > Math.max(...incorrectLens)) longest++;
        if (correctLen < Math.min(...incorrectLens)) shortest++;
      }

      if (total < MIN_QUESTIONS) continue;
      const longestRate = longest / total;
      const shortestRate = shortest / total;
      if (longestRate > MAX_RATE) {
        flaggedSets.push(
          `${setId}: correct answer is the longest option ${longest}/${total} ` +
          `(${(longestRate * 100).toFixed(0)}%, chance is ~25%)`
        );
      } else if (shortestRate > MAX_RATE) {
        flaggedSets.push(
          `${setId}: correct answer is the shortest option ${shortest}/${total} ` +
          `(${(shortestRate * 100).toFixed(0)}%, chance is ~25%) — over-corrected`
        );
      }
    }

    assert.deepEqual(
      flaggedSets,
      [],
      `Option-length rank bias detected — a student could score above chance by picking on ` +
      `length alone:\n${flaggedSets.join('\n')}`
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

// ────────────────────────────────────────────────────────────────────────────────
// Write-the-code problems, run for real
// ────────────────────────────────────────────────────────────────────────────────
//
// A code_write question is only as good as its test table, and a test table is
// easy to get quietly wrong: one expected value mistyped and the problem becomes
// unsolvable, with the student — who cannot see the key — left to conclude they
// cannot program. So every problem's own reference solution is run through the
// same interpreter and the same grader the student's answer meets, and every
// case has to pass.
describe('code_write problems are solvable', () => {
  const index = loadJSON('question_sets/index.json');

  for (const setId of index) {
    const questions = loadJSON(`question_sets/${setId}`);
    const problems = questions
      .map((q, i) => ({ q, i }))
      .filter(({ q }) => q.type === 'code_write');
    if (problems.length === 0) continue;

    describe(setId, () => {
      for (const { q, i } of problems) {
        const { name } = parseSignature(q.signature);

        it(`${name}() — the reference solution passes every test`, () => {
          const outcome = runTestCases({ signature: q.signature, body: q.solution, tests: q.tests });
          assert.ok(outcome.ok,
            `${setId}[${i}] ${name}(): the reference solution does not run — ` +
            `${outcome.error?.message} (line ${outcome.error?.line})`);
          const failures = outcome.results
            .filter(r => !r.passed)
            .map(r => r.error
              ? `${r.call} stopped: ${r.error.message}`
              : `${r.call} gave ${r.actualRepr}, the key says ${r.expectedRepr}`);
          assert.deepEqual(failures, [],
            `${setId}[${i}] ${name}() reference solution fails its own tests:\n  ` +
            failures.join('\n  '));
        });

        it(`${name}() — the tests can tell a right answer from a wrong one`, () => {
          // A table every body passes grades nothing. Returning a constant is the
          // laziest possible answer, so at least one case must reject each of the
          // constants a student could stumble into.
          for (const lazy of ['return None', 'return True', 'return False', 'return 0', 'return ""']) {
            const outcome = runTestCases({ signature: q.signature, body: lazy, tests: q.tests });
            assert.ok(!outcome.ok || outcome.passed < outcome.total,
              `${setId}[${i}] ${name}(): "${lazy}" passes every test — the table needs a ` +
              `case that rules it out`);
          }
        });

        it(`${name}() — examples and starter are consistent with the problem`, () => {
          // The examples shown above the box are generated from the first tests
          // unless authored, so an authored set has to be checked by hand-eye;
          // what can be checked here is that a starter body is a legal shape.
          if (typeof q.starter === 'string' && q.starter.trim()) {
            const outcome = runTestCases({ signature: q.signature, body: q.starter, tests: q.tests });
            assert.ok(outcome.passed < outcome.total,
              `${setId}[${i}] ${name}(): the starter code already passes every test`);
          }
        });
      }
    });
  }
});
