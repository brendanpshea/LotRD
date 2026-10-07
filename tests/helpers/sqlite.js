// tests/helpers/sqlite.js — real SQLite, in this process, for the tests.
//
// In the browser a student's query runs in a background worker, so that a query
// which never ends can be stopped. The tests have no page to freeze, so they run
// the same engine — the vendored sql.js build of SQLite — directly. Both sides
// hand the grader the same thing: a function that takes the SQL which builds the
// tables and the query to run, and answers with { columns, values }.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const wasmBinary = readFileSync(new URL('../../vendor/sqljs/sql-wasm.wasm', import.meta.url));
let engine = null;

/** The sql.js module, loaded once. */
export async function sqlite() {
  engine ??= await require('../../vendor/sqljs/sql-wasm.js')({ wasmBinary });
  return engine;
}

/** A `run(setupSql, query)` for src/sqlgrade.js: a fresh database for every call. */
export async function directRunner() {
  const SQL = await sqlite();
  return async (setupSql, query) => {
    const db = new SQL.Database();
    try {
      db.run(setupSql);
      const results = db.exec(query);
      return results.length ? results[results.length - 1] : { columns: [], values: [] };
    } finally {
      db.close();
    }
  };
}

export const loadDatabase = name =>
  JSON.parse(readFileSync(new URL(`../../question_sets/databases/${name}.json`, import.meta.url), 'utf8'));
