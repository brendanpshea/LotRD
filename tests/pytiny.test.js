// Tests for src/pytiny.js — the small Python the code_write questions run on.
//
// The PROGRAMS table below is the load-bearing one: every expected string in it
// was produced by running the program through real CPython 3, not by reading the
// interpreter and writing down what it seemed to do. A difference between this
// interpreter and Python is a bug in this interpreter, and this table is how we
// find out. Regenerate it by running each source through `python3 -c`.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    parse, tokenize, Interpreter, PyError, runTestCases, assembleFunction,
    parseSignature, pyRepr, pyEquals, fromJson,
} from '../src/pytiny.js';

/** Run a program and return everything it printed. */
function run(source, options = {}) {
    const interpreter = new Interpreter(options);
    interpreter.run(parse(source));
    return interpreter.output.join('');
}

/** Run a program expected to fail, and return the PyError it failed with. */
function failure(source, options = {}) {
    try {
        run(source, options);
    } catch (err) {
        assert.ok(err instanceof PyError, `expected a PyError, got: ${err}`);
        return err;
    }
    assert.fail(`expected this program to fail:\n${source}`);
}

// ────────────────────────────────────────────────────────────────────────────────
// Agreement with real Python
// ────────────────────────────────────────────────────────────────────────────────

const PROGRAMS = [
    ["print(10 / 5, 10 // 3, -7 // 2, 7 % 3, -7 % 3, 2 ** 10, 2 ** 0.5)", "2.0 3 -4 1 2 1024 1.4142135623730951\n"],
    ["print(1 + 2.5, 3 * 1.5, 10 / 4, int(7 / 2), round(2.5), round(3.5), round(2.675, 2))", "3.5 4.5 2.5 3 2 4 2.67\n"],
    ["print(abs(-4), abs(-4.5), min(3,1,2), max([4,9,2]), sum([1,2,3]), sum([1.5,2]))", "4 4.5 1 9 6 3.5\n"],
    ["s = 'Hello World'\nprint(s.upper(), s.lower(), s.title(), s.strip(), len(s))\nprint(s.split(), s.split('o'), '-'.join(['a','b','c']))\nprint(s.replace('l','L'), s.find('World'), s.count('l'), s.startswith('He'))", "HELLO WORLD hello world Hello World Hello World 11\n['Hello', 'World'] ['Hell', ' W', 'rld'] a-b-c\nHeLLo WorLd 6 3 True\n"],
    ["s = 'abcdef'\nprint(s[0], s[-1], s[1:3], s[:2], s[2:], s[::-1], s[::2], s[1:5:2])", "a f bc ab cdef fedcba ace bd\n"],
    ["x = [1,2,3,4,5]\nprint(x[1:3], x[::-1], x[-2:], len(x), x + [6], x * 2)\nx.append(6)\nx.insert(0, 0)\nx.remove(3)\nprint(x, x.pop(), x.index(4), x.count(2))", "[2, 3] [5, 4, 3, 2, 1] [4, 5] 5 [1, 2, 3, 4, 5, 6] [1, 2, 3, 4, 5, 1, 2, 3, 4, 5]\n[0, 1, 2, 4, 5] 6 3 1\n"],
    ["x = [3,1,2]\ny = sorted(x)\nx.sort(reverse=True)\nprint(x, y, sorted(['b','a']), sorted([3,1,2], reverse=True))", "[3, 2, 1] [1, 2, 3] ['a', 'b'] [3, 2, 1]\n"],
    ["d = {'a': 1, 'b': 2}\nd['c'] = 3\nprint(d, d['a'], d.get('z'), d.get('z', 0), len(d), 'a' in d)\nprint(list(d.keys()), list(d.values()), list(d.items()))", "{'a': 1, 'b': 2, 'c': 3} 1 None 0 3 True\n['a', 'b', 'c'] [1, 2, 3] [('a', 1), ('b', 2), ('c', 3)]\n"],
    ["for i in range(3):\n    print(i)\nfor i in range(2, 8, 2):\n    print(i)\nfor i in range(3, 0, -1):\n    print(i)", "0\n1\n2\n2\n4\n6\n3\n2\n1\n"],
    ["total = 0\nn = 5\nwhile n > 0:\n    total += n\n    n -= 1\nprint(total)", "15\n"],
    ["def f(n):\n    if n <= 1:\n        return 1\n    return n * f(n - 1)\nprint(f(0), f(5), f(20))", "1 120 2432902008176640000\n"],
    ["def g(a, b=10, c='x'):\n    return str(a) + str(b) + c\nprint(g(1), g(1, 2), g(1, c='z'), g(1, b=3, c='y'))", "110x 12x 110z 13y\n"],
    ["print(True + True, True * 3, False + 1, int(True), bool(0), bool(''), bool([]), bool('a'))", "2 3 1 1 False False False True\n"],
    ["print(1 == 1.0, '5' == 5, [1,2] == [1,2], (1,2) == (1,2), None == None, 1 != 2)", "True False True True True True\n"],
    ["print(0 <= 5 < 10, 'a' < 'b', [1,2] < [1,3], not 0, 1 and 2, 0 or 'x', '' or 0)", "True True True True 2 x 0\n"],
    ["a, b = 1, 2\na, b = b, a\nprint(a, b)\nt = (1, 2, 3)\nprint(t, len(t), t[0], t[1:])", "2 1\n(1, 2, 3) 3 1 (2, 3)\n"],
    ["name = 'Ada'\nn = 7\npi = 3.14159\nprint(f'{name} has {n} items')\nprint(f'{pi:.2f} and {n * 2}')\nprint(f'{{literal}} {name.upper()}')", "Ada has 7 items\n3.14 and 14\n{literal} ADA\n"],
    ["words = ['apple', 'fig', 'kiwi']\nlongest = words[0]\nfor w in words:\n    if len(w) > len(longest):\n        longest = w\nprint(longest, len(longest))", "apple 5\n"],
    ["for i, ch in enumerate('abc'):\n    print(i, ch)\nprint(list(enumerate([10, 20], 1)))", "0 a\n1 b\n2 c\n[(1, 10), (2, 20)]\n"],
    ["print(list(reversed([1,2,3])), any([0, 1]), all([1, 1]), all([]), any([]))", "[3, 2, 1] True True True False\n"],
    ["print(str(5), str(5.0), str(True), str([1, 'a']), int('42'), int(-3.7), float('2.5'), float(3))", "5 5.0 True [1, 'a'] 42 -3 2.5 3.0\n"],
    ["print(ord('a'), chr(98), 'abc'.isdigit(), '123'.isdigit(), 'ab1'.isalpha(), ''.isdigit())", "97 b False True False False\n"],
    ["x = 0\nfor i in range(10):\n    if i % 2 == 0:\n        continue\n    if i > 7:\n        break\n    x += i\nprint(x)", "16\n"],
    ["def count_evens(nums):\n    count = 0\n    for n in nums:\n        if n % 2 == 0:\n            count += 1\n    return count\nprint(count_evens([2, 1, 2, 3, 4]), count_evens([]))", "3 0\n"],
    ["grid = [[1,2],[3,4]]\nprint(grid[1][0], grid[0], len(grid))\ntotal = 0\nfor row in grid:\n    for v in row:\n        total += v\nprint(total)", "3 [1, 2] 2\n10\n"],
    ["print([1,2,3][0:0], 'abc'[5:], [][:], 'abc'[-10:2])", "[]  [] ab\n"],
    ["s = 'a,b,,c'\nprint(s.split(','), len(s.split(',')))\nprint('  pad  '.strip(), 'xxhixx'.strip('x'))", "['a', 'b', '', 'c'] 4\npad hi\n"],
    ["d = {}\nfor ch in 'hello':\n    if ch in d:\n        d[ch] += 1\n    else:\n        d[ch] = 1\nprint(d)", "{'h': 1, 'e': 1, 'l': 2, 'o': 1}\n"],
    ["print(100000000000 * 100000000000, 2 ** 100)", "10000000000000000000000 1267650600228229401496703205376\n"],
    ["print(5 / 2, 5 // 2, 5.0 // 2, 5 % 2, 5.5 % 2, -5 // 2)", "2.5 2 2.0 1 1.5 -3\n"],
    ["def bigger(a, b):\n    return a if a > b else b\nprint(bigger(3, 9), bigger('a', 'b'))", "9 b\n"],
    ["out = ''\nfor ch in 'hello':\n    if ch != 'l':\n        out += ch.upper()\nprint(out, len(out))", "HEO 3\n"],
    ["nums = [5, 3, 8]\ncopy = nums\ncopy.append(1)\nprint(nums, copy, nums is copy)", "[5, 3, 8, 1] [5, 3, 8, 1] True\n"],
    ["def sum_digits(n):\n    total = 0\n    while n > 0:\n        total += n % 10\n        n = n // 10\n    return total\nprint(sum_digits(12345), sum_digits(0))", "15 0\n"],
    ["print('%s' == '%s', 'a' * 3, [0] * 4, len([0] * 4))", "True aaa [0, 0, 0, 0] 4\n"],
    ["d = {'x': 10}\nprint(d.get('x', 0) + d.get('y', 0))\nd['y'] = d.get('y', 0) + 5\nprint(d)", "10\n{'x': 10, 'y': 5}\n"],
    ["print(f'{1000000:,}', f'{1234.5678:.1f}', f'{3:.3f}')", "1,000,000 1234.6 3.000\n"],
    ["def is_prime(n):\n    if n < 2:\n        return False\n    i = 2\n    while i * i <= n:\n        if n % i == 0:\n            return False\n        i += 1\n    return True\nprint(is_prime(1), is_prime(2), is_prime(97), is_prime(100))", "False True True False\n"],
    ["t = (1, 'a', True)\nx, y, z = t\nprint(x, y, z, t.count(1))", "1 a True 2\n"],
    ["print(sorted(['bb','a','ccc'], key=len), max(['bb','a','ccc'], key=len), min([3,1,2]))", "['a', 'bb', 'ccc'] ccc 1\n"],
    ["s = 'The quick brown fox'\nwords = s.split()\nprint(len(words), words[-1], ' '.join(words[:2]), s.lower().count('o'))", "4 fox The quick 2\n"],
    ["n = 0\nfor i in range(1, 101):\n    n += i\nprint(n)", "5050\n"],
    ["x = 7\nif x > 10:\n    label = 'big'\nelif x > 5:\n    label = 'medium'\nelse:\n    label = 'small'\nprint(label)", "medium\n"],
    ["print(list(range(5)), list(range(2, 5)), list(range(5, 0, -2)), len(range(10)))", "[0, 1, 2, 3, 4] [2, 3, 4] [5, 3, 1] 10\n"],
    ["print(True and False or True, not (1 == 1), (1 > 2) == False)", "True False True\n"]
];

