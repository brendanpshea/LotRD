# Problem Set Writing Guide

> A reference for humans and LLMs on how to write high-quality question sets for LotRD.

---

## File Format Overview

Each question set is a **JSON array** of question objects saved in `question_sets/`. Nine structured question types are documented below (plus the non-question NPC teaching scene), with multiple-choice split into single-answer and multi-answer variants:

| Type | `type` field | Selection UI | Best for |
|------|-------------|-------------|----------|
| Multiple Choice | *(omitted)* | Radio (1 correct) or Checkbox (2+ correct) | Recall, analysis, "select all that apply" |
| Fill-in-the-Blank | `"fill_blank"` | Text input | Terminology, syntax, exact recall |
| Dynamic Numeric | `"dynamic_numeric"` | Numeric input | Randomized numeric reasoning, conversions, loop counts, storage math |
| Matching | `"matching"` | Dropdowns | Associating terms with definitions |
| Code Line | `"code_line"` | Text input + token-Wordle | Writing one line of code/command |
| Ordering | `"ordering"` | Tap-to-sequence | Process steps, algorithm stages, Parsons-style code arrangement |
| Multi-Blank Cloze | `"cloze"` | Inline text inputs | Synthesis: several related terms held in contrast in one passage |
| Write the Code | `"code_write"` | Code editor + test table | Writing a whole small function, run against real test cases (Python only) |
| NPC Teaching Scene | `"npc_demo"` | Dialogue walkthrough | Worked examples immediately before a paired question (not a question itself) |

A good problem set uses a **mix of all types**. Aim for roughly:
- 60–70% multiple choice (split between single-answer and multi-answer)
- 10–20% fill-in-the-blank
- 10–20% dynamic numeric
- 10–20% matching
- a few ordering questions where the material has a real sequence
- 1–2 multi-blank cloze items per set, for synthesis of contrasting ideas
- write-the-code problems where the set's job is writing Python, kept in their own set for now
- 1–3 NPC scenes per set, each directly followed by its paired question

Dynamic numeric questions use a safe built-in expression engine. JSON content does **not** execute arbitrary JavaScript.

---

## Type 1: Multiple Choice — Single Answer

Use when there is **exactly one** unambiguous correct answer.

### Schema

```json
{
  "question": "What is the output of: System.out.println(5 + 3);",
  "correct": ["8"],
  "incorrect": ["53", "5 + 3", "Error"],
  "feedback": "The + operator performs arithmetic addition on integers."
}
```

### Rules

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `question` | yes | string | The question stem |
| `correct` | yes | string[] | **Exactly 1 element** → renders as radio buttons |
| `incorrect` | yes | string[] | 3+ wrong answers recommended |
| `feedback` | no | string | Shown after answering |

### Writing Good Single-Answer Questions

1. **Make all answer options similar in length and structure.** If the correct answer is a full sentence, the distractors should be full sentences too. A conspicuously long or detailed answer is a giveaway.

   Similar length is not enough on its own: what matters is *rank*. Across a set, the correct answer should be the longest option about a quarter of the time, because with four options that is chance. It drifts above that on its own, because a correct answer has to be precisely true and picks up qualifiers, while a distractor can be blunt. When you catch yourself over the line, prefer giving a distractor a concrete false rationale over trimming the key — that fixes the length and makes the distractor more tempting at the same time. `tests/data.test.js` fails a set that goes past 45% in either direction.

2. **Avoid "all of the above" and "none of the above."** Answers are shuffled, so positional references break.

3. **A distractor must be wrong about the RIGHT topic.** This is the single most common way a long question becomes trivially easy, and length parity does not protect you from it. The test to apply: *could someone who has never studied this topic eliminate two options on sight, just by noticing they are about something else?* If so, the question measures nothing.

   ❌ **Eliminable — every distractor is about a different subject:**
   ```
   Q: Why is concatenating user input into a SQL query dangerous?
   ✔ The input can alter the query structure and execute unintended SQL commands
   ✘ It causes the operating system to delete the underlying database file on disk
   ✘ It automatically converts all database integer values into floating-point numbers
   ✘ It prevents web browsers from rendering static CSS stylesheets on web pages
   ```
   Only one option is even about queries, so the answer is free.

   ✔ **Discriminating — every distractor is a real confusion:**
   ```
   Q: In the von Neumann architecture, what is the job of the ALU?
   ✔ To perform arithmetic and logic, such as adding and comparing
   ✘ To fetch the next instruction from main memory each cycle    ← the control unit
   ✘ To hold the address of the instruction being executed now    ← the program counter
   ✘ To store data permanently after the computer powers off      ← storage
   ```
   Each wrong option is a component students genuinely mix up with the ALU.

   Note that **short options cannot drift off-topic** — if the answer is `private`, the distractors are forced to be `public` and `protected`. That makes shortening the options the cheapest repair when you cannot think of good long distractors.

4. **Don't let the correct answer be the only option that echoes the stem.** If the stem says "algorithm" and only the right answer says "algorithm", students match vocabulary instead of reasoning.

5. **Make distractors plausible.** Each wrong answer should represent a common misconception or a closely related concept—not an absurd option.

