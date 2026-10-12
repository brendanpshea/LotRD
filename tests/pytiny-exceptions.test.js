// tests/pytiny-exceptions.test.js — try / except, raise and files in the practice interpreter.
//
// The plan of tests/pytiny-classes.test.js again. Programs that are run on real
// Python and on src/pytiny.js and must print the same thing; programs Python
// stops, which pytiny has to stop too, after the same output and (where the
// interpreter knows it) with the same kind of error; a few hundred generated
// programs; and then the words a student reads, which are ours.
//
// Files are the one place the two cannot share a program as written: Python
// reads a real disk, the practice interpreter a table of names. So a program
// may come with `files`, which become real files in a fresh folder for Python
// and entries in that table for pytiny.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findPython, runOnCPython } from './helpers/cpython.js';
import { parse, Interpreter, PyError, runProblem, runTestCases } from '../src/pytiny.js';

const python = findPython();
if (!python && process.env.LOTRD_REQUIRE_PYTHON) {
  throw new Error('LOTRD_REQUIRE_PYTHON is set but no Python 3 was found');
}
const skip = python ? false
  : 'NO PYTHON FOUND — the interpreter was not compared with real Python. Install Python 3 or set LOTRD_PYTHON.';

/** The program as Python must run it: in an empty folder of its own, holding the files it was promised. */
function forPython(source, files = {}) {
  const lines = ['import os as _os, tempfile as _tempfile', '_os.chdir(_tempfile.mkdtemp(prefix="lotrd-"))'];
  for (const [name, text] of Object.entries(files)) {
    lines.push(`with open(${JSON.stringify(name)}, "w", newline="") as _f:`, `    _f.write(${JSON.stringify(text)})`);
  }
  lines.push('del _os, _tempfile');
  return lines.join('\n') + '\n' + source;
}

/** The same program on pytiny: what it printed, and the error that stopped it (or null). */
function onPytiny(source, files = {}) {
  const interpreter = new Interpreter();
  for (const [name, text] of Object.entries(files)) interpreter.files.set(name, text);
  try {
    interpreter.run(parse(source));
    return { out: interpreter.output.join(''), error: null, files: interpreter.files };
  } catch (error) {
    if (!(error instanceof PyError)) throw error;
    return { out: interpreter.output.join(''), error, files: interpreter.files };
  }
}

/** The Python name of the error pytiny stopped with, when it knows one. */
const kindOf = error => (error.exc ? error.exc.cls.name : error.pyType ?? null);

