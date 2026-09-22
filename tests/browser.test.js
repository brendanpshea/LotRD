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
