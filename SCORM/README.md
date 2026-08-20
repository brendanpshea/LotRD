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

The shim mirrors completion AND tier records (with their timestamps,
which gate the trials) into `cmi.suspend_data` on every commit as
`{"v":2,"sets":[[id, tier, apprenticeMs, journeymanMs, masterMs], ...]}`.
On launch it reads `suspend_data` and restores any missing records to
localStorage. Legacy v1 payloads (a plain array of completed IDs) are
restored as grandfathered Master completions.

The full RPG save (HP, level, current question queue) stays in
localStorage and is per-device. Only completion state syncs.

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