// ───────────────────────────────────────────────────────────── programs that run to the end
const PROGRAMS = {
  'an error in try jumps to except, and the program carries on': `
try:
    print("before")
    x = 10 // 0
    print("never")
except ZeroDivisionError:
    print("caught")
print("after")
`,
  'no error: the except block is skipped': `
try:
    x = 10 // 2
    print(x)
except ZeroDivisionError:
    print("caught")
print("after")
`,
  'int() on bad text is a ValueError, with Python\'s message': `
for text in ["12", "abc", " 7 ", "3.5", ""]:
    try:
        print(int(text) + 1)
    except ValueError as e:
        print("bad:", e)
`,
  'float() on bad text': `
for text in ["2.5", "x", "1e3"]:
    try:
        print(float(text))
    except ValueError as e:
        print("bad:", e)
`,
  'the first matching except wins': `
def attempt(k):
    try:
        if k == 0:
            return 1 // 0
        if k == 1:
            return int("x")
        if k == 2:
            return [1][3]
        return "fine"
    except ZeroDivisionError:
        return "zero"
    except ValueError:
        return "value"
    except IndexError:
        return "index"

print(attempt(0), attempt(1), attempt(2), attempt(3))
`,
  'one except for several kinds': `
for k in [0, 1, 2]:
    try:
        if k == 0:
            print(1 // 0)
        elif k == 1:
            print(int("x"))
        else:
            print("ok")
    except (ZeroDivisionError, ValueError):
        print("either")
`,
  'a parent kind catches its children': `
def attempt(k):
    try:
        if k == 0:
            return {"a": 1}["b"]
        if k == 1:
            return [1][5]
        if k == 2:
            return 5 % 0
        if k == 3:
            return int("q")
        return nothing_here
    except LookupError:
        return "lookup"
    except ArithmeticError:
        return "arithmetic"
    except Exception:
        return "something else"

print(attempt(0), attempt(1), attempt(2), attempt(3), attempt(4))
`,
  'a bare except catches anything': `
for k in [0, 1, 2]:
    try:
        if k == 0:
            print("a" + 1)
        elif k == 1:
            print([].pop())
        else:
            print({}["k"])
    except:
        print("caught", k)
`,
  'else runs only when nothing went wrong; finally always runs': `
for text in ["4", "four"]:
    try:
        n = int(text)
    except ValueError:
        print("not a number")
    else:
        print("doubled", n * 2)
    finally:
        print("done with", text)
`,
  'finally runs even when the function returns from try': `
def f(x):
    try:
        if x > 0:
            return "positive"
        return "not positive"
    finally:
        print("cleanup", x)

print(f(1))
print(f(-1))
`,
  'finally runs on the way out of a loop': `
for i in range(4):
    try:
        if i == 1:
            continue
        if i == 3:
            break
        print("body", i)
    finally:
        print("finally", i)
print("end")
`,
  'raise makes an error; str, repr and args': `
try:
    raise ValueError("age cannot be negative")
except ValueError as e:
    print(e)
    print(str(e))
    print(repr(e))
    print(e.args)
    print(f"problem: {e}")
    print("problem: " + str(e))
`,
  'raising the class on its own': `
try:
    raise ValueError
except ValueError as e:
    print("caught", repr(e), "[" + str(e) + "]", e.args)
`,
  'an error made with two values, or a number': `
try:
    raise ValueError("bad", 42)
except ValueError as e:
    print(e, e.args, repr(e))
try:
    raise RuntimeError(7)
except RuntimeError as e:
    print(e, e.args, repr(e), str(e) + "!")
`,
  'a KeyError shows its key in quotes': `
d = {"hp": 5}
try:
    print(d["mana"])
except KeyError as e:
    print("missing", e, e.args)
try:
    d.pop("gold")
except KeyError as e:
    print("missing", e)
try:
    print({1: "a"}[2])
except KeyError as e:
    print("missing", e)
try:
    raise KeyError("by hand")
except KeyError as e:
    print(e, repr(e))
`,
  'index errors, with Python\'s wording': `
try:
    print([1, 2, 3][3])
except IndexError as e:
    print(e)
try:
    print("abc"[10])
except IndexError as e:
    print(e)
try:
    print((1, 2)[-5])
except IndexError as e:
    print(e)
try:
    [].pop()
except IndexError as e:
    print(e)
try:
    items = [1]
    items[4] = 0
except IndexError as e:
    print(e)
`,
  'a name that does not exist, and an attribute that does not': `
class Purse:
    def __init__(self):
        self.coins = 0

try:
    print(total)
except NameError as e:
    print(e)
try:
    print(Purse().gems)
except AttributeError as e:
    print(e)
try:
    print(Purse.gems)
except AttributeError as e:
    print(e)
`,
  'adding text to a number is a TypeError': `
try:
    print("a" + 1)
except TypeError:
    print("type")
try:
    print(1 + "a")
except TypeError:
    print("type again")
try:
    print(abs(3, 4))
except TypeError:
    print("wrong count")
try:
    print(None < 1)
except TypeError:
    print("cannot compare")
`,
  'an error travels up through function calls until something catches it': `
def inner(x):
    print("inner start")
    result = 100 // x
    print("inner end")
    return result

def middle(x):
    print("middle start")
    r = inner(x)
    print("middle end")
    return r

for x in [5, 0]:
    try:
        print(middle(x))
    except ZeroDivisionError:
        print("caught at the top")
`,
  'a class of your own that inherits from Exception': `
class TooHeavy(Exception):
    pass

def lift(weight):
    if weight > 10:
        raise TooHeavy("that is " + str(weight - 10) + " too many")
    return "lifted " + str(weight)

for w in [4, 15]:
    try:
        print(lift(w))
    except TooHeavy as e:
        print("no:", e, repr(e), isinstance(e, Exception), isinstance(e, ValueError))
`,
  'a custom error with its own attributes': `
class LowFunds(Exception):
    def __init__(self, needed, have):
        super().__init__("need " + str(needed) + ", have " + str(have))
        self.short = needed - have

try:
    raise LowFunds(50, 20)
except LowFunds as e:
    print(e, e.short, e.args)
`,
  'a custom error whose __init__ never calls its parent': `
class Odd(Exception):
    def __init__(self, n):
        self.n = n

try:
    raise Odd(7)
except Odd as e:
    print(e.n, e.args, str(e), repr(e))
`,
  'a custom error with its own __str__': `
class Clash(Exception):
    def __init__(self, a, b):
        self.a = a
        self.b = b
    def __str__(self):
        return self.a + " clashes with " + self.b

try:
    raise Clash("red", "pink")
except Clash as e:
    print(e)
    print(str(e), f"[{e}]", e.args)
`,
  'a family of custom errors caught by the parent': `
class GameError(Exception):
    pass

class OutOfMana(GameError):
    pass

class OutOfRange(GameError):
    pass

def cast(k):
    if k == 0:
        raise OutOfMana("no mana")
    if k == 1:
        raise OutOfRange("too far")
    if k == 2:
        raise ValueError("not a spell")
    return "cast"

for k in range(4):
    try:
        print(cast(k))
    except OutOfMana as e:
        print("mana:", e)
    except GameError as e:
        print("game:", e)
    except Exception as e:
        print("other:", e)
`,
  'a bare raise passes the same error on': `
def careful():
    try:
        return int("zz")
    except ValueError:
        print("logging it")
        raise

try:
    careful()
except ValueError as e:
    print("outer got:", e)
`,
  'raising a different error from inside except': `
def load(text):
    try:
        return int(text)
    except ValueError:
        raise RuntimeError("could not load " + text)

try:
    load("q")
except RuntimeError as e:
    print(e)
`,
  'an error kept in another variable outlives the except block': `
kept = None
try:
    raise ValueError("first")
except ValueError as e:
    kept = e
print(kept, repr(kept), kept.args)
try:
    raise kept
except ValueError as e:
    print("again:", e, e is kept)
`,
  'try inside try': `
try:
    try:
        print(1 // 0)
    except ValueError:
        print("inner: wrong kind")
    finally:
        print("inner finally")
    print("skipped")
except ZeroDivisionError:
    print("outer caught it")
`,
  'an error inside else is not caught by the same try': `
try:
    try:
        x = 1
    except ValueError:
        print("no")
    else:
        print(int("bad"))
    finally:
        print("finally")
except ValueError:
    print("outer")
`,
  'the classic: a function that never crashes': `
def safe_divide(a, b):
    try:
        return a / b
    except ZeroDivisionError:
        return None

def to_number(text, fallback):
    try:
        return int(text)
    except ValueError:
        return fallback

print(safe_divide(6, 3), safe_divide(1, 0), to_number("9", -1), to_number("nine", -1))
`,
  'collecting the bad items instead of stopping': `
good = []
bad = []
for text in ["3", "x", "10", "", "7.5", "-2"]:
    try:
        good.append(int(text))
    except ValueError:
        bad.append(text)
print(good, bad, sum(good))
`,
  'assert is an AssertionError': `
try:
    assert 1 + 1 == 3, "arithmetic is broken"
except AssertionError as e:
    print("failed:", e, e.args)
try:
    assert False
except AssertionError as e:
    print("failed: [" + str(e) + "]", e.args)
`,
  'a local used too early is a kind of NameError': `
def f():
    try:
        print(count)
    except NameError:
        print("no count yet")
    count = 1
    return count

print(f())
`,
  'except with a name leaves the other variables alone': `
e = "kept"
n = 5
try:
    n = n + int("7")
except ValueError as err:
    print(err)
print(e, n)
`,
  'validating in one place, catching in another': `
class Account:
    def __init__(self, balance):
        self.balance = balance
    def withdraw(self, amount):
        if amount <= 0:
            raise ValueError("amount must be positive")
        if amount > self.balance:
            raise ValueError("not enough money")
        self.balance = self.balance - amount

a = Account(50)
for amount in [20, -5, 100, 30]:
    try:
        a.withdraw(amount)
        print("ok", a.balance)
    except ValueError as e:
        print("refused:", e, a.balance)
`,
  'isinstance on a caught error': `
try:
    {}["k"]
except Exception as e:
    print(isinstance(e, KeyError), isinstance(e, LookupError), isinstance(e, ValueError), isinstance(e, Exception))
`,
  'an error from a method call on the wrong kind of thing': `
x = 5
try:
    print(x.upper())
except AttributeError:
    print("numbers have no upper")
try:
    print("abc".push("d"))
except AttributeError:
    print("text has no push")
`,
};

