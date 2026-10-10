// tests/jtiny-differential.test.js — the practice Java against the real JDK.
//
// src/jtiny.js exists so that a student can write a Java method and see what it
// returns. Its one promise is that it never runs a method differently from Java:
// it may refuse, it may not be wrong. Nothing but Java can check that promise, so
// every program in tests/helpers/java-corpus.js is handed to javac and the JVM
// and to jtiny, and the two must agree — on each result, on which exception
// stopped a call, and on which programs do not compile at all.
//
// Without a JDK these tests are skipped, loudly. CI sets LOTRD_REQUIRE_JAVA so
// that they cannot be skipped there.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runProblemOnJtiny, findJdk, runOnJdk, runOnJtiny, caseForProblem } from './helpers/jdk.js';
import { AGREES, PROBLEMS, REJECTS, REFUSES, fuzzCases, flowCases, typeCases, boxCases, formatCases, roundingCases, collectionCases, collectionTypeCases, objectCases, inheritanceCases, interestingDoubles } from './helpers/java-corpus.js';
import { javaDouble } from '../src/jtiny.js';

const jdk = findJdk();
if (!jdk && process.env.LOTRD_REQUIRE_JAVA) {
  throw new Error('LOTRD_REQUIRE_JAVA is set but no JDK 25 or newer was found');
}
const skip = jdk ? false
  : 'NO JDK 25 FOUND — the practice Java was not compared with real Java. Install a JDK or set LOTRD_JAVA.';

const FUZZ_SEED = 20261008;
const FUZZ_CASES = 60;      // × 12 expressions × 3 argument sets = 2,160 evaluations
const FLOW_CASES = 600;     // method bodies: does it compile, and then what does it return
const TYPE_CASES = 900;     // expressions built with no regard for type: does it compile
const BOX_CASES = 600;      // the same, with Integer, Double and the other wrappers among them
const FORMAT_CASES = 400;   // String.format and printf with formats made at random
const COLLECTION_CASES = 30;   // × 25 runs of adds, removes and lookups: the order a HashMap and a HashSet print in
const COLLECTION_TYPE_CASES = 600;   // collection methods called on, and handed, anything at all
const OBJECT_CASES = 600;     // two small classes, used with no regard for what is private, static or null
const INHERITANCE_CASES = 600;   // an abstract class, two interfaces and three classes, used with no regard for type
const ROUNDING_CASES = 6;   // × 150 doubles × 9 ways of writing each: where %.2f rounds

// Everything goes to the JDK in one process: starting a JVM costs more than all the cases together.
const agree = Object.entries({ ...AGREES, ...PROBLEMS });
const reject = Object.entries(REJECTS).map(([name, source]) => [name, typeof source === 'string' ? { methods: source, calls: [] } : { methods: '', calls: [], ...source }]);
const refuse = Object.entries(REFUSES);
const fuzz = fuzzCases(FUZZ_SEED, FUZZ_CASES);
const generated = [...flowCases(FUZZ_SEED, FLOW_CASES), ...typeCases(FUZZ_SEED, TYPE_CASES), ...boxCases(FUZZ_SEED, BOX_CASES),
  ...formatCases(FUZZ_SEED, FORMAT_CASES), ...roundingCases(FUZZ_SEED, ROUNDING_CASES),
  ...collectionTypeCases(FUZZ_SEED, COLLECTION_TYPE_CASES), ...collectionCases(FUZZ_SEED, COLLECTION_CASES), ...objectCases(FUZZ_SEED, OBJECT_CASES), ...inheritanceCases(FUZZ_SEED, INHERITANCE_CASES)];
const doubles = interestingDoubles(FUZZ_SEED, 1500);
// A Java method may hold only so much code, so the bit patterns go in several.
const DOUBLES_PER_METHOD = 800;
const doubleChunks = Array.from({ length: Math.ceil(doubles.length / DOUBLES_PER_METHOD) },
  (_, i) => doubles.slice(i * DOUBLES_PER_METHOD, (i + 1) * DOUBLES_PER_METHOD));
