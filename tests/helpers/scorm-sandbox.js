// tests/helpers/scorm-sandbox.js — run the real SCORM shim against a fake LMS.
//
// The shim is a plain script meant for an LMS frame, so it is evaluated in a vm
// sandbox with a stubbed SCORM 1.2 API, localStorage and just enough DOM. Shared
// by scorm.test.js (the shim alone) and dataloss.test.js (the shim together with
// the real game), so both are exercised against one and the same fake LMS.
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const src = await readFile(
  new URL('../../SCORM/templates/scorm-shim.js', import.meta.url), 'utf8');

export const SET_COUNT = 12;
export const setId = i => `set_${String(i).padStart(2, '0')}.json`;
export const doneRec = ms => JSON.stringify({ completedAt: new Date(ms).toISOString(), score_pct: 100 });
export const tierRec = (tier, ms) => JSON.stringify({
  tier,
  apprenticeAt: new Date(ms).toISOString(),
  journeymanAt: new Date(ms).toISOString(),
  masterAt: new Date(ms).toISOString(),
});

/**
 * Boot the shim in a sandbox. Returns handles on the fake LMS and browser.
 *
 * `control` is a live switchboard for everything that goes wrong in the field,
 * and can be flipped mid-test: `down` (the LMS refuses writes — an expired
 * session, a dropped connection), `initFails`, `noApi` (the LMS has not put its
 * API in place yet), `catalogFails`, and `throws` (the API throws outright).
 * An LMS that is down keeps NOTHING: writes made while `down` do not reach
 * lmsStore, exactly as a real one would lose them.
 */
export function boot({ lmsStore = {}, local = {}, catalogFails = false, readyState = 'complete', control = {}, storage = null, single = null, crossOriginParent = false } = {}) {
  if (catalogFails) control.catalogFails = true;
  // Pass `storage` to launch again in the SAME browser: what it held survives.
  storage = storage || makeStorage(local);
  const calls = [];
  let snapshot = {};
  let pending = {};
  const guard = () => { if (control.throws) throw new Error('LMS unreachable'); };
  const api = {
    LMSInitialize: () => {
      calls.push('init'); guard();
      if (control.initFails || control.down) return 'false';
      // Many LMS players load the data model once, at initialise, and answer
      // every later GetValue from that copy. `cachedReads` models those; the
      // default models one that reads through to the server.
      snapshot = { ...lmsStore };
      return 'true';
    },
    // `persistOnFinish` models an LMS player that answers "true" to every SetValue
    // and Commit but only sends the data to its server when the content calls
    // LMSFinish. Against one of those, a session that never finishes saves NOTHING,
    // whatever Commit said — which is what the live D2L course appeared to be doing.
    LMSFinish: () => {
      calls.push('finish'); guard();
      if (control.persistOnFinish) { Object.assign(lmsStore, pending); pending = {}; }
      return 'true';
    },
    LMSGetValue: k => {
      guard();
      const from = control.cachedReads || control.persistOnFinish ? snapshot : lmsStore;
      return k in from ? from[k] : '';
    },
    LMSSetValue: (k, v) => {
      guard();
      if (control.down) return 'false';
      if (control.persistOnFinish) pending[k] = String(v); else lmsStore[k] = String(v);
      snapshot[k] = String(v);
      return 'true';
    },
    LMSCommit: () => { calls.push('commit'); guard(); return control.down ? 'false' : 'true'; },
    LMSGetLastError: () => (control.down ? '101' : '0'),
  };
  const handlers = {};
  const listen = prefix => (type, fn) => { (handlers[prefix + type] ||= []).push(fn); };
  const dispatched = [];
  const win = {
    get API() { return control.noApi ? undefined : api; },
    localStorage: storage, addEventListener: listen(''), setInterval: () => 0,
    dispatchEvent: ev => { dispatched.push(ev.type); return true; },
  };
  win.parent = win;
  // A frame above this one on another domain (D2L's own pages around its player,
  // D2L inside Teams): reachable as window.parent, but reading anything on it throws.
  if (crossOriginParent) {
    const foreign = {};
    Object.defineProperty(foreign, 'API', { get() { throw new Error('SecurityError: Blocked a frame from accessing a cross-origin frame.'); } });
    foreign.parent = foreign;
    win.parent = foreign;
  }
  win.self = win;
  // A single-set package: the build writes the set's id into the page, and the
  // package is worth full credit the moment that one set is cleared.
  if (single) win.LOTRD_SINGLE_SET = single;
  const elements = [];
  const quiet = { warn: () => {}, log: () => {}, error: () => {} };
  const ctx = vm.createContext({
    window: win, localStorage: storage, console: quiet, setInterval: () => 0,
    Date, JSON, Math, Number, Array, Object, String, Boolean, isNaN, parseInt, parseFloat,
    Event: class { constructor(type) { this.type = type; } },
    document: {
      readyState,
      addEventListener: listen('doc:'),
      createElement: () => {
        const el = { style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, appendChild() {}, offsetHeight: 30 };
        elements.push(el);
        return el;
      },
      body: { appendChild() {}, style: {} },
      hidden: false,
    },
    getComputedStyle: () => ({ paddingTop: '0px' }),
    fetch: async () => {
      if (control.catalogFails) throw new Error('network down');
      return {
        json: async () => [{
          topic: 'T',
          sets: Array.from({ length: SET_COUNT }, (_, i) => ({ id: setId(i + 1) })),
        }],
      };
    },
  });
  vm.runInContext(src, ctx);
  return {
    ctx, lmsStore, storage, control, calls, dispatched,
    shim: () => ctx.window.LotrdScorm,
    /** Fire a captured listener: 'pagehide', 'doc:visibilitychange', … */
    fire: (type, ev = {}) => (handlers[type] || []).map(fn => fn(ev)),
    banner: () => elements[0] || null,
  };
}

/** A localStorage stand-in. Iterable like the real one: the game walks its keys. */
export function makeStorage(initial = {}) {
  return {
    _d: { ...initial },
    getItem(k) { return k in this._d ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
    clear() { this._d = {}; },
    key(i) { return Object.keys(this._d)[i] ?? null; },
    get length() { return Object.keys(this._d).length; },
  };
}

/** The shim's start() is async; let its microtasks drain. */
export const settle = () => new Promise(r => setTimeout(r, 20));
