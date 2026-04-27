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

Score reported to the LMS is a percentage:

    score = (completed sets / total non-review sets in this edition) * 100

A "completed" set is one the player has cleared in the RPG sense
(victory) — the same definition the in-game "Cleared" badge uses.
Review sets are excluded from both numerator and denominator.

`cmi.core.lesson_status` is set to `completed` at 100%, otherwise
`incomplete`. The mastery threshold in the manifest is 100, but D2L
uses the raw score for the gradebook regardless.

## Cross-device persistence

The shim mirrors the list of completed set IDs into `cmi.suspend_data`
on every commit. On launch it reads `suspend_data` and restores any
missing completion records to localStorage. So a student who completes
two sets on a laptop will see those two sets marked complete when they
open the SCO on another device.

The full RPG save (HP, level, current question queue) stays in
localStorage and is per-device. Only completion state syncs.

## Adding to D2L

1. Course **Content** -> **Add Existing Activities** -> **SCORM/xAPI**.
2. Upload the zip. D2L imports and creates the activity.
3. Edit the activity -> ensure a grade item is associated, max 100.

The in-game banner shows live `Course progress: NN%` so students get
instant feedback without waiting for the gradebook page to refresh.
