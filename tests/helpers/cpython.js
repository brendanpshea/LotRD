// tests/helpers/cpython.js — real Python, as the oracle for the practice interpreter.
//
// src/pytiny.js is hand-written, and its whole value is that it behaves like
// Python. For everything that PRINTS, the way to know is to ask Python: run the
// same program on both and require identical output.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse, Interpreter } from '../../src/pytiny.js';

/** A working Python 3, or null. (On Windows `python3` is often a Store stub that runs nothing.) */
export function findPython() {
  for (const name of [process.env.LOTRD_PYTHON, 'python3', 'python', 'py'].filter(Boolean)) {
    try {
      const r = spawnSync(name, ['-c', 'import sys; print(sys.version_info[0])'], { encoding: 'utf8', timeout: 20000 });
      if (r.status === 0 && r.stdout.trim() === '3') return name;
    } catch (_) { /* try the next one */ }
  }
  return null;
}

/** Run many programs in ONE Python process; returns an array of { out, err } in order. */
export function runOnCPython(python, programs) {
  const dir = mkdtempSync(join(tmpdir(), 'lotrd-cpython-'));
  try {
    const driver = join(dir, 'driver.py');
    writeFileSync(join(dir, 'programs.json'), JSON.stringify(programs), 'utf8');
    writeFileSync(driver, [
      'import io, json, sys, contextlib, os',
      'here = os.path.dirname(os.path.abspath(__file__))',
      'programs = json.load(open(os.path.join(here, "programs.json"), encoding="utf-8"))',
      'results = []',
      'for src in programs:',
      '    buf = io.StringIO()',
      '    err = None',
      '    try:',
      '        with contextlib.redirect_stdout(buf):',
      '            exec(compile(src, "<program>", "exec"), {"__name__": "__main__"})',
      '    except BaseException as e:',
      '        err = type(e).__name__',
      '    results.append({"out": buf.getvalue(), "err": err})',
      'sys.stdout.reconfigure(encoding="utf-8")',
      'print(json.dumps(results))',
    ].join('\n'), 'utf8');
    const r = spawnSync(python, [driver], { encoding: 'utf8', timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(`Python driver failed: ${r.stderr}`);
    return JSON.parse(r.stdout);
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch (_) { /* best effort */ }
  }
}

/** The same program on the practice interpreter: { out, err } where err is the PyError message. */
export function runOnPytiny(source) {
  const interpreter = new Interpreter();
  try {
    interpreter.run(parse(source));
    return { out: interpreter.output.join(''), err: null };
  } catch (e) {
    return { out: interpreter.output.join(''), err: e.message || String(e) };
  }
}
