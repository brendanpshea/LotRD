# SCORM packaging

Builds standalone SCORM 1.2 packages of *Loop of the Recursive Dragon*,
filtered to a single topic (Java, Network+, etc.) for embedding in D2L.

## Build

```sh
python SCORM/build.py SCORM/editions/java.json
python SCORM/build.py SCORM/editions/*.json        # all editions; tests run once
```

The build runs the whole test suite first and **packages nothing if any test
fails** — including the data-loss scenarios and the real-browser check (see
"Running Tests" in the main README). It also refuses to package if the shim was
not injected into `index.html`. `--skip-tests` is for working on the build
script itself; never upload a package built with it.

Output: `SCORM/dist/<edition>-scorm.zip`

## Add a new edition

1. Create a config in `SCORM/editions/<name>.json`:

   ```json
   {
     "id": "lotrd-mytopic",
     "title": "LotRD — My Topic Edition",
     "intro_html": "<p>Intro shown on the main menu.</p>",
     "topics": ["Java"],
     "output": "lotrd-mytopic-scorm.zip"
   }
   ```

   `topics` must match the `topic` strings in
   [../question_sets/catalog.json](../question_sets/catalog.json).

2. Run `python SCORM/build.py SCORM/editions/<name>.json`.

## Single-set packages

```sh
python SCORM/build.py SCORM/editions/computing_singles.json    # one zip per chapter, 4-12
```

A config with `"single_sets": true` builds one package per set it lists
(`lotrd-cc-04-control-functions-scorm.zip`, ...). Each one:

- **opens on its set**, not on the menu: a landing page with the story, the
  objectives, where the student stands, and one button;
- is worth **full credit, all or nothing**: nothing is written to the gradebook
  until the set is cleared, and then it is 100 and `completed`;
