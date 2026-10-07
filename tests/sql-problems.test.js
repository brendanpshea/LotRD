// tests/sql-problems.test.js — every write-the-query problem can be solved, and only by a query.
//
// A problem whose reference query does not pass its own grading is unsolvable,
// and the student — who cannot see the key — is left to conclude they cannot
// write SQL. A problem that the visible answer, typed back, CAN pass is not a
// problem at all. And a problem that asks for an order which the data does not
// settle (two rows tying on the sort key) fails a correct answer at random.
//
// So for every sql_write question in every set, the reference query goes through
// the same engine and the same grader a student's query meets, and each of those
// three things is checked. The database files are checked too.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gradeSql, setupSql, describeTables } from '../src/sqlgrade.js';
import { directRunner } from './helpers/sqlite.js';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const index = read('../question_sets/index.json');
const databaseFiles = readdirSync(new URL('../question_sets/databases/', import.meta.url)).filter(f => f.endsWith('.json'));
const databases = new Map(databaseFiles.map(f => [f.replace(/\.json$/, ''), read(`../question_sets/databases/${f}`)]));

let run;
before(async () => { run = await directRunner(); });

/** The same dataset with every table's rows inserted in the opposite order. */
const reversed = dataset => ({
  ...dataset,
  rows: Object.fromEntries(Object.entries(dataset.rows).map(([table, rows]) => [table, [...rows].reverse()])),
});
const literal = v => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

describe('database files', () => {
  it('there is at least one', () => assert.ok(databases.size > 0));

  for (const [name, database] of databases) {
    describe(name, () => {
      it('is named after its file, and has tables', () => {
        assert.equal(database.name, name);
        assert.ok(Array.isArray(database.tables) && database.tables.length > 0);
        for (const table of database.tables) {
          assert.match(table.name, /^[a-z][a-z0-9_]*$/, 'table names are lower_snake_case');
          assert.ok(table.columns.length > 0 && table.columns.every(c => Array.isArray(c) && c.length === 2));
        }
      });

      it('has the dataset a student sees and at least two they do not', () => {
        // One hidden dataset can be matched by luck; two, with different rows, cannot.
        assert.ok(database.datasets.length >= 3, `only ${database.datasets.length} datasets`);
        const labels = database.datasets.map(d => d.label);
        assert.equal(new Set(labels).size, labels.length, 'dataset labels must differ: they are shown to the student');
      });

      it('gives every row a value for every column', () => {
        for (const dataset of database.datasets) {
          for (const table of database.tables) {
            const rows = dataset.rows[table.name];
            assert.ok(Array.isArray(rows) && rows.length > 0, `${dataset.label}: ${table.name} has no rows`);
            for (const row of rows) assert.equal(row.length, table.columns.length, `${dataset.label}: ${table.name} ${JSON.stringify(row)}`);
          }
        }
      });

      it('builds in SQLite with its own keys enforced, on every dataset', async () => {
        // A dataset that breaks its own foreign key would teach that keys do not matter.
        for (const dataset of database.datasets) {
          const result = await run(`PRAGMA foreign_keys = ON;\n${setupSql(database, dataset)}`, 'PRAGMA foreign_key_check');
          assert.deepEqual(result.values, [], `${dataset.label} breaks a foreign key`);
        }
      });

      it('keeps the table a student sees small enough to read on a phone', () => {
        for (const table of describeTables(database)) {
          assert.ok(table.rows.length <= 8, `${table.name} shows ${table.rows.length} rows`);
          assert.ok(table.columns.length <= 5, `${table.name} has ${table.columns.length} columns`);
        }
      });
    });
  }
});

describe('write-the-query problems', () => {
  let found = 0;

  for (const setId of index) {
    const problems = read(`../question_sets/${setId}`).map((q, i) => ({ q, i })).filter(({ q }) => q.type === 'sql_write');
    if (problems.length === 0) continue;
    found += problems.length;

    describe(setId, () => {
      for (const { q, i } of problems) {
        const database = databases.get(q.database);
        const name = `[${i}] ${q.question.slice(0, 60)}`;

        it(`${name} — the reference query passes on every dataset`, async () => {
          const outcome = await gradeSql(run, q, database, q.solution);
          assert.equal(outcome.ok, true, outcome.error?.message);
          assert.equal(outcome.passed, outcome.total, JSON.stringify(outcome.results.filter(r => !r.passed)));
        });

        it(`${name} — shows only tables that exist, and has rows to show for its answer`, async () => {
          describeTables(database, q.tables);
          const shown = await run(setupSql(database, database.datasets[0]), q.solution);
          assert.ok(shown.values.length > 0, 'the answer on the rows shown is empty: there is nothing to check a query against by eye');
        });

        it(`${name} — cannot be passed by typing the visible answer back`, async () => {
          const shown = await run(setupSql(database, database.datasets[0]), q.solution);
          const typedBack = `SELECT * FROM (VALUES ${shown.values.map(row => `(${row.map(literal).join(', ')})`).join(', ')})`;
          const outcome = await gradeSql(run, q, database, typedBack);
          assert.equal(outcome.results[0].passed, true, 'sanity: it does match the rows shown');
          assert.ok(outcome.passed < outcome.total, 'the hidden datasets give the same answer as the visible one');
        });

        it(`${name} — cannot be passed by returning the whole table`, async () => {
          const outcome = await gradeSql(run, q, database, `SELECT * FROM ${(q.tables || [database.tables[0].name])[0]}`);
          assert.equal(outcome.passed, 0);
        });

        if (q.ordered) {
          it(`${name} — asks for an order the data settles (no ties on the sort key)`, async () => {
            for (const dataset of database.datasets) {
              const forwards = await run(setupSql(database, dataset), q.solution);
              const backwards = await run(setupSql(database, reversed(dataset)), q.solution);
              assert.deepEqual(backwards.values, forwards.values,
                `${dataset.label}: the same query gives a different order when the rows are stored in a different order`);
            }
          });
        } else {
          it(`${name} — does not ask for an order it then ignores`, () => {
            assert.ok(!/\b(first|last|order|sorted|alphabetical|ascending|descending)\b/i.test(q.question),
              'the task mentions an order, but "ordered" is not set, so any order would be accepted');
          });
        }
      }
    });
  }

  it('some set has them', () => assert.ok(found > 0, 'no sql_write problem in any set'));
});