const doubleCase = {
  methods: doubleChunks.map((chunk, i) =>
    `String all${i}() { long[] bits = {${chunk.map(b => `0x${b.toString(16)}L`).join(', ')}}; StringBuilder sb = new StringBuilder(); ` +
    'for (long b : bits) sb.append(Double.longBitsToDouble(b)).append(\' \'); return sb.toString(); }').join('\n'),
  calls: doubleChunks.map((_, i) => `all${i}()`),
};

// Every Java write-the-code problem in a question set, plus one here so that the path
// is exercised while the sets have none: the reference solution, on the real JDK.
const SAMPLE_PROBLEM = {
  signature: 'public double[] scaled(double[] values, double by, String label, char mark, long big, boolean on, int[][] grid)',
  tests: [
    { args: [[1.5, -2, 0.1], 3, 'a "b"', 'x', 5000000000, true, [[1, 2], []]], expect: [4.5, -6, 0.30000000000000004] },
    { args: [[], -0.5, null, '\'', -1, false, [[-3]]], expect: [] },
  ],
  solution: 'double[] out = new double[values.length];\nfor (int i = 0; i < values.length; i++) {\n    out[i] = values[i] * by;\n}\nreturn out;',
};
// And a class problem: private fields, a constructor, a setter that guards, a second class it is handed, and toString.
const SAMPLE_CLASS_PROBLEM = {
  signature: 'public class Hero',
  scaffold: 'class Item {\n    private String name;\n    private int price;\n\n    Item(String name, int price) {\n        this.name = name;\n        this.price = price;\n    }\n\n    public String getName() {\n        return name;\n    }\n\n    public int getPrice() {\n        return price;\n    }\n}',
  tests: [
    { run: 'Hero h = new Hero("Aria", 50);\nItem potion = new Item("Potion", 20);', check: 'h.buy(potion)', expect: true },
    { run: 'Hero h = new Hero("Aria", 50);\nh.buy(new Item("Potion", 20));\nh.buy(new Item("Sword", 80));', check: 'h.getGold()', expect: 30 },
    { run: 'Hero h = new Hero("Aria", -5);\nSystem.out.println(h);', check: '"" + h + h.getGold() / 2.0', expect: 'Aria (0 gold)0.0' },
    { run: 'Hero a = new Hero("A", 9);\nHero b = new Hero("B", 1);\na.buy(new Item("x", 4));', check: 'b.toString()', expect: 'B (1 gold)' },
    { private: 'Hero.gold' },
  ],
  solution: 'private String name;\nprivate int gold;\n\nHero(String name, int gold) {\n    this.name = name;\n    this.gold = gold < 0 ? 0 : gold;\n}\n\npublic int getGold() {\n    return gold;\n}\n\npublic boolean buy(Item item) {\n    if (item.getPrice() > gold) {\n        return false;\n    }\n    gold -= item.getPrice();\n    return true;\n}\n\n@Override\npublic String toString() {\n    return name + " (" + gold + " gold)";\n}',
};
const SAMPLE_METHOD_IN_CLASS = {
  signature: 'public void takeDamage(int amount)',
  scaffold: 'public class Monster {\n    private int health;\n\n    Monster(int health) {\n        this.health = health;\n    }\n\n    public int getHealth() {\n        return health;\n    }\n',
  tests: [
    { run: 'Monster m = new Monster(30);\nm.takeDamage(10);', check: 'm.getHealth()', expect: 20 },
    { run: 'Monster m = new Monster(30);\nm.takeDamage(99);', check: 'm.getHealth()', expect: 0 },
    { run: 'Monster a = new Monster(30);\nMonster b = new Monster(8);\na.takeDamage(5);', check: 'b.getHealth()', expect: 8 },
  ],
  solution: 'health = health - amount;\nif (health < 0) {\n    health = 0;\n}',
};
const root = new URL('../', import.meta.url);
const setProblems = [['(a sample, kept here)', 0, SAMPLE_PROBLEM], ['(a sample class, kept here)', 0, SAMPLE_CLASS_PROBLEM], ['(a sample method of a class, kept here)', 0, SAMPLE_METHOD_IN_CLASS]];
for (const setId of JSON.parse(readFileSync(new URL('question_sets/index.json', root), 'utf8'))) {
  JSON.parse(readFileSync(new URL(`question_sets/${setId}`, root), 'utf8')).forEach((q, i) => {
    if (q.type === 'code_write' && q.language === 'java') setProblems.push([setId, i, q]);
  });
}
const problemCases = setProblems.map(([, , q]) => caseForProblem(q));

