// tests/data.test.js — Validate all JSON data files (questions, monsters, catalog, index)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');

function loadJSON(relPath) {
  return JSON.parse(readFileSync(join(ROOT, relPath), 'utf-8'));
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
        assert.ok(Number.isInteger(s.question_count) && s.question_count > 0,
          `Bad question_count for ${s.id}: ${s.question_count}`);
      }
    }
  });

  it('every catalog set ID has a matching file on disk', () => {
    for (const topic of catalog) {
      for (const s of topic.sets) {
        const p = join(ROOT, 'question_sets', s.id);
        assert.ok(existsSync(p), `catalog references missing file: ${s.id}`);
      }
    }
  });

  it('every catalog set ID appears in index.json', () => {
    for (const topic of catalog) {
      for (const s of topic.sets) {
        assert.ok(index.includes(s.id), `catalog set "${s.id}" not in index.json`);
      }
    }
  });

  it('question_count matches actual question count in each file', () => {
    for (const topic of catalog) {
      for (const s of topic.sets) {
        const questions = loadJSON(`question_sets/${s.id}`);
        assert.equal(questions.length, s.question_count,
          `${s.id}: catalog says ${s.question_count} questions, file has ${questions.length}`);
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
            assert.ok(Array.isArray(q.incorrect) && q.incorrect.length > 0,
              `${label}: MC must have non-empty incorrect array`);
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
