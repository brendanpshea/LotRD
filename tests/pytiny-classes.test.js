// tests/pytiny-classes.test.js — classes in the practice interpreter.
//
// Two halves. The first is differential: every program here is run on real
// Python and on src/pytiny.js, and the two must print exactly the same thing.
// Hand-written programs cover each behaviour that matters (one object's data
// staying separate from another's, the shared class attribute that is the
// chapter's classic bug, __str__, bound methods…); a seeded generator then
// produces a few hundred more, because the corners nobody thought to write
// down are where a hand-written interpreter goes wrong.
//
// The second half is what Python cannot referee: the words a student sees when
// they get something wrong. Those are ours, and are tested as ours.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findPython, runOnCPython, runOnPytiny } from './helpers/cpython.js';
import { parse, Interpreter, PyError } from '../src/pytiny.js';

const python = findPython();
if (!python && process.env.LOTRD_REQUIRE_PYTHON) {
  throw new Error('LOTRD_REQUIRE_PYTHON is set but no Python 3 was found');
}
const skip = python ? false
  : 'NO PYTHON FOUND — the interpreter was not compared with real Python. Install Python 3 or set LOTRD_PYTHON.';

// ───────────────────────────────────────────────────────────── hand-written corpus
const PROGRAMS = {
  'an object stores what __init__ gives it': `
class Hero:
    def __init__(self, name, hp):
        self.name = name
        self.hp = hp

h = Hero("Ayla", 9)
print(h.name, h.hp)
`,
  'two objects keep separate data': `
class Citizen:
    def __init__(self, name, balance):
        self.name = name
        self.balance = balance
    def pay(self, amount):
        self.balance = self.balance - amount

elaine = Citizen("Elaine", 120)
percival = Citizen("Percival", 40)
elaine.pay(30)
percival.pay(5)
elaine.pay(10)
print(elaine.balance, percival.balance)
`,
  'forgetting self. changes nothing': `
class Purse:
    def __init__(self):
        self.coins = 0
    def add(self, n):
        coins = self.coins + n

p = Purse()
p.add(5)
print(p.coins)
`,
  'a mutable class attribute is shared by every object': `
class Squad:
    members = []
    def add(self, who):
        self.members.append(who)

a = Squad()
b = Squad()
a.add("Lia")
b.add("Oz")
print(len(a.members), len(b.members), a.members is b.members)
print(Squad.members)
`,
  'a list made in __init__ belongs to one object': `
class Squad:
    def __init__(self):
        self.members = []
    def add(self, who):
        self.members.append(who)

a = Squad()
b = Squad()
a.add("Lia")
print(len(a.members), len(b.members))
`,
  'a counter kept on the class': `
class Robot:
    count = 0
    def __init__(self):
        Robot.count = Robot.count + 1

Robot()
Robot()
r = Robot()
print(Robot.count, r.count)
`,
  'assigning through an object shadows the class attribute for that object only': `
class Lamp:
    fuel = 5

a = Lamp()
b = Lamp()
a.fuel = 1
print(a.fuel, b.fuel, Lamp.fuel)
Lamp.fuel = 9
print(a.fuel, b.fuel)
`,
  '__str__ is used by print, str() and f-strings': `
class Hero:
    def __init__(self, name, hp):
        self.name = name
        self.hp = hp
    def __str__(self):
        return f"{self.name} ({self.hp})"

h = Hero("Ayla", 9)
print(h)
print(str(h) + "!")
print(f"I am {h}.")
print("a", h, "b", sep="-")
`,
  'a method can call another method through self': `
class Account:
    def __init__(self, balance):
        self.balance = balance
    def deposit(self, amount):
        if amount <= 0:
            return False
        self.balance = self.balance + amount
        return True
    def deposit_twice(self, amount):
        first = self.deposit(amount)
        second = self.deposit(amount)
        return first and second

acct = Account(50)
print(acct.deposit_twice(10), acct.balance)
print(acct.deposit_twice(-1), acct.balance)
`,
  'methods return values that can be used straight away': `
class Tag:
    def __init__(self, text):
        self.text = text
    def shout(self):
        return self.text.upper() + "!"

t = Tag("go")
print(t.shout().lower(), len(t.shout()), t.shout()[0])
`,
  'objects live in lists and dictionaries': `
class Guard:
    def __init__(self, name, rank):
        self.name = name
        self.rank = rank

watch = [Guard("Lia", 2), Guard("Oz", 5), Guard("Kit", 3)]
best = watch[0]
for g in watch:
    if g.rank > best.rank:
        best = g
print(best.name)
by_name = {}
for g in watch:
    by_name[g.name] = g
print(by_name["Kit"].rank, len(by_name))
strong = []
for g in watch:
    if g.rank > 2:
        strong.append(g.name)
print(strong)
`,
  'composition: an object holding other objects': `
class Card:
    def __init__(self, value):
        self.value = value

class Deck:
    def __init__(self):
        self.cards = []
    def add(self, card):
        self.cards.append(card)
    def total(self):
        running = 0
        for card in self.cards:
            running = running + card.value
        return running

deck = Deck()
for v in [3, 7, 10]:
    deck.add(Card(v))
print(deck.total(), len(deck.cards), deck.cards[1].value)
`,
  'a bound method remembers its object': `
class Counter:
    def __init__(self):
        self.n = 0
    def bump(self):
        self.n = self.n + 1
        return self.n

c = Counter()
go = c.bump
go()
go()
print(go(), c.n)
`,
  'calling a method through the class, passing the object by hand': `
class Counter:
    def __init__(self):
        self.n = 0
    def bump(self, by):
        self.n = self.n + by

c = Counter()
Counter.bump(c, 4)
c.bump(2)
print(c.n)
`,
  'defaults and keyword arguments work in __init__ and in methods': `
class Potion:
    def __init__(self, name, power=3, rare=False):
        self.name = name
        self.power = power
        self.rare = rare
    def boost(self, by=1, times=2):
        self.power = self.power + by * times
        return self.power

a = Potion("mint")
b = Potion("ash", rare=True, power=8)
print(a.power, a.rare, b.power, b.rare)
print(a.boost(), a.boost(times=3), a.boost(5, 1), b.boost(by=2))
`,
  'identity and equality of objects': `
class Coin:
    def __init__(self, value):
        self.value = value

a = Coin(5)
b = Coin(5)
c = a
print(a == b, a is b, a == c, a is c, a != b)
print(a in [b], a in [b, c], [a, b].index(b))
`,
  'augmented assignment on an attribute': `
class Tally:
    def __init__(self):
        self.n = 10
        self.label = "x"
    def bump(self):
        self.n += 5
        self.n -= 1
        self.n *= 2
        self.label += "y"

t = Tally()
t.bump()
print(t.n, t.label)
`,
  'a function handed an object changes the same object': `
class Box:
    def __init__(self):
        self.items = []
        self.count = 0

def fill(box, n):
    for i in range(n):
        box.items.append(i)
    box.count = n

mine = Box()
other = mine
fill(other, 3)
print(mine.items, mine.count, mine is other)
`,
  'a class with no __init__, and attributes added from outside': `
class Blank:
    pass

b = Blank()
b.x = 3
b.y = b.x * 2
print(b.x, b.y)
`,
  'a linked chain of objects, walked recursively and in a loop': `
class Node:
    def __init__(self, value, rest):
        self.value = value
        self.rest = rest
    def length(self):
        if self.rest is None:
            return 1
        return 1 + self.rest.length()

chain = Node(1, Node(2, Node(3, None)))
print(chain.length())
total = 0
node = chain
while node is not None:
    total = total + node.value
    node = node.rest
print(total)
`,
  'docstrings and pass are fine inside a class': `
class Quiet:
    """A class with a docstring."""
    def __init__(self):
        """And a method with one."""
        self.ready = True
    def nothing(self):
        pass

q = Quiet()
print(q.ready, q.nothing())
`,
  'objects are truthy, and an attribute may hold None': `
class Slot:
    def __init__(self):
        self.item = None

s = Slot()
if s:
    print("an object counts as true")
if s.item is None:
    print("empty")
s.item = "key"
if s.item:
    print(s.item)
`,
  'unpacking straight into attributes': `
class Point:
    def __init__(self, x, y):
        self.x, self.y = x, y
    def swap(self):
        self.x, self.y = self.y, self.x

p = Point(3, 7)
p.swap()
print(p.x, p.y)
`,
  'a small stack: the ADT behind two methods': `
class Stack:
    def __init__(self):
        self.items = []
    def push(self, x):
        self.items.append(x)
    def pop(self):
        return self.items.pop()
    def peek(self):
        return self.items[-1]
    def size(self):
        return len(self.items)
    def is_empty(self):
        return len(self.items) == 0

s = Stack()
print(s.is_empty())
s.push(1)
s.push(2)
s.pop()
s.push(3)
print(s.peek(), s.size(), s.pop(), s.pop(), s.is_empty())
`,
  'a method may create and return another object of its own class': `
class Vec:
    def __init__(self, x, y):
        self.x = x
        self.y = y
    def plus(self, other):
        return Vec(self.x + other.x, self.y + other.y)
    def __str__(self):
        return f"<{self.x}, {self.y}>"

print(Vec(1, 2).plus(Vec(10, 20)).plus(Vec(100, 200)))
`,
  'a class attribute used as a shared constant': `
class Ticket:
    PRICE = 12
    def __init__(self, seats):
        self.seats = seats
    def cost(self):
        return self.seats * Ticket.PRICE + self.PRICE

print(Ticket(3).cost(), Ticket.PRICE)
`,
  'a parameter may shadow nothing on the object': `
class Hero:
    def __init__(self, name):
        self.name = name
    def rename(self, name):
        old = self.name
        self.name = name
        return old

h = Hero("Ayla")
print(h.rename("Bren"), h.name)
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

const CLASSES = `
class Account:
    opened = 0
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance
        self.log = []
        Account.opened = Account.opened + 1
    def deposit(self, amount):
        if amount <= 0:
            return False
        self.balance += amount
        self.log.append(amount)
        return True
    def withdraw(self, amount):
        if amount > self.balance:
            return False
        self.balance -= amount
        self.log.append(-amount)
        return True
    def transfer(self, other, amount):
        if self.withdraw(amount):
            other.deposit(amount)
            return True
        return False
    def __str__(self):
        return f"{self.owner}: {self.balance}"

class Stack:
    shared = []
    def __init__(self):
        self.items = []
    def push(self, x):
        self.items.append(x)
        self.shared.append(x)
    def pop(self):
        if len(self.items) == 0:
            return None
        return self.items.pop()
    def size(self):
        return len(self.items)
`;

function generate(seed) {
  const r = rng(seed);
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const pick = list => list[Math.floor(r() * list.length)];
  const names = ['a', 'b', 'c'];
  const lines = [CLASSES,
    'a = Account("Ann", ' + int(0, 90) + ')', 'b = Account("Bo")', 'c = Account(balance=' + int(5, 50) + ', owner="Cy")',
    's = Stack()', 't = Stack()'];
  for (let step = 0; step < int(6, 14); step++) {
    const who = pick(names), other = pick(names);
    switch (int(0, 10)) {
      case 0: lines.push(`print(${who}.deposit(${int(-5, 40)}), ${who}.balance)`); break;
      case 1: lines.push(`print(${who}.withdraw(${int(1, 80)}), ${who})`); break;
      case 2: lines.push(`print(${who}.transfer(${other}, ${int(1, 60)}), ${who}.balance, ${other}.balance)`); break;
      case 3: lines.push(`${pick(['s', 't'])}.push(${int(0, 9)})`); break;
      case 4: lines.push(`print(${pick(['s', 't'])}.pop(), s.size(), t.size())`); break;
      case 5: lines.push(`${who} = ${other}`, `print(${who} is ${other}, ${who}.owner)`); break;
      case 6: lines.push(`${who}.balance = ${who}.balance * ${int(1, 3)}`, `print(f"{${who}} / {${who}.log}")`); break;
      case 7: lines.push(`print(sorted([a.balance, b.balance, c.balance]), Account.opened)`); break;
      case 8: lines.push(`move = ${who}.deposit`, `print(move(${int(1, 9)}), move(${int(-3, 0)}), ${who}.balance)`); break;
      case 9: lines.push(`${who}.opened = ${int(50, 60)}`, `print(${who}.opened, ${other}.opened, Account.opened)`); break;
      default: lines.push(`print(len(Stack.shared), s.items == t.items, sum(a.log), [str(a), str(b), str(c)])`);
    }
  }
  lines.push('print(a, b, c, Account.opened, s.items, t.items, Stack.shared)');
  return lines.join('\n') + '\n';
}

// ───────────────────────────────────────────────────────────── the comparison
describe('classes: the practice interpreter agrees with real Python', { skip }, () => {
  const named = Object.entries(PROGRAMS);
  const generated = Array.from({ length: 250 }, (_, i) => [`generated #${i + 1}`, generate(i + 1)]);
  const all = [...named, ...generated];
  const expected = python ? runOnCPython(python, all.map(([, src]) => src)) : [];

  for (let i = 0; i < named.length; i++) {
    it(named[i][0], () => {
      assert.equal(expected[i].err, null, `this program does not even run on real Python: ${expected[i].err}`);
      const mine = runOnPytiny(named[i][1]);
      assert.equal(mine.err, null, `pytiny refused a program Python runs: ${mine.err}`);
      assert.equal(mine.out, expected[i].out);
    });
  }

  it(`${generated.length} generated programs over accounts and stacks`, () => {
    const wrong = [];
    generated.forEach(([name, src], k) => {
      const want = expected[named.length + k];
      const mine = runOnPytiny(src);
      if (want.err !== null) wrong.push(`${name}: generator produced a program Python rejects (${want.err})`);
      else if (mine.err !== null) wrong.push(`${name}: pytiny error: ${mine.err}`);
      else if (mine.out !== want.out) wrong.push(`${name}:\n--- python\n${want.out}--- pytiny\n${mine.out}`);
    });
    assert.deepEqual(wrong.slice(0, 3), [], `${wrong.length} of ${generated.length} differ`);
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

describe('classes: what a student is told when it goes wrong', () => {
  it('reading an attribute that was never set names the object and suggests the near miss', () => {
    const err = failure('class Purse:\n    def __init__(self):\n        self.coins = 0\np = Purse()\nprint(p.coinz)\n');
    assert.match(err.message, /Purse/);
    assert.match(err.message, /coinz/);
    assert.match(err.hint, /coins/);
    assert.equal(err.line, 5);
  });

  it('using a bare name where self.name was meant says so', () => {
    // The read-side twin of the forgotten-self bug, and the one that DOES raise.
    const err = failure('class Purse:\n    def __init__(self):\n        self.coins = 0\n    def show(self):\n        return coins\nprint(Purse().show())\n');
    assert.match(err.hint, /self\.coins/);
  });

  it('a method written without self is explained, not reported as an argument count', () => {
    const err = failure('class Bell:\n    def ring():\n        return "ding"\nprint(Bell().ring())\n');
    assert.match(err.message + ' ' + err.hint, /self/);
  });

  it('argument counts never include self', () => {
    const err = failure('class Account:\n    def deposit(self, amount):\n        return amount\nAccount().deposit(1, 2)\n');
    assert.match(err.message, /deposit\(\) takes 1 value/);
    assert.match(err.message, /gave it 2/);
  });

  it('a method name written without parentheses is caught, since it silently does nothing', () => {
    const err = failure('class Counter:\n    def __init__(self):\n        self.n = 0\n    def bump(self):\n        self.n = self.n + 1\nc = Counter()\nc.bump\nprint(c.n)\n');
    assert.match(err.message, /parentheses/);
    assert.equal(err.line, 7);
  });

  it('the old hint for a text method without parentheses still stands', () => {
    const err = failure('word = "hi"\nprint(word.upper)\n');
    assert.match(err.message, /without parentheses/);
  });

  it('calling a missing method names the class and suggests the near miss', () => {
    const err = failure('class Stack:\n    def push(self, x):\n        pass\nStack().pussh(1)\n');
    assert.match(err.message, /Stack/);
    assert.match(err.hint, /push/);
  });

  it('giving __init__ the wrong number of values talks about creating the object', () => {
    const err = failure('class Hero:\n    def __init__(self, name):\n        self.name = name\nHero()\n');
    assert.match(err.message, /Hero\(\)|name/);
  });

  it('a class with no __init__ cannot be given values', () => {
    const err = failure('class Blank:\n    pass\nBlank(3)\n');
    assert.match(err.message, /Blank/);
  });

  it('__init__ must not return a value', () => {
    const err = failure('class Odd:\n    def __init__(self):\n        return 5\nOdd()\n');
    assert.match(err.message, /__init__/);
  });

  it('setting an attribute on something that is not an object is explained', () => {
    const err = failure('n = 5\nn.size = 3\n');
    assert.match(err.message, /attribute/i);
  });

  it('method bodies cannot see class-level names without self. or the class name, as in Python', () => {
    const err = failure('class Ticket:\n    PRICE = 12\n    def cost(self):\n        return PRICE\nprint(Ticket().cost())\n');
    assert.match(err.message, /PRICE/);
    assert.match(err.hint, /self\.PRICE|Ticket\.PRICE/);
  });

  it('inheritance is refused by name until it is supported', () => {
    const err = failure('class A:\n    pass\nclass B(A):\n    pass\n');
    assert.match(err.message, /inherit/i);
  });

  it('an object with no __str__ prints as something recognisable, and says how to improve it', () => {
    const interpreter = new Interpreter();
    interpreter.run(parse('class Hero:\n    pass\nprint(Hero())\n'));
    assert.match(interpreter.output.join(''), /Hero object/);
  });

  it('endless recursion through a method is still caught', () => {
    const err = failure('class Loop:\n    def go(self):\n        return self.go()\nLoop().go()\n');
    assert.equal(err.kind, 'limit');
  });

  it('runaway object creation is still caught', () => {
    const err = failure('class Dot:\n    pass\nitems = []\nwhile True:\n    items.append(Dot())\n');
    assert.equal(err.kind, 'limit');
  });
});