const everything = [...problemCases, ...agree.map(([, c]) => c), ...reject.map(([, c]) => c), ...refuse.map(([, c]) => c), ...fuzz, doubleCase, ...generated];
const java = jdk ? runOnJdk(jdk, everything) : [];
let at = 0;
const take = n => { const slice = java.slice(at, at + n); at += n; return slice; };
const javaProblems = take(problemCases.length);
const javaAgree = take(agree.length);
const javaReject = take(reject.length);
const javaRefuse = take(refuse.length);
const javaFuzz = take(fuzz.length);
const [javaDoubles] = take(1);
const javaGenerated = take(generated.length);

/** Call by call, so a failure names the call rather than dumping two long outputs. */
function assertSameCalls(testCase, expected, mine) {
  const want = expected.out.split('\n');
  const got = mine.out.split('\n');
  // With printing mixed in, lines and calls no longer pair up; compare the whole text.
  if (want.length !== testCase.calls.length + 1 || got.length !== want.length) {
    assert.equal(mine.out, expected.out);
    return;
  }
  const differences = testCase.calls
    .map((call, i) => (want[i] === got[i] ? null : `${call}\n      Java:  ${want[i]}\n      jtiny: ${got[i]}${got[i] === '?refused' ? `   (${mine.refused})` : ''}`))
    .filter(Boolean);
  assert.deepEqual(differences, [], `\n    ${differences.join('\n    ')}\n`);
}

describe('every Java problem in the question sets: its reference solution, on real Java', { skip }, () => {
  // tests/data.test.js proves each solution passes its own table on jtiny. This proves
  // jtiny and Java return the same thing for every row — so the table is true of Java.
  setProblems.forEach(([setId, index, question], i) => {
    it(`${setId}[${index}] ${question.signature}`, () => {
      assert.ok(javaProblems[i].compiled, `the reference solution does not compile on real Java: ${javaProblems[i].compileError}`);
      const mine = runProblemOnJtiny(question);
      assert.ok(mine.compiled, `jtiny refused the reference solution: ${mine.compileError}`);
      assertSameCalls(problemCases[i], javaProblems[i], mine);
    });
  });
});

describe('the practice Java gives the answers real Java gives', { skip }, () => {
  agree.forEach(([name, testCase], i) => {
    it(name, () => {
      assert.ok(javaAgree[i].compiled, `this case does not compile on real Java: ${javaAgree[i].compileError}`);
      const mine = runOnJtiny(testCase);
      assert.ok(mine.compiled, `jtiny refused a program Java runs: ${mine.compileError}`);
      assertSameCalls(testCase, javaAgree[i], mine);
    });
  });
});

describe('the practice Java refuses what javac refuses', { skip }, () => {
  reject.forEach(([name, testCase], i) => {
    it(name, () => {
      assert.ok(!javaReject[i].compiled, 'this compiles on real Java; it belongs in AGREES');
      const mine = runOnJtiny(testCase);
      assert.ok(!mine.compiled, `jtiny accepted a method javac rejects (${javaReject[i].compileError})`);
    });
  });
});

describe('where the practice Java stops short of Java, it says so and gives no answer', { skip }, () => {
  refuse.forEach(([name, testCase], i) => {
    it(name, () => {
      assert.ok(javaRefuse[i].compiled, `this does not compile on real Java (${javaRefuse[i].compileError}); it belongs in REJECTS`);
      const mine = runOnJtiny(testCase, { steps: 200000 });
      if (!mine.compiled) return;
      const answered = mine.out.split('\n').filter(line => line !== '' && line !== '?refused');
      assert.deepEqual(answered, [], 'jtiny answered where it was expected to refuse — if it is now right, move this case to AGREES');
    });
  });
});