6. **Keep the stem self-contained.** A reader should understand what is being asked without reading the answer options first.

7. **Use precise language.** Avoid vague qualifiers ("sometimes," "usually") unless the ambiguity is the point of the question.

### Good Stem Patterns for Single-Answer

```
"What is the result of ...?"
"Which keyword is used to ...?"
"What does the ___ method return when ...?"
"In the following code, what value is stored in x after execution?"
"Which of the following is the correct syntax for ...?"
"What is the primary purpose of ...?"
"Which data type is most appropriate for storing ...?"
```

### Example

```json
{
  "question": "Which access modifier makes a Java field visible only within the same class?",
  "correct": ["private"],
  "incorrect": ["public", "protected", "default (package-private)"],
  "feedback": "The 'private' modifier restricts access to the declaring class only."
}
```

---

## Type 2: Multiple Choice — Multiple Answers (Select All That Apply)

Use when **two or more** answers are correct. The game renders checkboxes and tells the player how many to select.

### Schema

```json
{
  "question": "Which of the following are valid Java primitive types?",
  "correct": ["int", "boolean", "char"],
  "incorrect": ["String", "Integer", "Array"],
  "feedback": "String, Integer, and Array are reference types, not primitives."
}
```

### Rules

Same schema as single-answer, but `correct` has **2 or more** elements.

### Writing Good Multi-Answer Questions

1. **The stem must clearly signal that multiple answers are expected.** Use phrasing that naturally implies plurality.

2. **Each correct answer should be independently and unambiguously correct.** Avoid answers that are only correct "depending on context."

3. **Each incorrect answer should be independently and clearly wrong** for the concept being tested, not just "less correct."

4. **Avoid making the number of correct answers a clue.** Don't always have exactly 2 or exactly 3 correct. Vary it across the set. (Note: the game *does* show the count, but a varied set is still better practice.)

5. **Don't combine overlapping claims.** If answer A includes answer B, the logic gets confusing.

6. **Keep every option roughly equal in length and specificity** so that correct answers don't cluster by phrasing style.

### Good Stem Patterns for Multi-Answer

These stems naturally communicate "select all that apply" without being awkward:

```
"Which of the following are true about ...?"
"Which claims about ___ are correct?"
"Select every statement that accurately describes ..."
"Which of these are valid examples of ...?"
"Which of the following will compile without error?"
"Which operations are supported by the ___ interface?"
"Which of the following can cause a ___?"
"Which principles apply to ...?"
```

**Stems to avoid** (they confuse some LLMs and test-takers):

```
"Which is NOT true about ...?"         ← double-negative risk; hard to parse with checkboxes
"All of the following are true EXCEPT:" ← positional/exclusion logic doesn't pair well with multi-select
```

### Example

```json
{
  "question": "Which of the following are true about Java interfaces?",
  "correct": [
    "An interface can declare abstract methods",
    "A class can implement multiple interfaces",
    "Interfaces can contain default methods with a body"
  ],
  "incorrect": [
    "An interface can be instantiated with the new keyword",
    "Interface methods are private by default",
    "A class can extend multiple interfaces using the extends keyword"
  ],
  "feedback": "Interfaces support abstract methods, default methods, and multiple implementation. They cannot be instantiated directly, their methods are public by default, and classes use 'implements' (not 'extends') for interfaces."
}
```

---

## Type 3: Fill-in-the-Blank

Use for **terminology, syntax, commands, or exact-recall** items where the student must produce (not just recognize) the answer.

### Schema

```json
{
  "type": "fill_blank",
  "question": "The keyword used to define a subclass in Java is ___.",
  "correct": ["extends"],
  "case_sensitive": false,
  "feedback": "The 'extends' keyword establishes an inheritance relationship."
}
```

### Rules

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `type` | yes | `"fill_blank"` | Must be exactly this string |
| `question` | yes | string | Should contain `___` where the answer goes |
| `correct` | yes | string[] | All acceptable answers (any match = correct) |
| `case_sensitive` | no | boolean | Default `false`. Set `true` for syntax-sensitive answers |
| `feedback` | no | string | Shown after answering |

### Writing Good Fill-in-the-Blank Questions

1. **The blank should have exactly one concept as the answer**, even if multiple phrasings are accepted. List all valid phrasings in `correct[]`.

2. **Place the blank near the end of the sentence** when possible. This lets the student read the full context before encountering the blank.

3. **Include common alternative spellings/phrasings** in the `correct` array:
   ```json
   "correct": ["ArrayList", "arraylist", "array list"]
   ```

4. **Use `case_sensitive: true` only when casing is the point** (e.g., Java keywords, terminal commands, exact syntax).

5. **Don't make the blank too broad.** "The ___ is used in Java" is too vague. "The keyword used to prevent a class from being subclassed is ___" is focused.

6. **The UI shows the character count** of the first entry in `correct[]` as a hint. Keep your primary answer as the first element if you want to give an accurate length hint.

7. **Keep the required typed answer at 12 characters or fewer.** If the shortest accepted answer is longer than that, rewrite the item as multiple choice, matching, or a shorter blank focused on one keyword.

