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
      'tpl-encounter-fill-blank', 'tpl-encounter-code-line', 'tpl-encounter-matching',
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
