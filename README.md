# Loop of the Recursive Dragon

A browser-based quiz game for computer science students. Answer questions to battle monsters, level up your character, and track your progress across topic areas.

**A game by Brendan Shea, PhD — [Brendan.Shea@rctc.edu](mailto:Brendan.Shea@rctc.edu)**

---

## How to Play

1. Open `index.html` in a browser (or serve the folder with any static file server).
2. From the main menu, choose a topic and question set.
3. Each encounter presents a question. Answer correctly to damage the monster; wrong answers let the monster hit back.
4. Defeat monsters to earn XP and level up, unlocking better weapons and armor.
5. Complete all questions in a set to achieve Victory. Your progress auto-saves to `localStorage`.

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1`–`9` | Toggle answer checkboxes (multiple-choice) |
| `Enter` | Submit answer / advance to next screen |
| `Enter` (in text field) | Submit fill-in-the-blank answer |

---

## Features

- **Three question types** (described below)
- **Main menu** with topic groupings, per-set progress badges, and a global stats bar
- **Auto-save** — every encounter result is saved to `localStorage`; the back button saves and returns to the menu
- **Completion tracking** — `lotrd_done_${setId}` records completed sets permanently
- **Global stats** — `lotrd_global` accumulates lifetime totals across all sets
- **Session review** — question-by-question pass/fail breakdown with export to `.txt`
- **Direct-link support** — instructors can share `?set=filename.json` URLs
- **Sound effects** — Web Audio API; toggle with 🔊 button in toolbar
- **Streak bonuses** — consecutive perfect answers multiply player damage (1.25×, 1.5×, 2×)

---

## Question Types

All three types live in the same JSON arrays and can be mixed within one set. Existing questions with no `type` field are treated as **multiple-choice** (default).

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
- **Scoring is binary** — exact match = full player attack + streak; anything else = full monster counter-attack. The question re-queues on a miss.

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
- **Scoring is proportional** — each correct pair rolls one weapon die; each wrong pair rolls one monster die. The question re-queues if any pair is wrong.

---

## Damage Formula

| Situation | Player damage | Monster damage |
|-----------|--------------|----------------|
| Multiple-choice: each correct selection | +1 weapon roll | — |
| Multiple-choice: each wrong / missed selection | — | +1 monster roll |
| Fill-blank: exact match | 1 weapon roll × streak multiplier | — |
| Fill-blank: wrong | — | 1 monster roll |
| Matching: each correct pair | 1 weapon roll (× streak multiplier) | — |
| Matching: each wrong pair | — | 1 monster roll |

Streak multipliers (consecutive perfect answers): 3–4 = 1.25×, 5–9 = 1.5×, 10+ = 2×.  
Monster defense and player armor reduce gross damage to net damage (minimum 0).

---

## Project Structure

```
index.html          — All HTML templates (SPA; templates are <template> elements)
styles.css          — BBS-style dark-green terminal theme
src/
  main.js           — Entry point; instantiates GameController
  app.js            — GameUI (all screen rendering) + GameController (game flow)
  model.js          — Player, Monster, GameModel; all game logic and battle math
assets/
  monsters.json     — Monster definitions (name, hit_dice, attack_die, defense, image)
  questions.json    — Legacy; not used by the main app
images/monsters/    — Monster artwork
question_sets/
  catalog.json      — Topic groupings and metadata for the main menu
  index.json        — Flat list of available set filenames (for direct-link validation)
  *.json            — Individual question sets
```

---

## Adding New Question Sets

1. Create `question_sets/your_set.json` — a JSON array of question objects (any mix of types).
2. Add the filename to `question_sets/index.json`.
3. Add an entry to the appropriate topic in `question_sets/catalog.json`.

---

## Available Question Sets

| Topic | Set | Questions |
|-------|-----|-----------|
| Foundations | Basic Math | 10 |
| Computing Concepts | Computing Concepts | 33 |
| Computing Concepts | Data Systems | 75 |
| Java | Hour of Java | 30 |
| Java | Java Basics | 29 |
| Java | Control Flow | 30 |
| Java | Algorithms | 25 |
| Java | Functions & Methods | 30 |
| Java | Types, Null & Imports | 28 |
| Java | Collections | 30 |
| Java | Object-Oriented Programming | 34 |
| Java | Inheritance & Polymorphism | 34 |
| Java | Exceptions | 32 |
| Java | Streams & Lambdas | 33 |
| Java | GUI Programming | 30 |

---

## localStorage Keys

| Key | Contents |
|-----|----------|
| `lotrd_save_${setId}` | In-progress game state for a set |
| `lotrd_done_${setId}` | Completion record (timestamp, score %, level) |
| `lotrd_global` | Lifetime totals: answered, correct, incorrect, best streak, sets completed |
| `lotrd_sound` | Sound preference: `"1"` on, `"0"` off |

---

## License

See [LICENSE](LICENSE).
