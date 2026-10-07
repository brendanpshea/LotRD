// tests/sqlgrade.test.js — grading a query a student wrote.
//
// A write-the-query problem gives a task and a reference query. The student's
// query is right when it returns the same rows as the reference — not on the
// tables they can see alone, but on every dataset the database file holds, so
// that a query which merely spells out the visible answer does not pass.
//
// The engine is real SQLite (vendor/sqljs), so nothing here checks that SQL
// means what SQL means. What it checks is the grading around it.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { gradeSql, setupSql, checkStatement, compareResults, explainError, describeTables } from '../src/sqlgrade.js';
import { directRunner, loadDatabase } from './helpers/sqlite.js';

const database = loadDatabase('candy_factory');
let run;
before(async () => { run = await directRunner(); });

const LOW_SUGAR = {
  type: 'sql_write',
  question: 'List the name of every candy with less than 20 grams of sugar, in alphabetical order.',
  database: 'candy_factory',
  solution: 'SELECT name FROM candies WHERE sugar_grams < 20 ORDER BY name;',
  ordered: true,
};
const PER_MAKER = {
  type: 'sql_write',
  question: 'For each maker, show the maker and how many candies it makes.',
  database: 'candy_factory',
  solution: 'SELECT maker, COUNT(*) FROM candies GROUP BY maker;',
};
const grade = (question, text) => gradeSql(run, question, database, text);

describe('a correct query', () => {
  it('passes on every dataset, the hidden ones included', async () => {
    const outcome = await grade(LOW_SUGAR, LOW_SUGAR.solution);
    assert.equal(outcome.ok, true);
    assert.equal(outcome.total, database.datasets.length);
    assert.equal(outcome.passed, outcome.total);
  });

  it('may be written differently from the reference', async () => {
    const outcome = await grade(LOW_SUGAR, 'select candies.name\nfrom candies\nwhere 20 > sugar_grams\norder by 1');
    assert.equal(outcome.passed, outcome.total);
  });

  it('is not marked down for naming its columns differently', async () => {
    const outcome = await grade(PER_MAKER, 'SELECT maker AS who, COUNT(candy_id) AS how_many FROM candies GROUP BY maker');
    assert.equal(outcome.passed, outcome.total);
  });

  it('may return its rows in any order when the task does not ask for one', async () => {
    const outcome = await grade(PER_MAKER, 'SELECT maker, COUNT(*) FROM candies GROUP BY maker ORDER BY maker DESC');
    assert.equal(outcome.passed, outcome.total);
  });
});

describe('a wrong query', () => {
  it('fails when it only spells out the answer that is on screen', async () => {
    // The rows shown give Gumdrop, Mint, Sherbet. Typing them back is not a query.
    const outcome = await grade(LOW_SUGAR,
      "SELECT name FROM candies WHERE name IN ('Gumdrop', 'Mint', 'Sherbet') ORDER BY name");
    assert.equal(outcome.results[0].passed, true, 'it does match the rows shown');
    assert.ok(outcome.passed < outcome.total, 'and must fail on rows it has not seen');
  });

  it('fails on the boundary the task draws (less than 20 is not 20)', async () => {
    const outcome = await grade(LOW_SUGAR, 'SELECT name FROM candies WHERE sugar_grams <= 20 ORDER BY name');
    assert.equal(outcome.results[0].passed, true, 'no candy shown has exactly 20 grams');
    assert.ok(outcome.passed < outcome.total, 'a hidden dataset has one that does');
  });

  it('fails for the right rows in the wrong order, when order was asked for', async () => {
    const outcome = await grade(LOW_SUGAR, 'SELECT name FROM candies WHERE sugar_grams < 20 ORDER BY name DESC');
    assert.equal(outcome.passed, 0);
    assert.match(outcome.results[0].detail, /order/i);
  });

  it('says so when it returns the wrong number of columns', async () => {
    const outcome = await grade(LOW_SUGAR, 'SELECT name, maker FROM candies WHERE sugar_grams < 20 ORDER BY name');
    assert.equal(outcome.passed, 0);
    assert.match(outcome.results[0].detail, /2 columns.*1/);
  });

  it('says so when it returns too many or too few rows', async () => {
    const outcome = await grade(LOW_SUGAR, 'SELECT name FROM candies ORDER BY name');
    assert.match(outcome.results[0].detail, /5 rows.*3/);
  });

  it('shows the rows it returned beside the rows expected, for the dataset on screen only', async () => {
    const outcome = await grade(LOW_SUGAR, 'SELECT name FROM candies ORDER BY name');
    assert.deepEqual(outcome.results[0].expected.values, [['Gumdrop'], ['Mint'], ['Sherbet']]);
    assert.equal(outcome.results[0].actual.values.length, 5);
    assert.equal(outcome.results[1].expected, undefined, 'hidden rows stay hidden');
    assert.equal(outcome.results[1].actual, undefined);
  });
});

