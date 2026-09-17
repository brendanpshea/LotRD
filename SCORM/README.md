# SCORM packaging

Builds standalone SCORM 1.2 packages of *Loop of the Recursive Dragon*,
filtered to a single topic (Java, Network+, etc.) for embedding in D2L.

## Build

```sh
python SCORM/build.py SCORM/editions/java.json
python SCORM/build.py SCORM/editions/network.json
```

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

## How scoring works

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

**Still per-device:** HP/inventory mid-run, historical miss counts (they
weight trial sampling; keyed by question text and too large), the Sharpen
review schedule, lifetime stats, the sound setting.

**Cannot be fixed here:** SCORM 1.2 reads the LMS only at launch, so two
devices open at once are last-writer-wins. The grade is protected by the
score floor; ranks and positions can briefly regress until the next launch.

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