// ───────────────────────────────────────────────────────────── programs with files
const FILE_PROGRAMS = {
  'read a whole file': {
    files: { 'notes.txt': 'first\nsecond\nthird\n' },
    source: `
f = open("notes.txt")
text = f.read()
f.close()
print(text)
print(len(text), f.closed)
`,
  },
  'a second read() finds nothing left': {
    files: { 'a.txt': 'hello\n' },
    source: `
f = open("a.txt", "r")
print([f.read(), f.read()])
f.close()
`,
  },
  'with closes the file': {
    files: { 'a.txt': 'x\ny\n' },
    source: `
with open("a.txt") as f:
    print(f.closed)
    data = f.read()
print(f.closed, [data], f.name, f.mode)
`,
  },
  'looping over the lines': {
    files: { 'names.txt': 'Ayla\nBren\nCy\n' },
    source: `
with open("names.txt") as f:
    for line in f:
        print([line], line.strip().upper())
`,
  },
  'no newline at the end of the last line': {
    files: { 'names.txt': 'Ayla\nBren' },
    source: `
with open("names.txt") as f:
    for line in f:
        print([line])
with open("names.txt") as f:
    print(f.readlines())
`,
  },
  'readline, one at a time, then empty text forever': {
    files: { 'a.txt': 'one\ntwo\n' },
    source: `
f = open("a.txt")
print([f.readline(), f.readline(), f.readline(), f.readline()])
f.close()
`,
  },
  'readlines after a readline gives the rest': {
    files: { 'a.txt': 'one\ntwo\nthree\n' },
    source: `
with open("a.txt") as f:
    first = f.readline()
    rest = f.readlines()
    print([first], rest, [f.read()])
`,
  },
  'an empty file': {
    files: { 'empty.txt': '' },
    source: `
with open("empty.txt") as f:
    print([f.read()])
with open("empty.txt") as f:
    print(f.readlines())
count = 0
with open("empty.txt") as f:
    for line in f:
        count = count + 1
print(count)
`,
  },
  'adding up a file of numbers': {
    files: { 'scores.txt': '10\n25\n7\n' },
    source: `
total = 0
with open("scores.txt") as f:
    for line in f:
        total = total + int(line)
print(total)
`,
  },
  'splitting each line into fields': {
    files: { 'heroes.csv': 'Ayla,9,bow\nBren,4,axe\n' },
    source: `
with open("heroes.csv") as f:
    for line in f:
        parts = line.strip().split(",")
        print(parts[0], int(parts[1]) * 2, parts)
`,
  },
  'blank lines are lines too': {
    files: { 'a.txt': 'x\n\ny\n\n' },
    source: `
with open("a.txt") as f:
    lines = f.readlines()
print(lines, len(lines))
`,
  },
  'write a file, then read it back': {
    source: `
with open("out.txt", "w") as f:
    print(f.write("line one\\n"))
    print(f.write("two"))
    f.write("\\n")
with open("out.txt") as f:
    print([f.read()])
`,
  },
  'opening with w starts the file again from nothing': {
    files: { 'log.txt': 'old stuff\n' },
    source: `
with open("log.txt", "w") as f:
    f.write("new\\n")
with open("log.txt") as f:
    print([f.read()])
with open("log.txt", "w") as f:
    pass
with open("log.txt") as f:
    print([f.read()])
`,
  },
  'opening with a adds to the end': {
    files: { 'log.txt': 'day 1\n' },
    source: `
with open("log.txt", "a") as f:
    f.write("day 2\\n")
with open("log.txt", "a") as f:
    f.write("day 3\\n")
with open("fresh.txt", "a") as f:
    f.write("made by append\\n")
with open("log.txt") as f:
    print(f.readlines())
with open("fresh.txt") as f:
    print(f.readlines())
`,
  },
  'numbers have to be turned into text to be written': {
    source: `
scores = [3, 14, 15]
with open("scores.txt", "w") as f:
    for s in scores:
        f.write(str(s) + "\\n")
back = []
with open("scores.txt") as f:
    for line in f:
        back.append(int(line))
print(back, back == scores)
`,
  },
  'a missing file is a FileNotFoundError': {
    files: { 'here.txt': 'yes\n' },
    source: `
for name in ["here.txt", "gone.txt"]:
    try:
        with open(name) as f:
            print(f.read().strip())
    except FileNotFoundError as e:
        print("no such file:", name)
        print(e)
        print(isinstance(e, OSError), isinstance(e, Exception))
`,
  },
  'using a file after it is closed': {
    files: { 'a.txt': 'hello\n' },
    source: `
with open("a.txt") as f:
    pass
try:
    print(f.read())
except ValueError as e:
    print(e)
g = open("b.txt", "w")
g.close()
g.close()
try:
    g.write("late")
except ValueError as e:
    print(e)
`,
  },
  'try / finally closes the file by hand': {
    files: { 'a.txt': '5\nx\n' },
    source: `
f = open("a.txt")
try:
    for line in f:
        print(int(line))
except ValueError:
    print("bad line")
finally:
    f.close()
    print("closed:", f.closed)
`,
  },
  'with still closes the file when the block fails': {
    files: { 'a.txt': '5\nx\n' },
    source: `
try:
    with open("a.txt") as f:
        for line in f:
            print(int(line))
except ValueError:
    print("bad line, closed:", f.closed)
`,
  },
  'a function that loads, with a fallback': {
    files: { 'gold.txt': '120\n', 'broken.txt': 'lots\n' },
    source: `
def load_gold(name):
    try:
        with open(name) as f:
            return int(f.read())
    except FileNotFoundError:
        return 0
    except ValueError:
        return -1

print(load_gold("gold.txt"), load_gold("nothing.txt"), load_gold("broken.txt"))
`,
  },
  'copying one file into another, changed': {
    files: { 'in.txt': 'ayla\nbren\n' },
    source: `
with open("in.txt") as src:
    with open("out.txt", "w") as dst:
        for line in src:
            dst.write(line.strip().upper() + "!\\n")
with open("out.txt") as f:
    print(f.read())
`,
  },
  'mode given by keyword, and the long way round': {
    files: { 'a.txt': 'x\n' },
    source: `
f = open("a.txt", mode="r", encoding="utf-8")
print([f.read()])
f.close()
g = open("b.txt", mode="w")
g.write("y")
g.close()
h = open("b.txt", "rt")
print([h.read()])
h.close()
`,
  },
};

