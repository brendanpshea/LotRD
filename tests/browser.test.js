// tests/browser.test.js — the data-loss guarantee, in a real browser.
//
// dataloss.test.js runs the real game and the real shim, but inside Node, with a
// stand-in for localStorage and no page. This file closes that last gap: the
// actual page, in actual Chrome or Edge, framed by a stand-in for D2L — with the
// student's SCORM record held in the test's own server, so that two launches of
// the browser with different profiles are two devices sharing one LMS.
//
// It exists because this layer has already caught a bug the other 1,000 tests
// could not see: on a brand-new browser the game's start-up housekeeping deleted
// the progress the shim had restored a moment earlier. Nothing about that was
// wrong in either half; it was wrong in the page.
//
// Needs a Chromium-family browser. Without one the tests are SKIPPED, loudly —
// set LOTRD_BROWSER to the executable to point at one.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startServer, findBrowser, visit } from './helpers/browser-lms.js';

const browser = findBrowser();
// CI sets LOTRD_REQUIRE_BROWSER so that a missing browser is a failure there,
// not a quiet skip: a gate that can switch itself off is not a gate.
if (!browser && process.env.LOTRD_REQUIRE_BROWSER) {
  throw new Error('LOTRD_REQUIRE_BROWSER is set but no Chrome or Edge was found');
}
const skip = browser ? false
  : 'NO BROWSER FOUND — the real-browser data-loss checks did not run. Install Chrome or Edge, or set LOTRD_BROWSER.';

// Two real sets from the real catalog.
const catalog = JSON.parse(readFileSync(new URL('../question_sets/catalog.json', import.meta.url), 'utf8'));
const playable = catalog.flatMap(t => (t.sets || []).filter(s => !s.review && s.id));
const [cleared, left] = playable;

describe('in a real browser: work done on one device is there on the next', { skip }, () => {
  let server, first, second;

  before(async () => {
    server = await startServer();
    const params = { clear: cleared.id, leave: left.id, clearTitle: cleared.title, leaveTitle: left.title };
    // Device one: clears a set while D2L is unreachable, then leaves another half-done.
    first = await visit(browser, server.origin, 'work', params);
    // Device two: a profile that has never existed before. It only looks.
    second = await visit(browser, server.origin, 'look', params);
  });

  after(async () => { await server?.close(); });

  it('says progress is saved only while it is', () => {
    assert.match(first.connected.text, /saved to D2L/);
    assert.equal(first.connected.role, 'status');
  });

  it('warns, in red, while D2L is not receiving a set that was just cleared', () => {
    assert.equal(first.duringOutage.lmsKnowsTheSet, false, 'precondition: the LMS was down');
    assert.match(first.duringOutage.banner.text, /NOT been saved to D2L/);
    assert.equal(first.duringOutage.banner.role, 'alert');
  });

  it('delivers the cleared set once D2L is back, without the student doing anything', () => {
    assert.equal(first.afterOutage.lmsKnowsTheSet, true);
    assert.match(first.afterOutage.banner.text, /saved to D2L/);
    assert.ok(Number(first.afterOutage.score) > 0);
  });

  it('shows the cleared set as cleared, with its rank, in a browser that has never seen it', () => {
    assert.equal(second.storedDone, true, 'the completion was not restored from the LMS');
    assert.match(second.clearedRow, /Apprentice/, `the menu row reads: ${JSON.stringify(second.clearedRow)}`);
  });

  it('offers to resume the half-finished set there, and does not erase it from the LMS by looking', () => {
    assert.equal(first.lmsHasPosition, true, 'precondition: device one synced its position');
    assert.equal(second.storedPosition, true, 'restored, then deleted by the page\'s own start-up');
    assert.match(second.inProgressRow, /Resume/, `the menu row reads: ${JSON.stringify(second.inProgressRow)}`);
    assert.equal(second.lmsStillHasPosition, true);
  });
});

