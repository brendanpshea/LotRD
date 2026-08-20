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
import { highlightPython } from '../src/highlight.js';

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
    const start = html.indexOf('id="code-write-help"');
    const help = html.slice(start, html.indexOf('</div>', html.indexOf('</details>', start)));
    assert.match(help, /indent buttons/,
      'the help text must mention the buttons, not just Tab');
  });

  // Submit is the only irreversible control on this screen. Run is tapped over
  // and over; if a redesign ever moves Submit into that pinned row, the two end
  // up under the same thumb.
  it('keeps Submit out of the pinned action row', () => {
    const row = template.slice(template.indexOf('class="code-write-actions"'),
                               template.indexOf('id="code-write-help"'));
    assert.match(row, /data-action="run"/, 'Run belongs in the pinned row');
    assert.doesNotMatch(row, /data-action="submit"/,
      'Submit must not sit in the row that pins under the thumb');
  });
});

// The highlighted copy is painted on top of the textarea the student types in.
// It only stays on top while it contains exactly the same characters: one
// swallowed or invented character slides every colour after it off the caret.
describe('highlighting preserves the text underneath it', () => {
  const strip = html => html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

  const sources = [
    'return a + b',
    'if weekday and not holiday:\n    return False   # go to work',
    'total = 0\nfor i in range(n):\n    total += i\nreturn total',
    'return "return is not a keyword in here"',
    "return 'if' + '#not a comment'",
    'return a < b and c > d and e & f',
    'return len(s) + 12 + 3.5',
    'x = {"a": 1}\nreturn x["a"]',
    '',
    '\n\n',
  ];

  for (const src of sources) {
    it(`round-trips ${JSON.stringify(src.slice(0, 34))}`, () => {
      assert.equal(strip(highlightPython(src)), src);
    });
  }

  it('escapes markup so a student cannot break the layer with their own code', () => {
    const out = highlightPython('return "<script>x</script>"');
    assert.ok(!/<script>/.test(out), 'raw markup must not survive into the layer');
    assert.match(out, /&lt;script&gt;/);
  });

  it('colours keywords and leaves ordinary names alone', () => {
    const out = highlightPython('return weekday');
    assert.match(out, /class="hl-kw">return</);
    assert.ok(!/hl-kw">weekday/.test(out));
  });
});

// The gutter, the highlighted copy and the textarea are three stacked layers.
// Anything that decides where a character lands has to be set on all three at
// once, or they drift apart — so the stylesheet must never size one alone.
describe('editor layers stay in lockstep', () => {
  const css = readFileSync(join(import.meta.dirname, '..', 'styles.css'), 'utf-8');
  const METRICS = /(^|[;{\s])(font-size|font-family|line-height|tab-size|padding|padding-top|padding-left|letter-spacing)\s*:/;

  // Split into rules: everything up to a { is the selector, then the body.
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(m => ({ selector: m[1].trim(), body: m[2] }));

  it('never sets a metric on the textarea without setting it on the overlay', () => {
    const offenders = rules
      .filter(r => /\.code-write-body(?![\w-])/.test(r.selector))
      .filter(r => METRICS.test(r.body))
      .filter(r => !/\.code-highlight/.test(r.selector))
      .map(r => `${r.selector} { ${r.body.trim().slice(0, 60)}… }`);
    assert.deepEqual(offenders, [],
      'these rules would move the textarea text without moving the highlight layer');
  });

  it('never sets a metric on the overlay without setting it on the textarea', () => {
    const offenders = rules
      .filter(r => /\.code-highlight(?![\w-])/.test(r.selector))
      .filter(r => METRICS.test(r.body))
      .filter(r => !/\.code-write-body/.test(r.selector))
      .map(r => `${r.selector} { ${r.body.trim().slice(0, 60)}… }`);
    assert.deepEqual(offenders, [], 'these rules would move the highlight layer off the caret');
  });

  it('keeps the overlay from bolding or slanting what the textarea draws plain', () => {
    const palette = rules.filter(r => /\.code-highlight\s+\.hl-/.test(r.selector));
    assert.ok(palette.length > 0, 'the overlay needs its own palette');
    for (const rule of palette) {
      assert.ok(!/font-weight:\s*(bold|[6-9]00)/.test(rule.body),
        `${rule.selector} bolds text the textarea draws at normal weight`);
      assert.ok(!/font-style:\s*italic|font-style:\s*oblique/.test(rule.body),
        `${rule.selector} slants text the textarea draws upright`);
    }
  });
});