8. **Avoid fill-in-the-blank for answers with many valid phrasings.** If there are 10 reasonable ways to say the answer, use multiple choice instead.

### Good Stem Patterns for Fill-in-the-Blank

```
"The terminal command used to ___ is ___."
"The keyword used to ___ in Java is ___."
"A ___ is a data structure that ___."
"In object-oriented programming, ___ refers to ___."
"The return type of the ___ method is ___."
"To compile a Java file named Example.java, you would type ___."
```

### Example

```json
{
  "type": "fill_blank",
  "question": "The Java keyword used to handle exceptions that may be thrown in a try block is ___.",
  "correct": ["catch"],
  "case_sensitive": true,
  "feedback": "The 'catch' block follows a 'try' block and specifies the exception type to handle."
}
```

---

## Type 4: Dynamic Numeric

Use for **randomized numeric problems** where the prompt contains generated values and the student submits a single numeric answer. This is the best fit for intro-CS items such as binary and hex conversion to decimal, loop iteration counts, loop sums, bitwise results, array indexing, and storage-size arithmetic.

### Schema

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

### Rules

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `type` | yes | `"dynamic_numeric"` | Must be exactly this string |
| `question` | yes | string | Template string; may use `{{name}}` placeholders |
| `variables` | yes | object | Numeric inputs, each defined by `values[]` or `min` / `max` / optional `step` |
| `derived` | no | object | Extra template values computed from expressions |
| `answer.expr` | yes | string | Expression that resolves to one finite number |
| `answer.tolerance_abs` | no | number | Absolute error allowed; default `0` |
| `answer.display_decimals` | no | integer | Optional display rounding for the expected answer |
| `feedback_template` | no | string | Template rendered after variables and `expected` are resolved |
| `allow_expression` | no | boolean | Default `true`. Whether the student may type arithmetic instead of a number — see below |

### Letting Students Type Arithmetic

By default a student may answer `7 * 7 * 7` instead of `343`, and the same safe parser that computes the answer key works it out. This is usually what you want: for most numeric questions the setup is the skill and the multiplication is incidental, and the expression is *better* evidence of understanding than the number is — `343` could come from a calculator or a guess.

**Set `"allow_expression": false` when the stem shows the arithmetic being asked for.** On *"What does `{{a}} + {{b}} ** {{c}}` evaluate to?"* the student could paste the expression straight back and let the grader do the work, which is the entire question.

You do not have to spot these by eye. `data.test.js` renders every stem with its own variables, evaluates each arithmetic run inside it, and fails the build if one equals the answer while the question still allows expressions.

> **Never state how far a wrong answer was off.** Feedback on a wrong attempt gives direction only — "Too low." or "Too high." Saying "off by 15" hands over the answer, because the student has three attempts and can simply add 15.

### Supported Dynamic Helpers

Arithmetic helpers:

```text
abs, round, floor, ceil, trunc, sqrt, pow, min, max, clamp, mod, floorDiv
```

CS-focused helpers:

```text
toBin, toOct, toHex, toBase, fromBase,
bitAnd, bitOr, bitXor, shl, shr, ushr,
popcount, bitLength,
sumRange, countRange
```

### Writing Good Dynamic Numeric Questions

1. **Keep the student answer numeric.** The prompt may show binary or hex strings, but the answer should still be one number for v1.

2. **Use placeholders only for values the student should see.** If a helper value is only useful internally, keep it in `answer.expr` instead of exposing it in the prompt.

3. **Prefer declarative formulas over ad hoc logic.** If a question can be written with `sumRange`, `countRange`, `bitAnd`, or `fromBase`, do that instead of asking for arbitrary JavaScript.

4. **Keep variable ranges pedagogically sane.** Large numbers make mental math miserable and hide the concept being tested.

5. **Use `tolerance_abs` only when rounding is expected.** For exact integer results, keep it at `0`.

6. **When asking for a rounded decimal, state the precision in the prompt** and set `answer.display_decimals` plus a matching `tolerance_abs`.

7. **Do not depend on arbitrary JavaScript built-ins or loops in JSON.** The expression engine is intentionally limited so sets are testable, safe, and predictable.

### Good Stem Patterns for Dynamic Numeric

```text
"What decimal value does binary {{bits}} represent?"
"How many times does this loop body execute?"
"What is the final value of sum after this loop?"
"How many bytes are in {{kib}} KiB?"
"What decimal result does {{a}} AND {{b}} produce?"
"What is the minimum number of bits needed to store unsigned decimal {{n}}?"
```

### Example

```json
{
  "type": "dynamic_numeric",
  "question": "How many times does the loop body execute? for (int i = {{start}}; i < {{limit}}; i += {{step}})",
  "variables": {
    "start": { "min": 0, "max": 4 },
    "step": { "values": [1, 2, 3] },
    "iterations": { "min": 3, "max": 6 }
  },
  "derived": {
    "limit": "start + iterations * step"
  },
  "answer": {
    "expr": "iterations",
    "tolerance_abs": 0
  },
  "feedback_template": "Starting at {{start}} and increasing by {{step}} stops just before {{limit}}, so the loop runs {{expected}} times."
}
```

---

## Type 5: Matching

