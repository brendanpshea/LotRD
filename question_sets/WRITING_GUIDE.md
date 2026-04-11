# Problem Set Writing Guide

> A reference for humans and LLMs on how to write high-quality question sets for LotRD.

---

## File Format Overview

Each question set is a **JSON array** of question objects saved in `question_sets/`. Three question types are supported:

| Type | `type` field | Selection UI | Best for |
|------|-------------|-------------|----------|
| Multiple Choice | *(omitted)* | Radio (1 correct) or Checkbox (2+ correct) | Recall, analysis, "select all that apply" |
| Fill-in-the-Blank | `"fill_blank"` | Text input | Terminology, syntax, exact recall |
| Matching | `"matching"` | Dropdowns | Associating terms with definitions |

A good problem set uses a **mix of all types**. Aim for roughly:
- 60–70% multiple choice (split between single-answer and multi-answer)
- 15–20% fill-in-the-blank
- 10–20% matching

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

2. **Avoid "all of the above" and "none of the above."** Answers are shuffled, so positional references break.

3. **Make distractors plausible.** Each wrong answer should represent a common misconception or a closely related concept—not an absurd option.

4. **Keep the stem self-contained.** A reader should understand what is being asked without reading the answer options first.

5. **Use precise language.** Avoid vague qualifiers ("sometimes," "usually") unless the ambiguity is the point of the question.

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

7. **Avoid fill-in-the-blank for answers with many valid phrasings.** If there are 10 reasonable ways to say the answer, use multiple choice instead.

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

## Type 4: Matching

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
- [ ] MC questions have non-empty `correct[]` and `incorrect[]`
- [ ] Fill-blank questions have `"type": "fill_blank"` and non-empty `correct[]`
- [ ] Matching questions have `"type": "matching"` and ≥ 2 pairs with `term` and `definition`
- [ ] No duplicate options within any MC question (`correct` ∪ `incorrect` has no repeats)
- [ ] No overlap between `correct` and `incorrect` in any MC question
- [ ] `question_count` in `catalog.json` matches the actual array length
- [ ] The filename is listed in `index.json`
- [ ] Answer options are roughly equal in length within each question
- [ ] All questions have `feedback`

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
   ```
   npm test
   ```

---

## Complete Example: Mini Question Set

A small but complete example demonstrating all four question styles:

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
