// tests/pytiny-differential.test.js — the practice interpreter against real Python.
//
// Everything a student can print, Python can referee. Each program below is run
// on real Python and on src/pytiny.js and must produce identical output.
//
// It opens with aliasing, because that is where the interpreter used to be
// WRONG: `a += [2]` built a new list instead of growing the one two names
// shared, `[1] is [1]` came out True, and a default of [] was rebuilt on every
// call. A student testing the chapter's central idea in a practice box was being
// shown the opposite of what Python does. Found by this comparison, in its first
// hour of existence.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findPython, runOnCPython, runOnPytiny } from './helpers/cpython.js';

const python = findPython();
if (!python && process.env.LOTRD_REQUIRE_PYTHON) {
  throw new Error('LOTRD_REQUIRE_PYTHON is set but no Python 3 was found');
}
const skip = python ? false
  : 'NO PYTHON FOUND — the interpreter was not compared with real Python. Install Python 3 or set LOTRD_PYTHON.';

const PROGRAMS = {
  // ── aliasing: two names, one list
  'a change made through one name shows through the other': 'a = [1, 2]\nb = a\nb.append(3)\nb[0] = 9\nprint(a, b)\n',
  '+= grows the shared list in place': 'a = [1]\nb = a\na += [2]\nprint(b, a is b)\n',
  'a = a + [x] builds a new list and breaks the link': 'a = [1]\nb = a\na = a + [2]\nprint(a, b, a is b)\n',
  '*= repeats the shared list in place': 'a = [1, 2]\nb = a\na *= 2\nprint(b, a is b)\na *= 0\nprint(b)\n',
  '+= on a list accepts any sequence': 'a = [1]\na += (2, 3)\na += "hi"\na += range(2)\nprint(a)\n',
  'is tells equal lists from the same list': 'a = [1]\nb = [1]\nc = a\nprint(a is b, a == b, a is c, a is not b)\n',
  'is tells equal dictionaries from the same dictionary': 'a = {"k": 1}\nb = {"k": 1}\nc = a\nprint(a is b, a == b, a is c)\n',
  'is None still works': 'x = None\ny = 0\nprint(x is None, y is None, x is not None)\n',
  'a copy is a different list': 'a = [1, 2]\nb = a.copy()\nc = a[:]\nd = list(a)\nb.append(3)\nprint(a, a is b, a is c, a is d, a == c)\n',
  'a function that appends changes the caller\'s list; one that rebuilds does not':
    'def grow(items):\n    items.append(1)\n\ndef rebuild(items):\n    items = items + [1]\n\nmine = []\ngrow(mine)\nrebuild(mine)\ngrow(mine)\nprint(mine)\n',
  'in-place += inside a function reaches the caller too': 'def grow(items):\n    items += [7]\n\nmine = [1]\ngrow(mine)\nprint(mine)\n',
  'a default value is built once, when the def runs': 'def f(x, acc=[]):\n    acc.append(x)\n    return acc\n\nf(1)\nprint(f(2))\nprint(f(3, []), f(4))\n',
  'a default may use names defined before the def': 'base = 10\ndef f(x, step=base * 2):\n    return x + step\n\nbase = 99\nprint(f(1), f(1, 1))\n',
  'nested lists share their inner lists': 'row = [0, 0]\ngrid = [row, row]\ngrid[0][0] = 5\nprint(grid, grid[0] is grid[1])\n',

  // ── the ground the rest stands on
  // (Only what the interpreter claims to support. Where it REFUSES something with a clear
  // message — tuple repetition, f-string widths such as {k:5} — that is a limit, not an error:
  // a refusal cannot mislead a student the way a wrong answer does.)
  'int and float arithmetic': 'print(7 / 2, 7 // 2, 7 % 2, -7 // 2, -7 % 2, 2 ** 10, 10 / 5, 1 + 2.0)\nprint(round(2.5), round(3.5), round(2.675, 2), abs(-3), int(3.9), int(-3.9), float(3))\n',
  'comparison chains and boolean operators': 'x = 5\nprint(1 < x < 10, 1 < x > 7, not x == 5, x > 3 and x < 4, 0 or "a", "" or 0, 3 and 4)\n',
  'string methods': 's = "  Hello, World  "\nprint(s.strip().upper(), s.strip().lower().replace("l", "L"), s.strip().split(", "))\nprint("-".join(["a", "b"]), "abc".find("c"), "abc".find("z"), "a,b".split(","), "hi".startswith("h"), "x".isdigit(), "7".isdigit())\n',
  'slicing, negative indices and steps': 't = "abcdefg"\nn = [0, 1, 2, 3, 4, 5]\nprint(t[1:4], t[:2], t[-3:], t[::2], t[::-1], n[1:-1], n[::-2], n[10:], t[-1], n[-2])\n',
  'list methods': 'a = [3, 1, 2]\na.append(5)\na.insert(0, 9)\na.remove(1)\nprint(a, a.pop(), a.pop(0), a, a.index(2), a.count(3))\na.sort()\nprint(a, sorted([3, 1, 2], reverse=True), len(a), sum(a), min(a), max(a))\na.reverse()\nprint(a)\n',
  'dictionaries keep insertion order': 'd = {"b": 1, "a": 2}\nd["c"] = 3\nd["b"] = 10\nfor k in d:\n    print(k, d[k])\nprint(list(d.keys()), list(d.values()), d.get("z"), d.get("z", 0), "a" in d, len(d))\nfor k, v in d.items():\n    print(k, v)\n',
  'tuples and unpacking': 'p = (3, 4)\nx, y = p\nx, y = y, x\nprint(x, y, p[0], len(p), p + (5,))\nfor i, ch in enumerate("ab"):\n    print(i, ch)\n',
  'f-strings': 'n = 3.14159\nk = 42\nname = "Ada"\nprint(f"{name} is {k}", f"{n:.2f}", f"{1234567:,}", f"{k + 1}", f"{name.upper()}!")\n',
  'while with break and continue': 'n = 0\nwhile True:\n    n += 1\n    if n % 2 == 0:\n        continue\n    if n > 7:\n        break\n    print(n)\n',
  'range in all three forms': 'print(list(range(4)), list(range(2, 6)), list(range(10, 0, -3)), list(range(0)), len(range(3, 20, 4)))\n',
  'recursion': 'def fact(n):\n    if n <= 1:\n        return 1\n    return n * fact(n - 1)\n\nprint(fact(10), fact(25))\n',
  'a function with no return gives None': 'def quiet():\n    x = 1\n\nprint(quiet(), quiet() is None)\n',
  'scope: assignment inside a function is local': 'x = 1\ndef f():\n    x = 2\n    return x\n\nprint(f(), x)\n',
  'conditional expressions and truthiness': 'for v in [0, 1, "", "a", [], [0], None]:\n    print("yes" if v else "no")\n',
  'printing: sep, end and mixed values': 'print(1, "a", 2.0, True, None, [1, "a"], (1,), {"k": 1}, sep=" | ")\nprint("a", end="")\nprint("b")\nprint()\n',

  // ── found by the September 2026 review: each of these printed something Python does not
  'removing from a list while looping over it skips the next item':
    'x = [2, 4, 6, 8]\nfor v in x:\n    if v % 2 == 0:\n        x.remove(v)\nprint(x)\nnums = [1, 2, 2, 3]\nfor n in nums:\n    if n == 2:\n        nums.remove(n)\nprint(nums)\n',
  'appending while looping visits the new items too':
    'x = [1, 2]\nfor v in x:\n    if v < 4:\n        x.append(v + 2)\nprint(x)\n',
  'a loop sees items changed ahead of it': 'x = [1, 2, 3]\nfor v in x:\n    print(v)\n    if len(x) > 1:\n        x[1] = 20\n',
  '__eq__ decides == and !=, and so in, count, index and remove':
    'class P:\n    def __init__(self, x):\n        self.x = x\n    def __eq__(self, other):\n        return self.x == other.x\n\n' +
    'a = P(1)\nb = P(1)\nc = P(2)\nprint(a == b, a != b, a == c, a != c, a is b)\nitems = [P(2), P(1)]\nprint(b in items, items.count(P(1)), items.index(P(1)))\nitems.remove(P(2))\nprint(len(items))\n',
  'without __eq__, == means the same object':
    'class P:\n    def __init__(self, x):\n        self.x = x\n\na = P(1)\nb = a\nprint(a == P(1), a == b, a != P(1), P(1) in [a])\n',
  '__bool__ and __len__ decide truthiness':
    'class Box:\n    def __init__(self, items):\n        self.items = items\n    def __len__(self):\n        return len(self.items)\n\n' +
    'class Flag:\n    def __init__(self, on):\n        self.on = on\n    def __bool__(self):\n        return self.on\n\n' +
    'for thing in [Box([]), Box([1]), Flag(False), Flag(True)]:\n    print("t" if thing else "f", bool(thing), not thing)\nprint(len(Box([1, 2, 3])))\nif Box([]) or Flag(True):\n    print("or works")\nwhile Flag(False):\n    print("never")\n',
  '__repr__ is used for objects inside lists, tuples and dictionaries':
    'class Q:\n    def __init__(self, x):\n        self.x = x\n    def __repr__(self):\n        return "Q(" + str(self.x) + ")"\n\n' +
    'print([Q(1), Q(2)], (Q(3),), {"k": Q(4)})\nprint(Q(5))\nprint(f"{[Q(6)]}")\nprint(str([Q(7)]))\n',
  '__str__ is for print; inside a list it is still __repr__':
    'class R:\n    def __str__(self):\n        return "shown"\n    def __repr__(self):\n        return "R()"\n\nprint(R(), [R()], str(R()), f"{R()}")\n',
  'f-string rounding of halves goes to the even digit, as the float really is':
    'avg = (80 + 85) / 2\nprint(f"{avg:.0f}", f"{2.5:.0f}", f"{0.5:.0f}", f"{1.5:.0f}", f"{1.25:.1f}", f"{10.125:.2f}", f"{0.125:.2f}", f"{2.675:.2f}")\n' +
    'print(f"{-2.5:.0f}", f"{-0.0:.1f}", f"{-0.001:.2f}", f"{1234567.125:,.2f}", f"{3:.2f}", f"{True:.1f}", f"{1e20:.1f}", f"{0.1:.20f}")\n',
  'a list or dictionary that contains itself prints with ...':
    'a = [1]\na.append(a)\nprint(a, len(a))\nd = {}\nd["me"] = d\nprint(d)\n',
  'a list extended by itself doubles once': 'a = [1, 2]\na.extend(a)\nprint(a)\na += a\nprint(a)\n',
  'replace with empty text puts the new text between every character':
    'print("aaa".replace("", "-"), "".replace("", "-"), "ab".replace("", ""))\n',
  'in on a huge range is answered at once': 'print(10 ** 10 in range(10 ** 12), 10 ** 12 in range(10 ** 12), 7 in range(1, 100, 3), 5.0 in range(10), 5.5 in range(10), "a" in range(3), -3 in range(0, -10, -3))\n',
};

