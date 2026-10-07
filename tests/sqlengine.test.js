// tests/sqlengine.test.js — the worker that runs a student's query, and the clock on it.
//
// The browser runs SQLite in a Web Worker so that a query which never ends can
// be stopped. Node has no Web Worker of that kind, so these tests give the
// runner a stand-in that speaks the same messages — backed by the real engine —
// and can be told to go silent, the way a runaway query does.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSqlRunner } from '../src/sqlengine.js';
import { gradeSql } from '../src/sqlgrade.js';
import { sqlite, loadDatabase } from './helpers/sqlite.js';

const SQL = await sqlite();

/** A stand-in for vendor/sqljs/worker.sql-wasm.js: same messages in, same messages out. */
function fakeWorkers({ hangOn = () => false, failToStart = false } = {}) {
  const made = [];
  const makeWorker = () => {
    if (failToStart) throw new Error('workers are disabled');
    let db = null;
    const worker = {
      terminated: false, onmessage: null, onerror: null,
      terminate() { this.terminated = true; },
      postMessage(message) {
        if (hangOn(message)) return;                       // never answers: a query that never ends
        setImmediate(() => {
          if (this.terminated) return;
          try {
            if (message.action === 'open') { db?.close(); db = new SQL.Database(); this.onmessage({ data: { id: message.id, ready: true } }); }
            else this.onmessage({ data: { id: message.id, results: db.exec(message.sql) } });
          } catch (err) { this.onmessage({ data: { id: message.id, error: err.message } }); }
        });
      },
    };
    made.push(worker);
    return worker;
  };
  return { makeWorker, made };
}

const SETUP = "CREATE TABLE t (a, b); INSERT INTO t VALUES (1, 'x'), (2, 'y');";

describe('running a query in the worker', () => {
  it('builds the tables, runs the query, and hands back its rows', async () => {
    const { makeWorker } = fakeWorkers();
    const { run } = createSqlRunner({ makeWorker });
    assert.deepEqual(await run(SETUP, 'SELECT a FROM t ORDER BY a DESC'), { columns: ['a'], values: [[2], [1]] });
  });

  it('gives each run an empty database of its own', async () => {
    const { makeWorker, made } = fakeWorkers();
    const { run } = createSqlRunner({ makeWorker });
    await run(SETUP, 'SELECT 1');
    await run(SETUP, 'SELECT COUNT(*) FROM t');          // would fail with "table t already exists" otherwise
    assert.equal(made.length, 1, 'the worker itself is reused');
  });

  it('answers a query that matches nothing with no rows, not with an error', async () => {
    const { makeWorker } = fakeWorkers();
    const { run } = createSqlRunner({ makeWorker });
    assert.deepEqual((await run(SETUP, 'SELECT a FROM t WHERE a > 9')).values, []);
  });

  it("passes on SQLite's own complaint when the SQL is wrong", async () => {
    const { makeWorker } = fakeWorkers();
    const { run } = createSqlRunner({ makeWorker });
    await assert.rejects(run(SETUP, 'SELECT zz FROM t'), /no such column: zz/);
    assert.deepEqual((await run(SETUP, 'SELECT a FROM t')).values, [[1], [2]], 'and carries on afterwards');
  });

  it('keeps runs in order when they are asked for at once', async () => {
    const { makeWorker } = fakeWorkers();
    const { run } = createSqlRunner({ makeWorker });
    const [first, second] = await Promise.all([run(SETUP, 'SELECT 1'), run(SETUP, 'SELECT 2')]);
    assert.deepEqual([first.values, second.values], [[[1]], [[2]]]);
  });
});

describe('a query that never ends', () => {
  const runaway = message => /RUNAWAY/.test(message.sql || '');

  it('is stopped by terminating its worker, and says why', async () => {
    const { makeWorker, made } = fakeWorkers({ hangOn: runaway });
    const { run } = createSqlRunner({ makeWorker, timeoutMs: 40 });
    const error = await run(SETUP, 'SELECT /* RUNAWAY */ 1').then(() => null, e => e);
    assert.ok(error, 'the run must not hang forever');
    assert.equal(error.limit, true);
    assert.match(error.message, /too long/);
    assert.match(error.hint, /JOIN/);
    assert.equal(made[0].terminated, true, 'only terminating the worker is guaranteed to stop it');
  });

  it('does not take the next query down with it', async () => {
    const { makeWorker, made } = fakeWorkers({ hangOn: runaway });
    const { run } = createSqlRunner({ makeWorker, timeoutMs: 40 });
    await run(SETUP, 'SELECT /* RUNAWAY */ 1').catch(() => {});
    assert.deepEqual((await run(SETUP, 'SELECT a FROM t')).values, [[1], [2]]);
    assert.equal(made.length, 2, 'a fresh worker was started');
  });

  it('is reported to the student as a query that did not run, on every dataset', async () => {
    const { makeWorker } = fakeWorkers({ hangOn: runaway });
    const { run } = createSqlRunner({ makeWorker, timeoutMs: 40 });
    const database = loadDatabase('candy_factory');
    const question = { solution: 'SELECT name FROM candies', database: 'candy_factory' };
    const outcome = await gradeSql(run, question, database, 'SELECT /* RUNAWAY */ name FROM candies, candies AS b');
    assert.equal(outcome.ok, false);
    assert.match(outcome.error.message, /too long/);
    assert.equal(outcome.passed, 0);
  });
});

describe('an engine that will not start', () => {
  it('says so, and blames the engine rather than the query', async () => {
    const { makeWorker } = fakeWorkers({ failToStart: true });
    const { run } = createSqlRunner({ makeWorker });
    const error = await run(SETUP, 'SELECT 1').then(() => null, e => e);
    assert.equal(error.limit, true);
    assert.match(error.message, /could not be started/);
  });

  it('gives up on an engine that never finishes loading', async () => {
    const { makeWorker } = fakeWorkers({ hangOn: message => message.action === 'open' });
    const { run } = createSqlRunner({ makeWorker, startupMs: 40 });
    const error = await run(SETUP, 'SELECT 1').then(() => null, e => e);
    assert.match(error.message, /too long to load/);
  });
});
