# Loop of the Recursive Dragon

A free, browser-based quiz-RPG for learning programming, networking, and computer science. Answer questions to battle monsters, level up your character, and track your progress across topic areas — built originally for college students, but open to anyone studying for an exam like Network+ or working through a first Java course.

**A game by Brendan Shea, PhD — [Brendan.Shea@rctc.edu](mailto:Brendan.Shea@rctc.edu)**

> No account, no install, no tracking. Progress saves locally in your browser via `localStorage`. Pick a topic, start a set, and your spot is remembered next time you visit.

---

## How to Play

1. Open `index.html` in a browser (or serve the folder with any static file server).
2. From the main menu, choose a topic and question set.
3. Each encounter presents a question. Answer correctly to damage the monster; wrong answers let the monster hit back.
4. Defeat monsters to earn XP and level up. Each level grants a **revive charge** (⚗️) — when your HP hits 0, a charge is consumed to restore 10 HP.
5. Your **player level persists globally** across all question sets. Finishing a set by defeating the last monster or exhausting all remaining questions counts as clearing it. Progress auto-saves to `localStorage`.

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1`–`9` | Toggle answer checkboxes (multiple-choice) |
| `Enter` | Submit answer / advance to next screen |
| `Enter` (in text field) | Submit fill-in-the-blank answer |

---

## Features

- **Nine question formats** plus NPC teaching scenes (described below)
- **Main menu** with topic groupings, per-set progress badges, and a global stats bar
- **Lesson intros** — sets can declare an `intro` (story + learning objectives) in `catalog.json`, shown before the run starts
- **Sequential first pass** — full runs present questions in authored order (the set is written as a progression, and NPC scenes precede their paired questions); missed questions still requeue, and reviews/trials shuffle their samples
- **Mastery tiers** — the first full clear earns **Apprentice** rank (80% of the set's gradebook credit). A **Journeyman trial** unlocks 3 days later (90%), and a **Master trial** 7 days after completing Journeyman (100%). Trials are half the set (capped at 18 questions), weighted toward historically missed questions; finishing the run (retrieval boss included) earns the rank. Credit only ever rises. Sets cleared before tiers existed are grandfathered at Master
- **Auto-save** — every encounter result is saved to `localStorage`; the back button saves and returns to the menu
- **Completion tracking** — `lotrd_done_${setId}` records cleared sets permanently, including runs that end because there are no questions left
- **Global stats** — `lotrd_global` accumulates lifetime totals across all sets
- **Session review** — question-by-question pass/fail breakdown with export to `.txt`
- **Direct-link support** — instructors can share `?set=filename.json` URLs
- **Encounter screen** — the monster sprite is shown at its native 128px, with its level and an HP bar; the player's HP mirrors it. Flavour text sits behind an **Examine** toggle that opens itself the first time you meet a monster in a run and stays folded away after, so the description is something you read once rather than on every question. The retrieval boss keeps its line always visible, since there it reports concepts remaining rather than flavour
- **Sound effects** — Web Audio API; toggle with 🔊 button in toolbar
- **Streak bonuses** — consecutive perfect answers multiply player damage (1.25×, 1.5×, 2×)
- **Global level** — player level and revive charges persist across all question sets
- **Revive mechanic** — revive charges (earned on level-up) auto-restore 10 HP on defeat
- **Retrieval boss** — when the questions run out, anything missed during the run comes back as the Recursive Dragon's HP bar; each concept only leaves the bar once it's answered cleanly (a flawless run skips the fight)
- **Items** — two inventory slots (`Q`/`W`) hold drops from defeated monsters: heals, shields, 2× damage/XP, and a Mulligan that rewinds one wrong answer
- **Spaced review** — once a set reaches Master rank, it becomes "due" again on an expanding schedule (first ~21 days after mastery, then 60) and offers a short 5-question refresher; below Master, the rank trials are the spaced re-encounters

---

## Question Types

All question types live in the same JSON arrays and can be mixed within one set. Existing questions with no `type` field are treated as **multiple-choice** (default). Dynamic numeric questions use a safe expression engine with curated helper functions; JSON content does not execute arbitrary JavaScript.

### Multiple Choice (default)

The original type. Select all correct answers; partial credit is not given for individual selections — the damage formula counts each correct selection and each wrong one separately.

```json
{
  "question": "Which are valid Java variable declarations?",
  "correct": ["int x = 5;", "String name = \"Alice\";"],
  "incorrect": ["int x = 5", "variable x = 5;"],
  "feedback": "Optional explanation shown on the results screen."
}
```

### Fill-in-the-Blank

```json
{
  "type": "fill_blank",
  "question": "The keyword used to inherit from a class in Java is ___.",
  "correct": ["extends"],
  "case_sensitive": true,
  "feedback": "Optional explanation."
}
```

- `correct` is an array — list all acceptable answers (e.g. `["true", "True", "TRUE"]`).
- `case_sensitive: true` should be used for Java keywords and code; omit or set `false` for prose answers.
- The UI shows a per-word character-count hint (e.g. `_ _ _ _ _ _ _  (7 chars)`).
- Players get up to **3 attempts**. Wrong attempts show Wordle-style feedback; long answers may auto-cloze so only one word needs to be typed.
- A one-character typo on a long non-case-sensitive answer is accepted automatically.
- Missed questions re-queue, and final failure keeps partial credit based on similarity.

### Dynamic Numeric

```json
{
  "type": "dynamic_numeric",
  "question": "What decimal value does binary {{bits}} represent?",
  "variables": {
    "n": { "min": 8, "max": 63 }
  },
  "derived": {
    "bits": "toBin(n)"
  },
  "answer": {
    "expr": "fromBase(bits, 2)",
    "tolerance_abs": 0
  },
  "feedback_template": "Binary {{bits}} equals {{expected}} in decimal."
}
```

- `variables` define numeric inputs using either `min` / `max` / optional `step` or an explicit `values` list.
- `derived` lets authors compute helper values for the rendered prompt, such as binary or hex strings.
- `question` is a template string that can reference resolved values with `{{name}}` placeholders.
- `answer.expr` must evaluate to a single finite number. `tolerance_abs` controls accepted error.
- Supported helper functions include `toBin`, `toHex`, `fromBase`, `bitAnd`, `bitOr`, `bitXor`, `shl`, `shr`, `popcount`, `bitLength`, `sumRange`, `countRange`, plus arithmetic helpers like `min`, `max`, `abs`, `pow`, `floor`, `ceil`, and `round`.
- Dynamic numeric questions reuse the 3-attempt fill-blank flow, but numeric misses show high/low feedback and accepted tolerance instead of character hints.

### Code Trace ("predict the output")

```json
{
  "type": "code_trace",
  "question": "What does this loop print?",
  "code": "for (int i = 1; i <= 3; i++) {\n    System.out.println(\"Hi \" + i);\n}",
  "language": "java",
  "correct": ["Hi 1\nHi 2\nHi 3"],
  "case_sensitive": true,
  "feedback": "Optional explanation."
}
```

- The snippet is shown in a monospaced `<pre>` block. When `language` is `"java"` (default), keywords, strings, numbers, and comments are syntax-highlighted by [src/highlight.js](src/highlight.js); other languages render plain.
- Player types the program's expected stdout into a multi-line `<textarea>`, one value per line. **Submit with `Ctrl`/`Cmd`+`Enter`** (plain `Enter` inserts a newline).
- Input is normalised before comparison: line endings unified, trailing whitespace per line stripped, leading/trailing blank lines dropped — write `correct` answers exactly as printed, with `\n` between lines.
- Scoring reuses the **fill-blank engine**: 3 attempts, Levenshtein-based partial credit on the final miss, monster counter-attack on each wrong attempt. The wordle-style per-character grid is hidden for code-trace.

### Code Line

```json
{
  "type": "code_line",
  "question": "Declare an empty ArrayList of Strings named names.",
  "language": "java",
  "correct": [
    "List<String> names = new ArrayList<>();",
    "ArrayList<String> names = new ArrayList<>();"
  ],
  "case_sensitive": true,
  "feedback": "Declaring as List<String> is preferred — it keeps the left-hand side flexible."
}
```

- Best for one-line code or command authoring.
- Grading is token-based, so whitespace-only differences do not matter.
- Players get 3 attempts, token-Wordle feedback, and a typo confirmation prompt for near-misses.

### Matching

```json
{
  "type": "matching",
  "question": "Match each OOP term to its definition.",
  "pairs": [
    { "term": "Encapsulation", "definition": "Bundling data and methods, restricting direct access" },
    { "term": "Polymorphism",  "definition": "One interface can represent many types at runtime" }
  ],
  "feedback": "Optional explanation."
}
```

- Recommended size: 4–6 pairs.
- Definitions are shuffled into per-row dropdowns.
- **Scoring is proportional** — each correct pair rolls one attack die (d6); each wrong pair rolls one monster die. The question re-queues if any pair is wrong.

### Ordering

```json
{
  "type": "ordering",
  "question": "Arrange one full turn of the instruction cycle in order.",
  "items": [
    "Fetch the next instruction from memory",
    "Decode the instruction to see what it asks",
    "Execute the operation"
  ],
  "feedback": "Optional explanation."
}
```

- `items` is written **in the correct order** (3–6 unique strings); the game shuffles the bank and the student taps items into sequence (tap a placed item to remove it).
- Optional `language` renders items in monospace — use it for Parsons-style "arrange the code lines" questions.
- **Scoring is positional** — each item in its correct slot rolls one attack die; each misplaced item rolls one monster die. Anything less than perfect re-queues.

### Multi-Blank Cloze

```json
{
  "type": "cloze",
  "question": "The {{1}} layer routes packets, while the {{2}} layer makes delivery reliable.",
  "blanks": [
    { "accept": ["Internet", "IP"], "hint": "layer" },
    { "accept": ["transport"] }
  ],
  "feedback": "Optional explanation."
}
```

- The prompt renders as flowing text with an inline input wherever a `{{n}}` placeholder sits (1-based, and every blank needs one).
- 2–4 blanks, each typable in ≤ 12 characters; each carries its own `accept` list, optional `hint` placeholder text, and optional `case_sensitive`.
- **Graded per blank in one submission** — no three-attempt loop. Each correct blank rolls an attack die, each wrong one rolls a monster die, and the question re-queues unless all are right. A one-character typo on a long case-insensitive answer is still forgiven.
- `Enter` advances to the next blank and submits from the last one.

### Write the Code (`code_write`)

A CodingBat-style problem: the signature is fixed and shown above the box, the student writes the **body**, and the code is run against a table of test cases.

```json
{
  "type": "code_write",
  "question": "Return the sum of two numbers — except if they are equal, return double their sum.",
  "signature": "def sum_double(a, b):",
  "tests": [
    { "args": [1, 2], "expect": 3 },
    { "args": [2, 2], "expect": 8 }
  ],
  "solution": "if a == b:\n    return (a + b) * 2\nreturn a + b",
  "starter": "optional prefilled body",
  "examples": ["optional; the first three tests are used when this is absent"],
  "feedback": "Optional explanation."
}
```

- **Run is free and unlimited.** The Run button executes the same tests that will grade the answer and shows expected against actual, row by row. Only Submit resolves the turn.
- **Graded per test case**, like matching and cloze, but the attack dice are scaled to a fixed budget (`CODE_WRITE_HIT_BUDGET`) rather than one die per case — otherwise a ten-case problem would deal twice the damage of a five-case one for the same work. The question re-queues unless every case passes.
- **A worked answer is shown afterwards**, whether or not the student's own passed. `solution` is required, and the test suite runs it through the real interpreter: a problem whose own answer key fails is a failing build. The suite also rejects a test table that `return None` / `return True` / `return 0` and friends can pass, since such a table grades nothing.
- `args` and `expect` are ordinary JSON. Whole numbers become Python ints and fractions become floats; `{"__float": 5}` forces `5.0` and `{"__tuple": [1, 2]}` makes a tuple. Comparison uses Python's `==`, so an int answer still matches a float expectation.
- The body may be typed flush against the left margin or already indented — whichever the student does, the shallowest line becomes one level of indentation. Tab inserts four spaces, Shift+Tab removes them, Enter keeps the current indent and adds a level after a colon. `Ctrl`+`Enter` runs the tests.

The code runs on `src/pytiny.js`, a small Python interpreter written for this purpose (see [Runtime Architecture](#runtime-architecture)).

### NPC Teaching Scene (`npc_demo`)

Not a question: a mentor NPC (default: *Ada the Artificer*) walks through a worked example step by step, with optional low-stakes `check` prompts ("what comes next?") that get a gentle correction when wrong. Scenes deal no damage, award no XP, never requeue, are skippable, don't count toward `question_count`, and are excluded from reviews and rank trials. Author each scene **immediately before a paired question** that uses the same technique with different surface features. See the [WRITING_GUIDE](question_sets/WRITING_GUIDE.md) for the schema.

---

## Damage Formula

| Situation | Player damage | Monster damage |
|-----------|--------------|----------------|
| Multiple-choice: each correct selection | +1 attack roll (d6) | — |
| Multiple-choice: each wrong / missed selection | — | +1 monster roll |
| Fill-blank / dynamic numeric / code-trace: correct within 3 tries | 1 attack roll (d6) × streak multiplier | — |
| Fill-blank / dynamic numeric / code-trace: wrong intermediate guess | — | 1 monster roll, scaled by attempt (0%, 50%, 100%) |
| Code-line: correct within 3 tries | 1 attack roll (d6) × streak multiplier | — |
| Code-line: wrong intermediate guess | — | 1 monster roll |
| Matching: each correct pair | 1 attack roll (d6) × streak multiplier | — |
| Matching: each wrong pair | — | 1 monster roll |

Final failure on fill-blank, dynamic numeric, code-trace, and code-line keeps partial credit based on best similarity or numeric closeness and re-queues the question. Streak multipliers (consecutive perfect answers): 3–4 = 1.25×, 5–9 = 1.5×, 10+ = 2×. Monster defense reduces player damage; player base defense (1) reduces monster damage (minimum 0 net). Player stats are fixed: attack die = d6, base defense = 1, max HP = 20. Level-ups grant revive charges only.

---

## Project Structure

```
index.html          — All HTML templates (SPA; templates are <template> elements)
styles.css          — BBS-style dark-green terminal theme
src/
  main.js           — Entry point; instantiates GameController
  app.js            — Barrel module that re-exports the main runtime classes
  controller.js     — GameController; game flow, persistence, item drops, review-set launch
  ui.js             — GameUI; all screen rendering, keyboard handling, encounter/results screens
  sound.js          — SoundSystem; Web Audio API effects and keep-alive logic
  items.js          — ITEM_DROPS table for post-battle loot
  model.js          — Player, Monster, GameModel; game logic, battle math, save/load state
  pytiny.js         — A small Python interpreter; runs student code for code_write questions
  highlight.js      — Minimal Java and Python syntax highlighters
  util.js           — Shared helpers such as shuffle()