// ───────────────────────────────────────────────────────────── programs Python stops
const STOPS = {
  'a raise nobody catches': { source: `
print("start")
raise ValueError("stop here")
` },
  'an except for the wrong kind': { source: `
try:
    print("trying")
    print(int("x"))
except ZeroDivisionError:
    print("caught")
` },
  'a child kind does not catch its parent': { source: `
try:
    print("trying")
    raise LookupError("general")
except KeyError:
    print("caught")
` },
  'a bare raise with nothing being handled': { source: `
print("start")
raise
` },
  'raising text instead of an error': { source: `
print("start")
raise "something went wrong"
` },
  'raising a number': { source: `
print("start")
raise 42
` },
  'except naming something that is not a kind of error': { source: `
try:
    print("trying")
    print(1 // 0)
except "ZeroDivisionError":
    print("caught")
` },
  'the name given by as is gone after the block': { source: `
try:
    print(int("x"))
except ValueError as e:
    print("caught")
print(e)
` },
  'the name given by as is gone even if it existed before': { source: `
e = "before"
try:
    print(int("x"))
except ValueError as e:
    print("caught")
print(e)
` },
  'inside a function, too': { source: `
def f():
    try:
        return int("x")
    except ValueError as e:
        print("caught")
    return e

f()
` },
  'an error raised inside except': { source: `
try:
    print(1 // 0)
except ZeroDivisionError:
    print("handling")
    print(int("oops"))
print("never")
` },
  'an error raised inside finally': { source: `
try:
    print("body")
finally:
    print("finally")
    print([][0])
` },
  'finally runs, and then the error carries on up': { source: `
def f():
    try:
        print("body")
        return 1 // 0
    finally:
        print("finally")

f()
print("never")
` },
  'a custom error nobody catches': { source: `
class Broken(Exception):
    pass

print("start")
raise Broken("in pieces")
` },
  'a custom error is not a ValueError': { source: `
class Broken(Exception):
    pass

try:
    print("trying")
    raise Broken("x")
except ValueError:
    print("caught")
` },
  'an error in else goes past the excepts of its own try': { source: `
try:
    print("body")
except ValueError:
    print("caught")
else:
    print(int("bad"))
` },
  'a second failure after the first was handled': { source: `
for text in ["1", "x", "0"]:
    try:
        print(10 // int(text))
    except ValueError:
        print("not a number")
` },
  'a keyword argument to an exception': { source: `
print("start")
raise ValueError(message="no")
` },
  'opening a file that is not there': { source: `
print("start")
f = open("nowhere.txt")
print(f.read())
` },
  'the wrong except around a missing file': { source: `
try:
    print("trying")
    open("nowhere.txt")
except ValueError:
    print("caught")
` },
  'writing a number straight into a file': { source: `
with open("out.txt", "w") as f:
    print("writing")
    f.write(42)
` },
  'reading from a file after with has closed it': { files: { 'a.txt': 'hi\n' }, source: `
with open("a.txt") as f:
    print("inside")
print(f.read())
` },
  'a bad line in a file of numbers': { files: { 'n.txt': '1\n2\nthree\n4\n' }, source: `
total = 0
with open("n.txt") as f:
    for line in f:
        total = total + int(line)
        print(total)
` },
};

