// tests/html.test.js — Validate HTML templates and cross-references with app.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf-8');
const appJs = readFileSync(join(ROOT, 'src', 'app.js'), 'utf-8');
const modelJs = readFileSync(join(ROOT, 'src', 'model.js'), 'utf-8');

// ────────────────────────────────────────────────────────────────────────────────
// Template IDs
// ────────────────────────────────────────────────────────────────────────────────
describe('HTML template integrity', () => {
  const templateIds = [...html.matchAll(/id="(tpl-[^"]+)"/g)].map(m => m[1]);

  it('has all expected templates', () => {
    const expected = [
      'tpl-main-menu', 'tpl-initial', 'tpl-encounter',
      'tpl-encounter-fill-blank', 'tpl-encounter-matching',
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
    const refs = [...appJs.matchAll(/["'](tpl-[^"']+)["']/g)].map(m => m[1]);
    for (const ref of refs) {
      assert.ok(templateIds.includes(ref),
        `app.js references template "${ref}" but it doesn't exist in index.html`);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// data-ref attributes
// ────────────────────────────────────────────────────────────────────────────────
describe('data-ref cross-references', () => {
  const htmlRefs = new Set([...html.matchAll(/data-ref="([^"]+)"/g)].map(m => m[1]));
  // Match the pattern $(root, "[data-ref=foo]") used throughout app.js
  const jsDollarRefs = [...appJs.matchAll(/\[data-ref=(\w+)\]/g)].map(m => m[1]);

  it('every data-ref used in app.js exists in HTML', () => {
    for (const ref of jsDollarRefs) {
      assert.ok(htmlRefs.has(ref),
        `app.js uses data-ref="${ref}" but it doesn't exist in index.html`);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// data-action attributes
// ────────────────────────────────────────────────────────────────────────────────
describe('data-action cross-references', () => {
  const htmlActions = new Set([...html.matchAll(/data-action="([^"]+)"/g)].map(m => m[1]));
  const jsActions = [...appJs.matchAll(/\[data-action=(\w+)\]/g)].map(m => m[1]);

  it('every data-action used in app.js exists in HTML', () => {
    for (const action of jsActions) {
      assert.ok(htmlActions.has(action),
        `app.js uses data-action="${action}" but it doesn't exist in index.html`);
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

  it('app.js does not reference weapon.name, armor.name, or old equipment fields', () => {
    assert.ok(!appJs.includes('weapon.name'), 'stale weapon.name in app.js');
    assert.ok(!appJs.includes('armor.name'), 'stale armor.name in app.js');
    assert.ok(!appJs.includes('armor.defense'), 'stale armor.defense in app.js');
    assert.ok(!appJs.includes('weapon.attack_die'), 'stale weapon.attack_die in app.js');
  });

  it('index.html includes the revive HUD ref', () => {
    assert.ok(html.includes('data-ref="pRevive"'), 'missing pRevive in index.html');
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
