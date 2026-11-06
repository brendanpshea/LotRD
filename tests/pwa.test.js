// The game as an installable app: manifest.webmanifest, the icons, sw.js and
// src/pwa.js. What matters most is what must NOT happen: an LMS package (or any
// page with the SCORM shim) registering a service worker, and a worker that
// serves an old question set while the network is there to give the new one.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { shouldRegister, describePage } from '../src/pwa.js';

const ROOT = join(import.meta.dirname, '..');
const read = rel => readFileSync(join(ROOT, rel), 'utf-8');
const html = read('index.html');
const manifest = JSON.parse(read('manifest.webmanifest'));

/** Width and height of a PNG, from its IHDR chunk. */
function pngSize(rel) {
  const bytes = readFileSync(join(ROOT, rel));
  assert.equal(bytes.toString('ascii', 1, 4), 'PNG', `${rel} is not a PNG`);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

describe('the web app manifest', () => {
  it('names the app and opens it where the page is, as an app of its own', () => {
    assert.ok(manifest.name && manifest.short_name && manifest.short_name.length <= 12);
    // Relative, so the same files work at a site's root and under /LotRD/ on GitHub Pages.
    assert.equal(manifest.start_url, './');
    assert.equal(manifest.scope, './');
    assert.equal(manifest.display, 'standalone');
  });

  it('has the icons an install needs, each the size it claims', () => {
    for (const icon of manifest.icons) {
      assert.ok(existsSync(join(ROOT, icon.src)), `${icon.src} is missing`);
      const [w, h] = pngSize(icon.src);
      assert.equal(`${w}x${h}`, icon.sizes, `${icon.src} is ${w}x${h}, not ${icon.sizes}`);
    }
    const any = manifest.icons.filter(i => (i.purpose || 'any').split(' ').includes('any')).map(i => i.sizes);
    assert.ok(any.includes('192x192') && any.includes('512x512'), 'needs 192 and 512 icons for "any"');
    assert.ok(manifest.icons.some(i => (i.purpose || '').includes('maskable')), 'needs a maskable icon');
  });

  it('matches the page it is linked from', () => {
    const theme = /<meta name="theme-color" content="([^"]+)">/.exec(html)?.[1];
    assert.equal(theme, manifest.theme_color);
    assert.equal(manifest.background_color, '#030903', 'the splash screen should be the game\'s own background');
  });
});