describe('arithmetic by the thousand: random expressions over every number type', { skip }, () => {
  fuzz.forEach((testCase, i) => {
    it(`seed ${FUZZ_SEED}, batch ${i + 1}`, () => {
      assert.ok(javaFuzz[i].compiled, `the generator wrote something Java rejects: ${javaFuzz[i].compileError}`);
      const mine = runOnJtiny(testCase);
      assert.ok(mine.compiled, `jtiny refused a generated expression: ${mine.compileError}`);
      const want = javaFuzz[i].out.split('\n');
      const got = mine.out.split('\n');
      const lines = testCase.methods.split('\n');
      const differences = testCase.calls
        .map((call, k) => (want[k] === got[k] ? null : `${lines[Math.floor(k / 3)].trim()}\n      ${call}\n      Java:  ${want[k]}\n      jtiny: ${got[k]}`))
        .filter(Boolean);
      assert.deepEqual(differences.slice(0, 5), [], `\n    ${differences.slice(0, 5).join('\n    ')}\n`);
    });
  });
});

describe('generated methods: jtiny and javac agree on which compile, and on what those return', { skip }, () => {
  // Three ways to disagree, all of them wrong: accepting what javac rejects; calling a
  // Java error on what javac accepts; and a different answer. Declining is none of them.
  const BATCH = 100;
  for (let from = 0; from < generated.length; from += BATCH) {
    const kind = from < FLOW_CASES ? 'method bodies' : from < FLOW_CASES + TYPE_CASES + BOX_CASES ? 'type puzzles'
      : from < FLOW_CASES + TYPE_CASES + BOX_CASES + FORMAT_CASES + ROUNDING_CASES ? 'formats'
        : from < generated.length - OBJECT_CASES - INHERITANCE_CASES ? 'collections' : 'objects';
    it(`seed ${FUZZ_SEED}, ${kind} ${from + 1}–${Math.min(from + BATCH, generated.length)}`, () => {
      const disagreements = [];
      let bothRan = 0;
      for (let i = from; i < Math.min(from + BATCH, generated.length); i++) {
        const testCase = generated[i];
        const real = javaGenerated[i];
        const mine = runOnJtiny(testCase, { steps: 200000 });
        if (!mine.compiled && mine.unsupported) continue;
        if (real.compiled !== mine.compiled) {
          disagreements.push(`${real.compiled ? `jtiny called a Java error (${mine.compileError}) on what Java runs` : `jtiny accepted what javac rejects (${real.compileError})`}\n${testCase.methods}`);
          continue;
        }
        if (!real.compiled) continue;
        bothRan++;
        const want = real.out.split('\n');
        const got = mine.out.split('\n');
        const k = want.findIndex((w, x) => w !== got[x] && got[x] !== '?refused');
        // A refusal is one line where Java may have printed several, and then the lines no longer pair up.
        if (k >= 0 && !(got.includes('?refused') && got.length !== want.length)) disagreements.push(`${testCase.calls[k]}: Java ${want[k]}, jtiny ${got[k]}\n${testCase.methods}`);
      }
      assert.deepEqual(disagreements.slice(0, 3), [], `\n${disagreements.slice(0, 3).join('\n\n')}\n`);
      // Most collection puzzles are type errors, so fewer of them run.
      assert.ok(bothRan >= Math.min(kind === 'objects' ? 1 : kind === 'collections' ? 3 : 10, generated.length - from), `only ${bothRan} of this batch compiled on both sides; the generator has drifted`);
    });
  }
});

describe('a double prints exactly as Java prints it', { skip }, () => {
  it(`${doubles.length} doubles, from the smallest to the largest`, () => {
    assert.ok(javaDoubles.compiled, javaDoubles.compileError);
    const want = javaDoubles.out.replace(/"/g, ' ').trim().split(/\s+/);
    assert.equal(want.length, doubles.length);
    const view = new DataView(new ArrayBuffer(8));
    const differences = [];
    doubles.forEach((bits, i) => {
      view.setBigUint64(0, bits);
      const mine = javaDouble(view.getFloat64(0));
      if (mine !== want[i]) differences.push(`0x${bits.toString(16)}: Java ${want[i]}, jtiny ${mine}`);
    });
    assert.deepEqual(differences.slice(0, 20), []);
  });
});
