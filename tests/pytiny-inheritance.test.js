// tests/pytiny-inheritance.test.js — inheritance in the practice interpreter.
//
// Same plan as tests/pytiny-classes.test.js. First, programs that are run on
// real Python and on src/pytiny.js and must print exactly the same thing:
// hand-written ones for each behaviour that matters (where a name is found,
// which version of an overridden method runs, what super() reaches), then a
// few hundred generated ones. Second, programs Python stops with an error,
// which pytiny has to stop too, after the same output. Third, the words a
// student reads when they get it wrong, which are ours to get right.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findPython, runOnCPython, runOnPytiny } from './helpers/cpython.js';
import { parse, Interpreter, PyError, runProblem, problemHeader } from '../src/pytiny.js';

const python = findPython();
if (!python && process.env.LOTRD_REQUIRE_PYTHON) {
  throw new Error('LOTRD_REQUIRE_PYTHON is set but no Python 3 was found');
}
const skip = python ? false
  : 'NO PYTHON FOUND — the interpreter was not compared with real Python. Install Python 3 or set LOTRD_PYTHON.';

// ───────────────────────────────────────────────────────────── hand-written corpus
const PROGRAMS = {
  'a child has everything its parent has': `
class Animal:
    def __init__(self, name):
        self.name = name
    def speak(self):
        return self.name + " makes a sound"

class Dog(Animal):
    pass

d = Dog("Rex")
print(d.name, "/", d.speak())
`,
  'a child can add a method the parent lacks': `
class Animal:
    def __init__(self, name):
        self.name = name

class Dog(Animal):
    def fetch(self):
        return self.name + " fetches"

print(Dog("Rex").fetch())
`,
  'overriding: the object\'s own class decides': `
class Animal:
    def speak(self):
        return "..."

class Dog(Animal):
    def speak(self):
        return "Woof"

class Cat(Animal):
    def speak(self):
        return "Meow"

class Fish(Animal):
    pass

for pet in [Dog(), Cat(), Fish(), Animal()]:
    print(pet.speak())
`,
  'super().__init__ runs the parent\'s setup': `
class Animal:
    def __init__(self, name):
        self.name = name
        self.legs = 4

class Bird(Animal):
    def __init__(self, name, can_fly):
        super().__init__(name)
        self.legs = 2
        self.can_fly = can_fly

b = Bird("Pip", True)
print(b.name, b.legs, b.can_fly)
`,
  'super().method() extends rather than replaces': `
class Hero:
    def __init__(self, name):
        self.name = name
    def describe(self):
        return "Hero " + self.name

class Mage(Hero):
    def __init__(self, name, mana):
        super().__init__(name)
        self.mana = mana
    def describe(self):
        return super().describe() + " with " + str(self.mana) + " mana"

print(Mage("Ayla", 30).describe())
print(Hero("Bren").describe())
`,
  'three levels, each calling the one above': `
class A:
    def __init__(self):
        self.trail = ["A"]
    def who(self):
        return "A"

class B(A):
    def __init__(self):
        super().__init__()
        self.trail.append("B")
    def who(self):
        return "B>" + super().who()

class C(B):
    def __init__(self):
        super().__init__()
        self.trail.append("C")
    def who(self):
        return "C>" + super().who()

c = C()
print(c.trail, c.who(), B().who(), A().who())
`,
  'super() skips a level that does not define the method': `
class A:
    def who(self):
        return "A"

class B(A):
    pass

class C(B):
    def who(self):
        return "C then " + super().who()

print(C().who())
`,
  'a child with no __init__ uses the nearest one above': `
class A:
    def __init__(self, x):
        self.x = x

class B(A):
    pass

class C(B):
    def double(self):
        return self.x * 2

print(C(21).double())
`,
  'a parent method calls a method the child overrides': `
class Report:
    def title(self):
        return "Report"
    def render(self):
        return "[" + self.title() + "]"

class Invoice(Report):
    def title(self):
        return "Invoice"

print(Report().render(), Invoice().render())
`,
  '__str__ is inherited, and can be overridden': `
class Item:
    def __init__(self, name):
        self.name = name
    def __str__(self):
        return "Item(" + self.name + ")"

class Potion(Item):
    pass

class Sword(Item):
    def __str__(self):
        return "Sword!" + super().__str__()

print(Potion("red"), Sword("long"), str(Potion("blue")), f"{Sword('short')}")
`,
  'an inherited __str__ uses the child\'s overridden method': `
class Shape:
    def area(self):
        return 0
    def __str__(self):
        return "area " + str(self.area())

class Square(Shape):
    def __init__(self, side):
        self.side = side
    def area(self):
        return self.side * self.side

print(Shape(), Square(3))
`,
  '__eq__ and __len__ are inherited': `
class Bag:
    def __init__(self, items):
        self.items = items
    def __eq__(self, other):
        return self.items == other.items
    def __len__(self):
        return len(self.items)

class Sack(Bag):
    pass

print(Sack([1, 2]) == Sack([1, 2]), Sack([1]) == Bag([2]), len(Sack([1, 2, 3])))
if Sack([]):
    print("full")
else:
    print("empty")
`,
  'isinstance follows the chain upward, never downward': `
class Animal:
    pass

class Dog(Animal):
    pass

class Puppy(Dog):
    pass

class Cat(Animal):
    pass

p = Puppy()
a = Animal()
print(isinstance(p, Puppy), isinstance(p, Dog), isinstance(p, Animal), isinstance(p, Cat))
print(isinstance(a, Animal), isinstance(a, Dog), isinstance(Cat(), Dog), isinstance(Cat(), Animal))
print(isinstance(p, (Cat, Dog)), isinstance(a, (Cat, Dog)))
`,
  'isinstance with Python\'s own types': `
class Thing:
    pass

print(isinstance(3, int), isinstance(3.0, int), isinstance(3.0, float), isinstance(3, float))
print(isinstance(True, int), isinstance(True, bool), isinstance(1, bool))
print(isinstance("a", str), isinstance(3, str), isinstance([1], list), isinstance((1, 2), tuple))
print(isinstance({"a": 1}, dict), isinstance([], dict), isinstance(None, int), isinstance(Thing(), int))
print(isinstance(3, Thing), isinstance("x", (int, str)), isinstance(2.5, (int, str)))
`,
  'class attributes are found through the parent': `
class Vehicle:
    wheels = 4
    kind = "vehicle"

class Bike(Vehicle):
    wheels = 2

class Car(Vehicle):
    pass

print(Bike.wheels, Car.wheels, Vehicle.wheels, Bike().wheels, Car().wheels, Bike.kind, Bike().kind)
Vehicle.wheels = 6
print(Bike.wheels, Car.wheels, Car().wheels)
Car.wheels = 3
print(Vehicle.wheels, Car.wheels, Bike.wheels)
`,
  'a list in the parent\'s class body is shared by every child': `
class Base:
    seen = []
    def note(self, x):
        self.seen.append(x)

class Left(Base):
    pass

class Right(Base):
    pass

Left().note(1)
Right().note(2)
print(Base.seen, Left.seen is Right.seen)
`,
  'a counter kept on the parent, bumped by children': `
class Unit:
    made = 0
    def __init__(self):
        Unit.made = Unit.made + 1

class Archer(Unit):
    def __init__(self):
        super().__init__()
        self.arrows = 10

class Scout(Unit):
    pass

Archer()
Scout()
Unit()
print(Unit.made, Archer.made, Scout().made)
`,
  'calling the parent\'s version through the class name': `
class Animal:
    def __init__(self, name):
        self.name = name
    def speak(self):
        return self.name + " makes a sound"

class Dog(Animal):
    def __init__(self, name, tricks):
        Animal.__init__(self, name)
        self.tricks = tricks
    def speak(self):
        return Animal.speak(self) + ", then barks"

d = Dog("Rex", 3)
print(d.speak(), d.tricks)
`,
  'object as a parent, and empty parentheses': `
class A(object):
    def hi(self):
        return "A"

class B():
    def hi(self):
        return "B"

class C(A):
    pass

print(A().hi(), B().hi(), C().hi())
`,
  'super().__init__() when nothing above has an __init__': `
class Plain:
    def hello(self):
        return "hello"

class Fancy(Plain):
    def __init__(self):
        super().__init__()
        self.ready = True

class Alone:
    def __init__(self):
        super().__init__()
        self.ok = 1

print(Fancy().ready, Fancy().hello(), Alone().ok)
`,
  'a child overriding __init__ without super() has only its own attributes': `
class Animal:
    def __init__(self):
        self.legs = 4
    def kind(self):
        return "animal"

class Snake(Animal):
    def __init__(self):
        self.length = 3

s = Snake()
print(s.length, s.kind())
`,
  'super() with defaults and keyword arguments': `
class Item:
    def __init__(self, name, price=1):
        self.name = name
        self.price = price

class Rare(Item):
    def __init__(self, name, price=50, glow=False):
        super().__init__(name, price=price * 2)
        self.glow = glow

a = Rare("orb")
b = Rare("gem", 5, glow=True)
print(a.name, a.price, a.glow, b.name, b.price, b.glow)
`,
  'a method taken from super() and kept for later': `
class Base:
    def tag(self):
        return "base:" + self.name

class Kid(Base):
    def __init__(self, name):
        self.name = name
    def tag(self):
        older = super().tag
        return older() + "|" + older().upper()

print(Kid("k").tag())
`,
  'polymorphism: one loop, many classes': `
class Shape:
    def __init__(self, name):
        self.name = name
    def area(self):
        return 0
    def describe(self):
        return f"{self.name}: {self.area()}"

class Rect(Shape):
    def __init__(self, w, h):
        super().__init__("rect")
        self.w = w
        self.h = h
    def area(self):
        return self.w * self.h

class Square(Rect):
    def __init__(self, side):
        super().__init__(side, side)
        self.name = "square"

shapes = [Rect(2, 3), Square(4), Shape("blob")]
total = 0
for s in shapes:
    print(s.describe())
    total = total + s.area()
print(total, isinstance(shapes[1], Rect), isinstance(shapes[0], Square))
`,
  'composition beside inheritance: an object holding objects': `
class Weapon:
    def __init__(self, power):
        self.power = power

class Bow(Weapon):
    def __init__(self):
        super().__init__(3)

class Hero:
    def __init__(self, weapon):
        self.weapon = weapon
        self.pack = []
    def strike(self):
        return self.weapon.power * 2

h = Hero(Bow())
h.pack.append(Weapon(9))
print(h.strike(), h.pack[0].power, isinstance(h.weapon, Weapon), isinstance(h, Weapon))
`,
  'an instance attribute hides a class attribute from any level': `
class A:
    level = 1

class B(A):
    pass

b = B()
b.level = 9
print(b.level, B.level, A.level, B().level)
`,
};