assets/
  monsters.json     — Monster definitions (name, hit_dice, attack_die, defense, image)
  questions.json    — Legacy; not used by the main app
images/monsters/    — Monster artwork
question_sets/
  catalog.json      — Topic groupings and metadata for the main menu
  index.json        — Flat list of available set filenames (for direct-link validation)
  *.json            — Individual question sets
tests/
  model.test.js     — Unit tests for game logic (Player, Monster, GameModel)
  data.test.js      — Validates all JSON data files (monsters, question sets, catalog)
  html.test.js      — Cross-reference checks (templates, data-refs, stale code)
  pytiny.test.js    — The Python interpreter, checked against real CPython output
  finishable.test.js— Every shipped set can be played to a terminal screen
```

### Runtime Architecture

- `main.js` is the browser entrypoint and creates a single `GameController` instance.
- `controller.js` owns application state transitions: loading sets, saving progress, resuming games, resolving battles, and routing to the right screen.
- `ui.js` is intentionally presentation-focused: it renders templates, handles keyboard shortcuts, and calls controller methods instead of reaching through globals.
- `model.js` owns the combat and progression rules: player/monster state, streaks, dynamic question materialization, safe expression evaluation, answer grading, shared damage resolution, and save snapshots.
- `pytiny.js` is a self-contained Python interpreter — tokenizer, parser, tree-walking evaluator — with no dependencies and no reach into the page. It exists because `code_write` questions have to run student code, and the alternative (Pyodide) is several megabytes of WebAssembly that the offline SCORM packages could not carry. It runs the Python of a first course and refuses everything else *by name*; errors are phrased in the words of that course ("you tried to add text to a number"), and every run is bounded by step, time, recursion, integer-size and output limits so a runaway loop reports itself instead of freezing the tab. Student text is never passed to `eval` or `Function`. Its test suite compares it against output captured from real CPython.
- `sound.js` is isolated from UI and model logic, so audio concerns stay separate from gameplay and rendering.
- `items.js` and `util.js` hold small shared data/helpers that were previously duplicated inline.

---

## Adding New Question Sets

1. Create `question_sets/your_set.json` — a JSON array of question objects (any mix of types).
2. Add the filename to `question_sets/index.json`.
3. Add an entry to the appropriate topic in `question_sets/catalog.json`.

---

## Available Question Sets

[`question_sets/catalog.json`](question_sets/catalog.json) is the source of truth for what the
main menu shows. The counts below mirror it, and `data.test.js` asserts that the catalog itself
matches the number of questions actually in each file.

| Topic | Set | Questions |
|-------|-----|-----------|
| Computing Concepts | What Is Computing? | 50 |
| Computing Concepts | Machine Architecture | 50 |
| Computing Concepts | Python Basics | 50 |
| Computing Concepts | Control Flow & Functions | 50 |
| Computing Concepts | Collections & ADTs | 50 |
| Computing Concepts | Modules & Objects | 50 |
| Computing Concepts | Searching, Sorting & Big-O | 50 |
| Computing Concepts | Software Engineering | 50 |
| Computing Concepts | Databases & the Relational Model | 50 |
| Computing Concepts | OS, Networks, Cloud & the Web | 50 |
| Computing Concepts | Cybersecurity — Defending Systems | 50 |
| Computing Concepts | AI, Machine Learning & Ethics | 50 |
| Database | Database Foundations | 33 |
| Database | Introduction to SQL: SELECT | 30 |
| Database | Joins and Set Operations | 30 |
| Database | Super Select: Advanced Retrieval | 30 |
| Database | Database Design | 30 |
| Database | Writing Data | 30 |
| Database | Views, CTEs & Governance | 30 |
| Database | Performance & Transactions | 30 |
| Database | PostgreSQL Basics | 30 |
| Database | Database Security | 30 |
| Database | Architecture, Deployment & Testing | 30 |
| Database | SQLite Final Project | 30 |
| Java | Java Review Mix | 30 (random mix) |
| Java | Hour of Java | 11 |
| Java | Java Basics | 36 |
| Java | Control Flow | 36 |
| Java | Algorithms | 30 |
| Java | Functions & Methods | 33 |
| Java | Types, Null & Imports | 29 |
| Java | Collections | 31 |
| Java | Object-Oriented Programming | 33 |
| Java | Inheritance & Polymorphism | 33 |
| Java | Exceptions | 33 |
| Java | Streams & Lambdas | 33 |
| Java | GUI, Git & Dev Workflow | 33 |
| Networking | Network+ Review Mix | 30 (random mix) |
| Networking | Network+ Fundamentals | 30 |
| Networking | Media, Topology & IPv4 Addressing | 30 |
| Networking | Routing & Switching | 30 |
| Networking | Wireless & Physical Installations | 30 |
| Networking | Operations & Monitoring | 30 |
| Networking | DR, Network Services & Access | 30 |
| Networking | Network Security Concepts | 30 |
| Networking | Attacks & Defense | 30 |
| Networking | Troubleshooting Methodology & Cabling | 30 |
| Networking | Services, Performance & Wireless Troubleshooting | 30 |
| Networking | Tools & Device Commands | 33 |
| SecurityX / CASP+ | Security Governance, Compliance & Ethics | 40 |
| SecurityX / CASP+ | Risk Management & Threat Modeling | 42 |
| SecurityX / CASP+ | AI Threats & Governance | 30 |
| SecurityX / CASP+ | Security Architecture & Zero Trust | 30 |
| SecurityX / CASP+ | Security Operations & Incident Response | 30 |
| SecurityX / CASP+ | IAM, Cryptography & Secure Engineering | 33 |
| SecurityX / CASP+ | Enterprise Cloud & Hybrid Security | 33 |
| SecurityX / CASP+ | Cryptography & PKI | 35 |

---

## localStorage Keys

| Key | Contents |
|-----|----------|
| `lotrd_save_${setId}` | In-progress game state for a set |
| `lotrd_done_${setId}` | Completion record (timestamp, score %, level) |
| `lotrd_tier_${setId}` | Mastery-tier record (tier, apprenticeAt/journeymanAt/masterAt timestamps) |
| `lotrd_misses_${setId}` | Historical miss counts per question text (weights rank-trial samples) |
| `lotrd_review_${setId}` | Spaced-review stage and last-reviewed timestamp |
| `lotrd_global` | Lifetime totals: answered, correct, incorrect, best streak, sets completed |
| `lotrd_player_level` | Global player level data (level, XP, revive charges) |
| `lotrd_sound` | Sound preference: `"1"` on, `"0"` off |

---

## Releasing Updated Content

- Question-set JSON files are fetched with `cache: "no-store"`, so browsers should re-request fresh content instead of reusing a stale cached copy.
- In-progress runs are restored from `localStorage`. If you change question content and want existing browsers to discard old in-progress snapshots, bump `SAVE_DATA_VERSION` in [src/controller.js](src/controller.js).
- Global progress and completed-set records are preserved; only `lotrd_save_*` keys are invalidated by a save-data version bump.

---

## Running Tests

Requires **Node.js 18+** (uses the built-in `node:test` runner — zero npm dependencies).

```bash
node --test tests/*.test.js
```

| File | What it checks |
|------|----------------|
| `model.test.js` | Model and combat logic — player state, streaks, fill-blank, dynamic numeric, code-line, matching, level-up, revive, items, retrieval boss, save round-trips |
| `controller.test.js` | Controller logic without the DOM — Mulligan rollback, item activation |
| `data.test.js` | All JSON files — required fields, type constraints, dynamic-question schema, image files exist, catalog/index consistency, question-count and duplicate-text checks |
| `html.test.js` | HTML/template cross-checks — template IDs, data-ref/data-action usage, stale code checks, accessibility, CSS classes |
| `util.test.js` | Shuffle and the spaced-review interval schedule |
| `pytiny.test.js` | The Python subset used by write-the-code questions — parsing, evaluation, the runaway-program limits, and the wording of every student-facing error |
| `ui.test.js` | UI logic reachable without a DOM — code-editor indentation (the only route on a phone) and the editor's markup |
| `finishable.test.js` | Every set can be finished — no question can lock a run |
| `scorm.test.js` | The SCORM wrapper — completion, scoring and suspend data |

---

## License

See [LICENSE](LICENSE).
