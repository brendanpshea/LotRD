// tests/helpers/browser-lms.js — the game in a real browser, against a fake LMS.
//
// A tiny HTTP server that is three things at once:
//   • the web server for the game, with the SCORM shim injected into index.html
//     the same way SCORM/build.py injects it;
//   • the LMS: one student's SCORM record, kept HERE, in the server — so it
//     outlives any one browser, which is the whole point. Two launches of Chrome
//     with different profiles are two devices sharing one LMS;
//   • the page D2L would wrap the activity in: it provides window.API (as
//     synchronous calls to this server) and frames the game.
//
// The wrapper page also carries a small script of things for "the student" to
// do, and leaves a JSON report in the DOM for --dump-dom to hand back.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Must stay identical to the tag SCORM/build.py replaces (html.test.js checks). */
export const MAIN_SCRIPT_TAG = '<script type="module" src="src/main.js"></script>';
export const SHIM_SCRIPT_TAG = '<script src="scorm-shim.js"></script>';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg',
};

const WRAPPER = `<!doctype html><meta charset="utf-8"><title>fake D2L</title>
<pre id="out">pending</pre>
<script>
  const post = (path, body) => { const x = new XMLHttpRequest(); x.open('POST', path, false); x.send(JSON.stringify(body || {})); return x.responseText; };
  window.API = {
    LMSInitialize: () => post('/__lms/init'), LMSFinish: () => 'true',
    LMSGetValue: k => post('/__lms/get', { k }), LMSSetValue: (k, v) => post('/__lms/set', { k, v: String(v) }),
    LMSCommit: () => post('/__lms/commit'), LMSGetLastError: () => '0',
    LMSGetErrorString: () => '', LMSGetDiagnostic: () => '',
  };
  const lms = { down: () => post('/__lms/control', { down: true }), up: () => post('/__lms/control', { down: false }),
    record: () => JSON.parse(post('/__lms/dump')) };

  const frame = document.createElement('iframe');
  frame.src = '/index.html'; frame.width = 420; frame.height = 900;
  document.body.appendChild(frame);
  const win = () => frame.contentWindow, doc = () => frame.contentDocument;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const until = async (test, what) => { for (let i = 0; i < 200; i++) { try { if (test()) return; } catch (_) {} await sleep(50); } throw new Error('timed out waiting for ' + what); };
  const banner = () => { const el = doc().getElementById('scorm-progress-banner'); return { text: el.textContent, role: el.getAttribute('role') }; };
  const menuText = () => doc().getElementById('game-root').innerText.replace(/\\n{2,}/g, '\\n');
  // The innermost element holding both the set's title and its buttons: its row in the topic list.
  const rowFor = title => { const all = [...doc().querySelectorAll('#game-root details *')].filter(e => e.querySelector('button') && e.innerText.includes(title)); return (all[all.length - 1] || {}).innerText || ''; };

  // The same steps a student's clicks take, minus the fifty questions: the run is
  // emptied and "Continue" pressed, which sends it down the real victory path.
  const openSet = async id => { const gc = win().gameController; await gc._launchSet(id, 'new'); await until(() => gc.model, 'the set to load'); gc.startAdventure(); return gc; };
  const clearSet = async id => { const gc = await openSet(id); gc.model.questions_to_ask = []; gc.model.current_question = null; gc.continueAdventure(); };
  const leaveMidSet = async (id, answered) => { const gc = await openSet(id); gc.model.current_question = null; gc.model.questions_to_ask.splice(0, answered); gc.continueAdventure(); };

  const SCENARIOS = {
    // Device one: D2L drops out, a set is cleared during the outage, D2L returns;
    // then a second set is left half-finished.
    async work({ clear, leave }) {
      const report = {};
      report.connected = banner();
      lms.down();
      await clearSet(clear);
      await sleep(3500);
      report.duringOutage = { banner: banner(), lmsKnowsTheSet: JSON.stringify(lms.record()).includes(clear) };
      lms.up();
      await sleep(7000);
      report.afterOutage = { banner: banner(), lmsKnowsTheSet: JSON.stringify(lms.record()).includes(clear), score: lms.record()['cmi.core.score.raw'] };
      await leaveMidSet(leave, 3);
      await sleep(500);
      report.lmsHasPosition = (lms.record()['cmi.suspend_data'] || '').includes(leave);
      return report;
    },
    // Device two: a browser that has never seen the game. Just look at the menu.
    async look({ clear, leave, clearTitle, leaveTitle }) {
      for (const d of doc().querySelectorAll('details')) d.open = true;
      await sleep(200);
      return { menu: menuText(), clearedRow: rowFor(clearTitle), inProgressRow: rowFor(leaveTitle),
        storedDone: !!win().localStorage.getItem('lotrd_done_' + clear), storedPosition: !!win().localStorage.getItem('lotrd_pos_' + leave),
        lmsStillHasPosition: (lms.record()['cmi.suspend_data'] || '').includes(leave) };
    },
  };

  (async () => {
    const params = Object.fromEntries(new URLSearchParams(location.search));
    let result;
    try {
      await until(() => win().gameController && win().LotrdScorm && doc().querySelector('#game-root button'), 'the game to start');
      // The shim draws its banner only after its own catalog fetch, which can land after the menu.
      await until(() => doc().getElementById('scorm-progress-banner'), 'the progress banner');
      result = await SCENARIOS[params.scenario](params);
    } catch (err) { result = { error: String(err && err.stack || err) }; }
    document.getElementById('out').textContent = JSON.stringify(result);
    document.title = 'done';
  })();
</script>`;

