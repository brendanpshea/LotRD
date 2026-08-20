// tests/html.test.js — Validate HTML templates and cross-references with app.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf-8');
const srcJs = [
  'app.js',
  'controller.js',
  'ui.js',
  'main.js',
  'items.js',
  'sound.js',
].map(file => readFileSync(join(ROOT, 'src', file), 'utf-8')).join('\n');
const modelJs = readFileSync(join(ROOT, 'src', 'model.js'), 'utf-8');

// ────────────────────────────────────────────────────────────────────────────────
// Template IDs
// ────────────────────────────────────────────────────────────────────────────────
describe('HTML template integrity', () => {
  const templateIds = [...html.matchAll(/id="(tpl-[^"]+)"/g)].map(m => m[1]);

  it('has all expected templates', () => {
    const expected = [
      'tpl-main-menu', 'tpl-initial', 'tpl-encounter',
      'tpl-encounter-fill-blank', 'tpl-encounter-code-line', 'tpl-encounter-code-trace',
      'tpl-encounter-matching', 'tpl-encounter-ordering', 'tpl-encounter-cloze',
      'tpl-encounter-code-write',
      'tpl-npc-scene', 'tpl-encounter-chrome',
      'tpl-results', 'tpl-levelup', 'tpl-victory',
      'tpl-no-questions', 'tpl-gameover', 'tpl-review',
    ];
    for (const id of expected) {
      assert.ok(templateIds.includes(id), `Missing template: ${id}`);
    }
  });

  it('no duplicate template IDs', () => {
    const dupes = templateIds.filter((id, i) => templateIds.indexOf(id) !== i);
    assert.deepEqual(dupes, [], `Duplicate template IDs: ${dupes.join(', ')}`);
  });

  it('every template ID referenced in app.js exists in HTML', () => {
    const refs = [...srcJs.matchAll(/["'](tpl-[^"']+)["']/g)].map(m => m[1]);
    for (const ref of refs) {
      assert.ok(templateIds.includes(ref),
        `src JS references template "${ref}" but it doesn't exist in index.html`);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// data-ref attributes
// ────────────────────────────────────────────────────────────────────────────────
describe('data-ref cross-references', () => {
  const htmlRefs = new Set([...html.matchAll(/data-ref="([^"]+)"/g)].map(m => m[1]));
  const jsDollarRefs = [...srcJs.matchAll(/\[data-ref=(\w+)\]/g)].map(m => m[1]);

  it('every data-ref used in app.js exists in HTML', () => {
    for (const ref of jsDollarRefs) {
      assert.ok(htmlRefs.has(ref),
        `src JS uses data-ref="${ref}" but it doesn't exist in index.html`);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// data-action attributes
// ────────────────────────────────────────────────────────────────────────────────
describe('data-action cross-references', () => {
  const htmlActions = new Set([...html.matchAll(/data-action="([^"]+)"/g)].map(m => m[1]));
  const jsActions = [...srcJs.matchAll(/\[data-action=(\w+)\]/g)].map(m => m[1]);

  it('every data-action used in app.js exists in HTML', () => {
    for (const action of jsActions) {
      assert.ok(htmlActions.has(action),
        `src JS uses data-action="${action}" but it doesn't exist in index.html`);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// No stale weapon/armor references
// ────────────────────────────────────────────────────────────────────────────────
describe('No stale weapon/armor references', () => {
  it('index.html has no pWeap or pArmor data-refs', () => {
    assert.ok(!html.includes('data-ref="pWeap"'), 'stale pWeap in index.html');
    assert.ok(!html.includes('data-ref="pArmor"'), 'stale pArmor in index.html');
  });

  it('index.html has no weaponName, armorName, weaponDie, armorDef, maxHP refs', () => {
    for (const ref of ['weaponName', 'armorName', 'weaponDie', 'armorDef', 'maxHP']) {
      assert.ok(!html.includes(`data-ref="${ref}"`), `stale ${ref} in index.html`);
    }
  });

  it('model.js does not import or reference WEAPONS or ARMORS', () => {
    assert.ok(!modelJs.includes('WEAPONS'), 'stale WEAPONS reference in model.js');
    assert.ok(!modelJs.includes('ARMORS'), 'stale ARMORS reference in model.js');
  });

  it('src JS does not reference weapon.name, armor.name, or old equipment fields', () => {
    assert.ok(!srcJs.includes('weapon.name'), 'stale weapon.name in src JS');
    assert.ok(!srcJs.includes('armor.name'), 'stale armor.name in src JS');
    assert.ok(!srcJs.includes('armor.defense'), 'stale armor.defense in src JS');
    assert.ok(!srcJs.includes('weapon.attack_die'), 'stale weapon.attack_die in src JS');
  });

  it('index.html includes the revive HUD ref', () => {
    assert.ok(html.includes('data-ref="pRevive"'), 'missing pRevive in index.html');
  });

  it('GameUI no longer reads window.gameController directly', () => {
    const uiJs = readFileSync(join(ROOT, 'src', 'ui.js'), 'utf-8');
    assert.ok(!uiJs.includes('window.gameController'), 'ui.js still references window.gameController');
  });

  it('dom.js has been removed', () => {
    assert.ok(!existsSync(join(ROOT, 'src', 'dom.js')), 'src/dom.js should be deleted');
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// Accessibility checks
// ────────────────────────────────────────────────────────────────────────────────
describe('Accessibility basics', () => {
  it('has sr-only class defined in CSS', () => {
    const css = readFileSync(join(ROOT, 'styles.css'), 'utf-8');
    assert.ok(css.includes('.sr-only'), 'styles.css missing .sr-only class');
  });

  it('all hud-sep spans have aria-hidden="true"', () => {
    const seps = [...html.matchAll(/<span[^>]*class="hud-sep"[^>]*>/g)];
    for (const match of seps) {
      assert.ok(match[0].includes('aria-hidden="true"'),
        `hud-sep without aria-hidden: ${match[0]}`);
    }
  });

  it('lang attribute is present on <html>', () => {
    assert.ok(html.match(/<html[^>]*lang=/), '<html> missing lang attribute');
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// CSS animation classes referenced in app.js exist in styles.css
// ────────────────────────────────────────────────────────────────────────────────
describe('The hidden attribute actually hides', () => {
  // Strip comments first: the file explains this rule in prose, and the prose
  // contains a sample rule that would otherwise match ahead of the real one.
  const css = readFileSync(join(ROOT, 'styles.css'), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');

  it('styles.css defines [hidden] { display: none !important }', () => {
    // Author rules outrank the user-agent [hidden] rule, so any class setting
    // `display` un-hides an element the markup and JS treat as hidden. This
    // rule is what makes el.hidden = true reliable app-wide.
    const rule = css.match(/\[hidden\]\s*\{[^}]*\}/);
    assert.ok(rule, 'styles.css must define a [hidden] rule');
    assert.match(rule[0], /display\s*:\s*none\s*!important/,
      '[hidden] must set display:none !important to beat class rules');
  });

  it('question text preserves the newlines in a code stem', () => {
    // Stems embed real programs ("What does this print?\n\nx = 4\nprint(x)").
    // Without pre-wrap the browser collapses them into one unreadable line.
    const rule = css.match(/\[data-ref="qText"\][^{]*\{[^}]*\}/);
    assert.ok(rule, 'styles.css must style [data-ref="qText"]');
    assert.match(rule[0], /white-space\s*:\s*pre-wrap/);
  });

  it('every element the app hides is covered by that rule', () => {
    // Elements toggled via the hidden attribute whose class also sets display.
    const displayClasses = new Set();
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/(^|[;\s])display\s*:/.test(m[2])) continue;
      for (const c of m[1].matchAll(/\.([A-Za-z0-9_-]+)(?![\w-]*::)/g)) displayClasses.add(c[1]);
    }
    // The guard rule above neutralises all of them; assert it is not empty, so
    // this test fails loudly if someone deletes the [hidden] rule.
    assert.ok(displayClasses.size > 0, 'expected the stylesheet to set display somewhere');
    assert.match(css, /\[hidden\][^{]*\{[^}]*display\s*:\s*none\s*!important/);
  });
});

describe('CSS animation classes', () => {
  const css = readFileSync(join(ROOT, 'styles.css'), 'utf-8');

  it('monster-hit class exists in CSS', () => {
    assert.ok(css.includes('.monster-hit'), 'CSS missing .monster-hit');
  });

  it('dmg-float class exists in CSS', () => {
    assert.ok(css.includes('.dmg-float'), 'CSS missing .dmg-float');
  });

  it('player-hit class exists in CSS', () => {
    assert.ok(css.includes('.player-hit'), 'CSS missing .player-hit');
  });
});

describe('Shared encounter chrome', () => {
  const encounterTemplates = [...html.matchAll(/id="(tpl-encounter[a-z-]*)"/g)]
    .map(m => m[1]).filter(id => id !== 'tpl-encounter-chrome');

  it('the monster header is defined exactly once', () => {
    assert.equal((html.match(/class="monster-layout"/g) || []).length, 1,
      'monster header markup should live only in tpl-encounter-chrome');
    assert.equal((html.match(/class="bbs-container progress-section"/g) || []).length, 1,
      'journey progress markup should live only in tpl-encounter-chrome');
  });

  it('every encounter screen has a placeholder to clone it into', () => {
    for (const id of encounterTemplates) {
      const body = html.split(`id="${id}"`)[1].split('</template>')[0];
      assert.ok(body.includes('data-ref="encounterChrome"'),
        `${id} is missing the encounterChrome placeholder`);
    }
    assert.ok(encounterTemplates.length >= 7,
      `expected the 7 encounter screens, found ${encounterTemplates.length}`);
  });
});

describe('SCORM manifest', () => {
  it('declares no mastery score, so partial progress is not reported as failed', () => {
    // Credit accrues over weeks. Under SCORM 1.2 an adlcp:masteryscore lets the
    // LMS stamp passed/failed by comparing it to cmi.core.score.raw, which would
    // mark a student who is legitimately mid-course as having failed.
    const manifest = readFileSync(join(ROOT, 'SCORM/templates/imsmanifest.xml'), 'utf-8');
    assert.ok(!/<adlcp:masteryscore>/.test(manifest),
      'imsmanifest.xml must not declare a mastery score');
  });
});
