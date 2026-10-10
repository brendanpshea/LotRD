// tests/jtiny.test.js — what a student sees when they write a Java method.
//
// Whether jtiny computes what Java computes is settled against the real JDK in
// jtiny-differential.test.js. This file is about everything around that: the
// results table, the line an error is pinned to, the wording when it will not
// compile, and what happens when the box holds something we did not ask for.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  runJavaTestCases, runJavaProblem, assembleJava, parseJavaSignature, javaProblemHeader,
  javaFromJson, javaRepr, javaEquals, javaDouble, compileJava, evaluateJava, JavaError,
} from '../src/jtiny.js';

const SUM = {
  type: 'code_write',
  language: 'java',
  signature: 'public int sumDouble(int a, int b)',
  tests: [
    { args: [1, 2], expect: 3 },
    { args: [3, 3], expect: 12 },
    { args: [0, 0], expect: 0 },
    { args: [-2, 5], expect: 3 },
  ],
  solution: 'int sum = a + b;\nif (a == b) {\n    sum = sum * 2;\n}\nreturn sum;',
};
const run = (body, question = SUM, options = {}) => runJavaProblem(question, body, options);
const withTests = (signature, tests) => ({ ...SUM, signature, tests });

describe('a Java problem: the results table', () => {
  it('passes every test for a correct body', () => {
    const outcome = run(SUM.solution);
    assert.equal(outcome.ok, true);
    assert.equal(outcome.passed, 4);
    assert.deepEqual(outcome.results[1], { call: 'sumDouble(3, 3)', expectedRepr: '12', actualRepr: '12', passed: true, output: [], error: null });
  });

  it('shows what a wrong body actually returned, test by test', () => {
    const outcome = run('return a + b;');
    assert.equal(outcome.ok, true);
    assert.equal(outcome.passed, 3);
    assert.equal(outcome.results[1].passed, false);
    assert.equal(outcome.results[1].actualRepr, '6');
  });

  it('writes values the way they are written in Java code', () => {
    const q = withTests('public String describe(String name, char grade, double score, boolean ok, int[] marks)',
      [{ args: ['Ada "L"', 'A', 3, true, [1, 2]], expect: null }]);
    const outcome = run('return null;', q);
    assert.equal(outcome.results[0].call, 'describe("Ada \\"L\\"", \'A\', 3.0, true, [1, 2])');
    assert.equal(outcome.results[0].expectedRepr, 'null');
    assert.equal(outcome.results[0].passed, true);
  });

  it('compares arrays by their values, and Strings by their text', () => {
    const q = withTests('public String[] both(String a, String b)', [{ args: ['x', 'y'], expect: ['x', 'y'] }, { args: ['', 'q'], expect: ['', 'q'] }]);
    assert.equal(run('String[] out = new String[2];\nout[0] = a;\nout[1] = b;\nreturn out;', q).passed, 2);
    assert.equal(run('return new String[] { b, a };', q).passed, 0);
    assert.equal(run('return new String[] { a };', q).passed, 0);
    assert.equal(run('return null;', q).passed, 0);
  });

  it('lets a double differ in its last few bits, because the order of the arithmetic decides those', () => {
    const q = withTests('public double average(double a, double b, double c)', [{ args: [0.1, 0.2, 0.3], expect: 0.2 }]);
    assert.equal(run('return (a + b + c) / 3;', q).results[0].actualRepr, '0.20000000000000004');
    assert.equal(run('return (a + b + c) / 3;', q).passed, 1);
    assert.equal(run('return a / 3 + b / 3 + c / 3;', q).passed, 1);
    assert.equal(run('return 0.2001;', q).passed, 0);
  });

  it('keeps what the method printed, beside the row it was printed for', () => {
    const outcome = run('System.out.println("a is " + a);\nSystem.out.print(b);\nreturn a + b;');
    assert.deepEqual(outcome.results[0].output, ['a is 1', '2']);
  });

  it('a test that throws is reported on its own row, and the others still run', () => {
    const q = withTests('public int share(int total, int people)', [{ args: [10, 2], expect: 5 }, { args: [10, 0], expect: 0 }, { args: [9, 3], expect: 3 }]);
    const outcome = run('return total / people;', q);
    assert.equal(outcome.ok, true);
    assert.equal(outcome.passed, 2);
    const err = outcome.results[1].error;
    assert.match(err.message, /^ArithmeticException: \/ by zero$/);
    assert.match(err.hint, /divided by zero/);
    assert.equal(err.line, 1);
    assert.equal(err.kind, 'runtime');
  });

  it('each test starts with fresh arguments: one test cannot spoil an array for the next', () => {
    const q = withTests('public int first(int[] nums)', [{ args: [[5, 6]], expect: 5 }, { args: [[5, 6]], expect: 5 }]);
    assert.equal(run('int f = nums[0];\nnums[0] = -1;\nreturn f;', q).passed, 2);
  });
});

