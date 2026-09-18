// tests/pytiny-problems.test.js — grading a class problem.
//
// A function is graded by calling it. An object is graded by what it has become:
// a test is a short script and then an expression to look at. These tests cover
// the runner that does that — and above all what a STUDENT sees when their method
// is wrong, missing, misnamed, or pasted in a shape we did not ask for.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runProblem, runScriptCases, assembleProblem, problemHeader, isScriptProblem, describeScript } from '../src/pytiny.js';

// Write ONE METHOD: the class so far is supplied, read-only.
const PURSE = {
  type: 'code_write',
  scaffold: 'class Purse:\n    def __init__(self):\n        self.coins = 0',
  signature: 'def add(self, n):',
  tests: [
    { run: 'p = Purse()\np.add(5)', check: 'p.coins', expect: 5 },
    { run: 'p = Purse()\np.add(5)\np.add(2)', check: 'p.coins', expect: 7 },
    { run: 'a = Purse()\nb = Purse()\na.add(3)', check: 'b.coins', expect: 0 },
  ],
  solution: 'self.coins = self.coins + n',
};

// Write A WHOLE CLASS: no scaffold; the signature is the class line.
const STACK = {
  type: 'code_write',
  signature: 'class Stack:',
  tests: [
    { run: 's = Stack()', check: 's.size()', expect: 0 },
    { run: 's = Stack()\ns.push(1)\ns.push(2)', check: 's.pop()', expect: 2 },
    { run: 's = Stack()\ns.push(1)\ns.push(2)\ns.pop()', check: 's.size()', expect: 1 },
  ],
  solution: 'def __init__(self):\n    self.items = []\ndef push(self, x):\n    self.items.append(x)\ndef pop(self):\n    return self.items.pop()\ndef size(self):\n    return len(self.items)',
};

describe('class problems: one method', () => {
  it('passes every test for a correct body', () => {
    const outcome = runProblem(PURSE, PURSE.solution);
    assert.equal(outcome.ok, true);
    assert.equal(outcome.passed, 3);
    assert.equal(outcome.results[1].actualRepr, '7');
  });

  it('shows the forgotten self. for what it is: every purse stays empty', () => {
    // The bug the chapter is about. It must FAIL the tests, not crash, and the
    // results must show the value the student's code actually produced.
    const outcome = runProblem(PURSE, 'coins = self.coins + n');
    assert.equal(outcome.ok, true);
    assert.equal(outcome.results[0].passed, false);
    assert.equal(outcome.results[0].actualRepr, '0');
    assert.equal(outcome.results[0].error, null);
    assert.equal(outcome.results[2].passed, true, 'the test about a second purse still passes');
  });

  it('reports an error on the line the STUDENT wrote, counted in their own lines', () => {
    const outcome = runProblem(PURSE, 'total = self.coins + n\nself.coins = totl');
    const err = outcome.results[0].error;
    assert.match(err.message, /totl/);
    assert.equal(err.line, 2, 'line 2 of the box, whatever was assembled around it');
    assert.match(err.hint, /total/);
  });

  it('points a bare attribute name at self.', () => {
    const outcome = runProblem(PURSE, 'self.coins = coins + n');
    assert.match(outcome.results[0].error.hint, /self\.coins/);
  });

  it('counts syntax errors in the student\'s lines too', () => {
    const outcome = runProblem(PURSE, 'self.coins = self.coins +');
    assert.equal(outcome.ok, false);
    assert.equal(outcome.error.line, 1);
  });

  it('accepts the method pasted in with its def line', () => {
    const outcome = runProblem(PURSE, 'def add(self, n):\n    self.coins = self.coins + n');
    assert.equal(outcome.passed, 3);
  });

  it('accepts a body that arrives already indented', () => {
    const outcome = runProblem(PURSE, '        self.coins = self.coins + n');
    assert.equal(outcome.passed, 3);
  });

  it('when the method was pasted under another name, the failure is in the test and carries no line number', () => {
    const outcome = runProblem(PURSE, 'def ad(self, n):\n    self.coins = self.coins + n');
    const err = outcome.results[0].error;
    assert.match(err.message, /no method called "\.add\(\)"/);
    assert.equal(err.line, null, 'a line in the hidden test script is not a line the student can see');
    assert.match(err.hint, /ad/);
  });

  it('an empty box is a friendly message, not a crash', () => {
    const outcome = runProblem(PURSE, '   \n');
    assert.equal(outcome.ok, false);
    assert.match(outcome.error.message, /not written any code/);
  });

  it('an endless loop in a method is stopped, test by test', () => {
    const outcome = runProblem(PURSE, 'while True:\n    n = n', { limits: { steps: 5000 } });
    assert.equal(outcome.results[0].error.kind, 'limit');
  });

  it('keeps what the method printed, for the results table', () => {
    const outcome = runProblem(PURSE, 'print("adding", n)\nself.coins = self.coins + n');
    assert.deepEqual(outcome.results[0].output, ['adding 5']);
    assert.equal(outcome.printedOnly, false, 'that flag is about functions that print instead of returning');
  });

  it('each test starts from a fresh program: nothing leaks from one to the next', () => {
    const leaky = { ...PURSE, scaffold: 'class Purse:\n    seen = []\n    def __init__(self):\n        self.coins = 0',
      tests: [{ run: 'p = Purse()\np.add(1)', check: 'len(Purse.seen)', expect: 1 }, { run: 'p = Purse()\np.add(1)', check: 'len(Purse.seen)', expect: 1 }] };
    const outcome = runProblem(leaky, 'self.seen.append(n)');
    assert.equal(outcome.passed, 2);
  });
});