// Programs Python stops with an error. pytiny must stop too — a refusal in its own
// words is fine — and must not print anything Python did not print first.
const STOPS = {
  'assigning a name anywhere in a function makes it local everywhere in it (UnboundLocalError)':
    'total = 0\ndef add(n):\n    total += n\n\nprint("before")\nadd(1)\nprint(total)\n',
  'reading a global and then assigning it is the same error':
    'x = 10\ndef f():\n    print(x)\n    x = 1\n\nf()\n',
  'a local assigned only in a branch that did not run':
    'x = 10\ndef f():\n    if False:\n        x = 1\n    return x\n\nprint(f())\n',
  'a loop variable is local too':
    'i = 5\ndef f():\n    print(i)\n    for i in range(2):\n        pass\n\nf()\n',
  'adding to a dictionary while looping over it':
    'd = {"a": 1}\nfor k in d:\n    d[k + "!"] = 0\nprint(d)\n',
};

describe('the practice interpreter agrees with real Python', { skip }, () => {
  const entries = Object.entries(PROGRAMS);
  const expected = python ? runOnCPython(python, entries.map(([, src]) => src)) : [];
  entries.forEach(([name, src], i) => {
    it(name, () => {
      assert.equal(expected[i].err, null, `this program does not run on real Python: ${expected[i].err}`);
      const mine = runOnPytiny(src);
      assert.equal(mine.err, null, `pytiny refused a program Python runs: ${mine.err}`);
      assert.equal(mine.out, expected[i].out);
    });
  });
});

describe('the practice interpreter stops where real Python stops', { skip }, () => {
  const entries = Object.entries(STOPS);
  const expected = python ? runOnCPython(python, entries.map(([, src]) => src)) : [];
  entries.forEach(([name, src], i) => {
    it(name, () => {
      assert.notEqual(expected[i].err, null, 'this program runs on real Python; it belongs in PROGRAMS');
      const mine = runOnPytiny(src);
      assert.notEqual(mine.err, null, `pytiny ran on where Python stops with ${expected[i].err}; it printed ${JSON.stringify(mine.out)}`);
      assert.equal(mine.out, expected[i].out, 'pytiny printed something Python never reached');
    });
  });
});
