// tests/ui.test.js — UI logic that can be exercised without a DOM.
//
// `_shiftCodeLines` never touches `this` or the document: it reads and writes
// the four textarea properties it is given. That makes it testable here with a
// plain object standing in for the textarea, which matters because it is the
// only way to indent on a phone — a soft keyboard has no Tab key, and Python
// without indentation is a syntax error rather than a wrong answer.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GameUI } from '../src/ui.js';

const shift = (textarea, opts) => GameUI.prototype._shiftCodeLines(textarea, opts);

/** A stand-in for the editor: `text` with the caret marked by | (or |…| for a selection). */
function editor(marked) {
  const first = marked.indexOf('|');
  const rest = marked.indexOf('|', first + 1);
  const value = marked.replace(/\|/g, '');
  return {
    value,
    selectionStart: first,
    selectionEnd: rest === -1 ? first : rest - 1,
  };
}

/** Render an editor back to the |-marked form, so failures read as text. */
function marked(ta) {
  const { value, selectionStart: a, selectionEnd: b } = ta;
  return a === b
    ? value.slice(0, a) + '|' + value.slice(a)
    : value.slice(0, a) + '|' + value.slice(a, b) + '|' + value.slice(b);
}

describe('code editor indentation (the touch path)', () => {
  it('indents the caret line and carries the caret with it', () => {
    const ta = editor('total = 0\nre|turn total');
    shift(ta, {});
    assert.equal(marked(ta), 'total = 0\n    re|turn total');
  });

  it('dedents by one level, and stops at the margin', () => {
    const ta = editor('        x = |1');
    shift(ta, { dedent: true });
    assert.equal(marked(ta), '    x = |1');
    shift(ta, { dedent: true });
    assert.equal(marked(ta), 'x = |1');
    shift(ta, { dedent: true });
    assert.equal(marked(ta), 'x = |1', 'dedent at the margin is a no-op');
  });

  it('eats a partial indent rather than overshooting into the code', () => {
    const ta = editor('  x = |1');
    shift(ta, { dedent: true });
    assert.equal(marked(ta), 'x = |1');
  });

  it('keeps the caret inside its line when the indent it sat in is removed', () => {
    const ta = editor('  |  x = 1');
    shift(ta, { dedent: true });
    assert.equal(ta.selectionStart, 0);
    assert.equal(ta.selectionEnd, 0);
    assert.equal(ta.value, 'x = 1');
  });

  it('shifts every line a selection touches, and keeps them selected', () => {
    const ta = editor('|for i in range(n):\n    total += i|\nreturn total');
    shift(ta, {});
    assert.equal(
      marked(ta),
      '|    for i in range(n):\n        total += i|\nreturn total');
  });

  it('dedents a whole selected block', () => {
    const ta = editor('    |a = 1\n    b = 2|');
    shift(ta, { dedent: true });
    assert.equal(ta.value, 'a = 1\nb = 2');
  });

  it('indents an empty line, so a student can step in before typing', () => {
    const ta = editor('if n > 0:\n|');
    shift(ta, {});
    assert.equal(marked(ta), 'if n > 0:\n    |');
  });

  it('leaves the rest of the program untouched', () => {
    const ta = editor('a = 1\n|b = 2\nc = 3');
    shift(ta, {});
    assert.equal(ta.value, 'a = 1\n    b = 2\nc = 3');
  });
});

describe('code-write editor markup', () => {
  const html = readFileSync(join(import.meta.dirname, '..', 'index.html'), 'utf-8');
  const template = html.slice(
    html.indexOf('<template id="tpl-encounter-code-write">'),
    html.indexOf('</template>', html.indexOf('<template id="tpl-encounter-code-write">')));

  // The JS binds these through a template literal, so the data-action
  // cross-check in html.test.js cannot see them. Without a check here, deleting
  // a button would leave phone users unable to indent and every test still green.
  it('offers both indent controls', () => {
    assert.match(template, /data-action="indent"/);
    assert.match(template, /data-action="outdent"/);
  });

  it('labels them for screen readers', () => {
    const labels = [...template.matchAll(/class="code-tool-btn"[^>]*\n?[^>]*aria-label="([^"]+)"/g)];
    assert.equal(labels.length, 2, 'both indent controls need an aria-label');
  });

  it('does not promise Tab as the only way in', () => {
    const help = html.slice(html.indexOf('id="code-write-help"'), html.indexOf('code-write-results'));
    assert.match(help, /indent buttons/,
      'the help text must mention the buttons, not just Tab');
  });
});