describe('a Java problem: errors are pinned to the line the student wrote', () => {
  it('counts lines of the box, not of the method assembled around it', () => {
    const outcome = run('int sum = a + b;\nint extra = sum / 0;\nreturn sum;');
    assert.equal(outcome.results[0].error.line, 2);
  });

  it('a missing semicolon is blamed on the line that should have ended with it', () => {
    const outcome = run('int sum = a + b\nreturn sum;');
    assert.equal(outcome.ok, false);
    assert.equal(outcome.error.line, 1);
    assert.match(outcome.error.message, /expected a ;/);
    assert.equal(outcome.error.kind, 'syntax');
  });

  it('a missing return is named for what it is, and stays inside the box', () => {
    const outcome = run('if (a == b) {\n    return 2 * (a + b);\n}');
    assert.equal(outcome.ok, false);
    assert.match(outcome.error.message, /has to return an int however it ends/);
    assert.match(outcome.error.hint, /might be skipped/);
    assert.equal(outcome.error.line, 3, 'the last line of what they typed, not a line they cannot see');
  });

  it('printing instead of returning gets the hint that names the mistake', () => {
    const outcome = run('System.out.println(a + b);');
    assert.match(outcome.error.hint, /RETURNS/);
  });

  it('an error inside a helper the student pasted is counted in the pasted lines', () => {
    const pasted = 'public int sumDouble(int a, int b) {\n    return twice(a + b);\n}\n\nint twice(int n) {\n    int[] xs = new int[1];\n    return xs[n];\n}';
    const outcome = run(pasted);
    assert.equal(outcome.results[0].error.line, 7);
    assert.match(outcome.results[0].error.message, /ArrayIndexOutOfBoundsException: Index 3 out of bounds for length 1/);
  });
});

describe('a Java problem: what may be typed into the box', () => {
  it('the body alone', () => {
    assert.equal(run('return a == b ? 2 * (a + b) : a + b;').passed, 4);
  });

  it('the whole method, pasted with its first line', () => {
    assert.equal(run('public int sumDouble(int a, int b) {\n' + SUM.solution + '\n}').passed, 4);
  });

  it('the whole method with a helper beside it', () => {
    assert.equal(run('int twice(int n) { return n * 2; }\npublic int sumDouble(int a, int b) { return a == b ? twice(a + b) : a + b; }').passed, 4);
  });

  it('a whole class around it, imports and all', () => {
    assert.equal(run('import java.util.*;\n\npublic class Solution {\n    public int sumDouble(int a, int b) {\n        return a == b ? 2 * (a + b) : a + b;\n    }\n}').passed, 4);
  });

  it('static or not, public or not: the method is found by its name and its types', () => {
    assert.equal(run('static int sumDouble(int a, int b) { return a == b ? 2 * (a + b) : a + b; }').passed, 4);
  });

  it('a method pasted under another name is told which name was wanted', () => {
    const outcome = run('public int sumDoubled(int a, int b) { return a + b; }');
    assert.equal(outcome.ok, false);
    assert.match(outcome.error.message, /could not find a method called sumDouble\(\)/);
    assert.match(outcome.error.hint, /You wrote sumDoubled\(\).*public int sumDouble\(int a, int b\)/);
  });

  it('a method pasted with different types is told how it has to be declared', () => {
    const outcome = run('public double sumDouble(int a, int b) { return a + b; }');
    assert.equal(outcome.ok, false);
    assert.match(outcome.error.message, /not declared the way the problem asks/);
  });

  it('an empty box is a friendly message, not a crash', () => {
    const outcome = run('  \n\t\n');
    assert.equal(outcome.ok, false);
    assert.match(outcome.error.message, /not written any code/);
    assert.equal(outcome.results.length, 4);
  });

  it('one } too many is said in those words', () => {
    assert.match(run('if (a == b) {\n    return 0;\n}\n}\nreturn a + b;').error.message, /one more \} than there are \{|outside the method/);
  });

  it('a { never closed is said in those words', () => {
    const outcome = run('if (a == b) {\n    return 0;\nreturn a + b;');
    assert.match(outcome.error.message, /never closed/);
  });

  it('Windows line endings and tabs are just layout', () => {
    assert.equal(run('int sum = a + b;\r\nif (a == b) {\r\n\tsum = sum * 2;\r\n}\r\nreturn sum;').passed, 4);
  });
});