describe('a query that does not run', () => {
  it('is reported once, in words, with nothing graded', async () => {
    const outcome = await grade(LOW_SUGAR, 'SELECT name FORM candies');
    assert.equal(outcome.ok, false);
    assert.equal(outcome.passed, 0);
    assert.equal(outcome.total, database.datasets.length);
    assert.match(outcome.error.message, /FORM|candies/);
    assert.ok(outcome.error.hint);
  });

  it('spots a misspelled keyword, which SQLite itself never names', async () => {
    // SQLite reads FORM as a nickname for the column and then trips over the
    // NEXT word, so its own message points at "candies". Found in a real browser.
    for (const [query, wrong, right] of [
      ['SELECT name FORM candies', 'FORM', 'FROM'],
      ['SELCT name FROM candies', 'SELCT', 'SELECT'],
      ['SELECT name FROM candies WERE sugar_grams < 20', 'WERE', 'WHERE'],
      ['SELECT maker, COUNT(*) FROM candies GRUOP BY maker', 'GRUOP', 'GROUP'],
      ['SELECT name FROM candies ODER BY name', 'ODER', 'ORDER'],
    ]) {
      const outcome = await grade(LOW_SUGAR, query);
      assert.equal(outcome.ok, false, query);
      assert.match(outcome.error.hint, new RegExp(`${wrong}.*${right}`), `${query} → ${outcome.error.hint}`);
    }
  });

  it('does not mistake a real column or table name for a misspelled keyword', async () => {
    const outcome = await grade(LOW_SUGAR, 'SELECT name FROM candies WHERE name = ');
    assert.doesNotMatch(outcome.error.hint || '', /misspell/i);
  });

  it('names the columns that do exist when one is misspelled', async () => {
    const outcome = await grade(LOW_SUGAR, 'SELECT name FROM candies WHERE sugar < 20');
    assert.equal(outcome.ok, false);
    assert.match(outcome.error.message, /no column called "sugar"/);
    assert.match(outcome.error.hint, /sugar_grams/);
  });

  it('names the tables that do exist when one is misspelled', async () => {
    const outcome = await grade(LOW_SUGAR, 'SELECT name FROM candy');
    assert.match(outcome.error.message, /no table called "candy"/);
    assert.match(outcome.error.hint, /candies/);
  });

  it('explains an ambiguous column in a join', async () => {
    const outcome = await grade(LOW_SUGAR,
      'SELECT candy_id FROM batches JOIN candies ON batches.candy_id = candies.candy_id');
    assert.match(outcome.error.hint, /candies\.candy_id|batches\.candy_id/);
  });
});