// ───────────────────────────────────────────────────────────── generated corpus
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RISKY = `
class AppError(Exception):
    pass

class DataError(AppError):
    def __init__(self, what, code):
        super().__init__(what)
        self.code = code

def risky(k):
    if k == 0:
        return 10 // (k * 1)
    if k == 1:
        return int("x1")
    if k == 2:
        return [1, 2][5]
    if k == 3:
        return {"a": 1}["b"]
    if k == 4:
        raise AppError("app failed")
    if k == 5:
        raise DataError("data failed", 55)
    if k == 6:
        raise ValueError("by hand")
    if k == 7:
        return "a" + 1
    if k == 8:
        return undefined_name
    if k == 9:
        return float("no")
    return k * 2

def relay(k):
    try:
        return risky(k)
    finally:
        print("relay done", k)

log = []
`;

// Kinds whose message is the same in every Python, so a handler may print it.
const PRINTABLE = ['ValueError', 'KeyError', 'IndexError', 'AppError', 'DataError', 'NameError'];
const QUIET = ['ZeroDivisionError', 'TypeError', 'LookupError', 'ArithmeticError', 'Exception'];

function generate(seed) {
  const r = rng(seed);
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const pick = list => list[Math.floor(r() * list.length)];
  const lines = [RISKY];
  for (let block = 0; block < int(4, 8); block++) {
    const k = int(0, 12);
    const call = pick(['risky', 'risky', 'relay']);
    lines.push('try:', '    try:', `        print("value", ${call}(${k}))`);
    const kinds = [];
    for (let h = 0; h < int(1, 3); h++) {
      const kind = r() < 0.55 ? pick(PRINTABLE) : pick(QUIET);
      if (kinds.includes(kind)) continue;
      kinds.push(kind);
      if (r() < 0.15) {
        const other = pick(QUIET);
        lines.push(`    except (${kind}, ${other}):`, `        print("caught one of ${kind} or ${other}")`);
      } else if (PRINTABLE.includes(kind)) {
        lines.push(`    except ${kind} as e:`, `        print("${kind}:", e, e.args)`, `        log.append(str(e))`);
        if (r() < 0.2) lines.push('        raise');
        if (r() < 0.15) lines.push(`        raise AppError("wrapped " + str(e))`);
      } else {
        lines.push(`    except ${kind}:`, `        print("caught ${kind}")`);
      }
    }
    if (r() < 0.4) lines.push('    else:', `        print("no error for ${k}")`);
    if (r() < 0.5) lines.push('    finally:', `        print("finally ${block}")`);
    lines.push('except AppError as outer:', '    print("outer app:", outer, isinstance(outer, DataError))',
      'except Exception:', '    print("outer: something else")');
  }
  lines.push('print(log)');
  return lines.join('\n') + '\n';
}