describe('a Java problem: the wording of the errors beginners make', () => {
  const message = body => { const o = run(body); return `${(o.error || o.results[0].error).message} | ${(o.error || o.results[0].error).hint}`; };

  it('= where == was meant', () => assert.match(message('if (a = b) return 1;\nreturn 0;'), /true-or-false test.*single = stores/s));
  it('== between Strings is declined, with .equals() offered', () => {
    const q = withTests('public boolean same(String a, String b)', [{ args: ['x', 'x'], expect: true }]);
    const outcome = run('return a == b;', q);
    assert.match(outcome.error.message, /very same object/);
    assert.match(outcome.error.hint, /a\.equals\(b\)/);
  });
  it('a double into an int', () => assert.match(message('int half = a / 2.0;\nreturn half;'), /double cannot be stored.*\(int\) value/s));
  it('an int used as a test', () => assert.match(message('if (a) return 1;\nreturn 0;'), /number as true or false/));
  it('a name that is nearly right', () => assert.match(message('int total = a + b;\nreturn totl;'), /no variable called totl.*Did you mean total/s));
  it('a capital letter out of place', () => assert.match(message('int total = a + b;\nreturn Total;'), /capital and small letters as different/));
  it('a variable declared twice', () => assert.match(message('int sum = a;\nint sum = b;\nreturn sum;'), /already declared.*leave the type off/s));
  it('a variable named like a parameter', () => assert.match(message('int a = 5;\nreturn a;'), /already the name of one of this method's parameters/));
  it('a variable with no value yet', () => assert.match(message('int sum;\nif (a > 0) sum = a;\nreturn sum;'), /might not have been given a value.*int sum = 0;/s));
  it('a line after return', () => assert.match(message('return a;\na++;'), /can never run/));
  it('a value on a line by itself', () => assert.match(message('a + b;\nreturn a;'), /does nothing with it/));
  it('a Python habit: a hash comment', () => assert.match(message('# add them\nreturn a + b;'), /Java comment starts with \/\//));
  it('a curly quote from a word processor', () => assert.match(message('String s = “hi”;\nreturn 0;'), /curly quote/));
  it('.length on a String without its ( )', () => {
    const q = withTests('public int size(String s)', [{ args: ['ab'], expect: 2 }]);
    assert.match(run('return s.length;', q).error.hint, /text\.length\(\)/);
  });
  it('.length() on an array', () => {
    const q = withTests('public int size(int[] nums)', [{ args: [[1]], expect: 1 }]);
    assert.match(run('return nums.length();', q).error.hint, /nums\.length/);
  });
  it('charAt past the end says how long the text is', () => {
    const q = withTests('public char last(String s)', [{ args: ['abc'], expect: 'c' }]);
    const err = run('return s.charAt(s.length());', q).results[0].error;
    assert.match(err.message, /StringIndexOutOfBoundsException/);
    assert.match(err.hint, /3 characters.*0 to 2/);
  });
  it('a method on null', () => {
    const q = withTests('public int size(String s)', [{ args: [null], expect: 0 }]);
    assert.match(run('return s.length();', q).results[0].error.message, /^NullPointerException$/);
  });
  it('something this box does not run is declined by name', () => {
    assert.match(message('TreeMap<String, Integer> xs = new TreeMap<>();\nreturn 0;'), /does not have TreeMap<…>.*ArrayList, LinkedList, HashSet and HashMap/s);
    assert.match(message('try { return a / b; } catch (Exception e) { return 0; }'), /try \/ catch is not available here yet/);
    assert.match(message('return (int) Math.random();'), /Math\.random\(\).*same answer every time/);
  });
});

describe('a Java problem: wrapper objects, null, and formatted text', () => {
  const HALF = withTests('public Double half(Integer n)', [{ args: [5], expect: 2.5 }, { args: [null], expect: null }]);

  it('a test can hand a method null, and want null back', () => {
    const outcome = run('if (n == null) {\n    return null;\n}\nreturn n / 2.0;', HALF);
    assert.deepEqual(outcome.results.map(r => r.passed), [true, true]);
    assert.equal(outcome.results[1].call, 'half(null)');
  });
  it('unboxing a null is a NullPointerException, on the line that did it, and says which value was null', () => {
    const err = run('double d = 1.0;\nreturn n / 2.0;', HALF).results[1].error;
    assert.equal(err.message, 'NullPointerException');
    assert.equal(err.line, 2);
    assert.match(err.hint, /The Integer being used as an int is null/);
  });
  it('== between two Integers is declined, with .equals() offered', () => {
    const q = withTests('public boolean same(Integer a, Integer b)', [{ args: [5, 5], expect: true }]);
    const outcome = run('return a == b;', q);
    assert.match(outcome.error.message, /very same object/);
    assert.match(outcome.error.hint, /a\.equals\(b\)/);
  });
  it('an int does not go into a Double', () => {
    const outcome = run('Double d = 5;\nreturn d;', HALF);
    assert.match(outcome.error.message, /Java boxes a double into a Double, and nothing else/);
    assert.match(outcome.error.hint, /5\.0/);
  });
  it('String.format: %.2f rounds, and shows both places', () => {
    const q = withTests('public String tag(String item, double price)', [{ args: ['Tea', 19.876], expect: 'Tea: $19.88' }, { args: ['Caf', 3], expect: 'Caf: $3.00' }]);
    assert.deepEqual(run('return String.format("%s: $%.2f", item, price);', q).results.map(r => r.passed), [true, true]);
  });
  it('a value that does not fit its % place stops the method the way Java does, and says which place to use', () => {
    const q = withTests('public String tag(double price)', [{ args: [2.5], expect: '2.50' }]);
    const err = run('return String.format("%d", price);', q).results[0].error;
    assert.match(err.message, /^IllegalFormatConversionException/);
    assert.match(err.hint, /%d is for whole numbers.*%\.2f/);
  });
  it('a format this box does not have is declined by name', () => {
    const q = withTests('public String hex(int n)', [{ args: [255], expect: 'ff' }]);
    assert.match(run('return String.format("%x", n);', q).error.message, /does not have %x in a format/);
  });
  it('printf prints beside the test, like println', () => {
    const outcome = run('System.out.printf("%d + %d%n", a, b);\nreturn a + b;', withTests(SUM.signature, [{ args: [1, 2], expect: 3 }]));
    assert.equal(outcome.results[0].passed, true);
    assert.match(JSON.stringify(outcome.results[0]), /1 \+ 2/);
  });
});

describe('a Java problem: lists, sets and maps', () => {
  const LONG = withTests('public ArrayList<String> longTitles(ArrayList<String> songs, int minLength)', [
    { args: [['Imagine', 'Kids', 'Yesterday'], 5], expect: ['Imagine', 'Yesterday'] },
    { args: [[], 1], expect: [] },
  ]);
  const COUNT = withTests('public HashMap<String, Integer> countPlays(String[] plays)', [
    { args: [['b', 'a', 'b']], expect: [['a', 1], ['b', 2]] },
  ]);

  it('a test hands a method a list, and the call is written the way Java prints one', () => {
    const outcome = run('ArrayList<String> out = new ArrayList<>();\nfor (String s : songs) {\n    if (s.length() >= minLength) {\n        out.add(s);\n    }\n}\nreturn out;', LONG);
    assert.deepEqual(outcome.results.map(r => r.passed), [true, true]);
    assert.equal(outcome.results[0].call, 'longTitles(["Imagine", "Kids", "Yesterday"], 5)');
  });
  it('a list is compared in order', () => {
    const outcome = run('ArrayList<String> out = new ArrayList<>(songs);\nCollections.reverse(out);\nout.remove("Kids");\nreturn out;', LONG);
    assert.equal(outcome.results[0].passed, false);
  });
  it('a map is written as pairs in the question file, and compared by what it holds, in any order', () => {
    const body = 'HashMap<String, Integer> m = new HashMap<>();\nfor (String p : plays) {\n    if (m.containsKey(p)) {\n        m.put(p, m.get(p) + 1);\n    } else {\n        m.put(p, 1);\n    }\n}\nreturn m;';
    assert.equal(run(body, COUNT).results[0].passed, true);
    assert.equal(run('HashMap<String, Integer> m = new HashMap<>();\nm.put("b", 2);\nreturn m;', COUNT).results[0].passed, false);
  });
  it('a set is compared by what it holds', () => {
    const q = withTests('public HashSet<String> unique(String[] names)', [{ args: [['x', 'y', 'x']], expect: ['y', 'x'] }]);
    assert.equal(run('HashSet<String> s = new HashSet<>();\nfor (String n : names) {\n    s.add(n);\n}\nreturn s;', q).results[0].passed, true);
  });
  it('removing inside a for-each is stopped, and the message names the exception Java would throw', () => {
    const err = run('for (String s : songs) {\n    if (s.length() < minLength) {\n        songs.remove(s);\n    }\n}\nreturn songs;', LONG).results[0].error;
    assert.match(err.message, /ConcurrentModificationException/);
    assert.match(err.hint, /index/);
    assert.equal(err.line, 1);
  });
  it('get past the end says how long the list is', () => {
    const err = run('ArrayList<String> out = new ArrayList<>();\nout.add(songs.get(songs.size()));\nreturn out;', LONG).results[0].error;
    assert.match(err.message, /^IndexOutOfBoundsException/);
    assert.match(err.hint, /3 elements.*0 to 2/);
  });
  it('the habits of arrays, on a list', () => {
    assert.match(run('return songs.length;', LONG).error.message, /length/);
    assert.match(run('songs.length();\nreturn songs;', LONG).error.hint, /\.size\(\)/);
    assert.match(run('ArrayList<int> xs = new ArrayList<>();\nreturn songs;', LONG).error.hint, /ArrayList<Integer>/);
    assert.match(run('List<String> xs = new List<>();\nreturn songs;', LONG).error.hint, /new ArrayList<>\(\)/);
  });
  it('what is not here is declined by name', () => {
    assert.match(run('Collections.shuffle(songs);\nreturn songs;', LONG).error.message, /random order/);
    assert.match(run('songs.removeIf(s -> s.length() < 5);\nreturn songs;', LONG).error.message, /does not have/);
    assert.match(run('List<String> xs = List.of("a");\nreturn songs;', LONG).error.hint, /new ArrayList<>\(Arrays\.asList/);
  });
});

describe('a Java class problem: tests are short scripts, and the student writes a method or a whole class', () => {
  const MONSTER = 'public class Monster {\n    private String name;\n    private int health;\n\n    Monster(String name, int health) {\n        this.name = name;\n        this.health = health;\n    }\n\n    public int getHealth() {\n        return health;\n    }\n';
  const DAMAGE = {
    type: 'code_write', language: 'java', scaffold: MONSTER, signature: 'public void takeDamage(int amount)',
    tests: [
      { run: 'Monster m = new Monster("Goblin", 30);\nm.takeDamage(10);', check: 'm.getHealth()', expect: 20 },
      { run: 'Monster m = new Monster("Goblin", 30);\nm.takeDamage(99);', check: 'm.getHealth()', expect: 0 },
      { run: 'Monster a = new Monster("A", 30);\nMonster b = new Monster("B", 8);\na.takeDamage(5);', check: 'b.getHealth()', expect: 8 },
    ],
    solution: 'health = health - amount;\nif (health < 0) {\n    health = 0;\n}',
  };
  const WEAPON = {
    type: 'code_write', language: 'java', signature: 'public class Weapon',
    tests: [
      { run: 'Weapon w = new Weapon("Sword", 25);', check: 'w.getDamage()', expect: 25 },
      { run: 'Weapon w = new Weapon("Stick", -50);', check: 'w.getDamage()', expect: 0 },
      { run: 'Weapon w = new Weapon("Axe", 40);', check: 'w.describe()', expect: 'Axe deals 40 damage.' },
      { private: 'Weapon.damage' },
    ],
    solution: 'private String name;\nprivate int damage;\n\nWeapon(String name, int damage) {\n    this.name = name;\n    this.damage = damage < 0 ? 0 : damage;\n}\n\npublic int getDamage() {\n    return damage;\n}\n\npublic String describe() {\n    return name + " deals " + damage + " damage.";\n}',
  };
  const passed = outcome => outcome.results.map(r => r.passed);

  it('one method of a class that is given: the body alone, or the method pasted with its first line', () => {
    assert.deepEqual(passed(run(DAMAGE.solution, DAMAGE)), [true, true, true]);
    assert.deepEqual(passed(run(`public void takeDamage(int amount) {\n${DAMAGE.solution}\n}`, DAMAGE)), [true, true, true]);
  });
  it('a row is written as the steps taken and the thing looked at, and a wrong answer shows what was there instead', () => {
    const outcome = run('health -= amount;', DAMAGE);
    assert.deepEqual(passed(outcome), [true, false, true]);
    assert.equal(outcome.results[1].call, 'Monster m = new Monster("Goblin", 30); m.takeDamage(99); m.getHealth()');
    assert.equal(outcome.results[1].expectedRepr, '0');
    assert.equal(outcome.results[1].actualRepr, '-69');
  });
  it('an error in the student\'s lines is counted in the lines of their box, not of the class above it', () => {
    const outcome = run('health = health - amount;\nint left = "none";', DAMAGE);
    assert.equal(outcome.ok, false);
    assert.equal(outcome.error.line, 2);
    const thrown = run('int[] xs = new int[1];\nhealth = xs[amount];', DAMAGE).results[0].error;
    assert.match(thrown.message, /ArrayIndexOutOfBoundsException/);
    assert.equal(thrown.line, 2);
  });
  it('a whole class: written as its members, or pasted with its class line', () => {
    assert.deepEqual(passed(run(WEAPON.solution, WEAPON)), [true, true, true, true]);
    assert.deepEqual(passed(run(`public class Weapon {\n${WEAPON.solution}\n}`, WEAPON)), [true, true, true, true]);
  });
  it('a field that was to be private and is not fails the row that asks, and only that row', () => {
    const outcome = run(WEAPON.solution.replace('private int damage', 'int damage'), WEAPON);
    assert.deepEqual(passed(outcome), [true, true, true, false]);
    assert.equal(outcome.results[3].call, 'damage is private in Weapon');
  });
  it('a test that cannot be run against the class says what it needed, with no line number to chase', () => {
    const outcome = run(WEAPON.solution.replace('getDamage', 'getdamage'), WEAPON);
    assert.equal(outcome.ok, true);
    assert.match(outcome.results[0].error.message, /has no method called getDamage\(\)/);
    assert.match(outcome.results[0].error.hint, /getdamage/);
    assert.equal(outcome.results[0].error.line, null);
    assert.equal(outcome.results[2].passed, true);
  });
  it('a class under another name is told which name was wanted', () => {
    const outcome = run(`public class Wepon {\n${WEAPON.solution.replace('Weapon(String', 'Wepon(String')}\n}`, WEAPON);
    assert.match(outcome.error.message, /could not find a class called Weapon/);
    assert.match(outcome.error.hint, /You wrote Wepon/);
  });
  it('the mistakes of a first class, in words', () => {
    const message = body => { const o = run(body, WEAPON); const e = o.error || o.results.find(r => r.error).error; return `${e.message} | ${e.hint}`; };
    assert.match(message('private int damage;\nvoid Weapon(String name, int damage) {\n    this.damage = damage;\n}'), /takes 0 values, but this call gives it 2/);
    assert.match(message('private int damage;\nweapon(String name, int damage) {\n}'), /no return type.*name of the class, Weapon/s);
    assert.match(message('private int damage;\nWeapon(String name, int damage) {\n    damage = damage;\n}\npublic static int getDamage() {\n    return damage;\n}'), /belongs to each Weapon object.*static/s);
    assert.match(message('private int damage\nWeapon(String name, int damage) { }'), /expected ; to end a field/);
    assert.match(message(`${WEAPON.solution}\n@Override\npublic String tostring() {\n    return name;\n}`), /@Override.*capital S/s);
    assert.match(message(WEAPON.solution.replace('public String describe', 'String toString')), /toString\(\) has to be public/);
  });
  it('an object with no toString() is not printed as a made-up code', () => {
    const q = { ...DAMAGE, tests: [{ run: 'Monster m = new Monster("G", 3);\nm.takeDamage(1);', check: 'm.getHealth()', expect: 2 }, DAMAGE.tests[0], DAMAGE.tests[1]] };
    const outcome = run('health -= amount;\nSystem.out.println(this);', q);
    assert.match(outcome.error.message, /no toString\(\) method.*Monster@/);
    assert.match(outcome.error.hint, /public String toString\(\)/);
  });
  it('what a method prints is kept beside its row, and static fields start afresh for every test', () => {
    const q = { ...WEAPON, tests: [{ run: 'Weapon a = new Weapon("a", 1);\nWeapon b = new Weapon("b", 2);', check: 'Weapon.made', expect: 2 }, { run: 'Weapon a = new Weapon("a", 1);', check: 'Weapon.made', expect: 1 }, WEAPON.tests[0]] };
    const outcome = run('static int made = 0;\nprivate int damage;\nWeapon(String name, int damage) {\n    this.damage = damage;\n    made++;\n    System.out.println("made " + name);\n}\npublic int getDamage() {\n    return damage;\n}', q);
    assert.deepEqual(passed(outcome), [true, true, true]);
    assert.deepEqual(outcome.results[0].output, ['made a', 'made b']);
  });
});

describe('a Java problem: a run cannot hang or grow without limit', () => {
  it('an endless loop is stopped, test by test', () => {
    const outcome = run('while (a < 100) { b++; }\nreturn b;', SUM, { limits: { steps: 5000 } });
    assert.equal(outcome.ok, true);
    assert.equal(outcome.results[0].error.kind, 'limit');
    assert.match(outcome.results[0].error.hint, /loop that never ends/);
  });

  it('recursion that never stops is stopped, and says what was missing', () => {
    const outcome = run('return sumDouble(a + 1, b);');
    assert.equal(outcome.results[0].error.kind, 'limit');
    assert.match(outcome.results[0].error.hint, /a case where it stops/);
  });

  it('once the whole run has taken too long, the remaining tests are not started', () => {
    let clock = 0;
    const outcome = run('return a + b;', SUM, { now: () => (clock += 2000) });
    assert.match(outcome.results[3].error.message, /earlier tests took too long/);
  });

  it('an array too large to make is refused rather than attempted', () => {
    const outcome = run('int[] big = new int[2000000000];\nreturn big.length;');
    assert.equal(outcome.results[0].error.kind, 'limit');
  });

  it('a String that doubles forever is stopped', () => {
    const outcome = run('String s = "ab";\nwhile (true) { s = s + s; }');
    assert.equal(outcome.results[0].error.kind, 'limit');
  });

  it('what a method prints is capped', () => {
    const outcome = run('for (int i = 0; i < 5000; i++) System.out.println(i);\nreturn a + b;');
    assert.ok(outcome.results[0].output.length <= 61);
    assert.match(outcome.results[0].output.at(-1), /more output not shown/);
  });
});

describe('a Java problem: student text is data, never code', () => {
  // Nothing typed into the box may reach the page. Each of these is a way a
  // careless interpreter lets it: it must come back as an ordinary refusal.
  for (const body of [
    'return eval("1");', 'return window.length;', 'return this.constructor;', 'return a.constructor;', 'return globalThis;',
    'return a.__proto__;', 'String s = "x"; return s.constructor.length;', 'return new Function("return 1")();', 'return document.cookie;',
    'int[] xs = new int[1]; return xs.constructor;', 'return "x".__proto__.length;', 'return process.exit(1);',
  ]) {
    it(body, () => {
      const outcome = run(body);
      assert.equal(outcome.ok, false);
      assert.equal(outcome.error.kind, 'syntax');
    });
  }

  it('an error that is not about the student\'s Java is not swallowed', () => {
    assert.throws(() => runJavaTestCases({ signature: 'not a method line', body: 'return 1;', tests: [] }), /not a Java method line/);
  });
});

describe('a Java problem: its parts', () => {
  it('reads the method line', () => {
    assert.deepEqual(parseJavaSignature('public static boolean has(int[] nums, String key) {'), {
      name: 'has', ret: 'boolean', params: [{ type: 'int[]', name: 'nums' }, { type: 'String', name: 'key' }],
      header: 'public static boolean has(int[] nums, String key)',
    });
  });

  it('shows the method line opened, as the student will see it above the box', () => {
    assert.equal(javaProblemHeader(SUM), 'public int sumDouble(int a, int b) {');
  });

  it('puts a body under the method line, one line down', () => {
    assert.deepEqual(assembleJava(SUM.signature, 'return 1;'), { source: 'public int sumDouble(int a, int b) {\nreturn 1;\n}\n', lineOffset: 1, pasted: false });
    assert.equal(assembleJava(SUM.signature, 'int f() { return 1; }').pasted, true);
    assert.equal(assembleJava(SUM.signature, 'int total = f(a);\nreturn total;').pasted, false, 'a call is not a method declaration');
  });

  it('turns test-table values into Java values, and refuses ones that do not fit the type', () => {
    assert.equal(javaFromJson(5, 'int'), 5);
    assert.equal(javaFromJson(5, 'double'), 5);
    assert.equal(javaFromJson(5, 'long'), 5n);
    assert.equal(javaFromJson('x', 'char'), 120);
    assert.equal(javaFromJson(null, 'String'), null);
    assert.deepEqual(javaFromJson([[1], []], 'int[][]').a.map(row => row.a), [[1], []]);
    for (const [value, type] of [[1.5, 'int'], [2147483648, 'int'], ['ab', 'char'], [1, 'boolean'], [1, 'String'], [null, 'int'], ['1', 'int'], [[1, 'a'], 'int[]'], [5, 'StringBuilder']]) {
      assert.throws(() => javaFromJson(value, type), Error, `${JSON.stringify(value)} as ${type}`);
    }
  });

  it('writes and compares values by their type', () => {
    assert.equal(javaRepr(97, 'char'), "'a'");
    assert.equal(javaRepr(97, 'int'), '97');
    assert.equal(javaRepr(10, 'char'), "'\\n'");
    assert.equal(javaRepr('a\tb', 'String'), '"a\\tb"');
    assert.equal(javaRepr(1e21, 'double'), '1.0E21');
    assert.equal(javaDouble(100), '100.0');
    assert.equal(javaEquals(NaN, NaN, 'double'), true);
    assert.equal(javaEquals(Infinity, 1e308, 'double'), false);
    assert.equal(javaEquals(5n, 5n, 'long'), true);
  });

  it('a program can be compiled once and called many times', () => {
    const program = compileJava('int twice(int n) { return n * 2; }');
    assert.equal(evaluateJava(program, 'twice(4) + twice(5)').value, 18);
    assert.equal(evaluateJava(program, 'twice(1) / 0').error.exception, 'ArithmeticException');
    assert.throws(() => evaluateJava(program, 'thrice(1)'), JavaError);
  });
});
