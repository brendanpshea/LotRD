// The symbol bar for touch keyboards: which keys an answer box gets, and how a key types.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { keysFor, needsSymbols, insertAtCaret, wantsKeyBar } from '../src/keybar.js';
import { straightenTyped } from '../src/util.js';

const inserts = keys => keys.map(k => k.insert);

describe('keysFor', () => {
  it('gives a number box the operators a number pad lacks, labelled as written by hand', () => {
    const keys = keysFor({ kind: 'math' });
    assert.deepEqual(inserts(keys), ['+', '-', '*', '/', '(', ')', '.', '^']);
    assert.equal(keys.find(k => k.insert === '*').label, '×');
    assert.equal(keys.find(k => k.insert === '/').label, '÷');
  });

  it('gives a number box that takes no arithmetic only a minus sign and a point', () => {
    assert.deepEqual(inserts(keysFor({ kind: 'math', expressions: false })), ['-', '.']);
  });

  it('chooses code keys by language', () => {
    assert.ok(inserts(keysFor({ kind: 'code', language: 'java' })).includes(';'));
    assert.ok(inserts(keysFor({ kind: 'code', language: 'Python' })).includes(':'));
    assert.ok(inserts(keysFor({ kind: 'code', language: 'Cisco IOS' })).includes('|'));
    assert.ok(inserts(keysFor({ kind: 'sql' })).includes('*'));
  });

  it('gives a typed word a bar only when no accepted answer can be typed without one', () => {
    assert.deepEqual(keysFor({ kind: 'text', answers: ['router', 'a router'] }), []);
    assert.deepEqual(keysFor({ kind: 'text', answers: ['COUNT(*)', 'count'] }), []);
    assert.ok(keysFor({ kind: 'text', answers: ['__init__'] }).length > 0);
    assert.ok(keysFor({ kind: 'text', answers: ['{'] }).length > 0);
  });

  it('shows the same keys whatever the answer is, so the bar gives nothing away', () => {
    assert.deepEqual(keysFor({ kind: 'text', answers: ['{'] }), keysFor({ kind: 'text', answers: ['%'] }));
  });
});

describe('needsSymbols', () => {
  it('is false for answers of letters, digits and everyday punctuation', () => {
    assert.equal(needsSymbols(['255.255.255.0', "don't", 'TCP 443', 'in-band']), false);
    assert.equal(needsSymbols([]), false);
  });
});

describe('insertAtCaret', () => {
  const box = (value, start, end = start) => ({
    value, selectionStart: start, selectionEnd: end, events: [],
    dispatchEvent(e) { this.events.push(e.type); },
  });

  it('types at the caret and replaces a selection', () => {
    const a = box('print x', 6);
    insertAtCaret(a, '(');
    assert.equal(a.value, 'print (x');
    const b = box('a + b', 2, 3);
    insertAtCaret(b, '*');
    assert.equal(b.value, 'a * b');
  });

  it('tells the box it changed, so highlighting and counters follow', () => {
    const a = box('', 0);
    insertAtCaret(a, ';');
    assert.deepEqual(a.events, ['input']);
  });
});

describe('wantsKeyBar', () => {
  it('is true only where the pointer is a finger', () => {
    assert.equal(wantsKeyBar({ matchMedia: q => ({ matches: q === '(pointer: coarse)' }) }), true);
    assert.equal(wantsKeyBar({ matchMedia: () => ({ matches: false }) }), false);
    assert.equal(wantsKeyBar({}), false);
  });
});

describe('straightenTyped', () => {
  it('puts back the quotes a phone keyboard curls', () => {
    assert.equal(straightenTyped('print(“hi”)'), 'print("hi")');
    assert.equal(straightenTyped('WHERE maker = ‘Gumley’'), "WHERE maker = 'Gumley'");
  });

  it('puts back a dash made from two hyphens, in code only', () => {
    assert.equal(straightenTyped('ls —all', { code: true }), 'ls --all');
    assert.equal(straightenTyped('a — b'), 'a — b');
  });

  it('reads a non-breaking space as a space', () => {
    assert.equal(straightenTyped('show vlan'), 'show vlan');
  });
});