describe('in a real browser: a write-the-method problem', { skip }, () => {
  let server, seen;
  before(async () => {
    server = await startServer();
    seen = await visit(browser, server.origin, 'classProblem', { set: 'computing_concepts_06_modules_oop.json' });
  });
  after(async () => { await server?.close(); });

  it('shows the class so far, ending in the method line the student completes', () => {
    assert.equal(seen.label, 'Write the method:');
    assert.match(seen.shown, /class Purse:/);
    assert.match(seen.shown, /self\.coins = 0/);
    assert.match(seen.shown.trimEnd(), /def add\(self, n\):$/);
  });

  it('gives examples as the steps taken and what they should leave behind', () => {
    assert.match(seen.examples, /p = Purse\(\); p\.add\(5\); p\.coins → 5/);
  });

  it('fails the forgotten self. by showing the purse still empty, rather than by crashing', () => {
    assert.match(seen.forgotSelf, /0/);
    assert.doesNotMatch(seen.forgotSelf, /did not run/i);
  });

  it('passes every test for the right method', () => {
    assert.match(seen.correct, /4 (of|\/) 4|all 4|4 passed/i);
  });
});

describe('in a real browser: a write-the-method problem in Java', { skip }, () => {
  let server, seen;
  before(async () => {
    server = await startServer();
    seen = await visit(browser, server.origin, 'javaProblem', { set: 'java_04_functions.json' });
  });
  after(async () => { await server?.close(); });

  it('shows the method line above the box and its closing brace below', () => {
    assert.equal(seen.label, 'Write the method:');
    assert.equal(seen.shown.trim(), 'public int countVowels(String word) {');
    assert.equal(seen.closing.trim(), '}');
    assert.match(seen.placeholder, /\/\/ your code here/);
  });

  it('gives examples written as Java', () => {
    assert.match(seen.examples, /countVowels\("banana"\) → 3/);
  });

  it('colours what is typed as Java', () => assert.equal(seen.highlighted, true));

  it('fails only the test a half-right answer gets wrong, and shows what it returned', () => {
    assert.match(seen.lowercaseOnly, /3 of 4 tests passed/);
    assert.match(seen.lowercaseOnly, /countVowels\("AEIOU"\)/);
  });

  it('a missing return is explained, with its line marked in the gutter', () => {
    assert.match(seen.noReturn, /did not run/i);
    assert.match(seen.noReturn, /has to return an int/);
    assert.equal(seen.blamedLine, '4');
  });

  it('running off the end of a String is the exception Java throws', () => {
    assert.match(seen.offTheEnd, /StringIndexOutOfBoundsException/);
  });

  it('an endless loop is stopped and the page is still alive', () => {
    assert.match(seen.endless, /ran for too long/);
  });

  it('passes every test for the right method, and shows the worked answer as a whole method', () => {
    assert.match(seen.correct, /All 4 tests passed/);
    assert.match(seen.worked, /^public int countVowels\(String word\) \{/);
    assert.match(seen.worked.trimEnd(), /\}$/);
  });
});

// Reported from the live course: a set cleared in Chrome was nowhere to be seen in
// Firefox, and no score had reached the gradebook for days — while the banner said
// "saved". This is that afternoon, against an LMS player that keeps every write in
// the page and sends it to the server only when the content calls LMSFinish.
describe('in a real browser: an LMS that saves only when the session is finished', { skip }, () => {
  let server, departure, firefox;
  before(async () => {
    server = await startServer();
    const params = { clear: cleared.id, leave: left.id, clearTitle: cleared.title, leaveTitle: left.title, buffered: '1' };
    departure = await visit(browser, server.origin, 'workAndLeave', params);     // "Chrome": clear a set, go elsewhere in the LMS
    firefox = await visit(browser, server.origin, 'look', params);          // a browser that has never seen the game
  });
  after(async () => { await server?.close(); });

  it('the student really did leave the page', () => assert.equal(departure.left, true));

  it('told the LMS the session had ended, on the way out', () => {
    assert.ok((server.lms.finishes || 0) >= 1, 'LMSFinish never reached the server');
    assert.ok(Number(server.lms.store['cmi.core.score.raw']) > 0, 'the score never reached the server');
  });

  it('the set cleared in one browser is cleared in the other', () => {
    assert.equal(firefox.storedDone, true);
    assert.match(firefox.clearedRow, /Apprentice/, `the menu row reads: ${JSON.stringify(firefox.clearedRow)}`);
  });
});