describe('what the box will run', () => {
  it('is one SELECT', () => {
    assert.equal(checkStatement('SELECT 1'), null);
    assert.equal(checkStatement('  select name\nfrom candies ; '), null);
    assert.equal(checkStatement('-- all of them\nSELECT * FROM candies'), null);
    assert.equal(checkStatement('WITH low AS (SELECT * FROM candies) SELECT * FROM low'), null);
  });

  it('is not nothing', () => {
    assert.match(checkStatement('   ').message, /Write a query/);
    assert.match(checkStatement('-- just a comment').message, /Write a query/);
  });

  it('is not a statement that changes the tables', () => {
    for (const text of ['DELETE FROM candies', 'drop table candies', "INSERT INTO candies VALUES (9, 'x', 'y', 1)",
      'UPDATE candies SET sugar_grams = 0', 'CREATE TABLE t (a)', 'PRAGMA foreign_keys = OFF']) {
      assert.match(checkStatement(text).message, /SELECT/, text);
    }
  });

  it('is not two statements', () => {
    assert.match(checkStatement('SELECT 1; SELECT 2').message, /one query/i);
    assert.match(checkStatement('SELECT 1; DELETE FROM candies').message, /one query/i);
  });

  it('is not fooled by a semicolon or a keyword inside quoted text', () => {
    assert.equal(checkStatement("SELECT name FROM candies WHERE name = 'a; DELETE'"), null);
  });

  it('refuses a statement that changes tables even when graded', async () => {
    const outcome = await grade(LOW_SUGAR, 'DELETE FROM candies');
    assert.equal(outcome.ok, false);
    assert.equal(outcome.passed, 0);
  });
});

describe('comparing two results', () => {
  const rows = values => ({ columns: values[0] ? values[0].map((_, i) => `c${i}`) : [], values });

  it('ignores row order unless told it matters', () => {
    assert.equal(compareResults(rows([[1], [2]]), rows([[2], [1]]), false).passed, true);
    assert.equal(compareResults(rows([[1], [2]]), rows([[2], [1]]), true).passed, false);
  });

  it('counts repeated rows: two of a row is not one of it', () => {
    assert.equal(compareResults(rows([[1], [1], [2]]), rows([[1], [2], [2]]), false).passed, false);
  });

  it('treats 2 and 2.0 as the same number, and nearly-equal averages as equal', () => {
    assert.equal(compareResults(rows([[2]]), rows([[2.0]]), true).passed, true);
    assert.equal(compareResults(rows([[0.1 + 0.2]]), rows([[0.3]]), true).passed, true);
  });

  it('does not confuse the number 5 with the text 5, or NULL with empty text', () => {
    assert.equal(compareResults(rows([[5]]), rows([['5']]), true).passed, false);
    assert.equal(compareResults(rows([[null]]), rows([['']]), true).passed, false);
  });

  it('agrees that nothing equals nothing', () => {
    assert.equal(compareResults({ columns: [], values: [] }, { columns: [], values: [] }, true).passed, true);
  });
});

describe('building the tables', () => {
  it('produces SQL that SQLite accepts, for every dataset', async () => {
    for (const dataset of database.datasets) {
      const result = await run(setupSql(database, dataset), 'SELECT COUNT(*) FROM candies');
      assert.equal(result.values[0][0], dataset.rows.candies.length);
    }
  });

  it('keeps an apostrophe in a value as text, not as the end of it', async () => {
    const odd = { tables: [{ name: 't', columns: [['a', 'TEXT']] }] };
    const result = await run(setupSql(odd, { rows: { t: [["Flint's"], [null]] } }), 'SELECT a FROM t');
    assert.deepEqual(result.values, [["Flint's"], [null]]);
  });

  it('describes the tables a problem names, with their rows, for the screen', () => {
    const shown = describeTables(database, ['candies']);
    assert.equal(shown.length, 1);
    assert.deepEqual(shown[0].columns, ['candy_id', 'name', 'maker', 'sugar_grams']);
    assert.equal(shown[0].rows.length, 5);
    assert.equal(describeTables(database).length, 2, 'every table, when the problem names none');
  });
});

describe('explaining an error', () => {
  it('passes through anything it has no better words for', () => {
    assert.equal(explainError('something unusual happened', database).message, 'something unusual happened');
  });

  it('says a query that ends too soon ends too soon', () => {
    assert.match(explainError('incomplete input', database).message, /ends too soon/);
  });
});