// A file read and rewritten at random: every way of reading, each mode of
// writing, and what is on the "disk" after each step.
function generateFiles(seed) {
  const r = rng(seed * 7919);
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const pick = list => list[Math.floor(r() * list.length)];
  const words = ['ash', 'bog', 'clay', 'dune', '12', '7', '', 'x y'];
  const text = () => {
    let out = '';
    for (let i = 0; i < int(0, 4); i++) out += pick(words) + '\n';
    return r() < 0.25 && out ? out + pick(['tail', '9']) : out;
  };
  const files = { 'a.txt': text(), 'b.txt': text() };
  const names = ['a.txt', 'b.txt', 'c.txt'];
  const lines = ['def show(name):', '    try:', '        with open(name) as f:', '            print(name, [f.read()])',
    '    except FileNotFoundError as e:', '        print("missing", e)', ''];
  for (let step = 0; step < int(4, 9); step++) {
    const name = pick(names);
    switch (int(0, 7)) {
      case 0: lines.push(`with open("${name}", "w") as f:`, `    print(f.write(${JSON.stringify(text())}))`); break;
      case 1: lines.push(`with open("${name}", "a") as f:`, `    f.write(${JSON.stringify(pick(words) + '\n')})`, `    f.write(${JSON.stringify(pick(words))})`); break;
      case 2: lines.push('try:', `    with open("${name}") as f:`, '        print(f.readline() == "", f.readlines())',
        'except FileNotFoundError:', '    print("not there")'); break;
      case 3: lines.push('try:', `    with open("${name}") as f:`, '        n = 0', '        for line in f:', '            n = n + len(line.strip())',
        '        print(n, [f.read()], [f.readline()])', 'except FileNotFoundError:', '    print("not there")'); break;
      case 4: lines.push('try:', `    f = open("${name}")`, '    first = f.readline()', '    f.close()', '    print([first], f.closed)',
        '    print(f.read())', 'except FileNotFoundError:', '    print("not there")', 'except ValueError as e:', '    print(e)'); break;
      case 5: lines.push('try:', '    total = 0', `    with open("${name}") as f:`, '        for line in f:', '            total = total + int(line)',
        '    print("total", total)', 'except FileNotFoundError:', '    print("not there")', 'except ValueError as e:', '    print("bad:", e)'); break;
      case 6: lines.push('try:', `    with open("${name}") as src:`, `        with open("${pick(names.filter(n => n !== name))}", "w") as dst:`,
        '            for line in src:', '                dst.write(line.strip() + "|")', 'except FileNotFoundError:', '    print("not there")'); break;
      default: lines.push(`show("${name}")`);
    }
  }
  for (const name of names) lines.push(`show("${name}")`);
  return { files, source: lines.join('\n') + '\n' };
}

// ───────────────────────────────────────────────────────────── the comparison
describe('exceptions and files: the practice interpreter agrees with real Python', { skip }, () => {
  const named = [
    ...Object.entries(PROGRAMS).map(([name, source]) => [name, { source }]),
    ...Object.entries(FILE_PROGRAMS).map(([name, program]) => [`files: ${name}`, program]),
  ];
  const stops = Object.entries(STOPS);
  const generated = [
    ...Array.from({ length: 300 }, (_, i) => [`generated #${i + 1}`, { source: generate(i + 1) }]),
    ...Array.from({ length: 200 }, (_, i) => [`generated files #${i + 1}`, generateFiles(i + 1)]),
  ];
  const all = [...named, ...stops, ...generated];
  const expected = python ? runOnCPython(python, all.map(([, p]) => forPython(p.source, p.files))) : [];

  for (let i = 0; i < named.length; i++) {
    it(named[i][0], () => {
      const program = named[i][1];
      assert.equal(expected[i].err, null, `this program does not even run on real Python: ${expected[i].err}`);
      const mine = onPytiny(program.source, program.files);
      assert.equal(mine.error, null, `pytiny refused a program Python runs: ${mine.error?.message}`);
      assert.equal(mine.out, expected[i].out);
    });
  }

  for (let i = 0; i < stops.length; i++) {
    it(`stops, as Python does: ${stops[i][0]}`, () => {
      const program = stops[i][1];
      const want = expected[named.length + i];
      assert.notEqual(want.err, null, 'real Python runs this program to the end; it does not belong in STOPS');
      const mine = onPytiny(program.source, program.files);
      assert.notEqual(mine.error, null, `pytiny ran a program that Python stops with: ${want.err}`);
      assert.equal(mine.out, want.out, 'what was printed before the error differs');
      // Where pytiny says which of Python's errors this is, it has to be the right one.
      if (kindOf(mine.error)) assert.equal(kindOf(mine.error), want.err);
    });
  }

  it(`${generated.length} generated programs`, () => {
    const wrong = [];
    generated.forEach(([name, program], k) => {
      const want = expected[named.length + stops.length + k];
      const mine = onPytiny(program.source, program.files);
      const shown = `${JSON.stringify(program.files ?? {})}\n${program.source}`;
      if (want.err !== null) wrong.push(`${name}: generator produced a program Python rejects (${want.err})\n${shown}`);
      else if (mine.error !== null) wrong.push(`${name}: pytiny error: ${mine.error.message}\n${shown}`);
      else if (mine.out !== want.out) wrong.push(`${name}:\n${shown}--- python\n${want.out}--- pytiny\n${mine.out}`);
    });
    assert.deepEqual(wrong.slice(0, 2), [], `${wrong.length} of ${generated.length} differ`);
  });
});

// ───────────────────────────────────────────────────────────── what the student is told
function failure(source, files = {}) {
  const outcome = onPytiny(source, files);
  assert.ok(outcome.error, `expected this program to fail:\n${source}`);
  return outcome.error;
}