// A package that is ONE problem set: no menu, no ranks, full credit on clearing it.
describe('in a real browser: writing a query', { skip }, () => {
  // The one screen whose answer comes back later: the query goes to SQLite in a
  // background worker, so that one which never ends can be stopped. None of that
  // exists in Node — no worker, no .wasm fetched over HTTP, no page to freeze.
  let server, seen;

  before(async () => {
    server = await startServer();
    seen = await visit(browser, server.origin, 'sqlProblem', { set: 'computing_concepts_09_databases.json' }, { realTime: true });
  });

  after(async () => { await server?.close(); });

  it('shows the task and the table it is about, with its rows', () => {
    assert.match(seen.task, /sugar/);
    assert.match(seen.tables, /candies/);
    assert.match(seen.tables, /sugar_grams/);
    assert.match(seen.tables, /Gumdrop/);
  });

  it('runs a query and shows the rows it returned beside the rows expected', () => {
    assert.match(seen.wholeTable, /Your result/);
    assert.match(seen.wholeTable, /Expected/);
    assert.match(seen.wholeTable, /Fizzer/, 'the whole table came back, Fizzer included');
    assert.doesNotMatch(seen.wholeTable, /ready to submit/);
  });

  it('puts a misspelled keyword into a sentence, with what to check', () => {
    assert.match(seen.misspelled, /did not run/);
    assert.match(seen.misspelled, /FORM/);
    assert.match(seen.misspelled, /SELECT … FROM … WHERE/);
  });

  it('will not run a statement that changes the table', () => {
    assert.match(seen.changesData, /SELECT queries only/);
  });

  it('stops a query that would never finish, and says why', () => {
    assert.match(seen.runaway, /too long and was stopped/);
    assert.ok(seen.runawayMs < 15000, `it took ${seen.runawayMs} ms to give up`);
  });

  it('runs the next query normally after stopping one', () => {
    assert.match(seen.afterRunaway, /Your result/);
  });

  it('passes the reference query on the rows shown and on the hidden ones', () => {
    assert.match(seen.correct, /ready to submit/);
    assert.match(seen.correct, /not shown\): correct/);
  });

  it('grades it on Submit and moves on', () => {
    assert.match(seen.afterSubmit, /One way to write it/);
    assert.equal(seen.remaining, 0, 'a correct query must not be asked again');
  });
});

describe('in a real browser: a single-set package', { skip }, () => {
  const SINGLE = 'computing_concepts_04_control_functions.json';
  let server, first, second;
  before(async () => {
    server = await startServer();
    first = await visit(browser, server.origin, 'singleSet', { single: SINGLE });
    second = await visit(browser, server.origin, 'singleLook', { single: SINGLE });   // a browser that has never seen it
  });
  after(async () => { await server?.close(); });

  it('opens on its own set, not on the menu of every topic', () => {
    assert.match(first.landing, /Control Flow & Functions/);
    assert.match(first.landing, /Not yet complete/);
    assert.match(first.landing, /all or nothing/i);
    assert.equal(first.menuButtons, 0, 'the topic list of the main menu was drawn');
    assert.doesNotMatch(first.landing, /Apprentice|Journeyman|Trial|Course score/);
  });

  it('writes no score before the set is cleared', () => {
    assert.match(first.bannerBefore, /Not yet complete/);
  });

  it('goes straight into the questions from the landing page', () => assert.equal(first.wentStraightIn, true));

  it('is worth 100 when cleared, and says so', () => {
    assert.equal(first.lms['cmi.core.score.raw'], '100');
    assert.equal(first.lms['cmi.core.lesson_status'], 'completed');
    assert.match(first.bannerAfter, /Complete — full credit/);
    assert.match(first.landingAfter, /you have full credit/i);
    assert.match(first.landingAfter, /never changes your grade/i);
  });

  it('shows as complete in a browser that has never seen it', () => {
    assert.match(second.landing, /you have full credit/i);
    assert.match(second.banner, /Complete — full credit/);
  });
});