- has **no ranks, no rank trials and no spaced review**. The website keeps all of
  that; these packages deliberately do not. (Dated review packages, released by
  the LMS's calendar, are the intended way to get spacing back.)

Why they exist: the multi-set editions build a grade over weeks, which depends on
the LMS remembering a student between visits, across devices, and across every
re-upload of the package. In the live course each of those has failed at some
point. A single-set package asks for almost none of it. Credit is one fact,
written once — and because nothing is written before the clear and nothing may
go below what the LMS holds, a fresh attempt (a re-upload, a new device, an
emptied browser) can never lower a grade. A re-upload costs at most a
half-finished run. Give each package its own grade item, out of 100.

The build writes `window.LOTRD_SINGLE_SET = "<set id>"` into the page ahead of
the shim; the shim and the game both key off it. Mid-set progress and player
level still sync through `suspend_data` exactly as below, where the LMS allows.
Rules and their tests: `tests/scorm-single.test.js`, the single-set block of
`tests/dataloss.test.js`, and `tests/browser.test.js`.

Computing Concepts chapters 1-3 stay as a multi-set, rank-graded edition
(students are part-way through it); chapters 4-12 are single-set packages.

## How scoring works

*(Multi-set editions. For single-set packages see above: cleared = 100.)*

Score reported to the LMS is a percentage built from per-set mastery
tiers:

    score = (sum of per-set credit / total non-review sets in this edition) * 100

    credit per set:  Apprentice (first clear)  0.8
                     Journeyman (trial, +3d)   0.9
                     Master     (trial, +7d)   1.0

A set's first full clear — victory or reaching the end of the question
queue — earns Apprentice. The Journeyman trial unlocks 3 days after the
first clear; the Master trial unlocks 7 days after completing
Journeyman. Trials are half the set, capped at 18 questions, and
weighted toward historically missed questions. Credit only ever rises,
so the reported score is monotonic. Sets completed before the tier
system existed are grandfathered at Master (full credit) so no existing
student's score drops on upgrade. Review sets are excluded from both
numerator and denominator.

`cmi.core.lesson_status` is set to `completed` at 100%, otherwise
`incomplete`. The mastery threshold in the manifest is 100, but D2L
uses the raw score for the gradebook regardless.

## Cross-device persistence

Students play on a phone, a classroom machine and a laptop. Treat
localStorage as a per-device cache and `cmi.suspend_data` as the record:
anything that must follow the student has to round-trip through it, inside
SCORM 1.2's 4096 characters.

The payload, rewritten whenever it changes:

    {"v":2,
     "sets":[[id, tier, apprenticeS, journeymanS, masterS], ...],
     "lvl":[level, xp, reviveCharges],
     "pos":[[id, fingerprint, remaining, missed, correct, incorrect, savedS], ...]}

| Part | What it is | When both sides have one |
|------|------------|--------------------------|
| `sets` | Cleared sets, their rank, and the timestamps that gate the trials | Higher rank wins, in both directions |
| `lvl` | Player level, XP within the level, revive charges | Further-along wins |
| `pos` | Where the student is in each half-finished set | Newer `savedS` wins |

`lvl` and `pos` are optional, and a reader that predates them ignores them,
so the version stayed at 2. Legacy v1 payloads (a plain array of completed
IDs) are restored as grandfathered Master completions.

**Restore is synchronous.** It runs while the shim script is being
evaluated — before the game's module script starts — so the main menu never
draws from a half-restored localStorage. (It used to wait for
DOMContentLoaded and a catalog fetch, lost that race, and showed cleared sets
as "not started" on every new device.) This matters more than "cross-device"
suggests: Safari discards localStorage for embedded third-party frames, which
is what a D2L SCORM activity is, when the browser closes — for those students
every return visit is a restore.

**Positions.** The full in-progress save holds every question object and
cannot leave the browser. Beside it the game writes `lotrd_pos_${setId}`: the
same run as question *numbers* — what remains (requeues included), what was
missed, the running tally — range-packed, typically under 100 characters.
A set resumed from a position picks up at the same question with the same
retrieval-boss material; HP, inventory and the current monster are left
behind. The fingerprint is a hash of the authored question file: after a
content update that adds, drops, reorders or rewords questions, old positions
are ignored rather than resumed somewhere arbitrary.

Measured worst case (every set in an edition half-finished at once, with
messy requeues): ~450 characters for a 3-set edition, ~1,400 for the 12-set
Java edition. If a payload ever did exceed the limit, positions are shed
first, then the lowest-ranked sets — never the reverse.

**Never written:** a score of 0, or an empty payload. Either one means "this
browser and this attempt know nothing", which is also what a student with
real credit looks like on a fresh attempt with empty storage.

**Shared computers.** D2L serves every student's copy of an activity from
the same address, so on a lab or library PC they share one localStorage. The
shim tags the browser's progress with a hash of `cmi.core.student_id`
(`lotrd_learner`; the id itself is never stored). When a different student
connects, the previous student's `lotrd_*` keys are moved into
`lotrd_stash_<hash>` and the new student's own stash, if any, is put back —
before anything is restored or reported. Set aside, not deleted: it may be the
only copy of work D2L never received. If storage is too full even after
dropping the oldest other stash, the session reports nothing and the banner
tells the student to use another browser. Browsers from before tagging carry
no owner; the first student to connect claims what is there, which on a shared
machine is a one-time exception.

**Still per-device:** HP/inventory mid-run, historical miss counts (they
weight trial sampling; keyed by question text and too large), the Sharpen
review schedule, lifetime stats, the sound setting.

## Interrupted sessions

Assume every session ends badly: D2L logs the student out mid-set, the
connection drops, a phone freezes the tab. Two copies of progress exist — this
browser's localStorage and the LMS — and the next launch may be on a device
where only the LMS copy exists. So the rule is that **the shim never believes
the LMS has something until the LMS says so.**

- **Writes are confirmed.** Every `LMSSetValue`/`LMSCommit` result is checked.
  The shim tracks what the LMS has *confirmed*, not what was last sent, so a
  refused or dropped write is simply still owed and goes out again on the next
  tick (3 s), when the tab is hidden or shown, and when the browser comes back
  online. It used to record what it sent — and so stopped retrying at exactly
  the moment a write failed.
- **The connection is re-established.** API discovery and `LMSInitialize` are
  retried until they succeed (some players install the API late); after
  repeated refusals the shim tries to initialise again, and keeps the existing
  session if the LMS says it is already initialised. A failed catalog fetch at
  launch is retried too, where it used to switch syncing off for the session.
- **Reconnecting is a merge.** Restore takes the higher rank, further level and
  newer position, so coming back after a stretch of offline play cannot lower
  anything. If the restore happens after the menu was drawn, the shim fires
  `lotrd-progress-restored` and the game redraws it.
- **The student is told, while it can still be fixed.** The banner reads
  "✓ saved to D2L" only when the LMS has confirmed everything. Otherwise it
  turns red (`role="alert"`) and says progress has not been saved since a given
  time, that it *is* safe in this browser, to keep the tab open, and — if the
  message stays — to reopen the activity **in this same browser**, where the
  next launch pushes everything the LMS is missing. Leaving with unsaved
  progress raises the browser's "Leave site?" prompt.
- **Every exit calls `LMSFinish`.** On `pagehide` always, and on `beforeunload`
  unless the shim is itself asking the student not to leave. If the page comes
  back (from the back/forward cache, or because they stayed), the next save
  finds the session closed and reconnects. **Do not make this conditional.** A
  build that skipped `LMSFinish` on `beforeunload`, and on `pagehide` whenever
  the browser reported `persisted` (which Chrome does for any cacheable page),
  sent nothing to the live D2L gradebook for days and carried nothing between
  browsers — while its banner read "✓ saved", because `LMSCommit` had answered
  "true". Some LMS players keep every write in the page and send it to the
  server only on `LMSFinish`. `tests/browser.test.js` reproduces this against
  such a player in real Chrome; note that the test server must NOT send
  `Cache-Control: no-store`, which bars the page from that cache and hides the
  bug.
- **`ⓘ sync details`.** A button at the bottom right shows `LotrdScorm.diagnose()`
  as text to copy into an email: which build this is, what the LMS returned at
  launch (`cmi.core.entry`, score, how much suspend_data), what it answered to
  the last write, and how the PREVIOUS session in this browser ended. Every test
  here runs against a stand-in LMS; this is how the real one gets a voice.
- **The game saves sooner, and says so.** It saves the moment an answer is
  resolved rather than on the Continue click after the results screen, and
  pokes the shim at every save point instead of waiting for the next tick.

**What none of this can save:** progress made while the LMS was unreachable,
in a browser whose storage is then lost (Safari closing, a classroom machine
wiping its profile) before the student reopens the activity there. At that
point the data exists nowhere. The red banner is the mitigation: it says so at
the only moment the student can act on it.

**Two devices open at once.** SCORM 1.2 has no way to tell a tab that another
device has written. Left alone that is last-writer-wins, and a tab that has sat
open since before the phone cleared a set would erase that set from the LMS on
its next write. So before every write the shim re-reads the LMS and folds in any
cleared set, higher rank or higher score it finds. **Whether that helps depends
on the LMS:** one that answers `LMSGetValue` from the server gets a true merge;
one that answers from a copy made at launch (many do, and D2L's behaviour here is
not verified) makes it a no-op. In that case the set is repaired the next time
the device that earned it launches — which works only if that browser still has
its storage. Both kinds of LMS are tested (`cachedReads` in the sandbox). The
student guide asks students to close the game when they are done.

To preserve existing browser save data across package refreshes, do not
change the local save keys or `SAVE_DATA_VERSION` in
`src/controller.js` unless you are intentionally migrating or clearing
incompatible in-progress saves.

## Adding to D2L

1. Course **Content** -> **Add Existing Activities** -> **SCORM/xAPI**.
2. Upload the zip. D2L imports and creates the activity.
3. Edit the activity -> ensure a grade item is associated, max 100.

The in-game banner shows live `Course progress: NN%` so students get
instant feedback without waiting for the gradebook page to refresh.
