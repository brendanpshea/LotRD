"""Prove the data-loss tests still have teeth.

A test suite that stays green is only reassuring if it would have gone red. This
script re-introduces, one at a time, each bug that has actually cost students
work (plus the ones the suite claims to guard against), runs the data-loss
suite against the sabotaged code, and reports which sabotage was CAUGHT and
which was MISSED. Every source file is restored afterwards, pass or fail.

    python tests/tools/prove_dataloss_tests.py             # against dataloss.test.js
    python tests/tools/prove_dataloss_tests.py --browser   # against browser.test.js
    python tests/tools/prove_dataloss_tests.py "zero score"  # only matching mutations

Run it after changing anything about saving, syncing or restoring — and add a
mutation here whenever a new data-loss bug is fixed, so the fix is pinned by a
test that is known to fail without it. It takes a few minutes, which is why it
is a tool and not part of the suite.

MISSED means a test is too weak, not that the code is safe.
"DID NOT APPLY" means the source moved on; update the mutation's search text.
"""
import re
import subprocess
import sys
from pathlib import Path

repo = str(Path(__file__).resolve().parents[2]).replace(chr(92), '/')
args = sys.argv[1:]
SUITE = 'tests/browser.test.js' if '--browser' in args else 'tests/dataloss.test.js'
ONLY = [a for a in args if not a.startswith('--')]
SHIM = repo + '/SCORM/templates/scorm-shim.js'
CTRL = repo + '/src/controller.js'
MODEL = repo + '/src/model.js'

MUTATIONS = [
    ('restore deferred until after the catalog fetch (the bug Elizabeth reported)', SHIM,
     '  connect();\n  scriptEvaluated = true;', '  scriptEvaluated = true;',
     # and connect later, from start()
     ('    await loadCatalog();\n    report();', '    await loadCatalog();\n    connect();\n    report();')),
    ('LMS write results ignored: a refused write counts as saved', SHIM,
     'function ok(result) { return result === "true" || result === true; }',
     'function ok(result) { return true; }', None),
    ('a stale browser keeps its own lower rank', SHIM,
     'if (localTier < tier) {', 'if (!local) {', None),
    ('a zero score is written', SHIM, 'if (pct > 0) {', 'if (true) {', None),
    ('no merge before overwriting the LMS copy', SHIM,
     '    restoreFromSuspendData(true);\n', '', None),
    ('catalog fetch is not retried', SHIM,
     '        loadCatalog().then(function () { catalogLoading = false; if (totalSets > 0) report(); });',
     '', None),
    ('no reconnect when the LMS was not ready at launch', SHIM,
     '    if (!initialized) connect();\n', '', None),
    ('positions purged by the first-visit housekeeping', CTRL,
     'if (key.startsWith("lotrd_save_")) {',
     'if (key.startsWith("lotrd_save_") || key.startsWith("lotrd_pos_")) {', None),
    ('the game does not poke the shim; sync waits for the next poll', CTRL,
     'try { window.LotrdScorm?.forceReport?.(); } catch (_) {}', '', None),
    ('no save until Continue is clicked on the results screen', CTRL,
     '    this._saveAfterAnswer(battleData);\n', '', None),
    ('saving after the last answer strands the run', CTRL,
     'if (queued > 0) this.saveGame();', 'this.saveGame();', None),
    ('a leftover save outranks a completion in the menu', CTRL,
     '    if (done) {\n      // Checked first',
     '    if (done && !(this._saveRemaining(save) > 0)) {\n      // Checked first', None),
    ('completion record not written on victory', CTRL,
     '      localStorage.setItem(this._completionKey(this._setName), JSON.stringify({',
     '      localStorage.setItem("lotrd_finished_" + this._setName, JSON.stringify({', None),
    ('position never written', CTRL,
     '      this._savePosition(savedAt);\n', '', None),
    ('misses not carried in a position', MODEL,
     "        for (const i of position.missed) if (at(i)) history.push(entry(at(i), false));\n", '', None),
    ('player level not synced', SHIM, '    if (state.level) out.lvl = state.level;\n', '', None),
    ('a shared computer: progress is not told apart by student', SHIM,
     '    foreignProgress = !adoptLearner(String(lmsCall("LMSGetValue", "cmi.core.student_id") || ""));\n',
     '', None),
    ("another student's progress is deleted rather than set aside", SHIM,
     '          if (!writeStash(owner, JSON.stringify(stash))) return false;\n', '', None),
    ("storage full: another student's progress is reported anyway", SHIM,
     '    if (initialized && foreignProgress) {', '    if (false) {', None),
    ('Back on the last results screen saves a run with nothing left in it', CTRL,
     'else this._saveAfterAnswer(results.battleData);', 'else this.saveGame();', None),
    ('Back on the death screen skips the game over', CTRL,
     'if (results.battleData.defeated_player) this._endRunByDefeat();\n      else ', '', None),
    ('Continue on a results screen runs again on a double-click', CTRL,
     '      if (results.clicked) return;\n', '',
     ('    if (results.done) return;\n    this._closeResults(results);', '    this._closeResults(results);')),
]


def read(p):
    return open(p, encoding='utf-8', newline='').read()


def write(p, s):
    open(p, 'w', encoding='utf-8', newline='').write(s)


def norm(s):
    return s.replace('\r\n', '\n')


results = []
for name, path, old, new, extra in MUTATIONS:
    if ONLY and not any(o in name for o in ONLY):
        continue
    original = read(path)
    crlf = '\r\n' in original
    s = norm(original)
    if s.count(old) != 1:
        results.append((name, 'MUTATION DID NOT APPLY'))
        continue
    s = s.replace(old, new)
    if extra:
        assert s.count(extra[0]) == 1, name
        s = s.replace(extra[0], extra[1])
    write(path, s.replace('\n', '\r\n') if crlf else s)
    try:
        out = subprocess.run(['node', '--test', SUITE], cwd=repo,
                             capture_output=True, text=True, encoding='utf-8', errors='replace').stdout
    finally:
        write(path, original)
    failed = re.findall(r'^\s+✖ (.+?) \(\d', out, re.M)
    results.append((name, failed))

caught = 0
for name, failed in results:
    if failed == 'MUTATION DID NOT APPLY':
        print(f'??  {name}: mutation did not apply')
    elif failed:
        caught += 1
        print(f'CAUGHT  {name}\n          by: {failed[0]}' + (f'  (+{len(failed) - 1} more)' if len(failed) > 1 else ''))
    else:
        print(f'MISSED  {name}')
print()
print(f'{caught} of {len(results)} caught by {SUITE}')
sys.exit(0 if caught == len(results) else 1)