describe('class problems: a whole class', () => {
  it('passes for a correct class written as its methods', () => {
    assert.equal(runProblem(STACK, STACK.solution).passed, 3);
  });

  it('accepts the whole class pasted with its class line', () => {
    const pasted = 'class Stack:\n' + STACK.solution.split('\n').map(l => '    ' + l).join('\n');
    assert.equal(runProblem(STACK, pasted).passed, 3);
  });

  it('a missing method fails only the tests that need it', () => {
    const outcome = runProblem(STACK, 'def __init__(self):\n    self.items = []\ndef size(self):\n    return len(self.items)');
    assert.equal(outcome.results[0].passed, true);
    assert.match(outcome.results[1].error.message, /push/);
  });

  it('a list put in the class body instead of __init__ is caught by a test with two stacks', () => {
    const twoStacks = { ...STACK, tests: [...STACK.tests, { run: 'a = Stack()\nb = Stack()\na.push(1)', check: 'b.size()', expect: 0 }] };
    const shared = 'items = []\ndef push(self, x):\n    self.items.append(x)\ndef pop(self):\n    return self.items.pop()\ndef size(self):\n    return len(self.items)';
    const outcome = runProblem(twoStacks, shared);
    assert.equal(outcome.results[3].passed, false);
    assert.equal(outcome.results[3].actualRepr, '1');
  });
});

describe('class problems: presentation', () => {
  it('shows the class so far with the method line the student is completing', () => {
    assert.equal(problemHeader(PURSE), 'class Purse:\n    def __init__(self):\n        self.coins = 0\n    def add(self, n):');
    assert.equal(problemHeader(STACK), 'class Stack:');
  });

  it('writes a test out as the steps taken and the thing looked at', () => {
    assert.equal(describeScript(PURSE.tests[1]), 'p = Purse(); p.add(5); p.add(2); p.coins');
  });

  it('tells the two kinds of problem apart, and leaves function problems exactly as they were', () => {
    assert.equal(isScriptProblem(PURSE), true);
    const fn = { signature: 'def double(n):', tests: [{ args: [2], expect: 4 }, { args: [0], expect: 0 }] };
    assert.equal(isScriptProblem(fn), false);
    const outcome = runProblem(fn, 'return n * 2');
    assert.equal(outcome.passed, 2);
    assert.equal(outcome.results[0].call, 'double(2)');
  });

  it('assembles with the right number of lines above the student\'s first', () => {
    assert.equal(assembleProblem({ ...PURSE, body: 'pass' }).lineOffset, 4);
    assert.equal(assembleProblem({ ...STACK, body: 'pass' }).lineOffset, 1);
  });
});