Use to test the ability to **associate terms with definitions**, concepts with examples, or inputs with outputs.

### Schema

```json
{
  "type": "matching",
  "question": "Match each collection type to its primary characteristic.",
  "pairs": [
    { "term": "ArrayList", "definition": "Ordered, allows duplicates, backed by an array" },
    { "term": "HashSet", "definition": "Unordered, no duplicates, backed by a hash table" },
    { "term": "LinkedList", "definition": "Ordered, allows duplicates, backed by a doubly-linked list" },
    { "term": "TreeSet", "definition": "Sorted, no duplicates, backed by a red-black tree" }
  ],
  "feedback": "Each Java collection implementation has distinct ordering and uniqueness properties."
}
```

### Rules

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `type` | yes | `"matching"` | Must be exactly this string |
| `question` | yes | string | Instruction for what to match |
| `pairs` | yes | `{term, definition}[]` | Minimum 2 pairs; 4–6 is ideal |
| `feedback` | no | string | Shown after answering |

### Writing Good Matching Questions

1. **All terms should belong to the same category** (all keywords, all data types, all methods, etc.). Mixing categories makes the matching trivial by elimination.

2. **All definitions should be parallel in structure.** If one definition starts with a verb, they all should. If one is a noun phrase, they all should.

3. **Make definitions distinct but not by giveaway keywords.** Avoid embedding the term inside its own definition.

4. **Use 4–6 pairs.** Fewer than 3 is trivially easy (50% guess rate per item). More than 7 becomes tedious.

5. **Definitions must be unambiguous.** Each definition should match exactly one term. If two definitions could reasonably apply to the same term, rewrite them.

6. **Avoid definitions that are simply synonyms.** "int → integer" isn't a meaningful exercise. Test understanding, not vocabulary lookup.

### Good Stem Patterns for Matching

```
"Match each ___ to its ___."
"Match each keyword to the concept it implements."
"Match each data type to the kind of value it stores."
"Match each error type to the scenario that causes it."
"Match each design pattern to its description."
"Match each method to what it returns."
"Match each code snippet to its output."
```

### Example

```json
{
  "type": "matching",
  "question": "Match each access modifier to its visibility scope.",
  "pairs": [
    { "term": "public", "definition": "Accessible from any class in any package" },
    { "term": "protected", "definition": "Accessible within the same package and by subclasses" },
    { "term": "default", "definition": "Accessible only within the same package" },
    { "term": "private", "definition": "Accessible only within the declaring class" }
  ],
  "feedback": "Java's four access levels form a spectrum from most open (public) to most restricted (private)."
}
```

---

## Type 6: Code Line

Use when the student should **write** (not just recognize) a single line of code or a single command. Grading is whitespace-insensitive at the token level: `int x=5;` ≡ `int x = 5 ;`. Up to 3 attempts per question, with token-level Wordle feedback between attempts and a "did you mean?" prompt for typos within 2 character edits of an accepted answer.