// ───────────────────────────────────────────────────────────── programs Python stops
const STOPS = {
  'an inherited attribute that super().__init__ would have set': `
class Animal:
    def __init__(self, name):
        self.name = name

class Dog(Animal):
    def __init__(self, name, tricks):
        self.tricks = tricks

d = Dog("Rex", 2)
print(d.tricks)
print(d.name)
`,
  'a method that exists only on a sibling': `
class Animal:
    pass

class Dog(Animal):
    def fetch(self):
        return "stick"

class Cat(Animal):
    pass

print(Dog().fetch())
print(Cat().fetch())
`,
  'a method that exists only on the child, called on the parent': `
class Animal:
    pass

class Dog(Animal):
    def fetch(self):
        return "stick"

print("start")
Animal().fetch()
`,
  'super() asked for something no parent has': `
class A:
    pass

class B(A):
    def go(self):
        print("going")
        return super().go()

B().go()
`,
  'the wrong number of values for an inherited __init__': `
class A:
    def __init__(self, x):
        self.x = x

class B(A):
    pass

print("before")
B()
`,
  'values handed to a super().__init__ that takes none': `
class A:
    pass

class B(A):
    def __init__(self):
        print("in B")
        super().__init__(5)

B()
`,
  'a parent that was never defined': `
print("first")
class Dog(Animal):
    pass
`,
  'a parent defined below its child': `
print("first")
class Dog(Animal):
    pass

class Animal:
    pass
`,
  'isinstance given a name in quotes': `
class Dog:
    pass

print("checking")
print(isinstance(Dog(), "Dog"))
`,
  'isinstance given an object where a class belongs': `
class Dog:
    pass

print("checking")
print(isinstance(Dog(), Dog()))
`,
  'super() outside any class': `
def f():
    print("in f")
    return super().x

f()
`,
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

// A family tree built at random: each class picks a parent among the classes
// above it, and for each method decides whether to inherit it, replace it, or
// extend it through super(). What every call prints is then Python's to say.
function generate(seed) {
  const r = rng(seed);
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const pick = list => list[Math.floor(r() * list.length)];
  const names = ['Base', 'Kid', 'Teen', 'Elder', 'Sage'].slice(0, int(3, 5));
  const lines = [
    'class Base:',
    '    tag = "base"',
    '    count = 0',
    '    def __init__(self, n):',
    '        self.n = n',
    '        self.log = ["Base"]',
    '        Base.count = Base.count + 1',
    '    def value(self):',
    '        return self.n',
    '    def label(self):',
    '        return "Base"',
    '    def show(self):',
    '        return self.label() + ":" + str(self.value())',
    '    def __str__(self):',
    '        return "<" + self.show() + ">"',
    ''];
  const parents = { Base: null };
  const takesTwo = { Base: false };
  for (const name of names.slice(1)) {
    const parent = pick(names.slice(0, names.indexOf(name)));
    parents[name] = parent;
    takesTwo[name] = takesTwo[parent];
    lines.push(`class ${name}(${parent}):`);
    let wrote = false;
    if (r() < 0.4) { lines.push(`    tag = "${name.toLowerCase()}"`); wrote = true; }
    const init = int(0, 3);
    if (init === 1) {
      // Extend __init__, keeping the same parameters.
      const params = takesTwo[parent] ? 'self, n, extra' : 'self, n';
      const up = takesTwo[parent] ? 'n, extra' : 'n';
      lines.push(`    def __init__(${params}):`, `        super().__init__(${up})`, `        self.log.append("${name}")`, `        self.n = self.n + ${int(1, 5)}`);
      wrote = true;
    } else if (init === 2 && !takesTwo[parent]) {
      // Take one more value than the parent does.
      lines.push('    def __init__(self, n, extra):', '        super().__init__(n)', '        self.extra = extra', `        self.log.append("${name}")`);
      takesTwo[name] = true;
      wrote = true;
    }
    const value = int(0, 3);
    if (value === 1) { lines.push('    def value(self):', `        return self.n * ${int(2, 4)}`); wrote = true; }
    if (value === 2) { lines.push('    def value(self):', `        return super().value() + ${int(10, 90)}`); wrote = true; }
    const label = int(0, 3);
    if (label === 1) { lines.push('    def label(self):', `        return "${name}"`); wrote = true; }
    if (label === 2) { lines.push('    def label(self):', `        return "${name}/" + super().label()`); wrote = true; }
    if (r() < 0.2) { lines.push('    def __str__(self):', `        return "${name}!" + super().__str__()`); wrote = true; }
    if (r() < 0.3) { lines.push(`    def only_${name.toLowerCase()}(self):`, `        return self.value() - ${int(1, 9)}`); wrote = true; }
    if (!wrote) lines.push('    pass');
    lines.push('');
  }
  const make = name => (takesTwo[name] ? `${name}(${int(1, 9)}, ${int(1, 9)})` : `${name}(${int(1, 9)})`);
  const objs = ['p', 'q', 'u', 'v'];
  const classOf = {};
  for (const o of objs) { classOf[o] = pick(names); lines.push(`${o} = ${make(classOf[o])}`); }
  for (let step = 0; step < int(6, 12); step++) {
    const o = pick(objs), c = pick(names);
    switch (int(0, 8)) {
      case 0: lines.push(`print(${o}.value(), ${o}.label(), ${o}.show())`); break;
      case 1: lines.push(`print(${o}, str(${o}), f"{${o}}")`); break;
      case 2: lines.push(`print(isinstance(${o}, ${c}), isinstance(${o}, (${pick(names)}, ${pick(names)})))`); break;
      case 3: lines.push(`print(${o}.tag, ${c}.tag, ${o}.log, ${o}.n)`); break;
      case 4: lines.push(`${c}.tag = "${c.toLowerCase()}${int(1, 9)}"`, 'print(p.tag, q.tag, u.tag, v.tag)'); break;
      case 5: lines.push(`${o} = ${make(c)}`, `print(${o}.show(), Base.count, ${c}.count)`); classOf[o] = c; break;
      case 6: lines.push(`print(${c}.label(${o}) if isinstance(${o}, ${c}) else "not a ${c}")`); break;
      case 7: lines.push(`print(sorted([p.value(), q.value(), u.value(), v.value()]), p.label() == q.label())`); break;
      default: lines.push(`${o}.tag = "own"`, `print(${o}.tag, ${classOf[o]}.tag)`);
    }
  }
  lines.push('for thing in [p, q, u, v]:', '    print(thing, thing.log, thing.tag)', 'print(Base.count)');
  return lines.join('\n') + '\n';
}

// ───────────────────────────────────────────────────────────── the comparison
describe('inheritance: the practice interpreter agrees with real Python', { skip }, () => {
  const named = Object.entries(PROGRAMS);
  const stops = Object.entries(STOPS);
  const generated = Array.from({ length: 300 }, (_, i) => [`generated #${i + 1}`, generate(i + 1)]);
  const all = [...named, ...stops, ...generated];
  const expected = python ? runOnCPython(python, all.map(([, src]) => src)) : [];

  for (let i = 0; i < named.length; i++) {
    it(named[i][0], () => {
      assert.equal(expected[i].err, null, `this program does not even run on real Python: ${expected[i].err}`);
      const mine = runOnPytiny(named[i][1]);
      assert.equal(mine.err, null, `pytiny refused a program Python runs: ${mine.err}`);
      assert.equal(mine.out, expected[i].out);
    });
  }

  for (let i = 0; i < stops.length; i++) {
    it(`stops, as Python does: ${stops[i][0]}`, () => {
      const want = expected[named.length + i];
      assert.notEqual(want.err, null, 'real Python runs this program to the end; it does not belong in STOPS');
      const mine = runOnPytiny(stops[i][1]);
      assert.notEqual(mine.err, null, `pytiny ran a program that Python stops with: ${want.err}`);
      assert.equal(mine.out, want.out, 'what was printed before the error differs');
    });
  }

  it(`${generated.length} generated family trees`, () => {
    const wrong = [];
    generated.forEach(([name, src], k) => {
      const want = expected[named.length + stops.length + k];
      const mine = runOnPytiny(src);
      if (want.err !== null) wrong.push(`${name}: generator produced a program Python rejects (${want.err})\n${src}`);
      else if (mine.err !== null) wrong.push(`${name}: pytiny error: ${mine.err}\n${src}`);
      else if (mine.out !== want.out) wrong.push(`${name}:\n${src}--- python\n${want.out}--- pytiny\n${mine.out}`);
    });
    assert.deepEqual(wrong.slice(0, 2), [], `${wrong.length} of ${generated.length} differ`);
  });
});

// ───────────────────────────────────────────────────────────── what the student is told
function failure(source) {
  try {
    const interpreter = new Interpreter();
    interpreter.run(parse(source));
  } catch (err) {
    assert.ok(err instanceof PyError, `expected a PyError, got: ${err && err.stack}`);
    return err;
  }
  return assert.fail(`expected this program to fail:\n${source}`);
}

describe('inheritance: what a student is told when it goes wrong', () => {
  it('an attribute the parent would have stored points at the missing super().__init__', () => {
    const err = failure('class Animal:\n    def __init__(self, name):\n        self.name = name\nclass Dog(Animal):\n    def __init__(self, name):\n        self.tricks = 0\nprint(Dog("Rex").name)\n');
    assert.match(err.message, /Dog object has no attribute called "name"/);
    assert.match(err.hint, /super\(\)\.__init__/);
    assert.match(err.hint, /Dog's __init__/);
    assert.equal(err.line, 7);
  });

  it('a plain missing attribute does not mention super()', () => {
    const err = failure('class Animal:\n    def __init__(self):\n        self.legs = 4\nclass Dog(Animal):\n    pass\nprint(Dog().zzz)\n');
    assert.doesNotMatch(err.hint, /super/);
  });

  it('a near-miss on an inherited method is suggested', () => {
    const err = failure('class Animal:\n    def speak(self):\n        return "x"\nclass Dog(Animal):\n    pass\nDog().speek()\n');
    assert.match(err.hint, /speak/);
  });

  it('a bare name the PARENT stores is still explained as a forgotten self.', () => {
    const err = failure('class Animal:\n    sound = "x"\nclass Dog(Animal):\n    def speak(self):\n        return sound\nDog().speak()\n');
    assert.match(err.hint, /self\.sound/);
  });

  it('a parent that is not defined is named, with where to put it', () => {
    const err = failure('class Dog(Animal):\n    pass\n');
    assert.match(err.message, /parent class "Animal" has not been defined/);
    assert.match(err.hint, /above class Dog/);
  });

  it('two parents are refused by name', () => {
    const err = failure('class A:\n    pass\nclass B:\n    pass\nclass C(A, B):\n    pass\n');
    assert.match(err.message, /only one parent/);
  });

  it('inheriting from one of Python\'s own types is refused by name', () => {
    assert.match(failure('class Shelf(list):\n    pass\n').message, /cannot inherit from Python's own list/);
    assert.match(failure('class Oops(Exception):\n    pass\n').message, /cannot inherit from Python's own Exception/);
  });

  it('inheriting from something that is not a class says what it is', () => {
    const err = failure('thing = 5\nclass A(thing):\n    pass\n');
    assert.match(err.message, /a whole number, not a class/);
  });

  it('super() with values in its parentheses is steered to the short form', () => {
    const err = failure('class A:\n    pass\nclass B(A):\n    def __init__(self):\n        super(B, self).__init__()\nB()\n');
    assert.match(err.message, /empty parentheses/);
  });

  it('super without parentheses is explained', () => {
    const err = failure('class A:\n    def go(self):\n        return 1\nclass B(A):\n    def go(self):\n        return super.go()\nB().go()\n');
    assert.match(err.hint, /super\(\)/);
  });

  it('super() outside a method says where it belongs', () => {
    assert.match(failure('def f():\n    return super().x\nf()\n').message, /inside a method/);
    assert.match(failure('super().x\n').message, /inside a method/);
  });

  it('super() reaching for a method the parent lacks names the parent', () => {
    const err = failure('class A:\n    def run(self):\n        return 1\nclass B(A):\n    def go(self):\n        return super().rum()\nB().go()\n');
    assert.match(err.message, /parent class A has nothing called "rum"/);
    assert.match(err.hint, /run/);
  });

  it('argument counts for an inherited __init__ never include self', () => {
    const err = failure('class A:\n    def __init__(self, x):\n        self.x = x\nclass B(A):\n    pass\nB(1, 2)\n');
    assert.match(err.message, /takes 1 value/);
    assert.match(err.message, /gave it 2/);
  });

  it('isinstance with the class name in quotes says to drop them', () => {
    const err = failure('class Dog:\n    pass\nprint(isinstance(Dog(), "Dog"))\n');
    assert.match(err.message, /has to be a class/);
    assert.match(err.hint, /no quotes/);
  });

  it('a runaway chain of super() calls is stopped like any other recursion', () => {
    const err = failure('class A:\n    def go(self):\n        return self.go()\nclass B(A):\n    def go(self):\n        return super().go()\nB().go()\n');
    assert.match(err.message, /without stopping/);
  });

  it('an override that calls itself through self. is pointed at super()', () => {
    const err = failure('class A:\n    def go(self):\n        return "a"\nclass B(A):\n    def go(self):\n        return self.go() + "b"\nB().go()\n');
    assert.match(err.message, /"go" called itself/);
    assert.match(err.hint, /super\(\)\.go\(\)/);
  });

  it('ordinary runaway recursion keeps its own advice', () => {
    const err = failure('def f(n):\n    return f(n + 1)\nf(1)\n');
    assert.match(err.hint, /base case/);
  });
});

// ───────────────────────────────────────────────────────────── subclass problems
describe('inheritance: a problem that asks for a subclass', () => {
  const HOUND = {
    type: 'code_write',
    question: 'Write Hound, a kind of Animal whose speak() returns "Woof".',
    scaffold: 'class Animal:\n    def __init__(self, name):\n        self.name = name\n    def speak(self):\n        return "..."',
    signature: 'class Hound(Animal):',
    tests: [
      { run: 'h = Hound("Rex")', check: 'h.speak()', expect: 'Woof' },
      { run: 'h = Hound("Rex")', check: 'h.name', expect: 'Rex' },
      { run: 'a = Animal("Bo")', check: 'a.speak()', expect: '...' },
    ],
    solution: 'def speak(self):\n    return "Woof"',
  };

  it('the header shows the finished parent, then the class line on its own', () => {
    assert.equal(problemHeader(HOUND), `${HOUND.scaffold}\n\nclass Hound(Animal):`);
  });

  it('the body alone is accepted', () => {
    const outcome = runProblem(HOUND, HOUND.solution);
    assert.equal(outcome.passed, outcome.total);
  });

  it('the class pasted with its class line is accepted, and still finds the parent', () => {
    const outcome = runProblem(HOUND, 'class Hound(Animal):\n    def speak(self):\n        return "Woof"');
    assert.equal(outcome.passed, outcome.total);
  });

  it('an empty subclass fails only the test about what it was meant to change', () => {
    const outcome = runProblem(HOUND, 'pass');
    assert.equal(outcome.total - outcome.passed, 1);
  });

  it('an error is reported on the line of the student\'s own box', () => {
    for (const body of ['def speak(self):\n    return nothing', 'class Hound(Animal):\n    def speak(self):\n        return nothing']) {
      const outcome = runProblem(HOUND, body);
      const error = outcome.error ?? outcome.results.find(r => r.error)?.error;
      assert.ok(error, 'expected an error to be reported');
      assert.equal(error.line, body.startsWith('class') ? 3 : 2);
    }
  });
});