describe('exceptions: what a student is told when it goes wrong', () => {
  it('an uncaught raise names the kind of error and gives its message', () => {
    const err = failure('def check(age):\n    if age < 0:\n        raise ValueError("age cannot be negative")\ncheck(-1)\n');
    assert.match(err.message, /stopped with a ValueError: age cannot be negative/);
    assert.equal(err.line, 3);
    assert.match(err.hint, /raised on purpose/);
  });

  it('an error Python itself would raise keeps its plain-language message when nothing catches it', () => {
    const err = failure('try:\n    print(1 // 0)\nexcept ValueError:\n    print("no")\n');
    assert.match(err.message, /divide by zero/);
    assert.equal(err.line, 2);
  });

  it('a try with nothing after it is explained', () => {
    assert.match(failure('try:\n    x = 1\nprint(x)\n').message, /needs an except/);
  });

  it('an except that does not line up with a try is explained', () => {
    assert.match(failure('x = 1\nexcept ValueError:\n    pass\n').message, /does not line up with any "try"/);
  });

  it('two kinds without parentheses are steered to the tuple form', () => {
    assert.match(failure('try:\n    pass\nexcept ValueError, TypeError:\n    pass\n').hint, /except \(ValueError, TypeError\):/);
  });

  it('a bare except has to come last', () => {
    assert.match(failure('try:\n    pass\nexcept:\n    pass\nexcept ValueError:\n    pass\n').message, /has to be the last except/);
  });

  it('raising plain text says how to wrap it', () => {
    const err = failure('raise "bad input"\n');
    assert.match(err.message, /Only an error can be raised/);
    assert.match(err.hint, /raise ValueError\("\.\.\."\)/);
  });

  it('except with the kind in quotes says to drop them', () => {
    const err = failure('try:\n    print(1 // 0)\nexcept "ZeroDivisionError":\n    pass\n');
    assert.match(err.hint, /without quotes/);
  });

  it('Python\'s wording for a division by zero is declined rather than guessed', () => {
    // It differs between Python versions, so printing it would be wrong on one of them.
    const err = failure('try:\n    print(1 // 0)\nexcept ZeroDivisionError as e:\n    print(e)\n');
    assert.match(err.message, /wording .* is not reproduced/);
    assert.match(err.hint, /message of your own/);
  });

  it('but catching it, and printing a message of your own, is fine', () => {
    const outcome = onPytiny('try:\n    print(1 // 0)\nexcept ZeroDivisionError as e:\n    print("cannot divide by zero")\n');
    assert.equal(outcome.error, null);
    assert.equal(outcome.out, 'cannot divide by zero\n');
  });

  it('a loop that never ends is not something except can swallow', () => {
    const err = failure('try:\n    while True:\n        pass\nexcept:\n    print("caught")\n');
    assert.equal(err.kind, 'limit');
  });

  it('nor is runaway recursion', () => {
    const err = failure('def f(n):\n    return f(n + 1)\ntry:\n    f(1)\nexcept Exception:\n    print("caught")\n');
    assert.equal(err.kind, 'limit');
  });

  it('something this interpreter declines to do is not caught either, and says so', () => {
    const err = failure('try:\n    x = input()\nexcept Exception:\n    print("caught")\n');
    assert.match(err.message, /not available here/);
    assert.match(err.hint, /cannot hand this particular error to an except/);
  });

  it('Python\'s own error classes cannot be altered', () => {
    assert.match(failure('ValueError.note = 1\n').message, /Python's own class/);
  });

  it('one program cannot leave a mark on the next', () => {
    onPytiny('class Mine(ValueError):\n    pass\n');
    assert.match(failure('print(Mine)\n').message, /has not been given a value/);
  });
});

describe('files: what a student is told when it goes wrong', () => {
  it('a missing file is named, and the fix is offered', () => {
    const err = failure('f = open("scroes.txt")\n');
    assert.match(err.message, /no file called 'scroes\.txt'/);
    assert.match(err.hint, /except FileNotFoundError/);
  });

  it('opening a file that is still being written is refused, since nothing has been saved yet', () => {
    // Real Python would quietly read an empty or half-written file here.
    const err = failure('f = open("out.txt", "w")\nf.write("hello")\nprint(open("out.txt").read())\n');
    assert.match(err.message, /still open for writing/);
    assert.match(err.hint, /with block/);
  });

  it('reading a file opened for writing says which mode it needs', () => {
    const err = failure('with open("out.txt", "w") as f:\n    print(f.read())\n');
    assert.match(err.message, /opened for writing/);
  });

  it('writing to a file opened for reading says how to open it', () => {
    const err = failure('with open("a.txt") as f:\n    f.write("x")\n', { 'a.txt': '' });
    assert.match(err.message, /opened for reading/);
    assert.match(err.hint, /open\(name, "w"\)/);
  });

  it('writing a number says to turn it into text', () => {
    const err = failure('with open("out.txt", "w") as f:\n    f.write(5)\n');
    assert.match(err.hint, /str\(value\)/);
  });

  it('with on something that is not a file is explained', () => {
    assert.match(failure('with 5 as f:\n    pass\n').message, /works on a file/);
  });

  it('with without "as" is explained', () => {
    assert.match(failure('with open("a.txt"):\n    pass\n', { 'a.txt': '' }).message, /"as" and a name/);
  });

  it('print(..., file=f) is declined by name rather than printed to the screen', () => {
    const err = failure('with open("out.txt", "w") as f:\n    print("hi", file=f)\n');
    assert.match(err.message, /file=/);
  });

  it('modes other than r, w and a are declined', () => {
    assert.match(failure('open("a.bin", "rb")\n').message, /mode 'rb' is not supported/);
  });

  it('nothing reaches a real disk: files live in the interpreter and nowhere else', () => {
    const outcome = onPytiny('with open("made.txt", "w") as f:\n    f.write("x\\n")\n');
    assert.equal(outcome.files.get('made.txt'), 'x\n');
    assert.match(failure('open("made.txt")\n').message, /no file called/);
  });
});

// ───────────────────────────────────────────────────────────── problems that use files
describe('files: a problem that gives the student files to read', () => {
  const TOTAL = {
    type: 'code_write',
    question: 'Return the sum of the numbers in the file, one per line.',
    signature: 'def total(name):',
    files: { 'scores.txt': '10\n25\n7\n', 'empty.txt': '' },
    tests: [
      { args: ['scores.txt'], expect: 42 },
      { args: ['empty.txt'], expect: 0 },
      { args: ['missing.txt'], expect: -1 },
    ],
    solution: 'try:\n    result = 0\n    with open(name) as f:\n        for line in f:\n            result = result + int(line)\n    return result\nexcept FileNotFoundError:\n    return -1',
  };

  it('each test starts with the problem\'s files', () => {
    const outcome = runProblem(TOTAL, TOTAL.solution);
    assert.equal(outcome.passed, 3, JSON.stringify(outcome.results.map(r => r.error?.message ?? r.actualRepr)));
  });

  it('a file one test writes is not there for the next', () => {
    const body = 'try:\n    with open("seen.txt") as f:\n        return -99\nexcept FileNotFoundError:\n    pass\nwith open("seen.txt", "w") as f:\n    f.write("x")\n' + TOTAL.solution;
    const outcome = runProblem(TOTAL, body);
    assert.equal(outcome.passed, 3);
  });

  it('runTestCases takes the files directly', () => {
    const outcome = runTestCases({ signature: TOTAL.signature, body: TOTAL.solution, tests: TOTAL.tests, files: TOTAL.files });
    assert.equal(outcome.passed, 3);
  });

  const SAVE = {
    type: 'code_write',
    question: 'Write each score on its own line of the file.',
    signature: 'def save(name, scores):',
    files: { 'old.txt': 'stale\n' },
    tests: [
      { run: 'save("out.txt", [3, 14])', check: 'open("out.txt").read()', expect: '3\n14\n' },
      { run: 'save("old.txt", [5])', check: 'open("old.txt").read()', expect: '5\n' },
      { run: 'save("out.txt", [])', check: 'open("out.txt").read()', expect: '' },
    ],
    solution: 'with open(name, "w") as f:\n    for s in scores:\n        f.write(str(s) + "\\n")',
  };

  it('a function that writes is graded by what the file holds afterwards', () => {
    const outcome = runProblem(SAVE, SAVE.solution);
    assert.equal(outcome.passed, 3, JSON.stringify(outcome.results.map(r => r.error?.message ?? r.actualRepr)));
  });

  const CHECK_AGE = {
    type: 'code_write',
    question: 'Raise a ValueError saying "too young" for an age under 13; otherwise return the age.',
    signature: 'def check_age(age):',
    tests: [
      { run: 'r = check_age(20)', check: 'r', expect: 20 },
      { run: 'check_age(5)', raises: 'ValueError', message: 'too young' },
      { run: 'check_age(12)', raises: 'ValueError' },
    ],
    solution: 'if age < 13:\n    raise ValueError("too young")\nreturn age',
  };

  it('a test can expect an error, and its message', () => {
    const outcome = runProblem(CHECK_AGE, CHECK_AGE.solution);
    assert.equal(outcome.passed, 3);
    assert.equal(outcome.results[1].expectedRepr, 'raises ValueError: too young');
    assert.equal(outcome.results[1].actualRepr, 'raises ValueError: too young');
  });

  it('returning instead of raising fails that row with "no error"', () => {
    const outcome = runProblem(CHECK_AGE, 'return age');
    assert.equal(outcome.passed, 1);
    assert.equal(outcome.results[1].actualRepr, 'no error');
    assert.equal(outcome.results[1].error, null);
  });

  it('the wrong message fails; the wrong kind of error is reported as the error it is', () => {
    const wrongWords = runProblem(CHECK_AGE, 'if age < 13:\n    raise ValueError("nope")\nreturn age');
    assert.equal(wrongWords.results[1].passed, false);
    assert.equal(wrongWords.results[1].actualRepr, 'raises ValueError: nope');
    assert.equal(wrongWords.results[2].passed, true);
    const wrongKind = runProblem(CHECK_AGE, 'if age < 13:\n    raise TypeError("too young")\nreturn age');
    assert.equal(wrongKind.results[1].passed, false);
    assert.match(wrongKind.results[1].error.message, /stopped with a TypeError/);
  });

  it('a subclass of the expected error passes, as an except for it would', () => {
    const lookup = { ...CHECK_AGE, tests: [CHECK_AGE.tests[0], { run: 'check_age(5)', raises: 'LookupError' }] };
    const outcome = runProblem(lookup, 'if age < 13:\n    raise KeyError("too young")\nreturn age');
    assert.equal(outcome.passed, 2);
  });

  it('forgetting to close the file is reported, not silently passed or failed', () => {
    const outcome = runProblem(SAVE, 'f = open(name, "w")\nfor s in scores:\n    f.write(str(s) + "\\n")');
    assert.equal(outcome.passed, 0);
    assert.match(outcome.results[0].error.message, /still open for writing/);
  });
});