describe('pytiny matches CPython', () => {
    for (const [source, expected] of PROGRAMS) {
        const title = source.split('\n')[0].slice(0, 60);
        it(title, () => {
            assert.equal(run(source), expected);
        });
    }
});

// ────────────────────────────────────────────────────────────────────────────────
// Errors a beginner will actually hit
// ────────────────────────────────────────────────────────────────────────────────

describe('error messages', () => {
    it('names the line an error happened on', () => {
        const err = failure('x = 1\ny = 2\nprint(z)\n');
        assert.equal(err.line, 3);
    });

    it('catches = used where == belongs', () => {
        const err = failure('x = 1\nif x = 2:\n    print(1)\n');
        assert.equal(err.kind, 'syntax');
        assert.match(err.message, /single = assigns/);
        assert.equal(err.line, 2);
    });

    it('catches a missing colon', () => {
        const err = failure('def f(a)\n    return a\n');
        assert.match(err.message, /colon/);
    });

    it('catches a body that was never indented', () => {
        const err = failure('if True:\nprint(1)\n');
        assert.match(err.message, /indented/);
    });

    it('explains adding text to a number rather than saying TypeError', () => {
        const err = failure('print("age: " + 5)');
        assert.match(err.message, /add text and a number/);
        assert.match(err.hint, /str\(n\)/);
    });

    it('explains an index past the end in terms of the last valid one', () => {
        const err = failure('items = [1, 2, 3]\nprint(items[3])\n');
        assert.match(err.message, /last position is 2/);
    });

    it('explains division by zero', () => {
        assert.match(failure('print(1 / 0)').message, /divide by zero/);
        assert.match(failure('print(1 // 0)').message, /divide by zero/);
    });

    it('suggests a correction for a misspelled method', () => {
        const err = failure('items = []\nitems.appendd(1)\n');
        assert.match(err.hint, /\.append\(\)/);
    });

    it('suggests a correction for a misspelled name', () => {
        const err = failure('total = 1\nprint(totl)\n');
        assert.match(err.hint, /total/);
    });

    it('says a missing key is missing, and points at .get()', () => {
        const err = failure('d = {"a": 1}\nprint(d["b"])\n');
        assert.match(err.message, /no key 'b'/);
        assert.match(err.hint, /\.get\(/);
    });

    it('refuses to guess at int() on text that is not a number', () => {
        assert.match(failure('print(int("twelve"))').message, /cannot turn 'twelve'/);
        assert.match(failure('print(int("1.5"))').hint, /float\(\)/);
    });

    it('names a method called without its parentheses', () => {
        const err = failure('s = "hi"\nprint(s.upper)\n');
        assert.match(err.message, /without parentheses/);
    });

    it('explains looping over something that cannot be looped over', () => {
        assert.match(failure('for x in 5:\n    print(x)\n').message, /cannot loop over/);
    });

    it('explains calling a value that is not a function', () => {
        const err = failure('items = [1, 2]\nprint(items(0))\n');
        assert.match(err.message, /not a function/);
        assert.match(err.hint, /square brackets/);
    });

    it('reports the wrong number of arguments', () => {
        assert.match(failure('def f(a, b):\n    return a\nprint(f(1))\n').message, /missing a value for "b"/);
        assert.match(failure('def f(a):\n    return a\nprint(f(1, 2))\n').message, /takes 1 value/);
    });

    it('refuses features it does not have, by name', () => {
        assert.match(failure('import math\n').message, /import anything/);
        assert.match(failure('class Dog:\n    pass\n').message, /Classes are not part/);
        assert.match(failure('x = [i for i in [1]]\n').message, /comprehensions/);
        assert.match(failure('x = {1, 2}\n').message, /Sets are not/);
        assert.match(failure('try:\n    pass\n').message, /try \/ except/);
        assert.match(failure('print(input())').hint, /never read input/);
        assert.match(failure('import random\n').message, /import/);
    });

    it('translates the Java and JavaScript habits students arrive with', () => {
        assert.match(failure('x = 1;\n').message, /semicolons/);
        assert.match(failure('if 1 != 2 & 3 > 1:\n    pass\n').message, /and\/or/);
        assert.match(failure('print "hello"\n').message, /parentheses/);
    });
});

// ────────────────────────────────────────────────────────────────────────────────
// Budgets: a student's mistake must never take the page down with it
// ────────────────────────────────────────────────────────────────────────────────

describe('runaway code is stopped', () => {
    it('stops an infinite while loop', () => {
        const err = failure('while True:\n    x = 1\n');
        assert.equal(err.kind, 'limit');
        assert.match(err.hint, /never ends/);
    });

    it('stops a loop whose counter never advances', () => {
        const err = failure('n = 0\nwhile n < 10:\n    total = n\n');
        assert.equal(err.kind, 'limit');
    });

    it('stops runaway recursion before the JavaScript stack overflows', () => {
        const err = failure('def f(n):\n    return f(n + 1)\nprint(f(1))\n');
        assert.equal(err.kind, 'limit');
        assert.match(err.message, /called itself/);
    });

    it('stops on wall-clock time even when the step budget is huge', () => {
        let clock = 0;
        const err = failure('while True:\n    x = 1\n',
            { steps: 10 ** 9, milliseconds: 50, now: () => (clock += 10) });
        assert.equal(err.kind, 'limit');
    });

    it('stops numbers from growing without bound', () => {
        const err = failure('x = 10\nwhile True:\n    x = x * x\n');
        assert.equal(err.kind, 'limit');
    });

    it('caps how much a program can print', () => {
        const interpreter = new Interpreter();
        interpreter.run(parse('for i in range(500):\n    print(i)\n'));
        assert.ok(interpreter.truncated);
        assert.ok(interpreter.outputLines().length <= 61);
    });

    it('never hands student text to eval or Function', () => {
        // Structural, not behavioural: student text is data from tokenizer to
        // result, and the way to keep it that way is for these calls never to
        // appear at all. String literals are stripped first so that the refusal
        // message for eval() does not look like a call to it.
        const source = readFileSync(new URL('../src/pytiny.js', import.meta.url), 'utf8')
            .replace(/'([^'\\]|\\.)*'|"([^"\\]|\\.)*"/g, "''");
        assert.doesNotMatch(source, /\beval\s*\(/);
        assert.doesNotMatch(source, /new Function\s*\(/);
        assert.doesNotMatch(source, /setTimeout|fetch\s*\(|XMLHttpRequest/);
    });
});

// ────────────────────────────────────────────────────────────────────────────────
// The CodingBat harness
// ────────────────────────────────────────────────────────────────────────────────

describe('assembleFunction', () => {
    it('accepts a body written flush against the left margin', () => {
        const { source, lineOffset } = assembleFunction('def f(a):', 'if a > 1:\n    return 1\nreturn 0');
        assert.equal(source, 'def f(a):\n    if a > 1:\n        return 1\n    return 0\n');
        assert.equal(lineOffset, 1);
    });

    it('accepts a body the student already indented', () => {
        const { source } = assembleFunction('def f(a):', '    if a > 1:\n        return 1\n    return 0');
        assert.equal(source, 'def f(a):\n    if a > 1:\n        return 1\n    return 0\n');
    });

    it('treats tabs as four spaces', () => {
        const { source } = assembleFunction('def f(a):', 'if a:\n\treturn 1\nreturn 0');
        assert.equal(source, 'def f(a):\n    if a:\n        return 1\n    return 0\n');
    });

    it('runs a whole pasted function as written', () => {
        const { source, lineOffset, pasted } = assembleFunction('def f(a):', 'def f(a):\n    return a');
        assert.equal(pasted, true);
        assert.equal(lineOffset, 0);
        assert.match(source, /^def f/);
    });

    it('says so when nothing has been written', () => {
        assert.throws(() => assembleFunction('def f(a):', '   \n\n'), /have not written any code/);
    });
});

describe('parseSignature', () => {
    it('reads the name and parameters', () => {
        assert.deepEqual(parseSignature('def make_bricks(small, big, goal):'),
            { name: 'make_bricks', params: ['small', 'big', 'goal'] });
    });
    it('handles no parameters and default values', () => {
        assert.deepEqual(parseSignature('def go():'), { name: 'go', params: [] });
        assert.deepEqual(parseSignature('def go(a, b=2):'), { name: 'go', params: ['a', 'b'] });
    });
    it('rejects anything that is not a def line', () => {
        assert.throws(() => parseSignature('make_bricks(a)'), /not a function definition/);
    });
});

const BRICKS = {
    signature: 'def make_bricks(small, big, goal):',
    tests: [
        { args: [3, 1, 8], expect: true },
        { args: [3, 1, 9], expect: false },
        { args: [3, 2, 10], expect: true },
    ],
};

describe('runTestCases', () => {
    it('passes every case for a correct body', () => {
        const result = runTestCases({
            ...BRICKS,
            body: 'if goal > small + big * 5:\n    return False\nif goal % 5 > small:\n    return False\nreturn True',
        });
        assert.equal(result.ok, true);
        assert.equal(result.passed, 3);
        assert.equal(result.total, 3);
        assert.ok(result.results.every(r => r.passed));
    });

    it('scores a partly-right body proportionally', () => {
        const result = runTestCases({ ...BRICKS, body: 'return True' });
        assert.equal(result.passed, 2);
        assert.equal(result.results[1].passed, false);
        assert.equal(result.results[1].actualRepr, 'True');
        assert.equal(result.results[1].expectedRepr, 'False');
    });

    it('describes each call the way the student would write it', () => {
        const result = runTestCases({ ...BRICKS, body: 'return True' });
        assert.equal(result.results[0].call, 'make_bricks(3, 1, 8)');
    });

    it('reports a syntax error once instead of per test', () => {
        const result = runTestCases({ ...BRICKS, body: 'return small +' });
        assert.equal(result.ok, false);
        assert.equal(result.error.kind, 'syntax');
        assert.equal(result.passed, 0);
    });

    it('counts error lines in the lines the student typed', () => {
        const result = runTestCases({ ...BRICKS, body: 'x = 1\ny = 2\nreturn undefined_name' });
        assert.equal(result.results[0].error.line, 3);
    });

    it('keeps running the other tests when one blows up', () => {
        const result = runTestCases({
            ...BRICKS,
            body: 'if goal == 9:\n    return [][0]\nreturn True',
        });
        assert.equal(result.ok, true);
        assert.equal(result.results[0].passed, true);
        assert.ok(result.results[1].error);
        assert.equal(result.results[2].passed, true);
    });

    it('notices a body that prints instead of returning', () => {
        const result = runTestCases({ ...BRICKS, body: 'print(small + big)' });
        assert.equal(result.printedOnly, true);
        assert.deepEqual(result.results[0].output, ['4']);
    });

    it('does not flag printing when something is also returned', () => {
        const result = runTestCases({ ...BRICKS, body: 'print(small)\nreturn True' });
        assert.equal(result.printedOnly, false);
    });

    it('runs each test in its own interpreter, so state cannot leak between them', () => {
        const result = runTestCases({
            signature: 'def add_one(items):',
            body: 'items.append(1)\nreturn len(items)',
            tests: [
                { args: [[]], expect: 1 },
                { args: [[]], expect: 1 },
                { args: [[]], expect: 1 },
            ],
        });
        assert.equal(result.passed, 3);
    });

    it('says which function it could not find when a paste has the wrong name', () => {
        const result = runTestCases({ ...BRICKS, body: 'def other(small, big, goal):\n    return True' });
        assert.equal(result.ok, false);
        assert.match(result.error.message, /make_bricks\(\)/);
    });

    it('stops an infinite loop and reports it as a failed test', () => {
        const result = runTestCases({ ...BRICKS, body: 'while True:\n    small = small\nreturn True' });
        assert.equal(result.ok, true);
        assert.equal(result.passed, 0);
        assert.equal(result.results[0].error.kind, 'limit');
    });
});

// ────────────────────────────────────────────────────────────────────────────────
// Values in and out
// ────────────────────────────────────────────────────────────────────────────────

describe('values from JSON', () => {
    it('turns whole JSON numbers into Python ints and fractions into floats', () => {
        assert.equal(pyRepr(fromJson(5)), '5');
        assert.equal(pyRepr(fromJson(2.5)), '2.5');
        assert.equal(pyRepr(fromJson({ __float: 5 })), '5.0');
    });

    it('carries lists, dicts, tuples, booleans and None across', () => {
        assert.equal(pyRepr(fromJson([1, 'a', true, null])), "[1, 'a', True, None]");
        assert.equal(pyRepr(fromJson({ a: 1 })), "{'a': 1}");
        assert.equal(pyRepr(fromJson({ __tuple: [1, 2] })), '(1, 2)');
    });

    it('compares an int against a float the way Python does', () => {
        assert.equal(pyEquals(fromJson(5), 5), true);
        assert.equal(pyEquals(fromJson(5), fromJson({ __float: 5 })), true);
        assert.equal(pyEquals('5', fromJson(5)), false);
    });
});

describe('repr', () => {
    it('shows floats with their .0 and strings with their quotes', () => {
        assert.equal(pyRepr(5.0), '5.0');
        assert.equal(pyRepr('hi'), "'hi'");
        assert.equal(pyRepr("it's"), '"it\'s"');
    });
});

describe('tokenize', () => {
    it('produces indent and dedent tokens for blocks', () => {
        const types = tokenize('if a:\n    b = 1\nc = 2\n').map(t => t.type);
        assert.ok(types.includes('indent'));
        assert.ok(types.includes('dedent'));
    });

    it('ignores blank lines and comments when measuring indentation', () => {
        assert.equal(run('def f():\n    # a comment\n\n    return 1\nprint(f())\n'), '1\n');
    });
});