### Schema

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
  "feedback": "Declaring as List<String> is preferred — it lets you swap implementations later."
}
```

### Rules

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `type` | yes | `"code_line"` | Must be exactly this string |
| `question` | yes | string | Plain-language instruction for what to write |
| `correct` | yes | string[] | All accepted variants. The grader picks the closest variant per attempt and renders token-Wordle against it. |
| `language` | no | string | Display tag (`java`, `python`, `bash`, `cisco`, …). Currently informational. |
| `case_sensitive` | no | boolean | Default `false`. Set `true` for code (most cases). |
| `feedback` | no | string | Shown after the question resolves |

### Writing Good Code-Line Questions

> **Typed-length limit:** `code_line` answers may be up to **20 characters after tokenization** — whitespace and punctuation are tokenized away, so `x = 5` counts as `x=5` (3). Every other typed type stays at **12**. The larger allowance exists because a complete short statement is the point of the exercise: `SELECT name FROM candies` cannot reach its `FROM` clause inside 12. `data.test.js` enforces both limits.

1. **Pin every free variable in the stem.** "Declare a list of Strings" → infinite valid names. "Declare a list of Strings named `names`" → bounded answer set.
2. **Enumerate every reasonable surface form** in `correct[]` (diamond vs explicit type, `var` vs declared type, alternate method orders for bash flags). Aim for 2–6 entries.
3. **Keep it to one line.** Multi-line answers belong in `code_trace` or a different format.
4. **Avoid open-ended questions.** "Write a class that…" has too many right answers — grading collapses.
5. **Use `case_sensitive: true`** for any code where casing matters (almost always; Cisco config is the main exception).
6. **Keep the tokenized answer at 12 non-whitespace characters or fewer.** If the command or line is longer than that, convert it to multiple choice or rewrite it as a shorter fill-in focused on the key keyword, flag, or function.
7. **Don't include leading/trailing whitespace** in `correct[]` entries — the grader trims for you.

### Scoring (how it maps to combat)

- **Win on attempt 1** → `isPerfect`, full damage, streak increments, XP eligible for doubling.
- **Win on attempt 2 or 3** → full damage but `isPerfect = false`; streak preserved.
- **Fail (3 wrong)** → no player damage; partial credit = best token-similarity across attempts. Streak preserved if best ≥ 0.8, else reset. Question re-queued.
- **Each wrong intermediate attempt** → monster attacks the player.
- **Typo gate** (≤ 2 char edits from any accepted answer) → "Did you mean: …?" prompt before the attempt counts.

### Good Stem Patterns

```
"Declare a ___ named ___, initialized to ___."
"Write the Java statement that ___."
"Write the bash command that lists ___."
"Write the lambda that returns true when ___."
"Write the Cisco command (in global config) to ___."
```

### Examples

```json
{
  "type": "code_line",
  "question": "List all files under /var/log modified in the last 24 hours.",
  "language": "bash",
  "correct": [
    "find /var/log -mtime -1",
    "find /var/log -mtime -1 -type f",
    "find /var/log -type f -mtime -1"
  ],
  "case_sensitive": true,
  "feedback": "`find /var/log -mtime -1` matches files modified less than 1 day ago."
}
```

```json
{
  "type": "code_line",
  "question": "Write a Python list comprehension that squares every even number in `nums`.",
  "language": "python",
  "correct": [
    "[n*n for n in nums if n % 2 == 0]",
    "[n**2 for n in nums if n % 2 == 0]",
    "[n*n for n in nums if n%2==0]",
    "[n**2 for n in nums if n%2==0]"
  ],
  "case_sensitive": true,
  "feedback": "List comprehensions filter with `if` and transform with the leading expression."
}
```

---

## Type 7: Ordering

Use when the material has a **genuine sequence**: stages of a process, steps of an algorithm, historical progression, or lines of a short program (Parsons-style).

### Schema

```json
{
  "type": "ordering",
  "question": "Arrange one full turn of the instruction cycle in order.",
  "items": [
    "Fetch the next instruction from memory",
    "Decode the instruction to see what it asks",
    "Execute the operation"
  ],
  "feedback": "Fetch brings the instruction in, decode interprets it, execute carries it out."
}
```

### Rules

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `type` | yes | `"ordering"` | Must be exactly this string |
| `question` | yes | string | Say what is being ordered and in which direction |
| `items` | yes | string[] | **In the correct order.** 3–6 items; must be unique strings |
| `language` | no | string | Set (e.g. `"python"`) to render items in monospace for code lines |
| `feedback` | no | string | Shown after answering |

### Writing Good Ordering Questions

1. **The order must be unambiguous.** Every adjacent pair should have exactly one defensible ordering. For code, make each line depend on the previous line's variable.
2. **State the direction in the stem** ("earliest to latest", "fastest to slowest") — never assume.
3. **Don't use ordering for lists without inherent sequence** — that's a matching or MC question.
4. Scoring is positional: each item in its correct slot counts, so partially-right arrangements earn partial credit. Anything less than perfect requeues.

---

## Type 8: Multi-Blank Cloze

A passage with **2–4 blanks**, all graded together in one submission. Use it for **synthesis** — when the point is holding several related ideas in contrast, not recalling one of them.

Because there are no options, a cloze cannot be solved by eliminating implausible distractors. That makes it the strongest antidote to the "long multiple-choice answers are trivially easy" problem, and typed production resists being memorised across repeat encounters far better than recognition does.

### Schema

```json
{
  "type": "cloze",
  "question": "The {{1}} layer routes packets between addresses, while the {{2}} layer makes delivery reliable end to end.",
  "blanks": [
    { "accept": ["Internet", "IP", "network"], "hint": "layer" },
    { "accept": ["transport"] }
  ],
  "feedback": "IP gets packets to the right machine; TCP makes that delivery reliable."
}
```

### Rules

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `type` | yes | `"cloze"` | Must be exactly this string |
| `question` | yes | string | Uses `{{1}}`, `{{2}}`… placeholders, **1-based**. Every blank needs a placeholder and vice versa |
| `blanks` | yes | object[] | 2–4 entries, in placeholder order |
| `blanks[].accept` | yes | string[] | All acceptable spellings. **First entry is shown as "the" answer in feedback**, so put the canonical form first |
| `blanks[].hint` | no | string | Placeholder text in the input (e.g. `"layer"`, `"protocol"`) — use it to disambiguate, not to give the answer away |
| `blanks[].case_sensitive` | no | boolean | Default `false`. Set `true` only when case is the point |

### Writing Good Cloze Questions

1. **Every blank must have exactly one defensible answer.** This is the failure mode to guard against. If two words fit the sentence, either add surrounding context that rules one out, or list both in `accept`.
2. **Each blank must be typable in ≤ 12 characters** (enforced by `data.test.js`, per blank).
3. **Blank the concepts, not the connective tissue.** Never blank "the", "a", or a word recoverable from grammar alone.
4. **Put contrasting ideas in one passage.** The type earns its keep when blanks 1 and 2 are things students routinely confuse.
5. **Use `hint` when the answer's *category* isn't obvious** from the sentence — it narrows without revealing.
6. Grading is per blank and proportional: each right blank rolls an attack die, each wrong one rolls a monster die, and the question re-queues unless every blank is right. A single-character typo on a long, case-insensitive answer is still forgiven.

---

## Type 9: Write the Code (`code_write`)

A CodingBat-style problem. The signature is fixed and shown above the box; the student writes the **body**, and the code is run against a table of test cases. Python only — the code runs on [`src/pytiny.js`](../src/pytiny.js), a small interpreter written for this game.

### Schema

```json
{
  "type": "code_write",
  "question": "Return the sum of two numbers — except if the two are equal, return double their sum.",
  "signature": "def sum_double(a, b):",
  "tests": [
    { "args": [1, 2], "expect": 3 },
    { "args": [3, 2], "expect": 5 },
    { "args": [2, 2], "expect": 8 }
  ],
  "solution": "if a == b:\n    return (a + b) * 2\nreturn a + b",
  "feedback": "Handle the special case first and return from inside the if."
}
```

### Rules

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `type` | yes | `"code_write"` | Must be exactly this string |
| `question` | yes | string | The spec. State the rule exactly — this is the contract the tests enforce |
| `signature` | yes | string | A `def name(params):` line. The student never edits it |
| `tests` | yes | object[] | 3+ cases, each `{ "args": [...], "expect": value }`. `args` must match the parameter count |
| `solution` | yes | string | A reference **body**. Shown to the student afterwards, and run by the test suite to prove the table is satisfiable |
| `starter` | no | string | Prefilled body. Must not already pass the tests |
| `examples` | no | string[] | Worked examples shown above the box. Omit and the first three tests are used, which keeps them from drifting |
| `feedback` | yes-ish | string | As everywhere: explain the idea, not just the answer |

### Values in `args` and `expect`

Ordinary JSON, converted to Python values: whole numbers become ints, fractions become floats, arrays become lists, objects become dicts. Two escape hatches for what JSON cannot say: `{"__float": 5}` is `5.0` and `{"__tuple": [1, 2]}` is `(1, 2)`. Comparison uses Python's `==`, so an int result still matches a float expectation.

### What the interpreter supports

`def`, `return`, `if`/`elif`/`else`, `while`, `for ... in`, `break`, `continue`, `pass`, ints, floats, strings, bools, `None`, lists, tuples, dicts, indexing, slicing, f-strings, keyword arguments and defaults, conditional expressions, recursion, and the usual built-ins and string/list/dict methods.

**Not supported, on purpose:** classes, imports, exceptions, comprehensions, generators, sets, lambdas, `global`. A student who types one is told it is missing rather than shown a parser error — but do not write a problem whose natural answer needs one.

### Writing Good Write-the-Code Problems

1. **One idea per problem, and say the rule exactly.** "Return True if the two numbers are equal, or if their sum is 10" leaves nothing to guess. Vagueness in the stem becomes an unfair test failure.
2. **Make the test table decide the question.** Every rule in the stem needs a case that enforces it, and every branch of your own solution needs a case that reaches it. The suite rejects a table that `return True` (or `None`, `False`, `0`, `""`) can pass outright, but that is a floor, not a target.
3. **Include the edges you actually mean:** the empty list, the empty string, zero, a negative, the one-element case. If an edge is not in the table, the problem does not test it and a student will not think about it.
4. **Keep it to 4–8 cases.** They are all visible, and a student reads every row on every run.
5. **Do not ask for printing.** The tests can only see what is returned; a problem that says "print" is unpassable. Say "return".
6. **Order the set by what it teaches** — returning a comparison, then strings and slicing, then lists, then accumulator loops — and let the earlier problems be genuinely easy. The format is new; the first one should build confidence, not filter.
7. **Write `feedback` about the technique, not the answer.** The worked answer is shown anyway; the feedback is where the pattern gets named ("the accumulator pattern: start at 0 before the loop, add inside, return after").
8. Grading is per test case, scaled to a fixed damage budget, and the question re-queues unless every case passes. Running the tests is free, unlimited, and has no effect on the battle.

---

## Type 10: NPC Teaching Scene (`npc_demo`)

**Not a question** — a worked example an NPC mentor walks through, step by step, immediately **before a paired question that uses the same technique with different surface features**. Scenes deal no damage, award no XP, never requeue, never appear in reviews or rank trials, and don't count toward the set's `question_count`.

### Schema

```json
{
  "type": "npc_demo",
  "question": "NPC: Turning 13 into binary",
  "npc": "Ada the Artificer",
  "intro": "Scene-setting text shown in italics before the first step.",
  "steps": [
    { "say": "First teaching beat — one idea per step." },
    { "say": "Second beat, ending just before a decision point.",
      "check": {
        "prompt": "What comes next?",
        "answer": "The right next move",
        "wrong": ["A plausible wrong move", "Another one"],
        "why": "One sentence explaining the right move."
      }
    },
    { "say": "Final beat: complete the example and state the takeaway pattern." }
  ],
  "outro": "Hand-off line pointing at the paired question that follows."
}
```

### Rules

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `type` | yes | `"npc_demo"` | Must be exactly this string |
| `question` | yes | string | The scene's title (shown as a caption; also its identity — must be unique). Prefix with `NPC:` by convention |
| `npc` | yes | string | Mentor **id** from [`assets/npcs.json`](../assets/npcs.json) — `ada`, `nia`, `zoya`, `flint`, `kaelen`, `tariq`, `val`, `omu`. The game resolves the display name and portrait from the roster. Pick the mentor whose domain matches the lesson, and write the prose to fit them (Zoya uses they/them) |
| `intro` / `outro` | no | string | Scene-setting and hand-off lines |
| `steps` | yes | object[] | 2–4 steps; each needs `say`, may carry `beats` and one `check` |
| `steps[].beats` | no | object[] | How the step is revealed: an ordered list where each entry is either `{"say": "..."}` (one spoken line) or `{"code": "...", "language": "..."}` (the artifact being examined). Without it the whole `say` string appears in one go |
| `steps[].check` | no | object | `prompt`, `answer`, `wrong[]` (1–2), optional `why`. Low-stakes: a wrong tap gets a gentle correction and the scene continues |

### Revealing a scene

The screen shows **one beat at a time** — a click reveals the next. Two rules follow from that:

1. **Keep each spoken beat short.** One or two sentences. `data.test.js` rejects a beat over 320 characters, but the target is far shorter: a student who is handed a paragraph will skim it, which defeats the point of the scene.
2. **Put code in its own `code` beat, never inside `say`.** Code beats render as a bordered monospace panel with a small label, visibly different from the mentor's speech. When code is embedded in a spoken line it renders in the same font and colour as the prose around it, and the student cannot tell the lesson from the narration.

```json
"beats": [
  { "say": "Here's a scrap of pseudocode:" },
  { "code": "SET count TO 10
ADD 5 TO count", "language": "pseudocode" },
  { "say": "Don't guess the answer — trace it." }
]
```

Useful `language` values: `pseudocode`, `python`, `sql`, or a short phrase describing the artifact (`typed by the attacker`). It is shown as a caption above the panel.

### Writing Good NPC Scenes

1. **Always pair it.** The very next entry in the array should be a real question using the same technique with different numbers/words (dynamic_numeric pairs beautifully: the scene demos 13 → binary, the monster asks for 22).
2. **Make at least one step a `check`** — a faded worked example beats a passive one. Put the check where the learner can predict the next move from what was just shown.
3. **Explain it like the student is twelve, and never hide behind the analogy.** A mentor may reach for a
   concrete image — a chest with two tags, three desks in a scriptorium, a row of clay golems — but the image
   is a way in, not the lesson. Every time one is used, bind it to the real word in the same breath: *each
   golem is one object*, *the tray is the staging area*, *the foreign key is the thread*. Two failures to
   watch for:
   - **An unexplained metaphor.** If a student has to work out what the image stands for before the
     explanation makes sense, the scene has taught them a riddle instead of the material.
   - **Vocabulary the paired question needs but the scene never says.** Read the very next entry in the
     array. If its options or feedback say *attribute*, *local variable* or *object*, the scene has to have
     said those words too — a student who followed the demonstration perfectly should not meet a monster
     speaking a language the demonstration avoided.
   Scene-setting is fine and welcome, but a prop introduced in the `intro` and never used again is noise;
   either give it something to do or leave it out.
4. **One idea per step.** If a `say` needs three sentences of new content, split it.
5. **Don't re-teach what the set already tested** — scenes introduce technique for the questions that follow, not summaries of earlier material.
6. Sets present in **array order** on a first full run, so the scene/question adjacency is preserved; reviews and trials skip scenes automatically.

---

## General Quality Guidelines

### Feedback

- Every question **should** have a `feedback` field. It's the primary learning mechanism.
- Feedback should explain **why** the correct answer is right, not just restate it.
- For multi-answer questions, briefly address why each distractor is wrong.

### Difficulty Curve

Order questions from easier to harder within a set. The game presents them in array order initially (then reshuffles missed ones), so early questions should build confidence.

### Avoiding Bias & Ambiguity

- Have the set reviewed by someone unfamiliar with the material. If they misunderstand a question, rewrite it.
- Avoid jargon in answer options that hasn't been introduced in the question stem.
- Don't test trick questions or gotchas. Test understanding.

### Validation Checklist

Before submitting a question set, verify:

- [ ] File is a valid JSON array
- [ ] Every question has a non-empty `question` string
- [ ] MC questions have non-empty `correct[]` and an `incorrect[]` array
- [ ] Fill-blank questions have `"type": "fill_blank"` and non-empty `correct[]`
- [ ] Dynamic numeric questions have `"type": "dynamic_numeric"`, a non-empty `variables` object, and a valid `answer.expr`
- [ ] Matching questions have `"type": "matching"` and ≥ 2 pairs with `term` and `definition`
- [ ] No duplicate options within any MC question (`correct` ∪ `incorrect` has no repeats)
- [ ] No overlap between `correct` and `incorrect` in any MC question
- [ ] The filename is listed in `index.json`
- [ ] Every typed-answer prompt can be completed in 12 characters or fewer under runtime rules
- [ ] Answer options are roughly equal in length within each question
- [ ] All questions have `feedback`

### Question Testing

The repository has automated checks in [tests/data.test.js](tests/data.test.js) that are meant to catch both schema errors and common authoring mistakes.

Run this before submitting question changes:

```bash
node --test tests/data.test.js
```

What the tests currently check:

- Basic structure: valid JSON, required fields, dynamic-question schema, matching-pair shape, no duplicate options, no overlap between `correct` and `incorrect`
- Registration: the file exists, is listed in `index.json`, and has a valid entry in `catalog.json`
- Typed-answer ergonomics: fill-in, code-line, code-trace, and dynamic-numeric prompts must not require more than 12 typed characters after runtime normalization
- Extreme multi-answer uniformity: if a set has many multi-answer questions, they should not all use the exact same `correct/incorrect` shape
- Answer-length bias: on average, correct answers should not be much longer than wrong answers in the same set
- Cue-word bias in distractors: wrong answers should not lean too heavily on giveaway absolutes or negations like `always`, `never`, `only`, `all`, or `cannot`

How to use those heuristics as an author:

- If a multi-answer set keeps using `3 correct / 3 incorrect` or `2 correct / 3 incorrect`, change a few items so the set mixes shapes
- If correct answers are consistently the longest options, shorten them or make distractors more parallel in wording and detail
- If wrong answers keep using absolute phrasing, rewrite some of them to be plausible without depending on words like `always`, `never`, or `only`
- Treat heuristic failures as editorial feedback, not just a puzzle to satisfy mechanically; the goal is to reduce obvious clues

---

## Registering a New Question Set

After creating your JSON file (e.g., `python_01_basics.json`):

1. **Add the filename to [`index.json`](index.json):**
   ```json
   ["basic_math.json", "java_01_basics.json", "...", "python_01_basics.json"]
   ```

2. **Add an entry to [`catalog.json`](catalog.json):**
   ```json
   {
     "topic": "Python",
     "sets": [
       {
         "id": "python_01_basics.json",
         "title": "Python Basics",
         "description": "Variables, types, operators, and basic I/O",
         "question_count": 30
       }
     ]
   }
   ```

3. **Run the tests** to validate your set:
    ```bash
    node --test tests/data.test.js
   ```

---

## Complete Example: Mini Question Set

A small but complete example demonstrating several question styles:

```json
[
  {
    "question": "What is the correct file extension for a Java source file?",
    "correct": [".java"],
    "incorrect": [".class", ".jar", ".javac"],
    "feedback": "Java source files use the .java extension. The .class extension is for compiled bytecode."
  },
  {
    "question": "Which of the following are valid ways to declare a variable in Java?",
    "correct": [
      "int count = 10;",
      "String name = \"Alice\";",
      "var items = new ArrayList<String>();"
    ],
    "incorrect": [
      "variable count = 10;",
      "let name = \"Alice\";",
      "count := 10;"
    ],
    "feedback": "Java uses explicit type declarations or 'var' (Java 10+). It does not use 'variable', 'let', or ':=' syntax."
  },
  {
    "type": "fill_blank",
    "question": "To print output to the console in Java, you call System.out.___.",
    "correct": ["println", "println()", "print", "print()"],
    "case_sensitive": true,
    "feedback": "System.out.println() prints a line to the console. System.out.print() also works but does not add a newline."
  },
  {
    "type": "matching",
    "question": "Match each Java keyword to its purpose.",
    "pairs": [
      { "term": "class", "definition": "Declares a new reference type with fields and methods" },
      { "term": "import", "definition": "Makes types from other packages available without full qualification" },
      { "term": "return", "definition": "Exits a method and optionally provides a value to the caller" },
      { "term": "new", "definition": "Allocates memory and invokes a constructor to create an object" }
    ],
    "feedback": "These four keywords are among the most fundamental building blocks of any Java program."
  }
]
```

---

## LLM Prompt Template

When asking an LLM to generate a question set, use this prompt structure:

````
Write a LotRD question set on the topic: [TOPIC].

The output must be a valid JSON array following these rules:
- Multiple choice (single-answer): { "question", "correct": ["one answer"], "incorrect": [...3+ options], "feedback" }
- Multiple choice (multi-answer): { "question", "correct": ["answer1", "answer2", ...], "incorrect": [...], "feedback" }  
- Fill-in-the-blank: { "type": "fill_blank", "question" (with ___), "correct": ["accepted answers..."], "case_sensitive": bool, "feedback" }
- Matching: { "type": "matching", "question", "pairs": [{"term", "definition"}, ...], "feedback" }
- Code line: { "type": "code_line", "question", "language", "correct": ["accepted variants..."], "case_sensitive": bool, "feedback" }

Requirements:
- Generate [N] questions total
- Use approximately 60-70% multiple choice (mix of single and multi-answer), 15-20% fill-in-the-blank, 10-20% matching
- Order questions from easier to harder
- Every question must have a "feedback" field explaining the answer
- All MC answer options must be similar in length and structure
- Multi-answer stems must clearly imply multiple correct answers (e.g., "Which of the following are true about...?")
- Fill-in-the-blank answers should have one clear concept; list all accepted phrasings
- Matching pairs should all belong to the same category with parallel definition structure
- No duplicate or overlapping options within any question
- Output ONLY the JSON array, no wrapper object or markdown

Topic details: [DESCRIBE SCOPE, DIFFICULTY LEVEL, PREREQUISITES]
````