/** Start the server. `lms` is the student's record; it lives as long as the server. */
export async function startServer() {
  const lms = { store: {}, down: false };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const send = (code, body, type = 'text/plain; charset=utf-8') => {
      res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      res.end(body);
    };
    try {
      if (url.pathname.startsWith('/__lms/')) {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const body = raw ? JSON.parse(raw) : {};
        const refuse = lms.down ? 'false' : null;
        switch (url.pathname.slice(7)) {
          case 'init':    return send(200, refuse ?? 'true');
          case 'commit':  return send(200, refuse ?? 'true');
          case 'get':     return send(200, lms.store[body.k] ?? '');
          case 'set':     if (refuse) return send(200, refuse); lms.store[body.k] = body.v; return send(200, 'true');
          case 'control': lms.down = !!body.down; return send(200, 'ok');
          case 'dump':    return send(200, JSON.stringify(lms.store), TYPES['.json']);
        }
        return send(404, 'no such LMS call');
      }
      if (url.pathname === '/__d2l.html') return send(200, WRAPPER, TYPES['.html']);
      if (url.pathname === '/scorm-shim.js') {
        return send(200, await readFile(join(ROOT, 'SCORM/templates/scorm-shim.js')), TYPES['.js']);
      }
      if (url.pathname === '/index.html') {
        const html = await readFile(join(ROOT, 'index.html'), 'utf8');
        if (!html.includes(MAIN_SCRIPT_TAG)) return send(500, 'index.html has no main script tag to inject the shim before');
        return send(200, html.replace(MAIN_SCRIPT_TAG, `${SHIM_SCRIPT_TAG}\n  ${MAIN_SCRIPT_TAG}`), TYPES['.html']);
      }
      const path = normalize(join(ROOT, decodeURIComponent(url.pathname)));
      if (!path.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep) || !existsSync(path)) return send(404, 'not found');
      return send(200, await readFile(path), TYPES[extname(path)] || 'application/octet-stream');
    } catch (err) { return send(500, String(err)); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { lms, origin, close: () => new Promise(r => server.close(r)) };
}

/** Find a Chromium-family browser, or null. Set LOTRD_BROWSER to choose one. */
export function findBrowser() {
  const candidates = [
    process.env.LOTRD_BROWSER,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ].filter(Boolean);
  for (const path of candidates) if (existsSync(path)) return path;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) {
    const found = spawnSync(process.platform === 'win32' ? 'where' : 'which', [name], { encoding: 'utf8' });
    if (found.status === 0 && found.stdout.trim()) return found.stdout.trim().split(/\r?\n/)[0];
  }
  return null;
}

/**
 * One visit from one device. A fresh profile directory IS a fresh device: empty
 * localStorage, nothing cached. Returns the scenario's report.
 */
export async function visit(browser, origin, scenario, params = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'lotrd-device-'));
  const query = new URLSearchParams({ scenario, ...params }).toString();
  try {
    // Asynchronously: this process is also the web server the browser is talking to.
    const { stdout: dom } = await promisify(execFile)(browser, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--mute-audio', ...(process.env.CI ? ['--no-sandbox'] : []),
      `--user-data-dir=${profile}`, '--virtual-time-budget=40000', '--dump-dom',
      `${origin}/__d2l.html?${query}`,
    ], { encoding: 'utf8', timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
    const match = /<pre id="out">([\s\S]*?)<\/pre>/.exec(dom);
    if (!match) throw new Error('the wrapper page produced no report');
    const text = match[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    if (text === 'pending') throw new Error('the scenario did not finish inside the time budget');
    const report = JSON.parse(text);
    if (report.error) throw new Error(`in the browser: ${report.error}`);
    return report;
  } finally {
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 5 }); } catch (_) {}
  }
}