describe('index.html links the app, in a block the SCORM build removes', () => {
  const START = '<!-- pwa:', END = '<!-- /pwa -->';
  const build = read('SCORM/build.py');
  const block = html.slice(html.indexOf(START), html.indexOf(END) + END.length);

  it('has exactly one such block, inside <head>', () => {
    assert.equal(html.split(START).length - 1, 1);
    assert.equal(html.split(END).length - 1, 1);
    assert.ok(html.indexOf(END) < html.indexOf('</head>'));
  });

  it('build.py removes that block, by the same markers', () => {
    assert.ok(build.includes('<!-- pwa:') && build.includes('<!-- /pwa -->'),
      'build.py has to strip the block between these markers from every package');
  });

  it('links nothing outside the block that a package lacks', () => {
    const rest = html.replace(block, '');
    assert.ok(!/rel="manifest"|icons\//.test(rest), 'a manifest or icon link outside the block would ship in packages');
  });

  it('links only files that exist', () => {
    for (const [, href] of block.matchAll(/href="([^"]+)"/g)) assert.ok(existsSync(join(ROOT, href)), `${href} is missing`);
  });
});

// ── sw.js, run against a fake cache and a fake network ─────────────────────────

const ORIGIN = 'https://example.org';
const BASE = `${ORIGIN}/LotRD/`;

/** Load sw.js in a sandbox; return its event handlers and the pieces to drive them. */
function loadWorker({ online = () => true } = {}) {
  const handlers = {};
  const stores = new Map();                      // cache name -> Map(url -> Response)
  const resolve = input => (typeof input === 'string' ? new URL(input, BASE).href : input.url);
  const store = name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const entries = stores.get(name);
    return {
      entries,
      async put(req, res) { entries.set(resolve(req), res); },
      async addAll(reqs) { for (const r of reqs) entries.set(resolve(r), await sandbox.fetch(r)); },
      async match(req, opts = {}) {
        const want = new URL(resolve(req));
        for (const [url, res] of entries) {
          const have = new URL(url);
          if (have.href === want.href || (opts.ignoreSearch && have.origin + have.pathname === want.origin + want.pathname)) return res.clone();
        }
        return undefined;
      },
    };
  };
  const fetched = [];
  const sandbox = {
    URL, Response, Headers, console,
    // Relative URLs resolve against the worker, as in a browser. A page load's
    // "navigate" mode is one only the browser can give a request, so it is set here.
    Request: class extends Request {
      constructor(input, init = {}) {
        const { mode, ...rest } = init;
        super(typeof input === 'string' ? new URL(input, BASE).href : input, mode === 'navigate' ? rest : init);
        if (mode === 'navigate') Object.defineProperty(this, 'mode', { value: 'navigate' });
      }
    },
    self: {
      location: new URL(`${BASE}sw.js`),
      addEventListener: (type, fn) => { handlers[type] = fn; },
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
    caches: {
      open: async name => store(name),
      keys: async () => [...stores.keys()],
      delete: async name => stores.delete(name),
    },
    fetch: async req => {
      const url = resolve(req);
      fetched.push(url);
      if (!online(url)) throw new TypeError('Failed to fetch');
      // Every response is basic and from the network, as same-origin ones are in a browser.
      const res = new Response(`body of ${url}`, { status: url.endsWith('/missing.json') ? 404 : 200 });
      Object.defineProperty(res, 'type', { value: 'basic' });
      return res;
    },
  };
  sandbox.self.caches = sandbox.caches;
  const source = read('sw.js');
  vm.runInNewContext(`${source}\n;globalThis.__PRECACHE = PRECACHE; globalThis.__CACHE = CACHE; globalThis.__handles = handles;`, sandbox);
  /** Fire a fetch event the way the browser does; return what the worker answered, or null if it stayed out. */
  const request = async (path, init = {}) => {
    let answer = null;
    const req = new sandbox.Request(path, init);
    handlers.fetch({ request: req, respondWith: p => { answer = p; } });
    return answer;
  };
  const lifecycle = async type => { let p; handlers[type]({ waitUntil: x => { p = x; } }); await p; };
  return { sandbox, stores, fetched, request, lifecycle, PRECACHE: sandbox.__PRECACHE, CACHE: sandbox.__CACHE, handles: sandbox.__handles };
}

describe('sw.js keeps what the game needs to open', () => {
  const { PRECACHE } = loadWorker();

  it('lists only files that exist', () => {
    for (const path of PRECACHE) assert.ok(existsSync(join(ROOT, path)), `sw.js precaches ${path}, which does not exist`);
  });

  it('lists every module of the game, so it starts with no network', () => {
    for (const name of readdirSync(join(ROOT, 'src')).filter(f => f.endsWith('.js'))) {
      assert.ok(PRECACHE.includes(`src/${name}`), `src/${name} is not in sw.js's PRECACHE`);
    }
  });

  it('lists the page, the menu\'s data, and every file the manifest names', () => {
    for (const path of ['index.html', 'styles.css', 'manifest.webmanifest', 'question_sets/catalog.json',
      'question_sets/index.json', 'assets/monsters.json', 'assets/npcs.json', 'assets/dragon_lines.json',
      ...manifest.icons.map(i => i.src)]) {
      assert.ok(PRECACHE.includes(path), `${path} is not in sw.js's PRECACHE`);
    }
  });

  it('installs by fetching the whole list into its cache', async () => {
    const w = loadWorker();
    await w.lifecycle('install');
    const kept = w.stores.get(w.CACHE);
    for (const path of w.PRECACHE) assert.ok(kept.has(new URL(path, BASE).href), `${path} was not kept on install`);
  });
});

describe('sw.js serves the network first', () => {
  it('online, answers from the network and keeps the answer', async () => {
    const w = loadWorker();
    const res = await w.request('question_sets/java_01_basics.json');
    assert.equal(await res.text(), `body of ${BASE}question_sets/java_01_basics.json`);
    assert.ok(w.stores.get(w.CACHE).has(`${BASE}question_sets/java_01_basics.json`));
  });

  it('online, never answers from the cache, so a changed set arrives at once', async () => {
    const w = loadWorker();
    await w.request('question_sets/java_01_basics.json');
    w.fetched.length = 0;
    await (await w.request('question_sets/java_01_basics.json')).text();
    assert.deepEqual(w.fetched, [`${BASE}question_sets/java_01_basics.json`]);
  });

  it('offline, answers with what it kept', async () => {
    let up = true;
    const w = loadWorker({ online: () => up });
    await w.request('question_sets/java_01_basics.json');
    up = false;
    const res = await w.request('question_sets/java_01_basics.json');
    assert.equal(await res.text(), `body of ${BASE}question_sets/java_01_basics.json`);
  });

  it('offline, opens the page for any ?set= link', async () => {
    let up = true;
    const w = loadWorker({ online: () => up });
    await w.lifecycle('install');
    up = false;
    const res = await w.request(`${BASE}?set=java_01_basics.json`, { mode: 'navigate' });
    assert.equal(await res.text(), `body of ${BASE}index.html`);
  });

  it('offline, fails a request it never kept, as the network would', async () => {
    const w = loadWorker({ online: () => false });
    await assert.rejects(w.request('question_sets/never_seen.json'));
  });

  it('does not keep an error', async () => {
    const w = loadWorker();
    await w.request('question_sets/missing.json');
    assert.ok(!w.stores.get(w.CACHE)?.has(`${BASE}question_sets/missing.json`));
  });

  it('stays out of what it should not touch', () => {
    const { handles, sandbox } = loadWorker();
    const R = sandbox.Request;
    assert.equal(handles(new R('question_sets/catalog.json', { method: 'POST', body: '{}' })), false, 'a POST');
    assert.equal(handles(new R('https://cdn.example.com/lib.js')), false, 'another site');
    assert.equal(handles(new R('narration/val-abc.mp3')), false, 'narration');
    assert.equal(handles(new R('images/x.png', { headers: { Range: 'bytes=0-' } })), false, 'a byte range');
    assert.equal(handles(new R('images/x.png')), true);
  });

  it('on update, drops what an older version kept, and nobody else\'s cache', async () => {
    const w = loadWorker();
    await w.sandbox.caches.open('lotrd-v0');
    await w.sandbox.caches.open('another-app');
    await w.sandbox.caches.open(w.CACHE);
    await w.lifecycle('activate');
    assert.deepEqual([...w.stores.keys()].sort(), ['another-app', w.CACHE].sort());
  });
});

describe('src/pwa.js registers the worker only on the website', () => {
  const site = { hasServiceWorker: true, secure: true, hasManifest: true, inLms: false, topLevel: true };

  it('registers on the website, opened as a page of its own', () => assert.equal(shouldRegister(site), true));

  for (const [why, change] of [
    ['inside an LMS package', { inLms: true }],
    ['on a page without the manifest (a built package)', { hasManifest: false }],
    ['in a frame on someone else\'s page', { topLevel: false }],
    ['where the browser has no service workers', { hasServiceWorker: false }],
    ['on an insecure page', { secure: false }],
  ]) {
    it(`does not register ${why}`, () => assert.equal(shouldRegister({ ...site, ...change }), false));
  }

  /** A stand-in window with just what describePage reads. */
  const fakeWindow = ({ scripts = [], manifest = true, extra = {}, framed = false } = {}) => {
    const win = {
      navigator: { serviceWorker: {} },
      isSecureContext: true,
      document: {
        querySelector: sel => {
          if (sel.includes('manifest')) return manifest ? {} : null;
          if (sel.includes('scorm-shim')) return scripts.some(s => s.includes('scorm-shim')) ? {} : null;
          return null;
        },
      },
      ...extra,
    };
    win.self = win;
    win.top = framed ? {} : win;
    return win;
  };

  it('sees the SCORM shim, as a package and the browser tests load it', () => {
    assert.equal(describePage(fakeWindow({ scripts: ['scorm-shim.js'] })).inLms, true);
    assert.equal(describePage(fakeWindow({ extra: { LotrdScorm: {} } })).inLms, true);
    assert.equal(describePage(fakeWindow({ extra: { LOTRD_SINGLE_SET: 'java_01_basics.json' } })).inLms, true);
    assert.equal(describePage(fakeWindow()).inLms, false);
  });

  it('knows a framed page from a page of its own, even when the frame is another site', () => {
    assert.equal(describePage(fakeWindow({ framed: true })).topLevel, false);
    const crossOrigin = fakeWindow();
    Object.defineProperty(crossOrigin, 'top', { get() { throw new Error('cross-origin'); } });
    assert.equal(describePage(crossOrigin).topLevel, false);
    assert.equal(describePage(fakeWindow()).topLevel, true);
  });
});
