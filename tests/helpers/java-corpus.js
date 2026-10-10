// tests/helpers/java-corpus.js — the programs the practice Java is compared with the real JDK on.
//
// Four kinds, and what each is for:
//   AGREES   Java runs it; jtiny must print exactly what Java prints, call by call,
//            down to which exception stopped it.
//   REJECTS  javac refuses it; jtiny must refuse it too. (A box that accepts code
//            Java would not compile teaches habits that fail the moment they leave it.)
//   REFUSES  Java runs it; jtiny says, in words, that it does not. That is a limit,
//            not an error — and each one here is pinned so that it cannot quietly
//            turn into a wrong answer.
//   and the generated cases at the bottom: arithmetic by the thousand, and
//   Double.toString across the whole range of doubles.
//
// Sources are String.raw, so a backslash here is a backslash in the Java.

const J = String.raw;

/** Expression probes: each string is evaluated on both sides. `methods` are helpers they may call. */
export const AGREES = {
  // ── numbers
  'int division truncates toward zero and % keeps the sign of the left side': {
    methods: J`int div(int a, int b) { return a / b; } int mod(int a, int b) { return a % b; }`,
    calls: ['div(7, 2)', 'div(-7, 2)', 'div(7, -2)', 'div(-7, -2)', 'mod(7, 2)', 'mod(-7, 2)', 'mod(7, -2)', 'mod(-7, -2)',
      'div(1, 0)', 'mod(1, 0)', 'div(0, 5)', 'div(Integer.MIN_VALUE, -1)', 'mod(Integer.MIN_VALUE, -1)', '7 / 2 * 2', '7 % 2 * 2', '1 / 2 + 1 / 2'],
  },
  'int arithmetic wraps around at 32 bits': {
    methods: J`int sq(int a) { return a * a; } int inc(int a) { return a + 1; } int neg(int a) { return -a; }`,
    calls: ['sq(46340)', 'sq(46341)', 'sq(65536)', 'sq(100000)', 'inc(Integer.MAX_VALUE)', 'neg(Integer.MIN_VALUE)', 'Integer.MAX_VALUE + Integer.MAX_VALUE',
      'Integer.MIN_VALUE - 1', 'Math.abs(Integer.MIN_VALUE)', '2147483647 * 2', '1000000 * 1000000', '0x7fffffff + 1', '0xFFFFFFFF', '0b1010', '017', '1_000_000'],
  },
  'long arithmetic wraps at 64 bits, and an int sum overflows before it is widened': {
    methods: J`long big(int a, int b) { return a * b; } long bigger(int a, int b) { return (long) a * b; } long sq(long a) { return a * a; }`,
    calls: ['big(100000, 100000)', 'bigger(100000, 100000)', 'sq(3037000500L)', 'Long.MAX_VALUE + 1', 'Long.MIN_VALUE - 1', '-Long.MIN_VALUE', 'Math.abs(Long.MIN_VALUE)',
      '5L / 2', '-5L / 2', '-5L % 3', '1L << 40', '1 << 40', '1L << 64', '1L << 63', '-1L >>> 1', '-1L >> 1', '123456789L * 987654321L', '9223372036854775807L', '-9223372036854775808L',
      '10L / 0', '10L % 0L', '0xFFFFFFFFFFFFFFFFL', '(int) 4294967298L', '(int) Long.MAX_VALUE', '(long) 1e19', '(long) -1e19', '(long) 3.99', '(long) -3.99'],
  },
  'double arithmetic, and where an int becomes a double': {
    methods: J`double half(int a) { return a / 2; } double halfD(int a) { return a / 2.0; } double avg(int a, int b) { return (a + b) / 2; } double avgD(int a, int b) { return (double) (a + b) / 2; }`,
    calls: ['half(7)', 'halfD(7)', 'avg(3, 4)', 'avgD(3, 4)', '0.1 + 0.2', '1.0 / 3', '2.0 / 3', '1 / 3 * 3.0', '1 / 3.0 * 3', '10 / 4 * 1.0', '1.0 * 10 / 4', '5.0 / 0', '-5.0 / 0', '0.0 / 0',
      '5.5 % 2', '-5.5 % 2', '5.5 % -2', '1e308 * 10', '-0.0', '0.0 == -0.0', '0.0 / 0 == 0.0 / 0', '3 + 4.0', "'a' + 1.5", '100 * 1.1', '3 * 0.1', '1.1 + 2.2', '0.1 * 3', '1e16 + 1', '4.35 * 100', '1.0 - 0.9'],
  },
  'casts between number types': {
    methods: J`int toInt(double d) { return (int) d; } char toChar(int n) { return (char) n; } int back(char c) { return c; } long toLong(double d) { return (long) d; } double toDouble(long n) { return n; }`,
    calls: ['toInt(3.99)', 'toInt(-3.99)', 'toInt(1e10)', 'toInt(-1e10)', 'toInt(0.0 / 0)', 'toInt(2147483647.5)', 'toInt(-0.5)', 'toChar(65)', 'toChar(97 + 25)', 'back(toChar(65536 + 66))',
      'back(toChar(-1))', "back('A')", '(int) 3.7 + 0.5', '(int) (3.7 + 0.5)', '(double) 7 / 2', '(double) (7 / 2)', '(char) 98.6', "(int) 'a'", '(char) (int) 1e10', "(char) ('a' + 1)",
      'toLong(1e30)', 'toDouble(9007199254740993L)', 'toDouble(Long.MAX_VALUE)', '(int) 1e300', "(long) 'z'", '(double) 1 / 3 + 1 / 3'],
  },
  'char arithmetic: a char in a sum is a number': {
    methods: J`char next(char c) { c++; return c; } char shift(char c, int by) { return (char) (c + by); } int diff(char a, char b) { return a - b; } char bump(char c) { c += 2; return c; }`,
    calls: ["next('a')", "next('z')", "shift('a', 25)", "diff('d', 'a')", "bump('x')", "'a' + 1", "'a' + 'b'", "(char) ('a' + 'b' - 'a')", "'7' - '0'", "'a' < 'b'", "'a' == 97", "'A' + 32 == 'a'",
      "\"\" + 'a' + 'b'", "'a' + 'b' + \"\"", "\"\" + ('a' + 1)", "\"\" + (char) ('a' + 1)", "'a' * 2", "-'a'", "~'a'", "'a' / 2", "'\\n' + 0", "'\\t' + 0", "'\\\\' + 0", "'\\'' + 0", "'\\u0041'", "'\\101'", "'\\0' + 0"],
  },
  'shifts and bit operators': {
    methods: J`int shl(int a, int n) { return a << n; } int shr(int a, int n) { return a >> n; } int ushr(int a, int n) { return a >>> n; }`,
    calls: ['shl(1, 31)', 'shl(1, 32)', 'shl(1, 33)', 'shl(1, -1)', 'shr(-8, 1)', 'ushr(-8, 1)', 'ushr(-1, 28)', 'shr(-1, 40)', '5 & 3', '5 | 3', '5 ^ 3', '~5', '~-1', '-1 >>> 0', '1 << 2 + 1', '(6 & 3) == 2 ? 1 : 0',
      '1 << 35L', '1L << 35', '8 >> 1L', "'a' << 1", 'true & false', 'true | false', 'true ^ true', 'false ^ true', '5 & 6 | 1', '5 | 6 & 1', '5 ^ 6 & 3'],
  },
  'operator precedence and ordering': {
    methods: '',
    calls: ['2 + 3 * 4', '(2 + 3) * 4', '2 * 3 % 4', '10 - 4 - 3', '100 / 10 / 5', '2 + 3 + "x" + 2 + 3', '"x" + 2 * 3', '"x" + (2 + 3)', '1 + 2 + "3"', '"1" + 2 + 3', '1 < 2 == true', '1 + 1 == 2 && 2 * 2 == 4',
      'true || false && false', '(true || false) && false', '!true || true', '5 > 3 ? "a" : "b"', '5 > 3 ? 1 : 2.0', 'true ? 1 : \'a\'', 'false ? 1 : \'a\'', 'true ? \'a\' : 0', '5 > 3 ? 5 < 3 ? 1 : 2 : 3',
      '-2 * -3', '- -3', '+ +3', '-(-3)', '10 - -3', '3 - - -3', '1 - 2 + 3', '7 - 2 * 3 + 1', '2 * (3 + 4) * 5', '"" + 1 + 1', '"" + (1 + 1)', '1 + 1 + ""', "1 + 'a' + \"\"", '"a" + null', 'null + "a"', '"" + 1.0', '"" + 10L', '"" + true', "\"\" + 'c'"],
  },
  'increments, compound assignment and the value of an assignment': {
    methods: J`
      int postfix(int a) { int b = a++; return a * 10 + b; }
      int prefix(int a) { int b = ++a; return a * 10 + b; }
      int mixed(int a) { int b = a++ + ++a; return b * 100 + a; }
      int self(int a) { a = a++; return a; }
      int selfPlus(int a) { a += a++; return a; }
      int chain() { int a, b, c; a = b = c = 7; return a + b + c; }
      int narrow(int a) { a += 3.7; return a; }
      int narrowTimes(int a) { a *= 1.5; return a; }
      int divide(int a) { a /= 2; a -= 1; a *= a; a %= 7; return a; }
      int bits(int a) { a <<= 2; a |= 1; a &= 13; a ^= 8; a >>= 1; a >>>= 1; return a; }
      long wide(long a) { a += 1; a *= 3; a <<= 33; return a; }
      double halve(double d) { d /= 2; d += 1; d -= 0.25; return d; }
      String grow(String s) { s += 1; s += 'c'; s += 2.5; s += true; s += null; s += 1 + 2; return s; }
      boolean flags(boolean b) { b &= true; b |= false; b ^= true; return b; }
      int inArray(int[] xs) { xs[0]++; ++xs[1]; xs[2] += xs[0]++; xs[1] *= 3; return xs[0] * 100 + xs[1] * 10 + xs[2]; }
      int index() { int[] xs = {0, 0, 0}; int i = 0; xs[i++] = i; xs[i++] = i; return xs[0] * 100 + xs[1] * 10 + i; }
      int order() { int i = 1; return i + (i = 5) * i; }
      int order2() { int i = 1; i += (i = 5) * 2; return i; }
      char charStep(char c) { c++; c += 1; c--; ++c; return c; }
      double incD(double d) { d++; return d; }
      long incL(long n) { n--; return n--; }
      int cond(int a) { int r = a > 0 ? a++ : a--; return r * 10 + a; }
    `,
    calls: ['postfix(5)', 'prefix(5)', 'mixed(1)', 'self(5)', 'selfPlus(5)', 'chain()', 'narrow(5)', 'narrowTimes(5)', 'divide(20)', 'bits(3)', 'wide(1)', 'halve(5)', 'grow("x")', 'flags(true)', 'flags(false)',
      'inArray(new int[] {1, 2, 3})', 'index()', 'order()', 'order2()', "charStep('a')", 'incD(1.5)', 'incL(Long.MIN_VALUE)', 'cond(3)', 'cond(-3)'],
  },

  // ── text
  'String methods': {
    methods: '',
    calls: [
      '"hello".length()', '"".length()', '"hello".charAt(0)', '"hello".charAt(4)', '"hello".charAt(5)', '"hello".charAt(-1)', '"".charAt(0)',
      '"hello".substring(1)', '"hello".substring(5)', '"hello".substring(6)', '"hello".substring(1, 3)', '"hello".substring(2, 2)', '"hello".substring(3, 2)', '"hello".substring(-1, 2)', '"hello".substring(0, 6)', '"hello".substring(0)',
      '"hello".indexOf("l")', '"hello".indexOf("z")', '"hello".indexOf("")', '"hello".indexOf("l", 3)', '"hello".indexOf("l", 10)', '"hello".indexOf("l", -5)', '"hello".indexOf(\'l\')', '"hello".indexOf(\'l\', 3)', '"hello".indexOf(108)', '"hello".indexOf("", 9)',
      '"hello".lastIndexOf("l")', '"hello".lastIndexOf(\'l\')', '"hello".lastIndexOf("l", 2)', '"hello".lastIndexOf("l", -1)', '"hello".lastIndexOf("")', '"hello".lastIndexOf("h", 0)', '"hello".lastIndexOf(\'h\', -1)',
      '"hello".equals("hello")', '"hello".equals("Hello")', '"hello".equals(null)', '"hello".equalsIgnoreCase("HELLO")', '"hello".equalsIgnoreCase(null)',
      '"apple".compareTo("banana")', '"b".compareTo("a")', '"apple".compareTo("apple")', '"app".compareTo("apple")', '"Apple".compareTo("apple")', '"a".compareTo("")', '"apple".compareToIgnoreCase("APPLE")', '"a".compareToIgnoreCase("B")',
      '"hello".contains("ell")', '"hello".contains("")', '"hello".contains("xyz")', '"hello".startsWith("he")', '"hello".startsWith("")', '"hello".startsWith("lo", 3)', '"hello".startsWith("he", -1)', '"hello".startsWith("", 5)', '"hello".startsWith("", 6)', '"hello".endsWith("lo")', '"hello".endsWith("")',
      '"".isEmpty()', '" ".isEmpty()', '" \\t\\n".isBlank()', '"".isBlank()', '" a ".isBlank()',
      '"Hello World 123".toUpperCase()', '"Hello World 123".toLowerCase()', '"  hi  ".trim()', '"\\t\\nhi\\r ".trim()', '"  hi  ".strip()', '" hi ".stripLeading()', '" hi ".stripTrailing()', '"".trim()', '"   ".trim()',
      '"hello".replace(\'l\', \'L\')', '"hello".replace("l", "LL")', '"hello".replace("ll", "")', '"hello".replace("", "-")', '"".replace("", "-")', '"aaa".replace("aa", "b")', '"hello".replace("x", "y")', '"a.b.c".replace(".", "")', '"a$b".replace("$", "\\\\")',
      '"abc".concat("def")', '"ab".repeat(3)', '"ab".repeat(0)', '"ab".repeat(-1)', '"".repeat(5)',
      '"hello".toCharArray()', '"".toCharArray()', '"hello".toCharArray().length',
      '"a,b,c".split(",")', '"a,b,,".split(",")', '",a,,b".split(",")', '"".split(",")', '",".split(",")', '",,".split(",")', '"abc".split("")', '"".split("")', '"a b  c".split(" ")', '"hello".split("l")', '"hello".split("xyz")', '"a--b".split("--")', '"a,b,c".split(",").length',
      '"hello".hashCode()', '"".hashCode()', '"The quick brown fox jumps over the lazy dog".hashCode()', '"hello".toString()',
      '"a" + "b" == null', '"hello".charAt(1) == \'e\'', '"hello".charAt(0) + "hello".charAt(1)', '"" + "hello".charAt(0) + "hello".charAt(1)', '"hello".substring(1, 3).length()', '"hello".toUpperCase().charAt(0)',
      '"Hello".indexOf("l") + "Hello".lastIndexOf("l")', '"x".compareTo(null)', '"x".contains(null)', '"x".concat(null)',
    ],
  },
  'a null String': {
    methods: J`String nothing() { return null; } int len(String s) { return s.length(); } String join(String a, String b) { return a + b; } boolean isNull(String s) { return s == null; } boolean notNull(String s) { return s != null; } boolean same(String s) { return "x".equals(s); }`,
    calls: ['nothing()', 'len(null)', 'len(nothing())', 'join(null, "a")', 'join("a", null)', 'join(null, null)', 'isNull(null)', 'isNull("")', 'notNull("a")', 'same(null)', 'nothing() + 1', 'nothing() == null',
      'String.valueOf(nothing())', '"" + nothing()', 'nothing().equals("x")', 'nothing().isEmpty()', '"x".indexOf(nothing())', '"x".replace("x", nothing())', '"x".equalsIgnoreCase(nothing())', '"x".startsWith(nothing())', '"x".endsWith(nothing())', '"abc".split(nothing())'],
  },
  'static helpers: String, Integer, Double, Character, Boolean': {
    methods: '',
    calls: [
      'String.valueOf(5)', 'String.valueOf(5L)', 'String.valueOf(2.50)', "String.valueOf('c')", 'String.valueOf(true)', 'String.valueOf(new char[] {\'h\', \'i\'})', 'String.valueOf("s")', "String.valueOf('a' + 1)", 'String.valueOf((char) 97)',
      'String.join(", ", new String[] {"a", "b", "c"})', 'String.join("-", "a", "b")', 'String.join("-", "a")', 'String.join("", new String[0])', 'String.join("+", new String[] {"a", null})',
      'Integer.parseInt("42")', 'Integer.parseInt("-42")', 'Integer.parseInt("+42")', 'Integer.parseInt("042")', 'Integer.parseInt("")', 'Integer.parseInt(" 42")', 'Integer.parseInt("4 2")', 'Integer.parseInt("4.2")', 'Integer.parseInt("abc")',
      'Integer.parseInt("2147483647")', 'Integer.parseInt("2147483648")', 'Integer.parseInt("-2147483648")', 'Integer.parseInt("-2147483649")', 'Integer.parseInt("-")', 'Integer.parseInt("+")', 'Integer.parseInt("1_000")', 'Integer.parseInt("0x10")', 'Integer.parseInt("12L")',
      'Integer.toString(-7)', 'Integer.MAX_VALUE', 'Integer.MIN_VALUE', 'Integer.compare(3, 5)', 'Integer.compare(5, 3)', 'Integer.compare(4, 4)', 'Integer.max(3, 5)', 'Integer.min(3, 5)', 'Integer.sum(3, 5)', 'Integer.signum(-9)',
      'Integer.toBinaryString(10)', 'Integer.toBinaryString(-1)', 'Integer.toBinaryString(0)', 'Integer.toHexString(255)', 'Integer.toHexString(-1)',
      'Long.parseLong("9223372036854775807")', 'Long.parseLong("9223372036854775808")', 'Long.parseLong("12x")', 'Long.MAX_VALUE', 'Long.MIN_VALUE', 'Long.toString(5L)', 'Long.compare(1L, 2L)',
      'Double.parseDouble("3.5")', 'Double.parseDouble("-3.5")', 'Double.parseDouble("  3.5  ")', 'Double.parseDouble("1e3")', 'Double.parseDouble(".5")', 'Double.parseDouble("5.")', 'Double.parseDouble("5")', 'Double.parseDouble("")', 'Double.parseDouble("abc")',
      'Double.parseDouble("1,5")', 'Double.parseDouble("NaN")', 'Double.parseDouble("-Infinity")', 'Double.parseDouble("3.5d")', 'Double.parseDouble("3.5f")', 'Double.parseDouble("1e")', 'Double.parseDouble(".")', 'Double.parseDouble("+.5e-2")', 'Double.parseDouble("0.1") + Double.parseDouble("0.2")',
      'Double.MAX_VALUE', 'Double.MIN_VALUE', 'Double.POSITIVE_INFINITY', 'Double.NEGATIVE_INFINITY', 'Double.NaN', 'Double.isNaN(0.0 / 0)', 'Double.isNaN(1.0)', 'Double.compare(0.0, -0.0)', 'Double.compare(Double.NaN, 1e300)', 'Double.compare(1.5, 2.5)', 'Double.toString(100)', 'Double.toString(1e-5)',
      'Boolean.parseBoolean("true")', 'Boolean.parseBoolean("TRUE")', 'Boolean.parseBoolean("yes")', 'Boolean.parseBoolean("")', 'Boolean.toString(false)',
      "Character.isDigit('5')", "Character.isDigit('a')", "Character.isLetter('a')", "Character.isLetter('Z')", "Character.isLetter('5')", "Character.isLetter(' ')", "Character.isLetterOrDigit('_')", "Character.isLetterOrDigit('9')",
      "Character.isUpperCase('A')", "Character.isUpperCase('a')", "Character.isUpperCase('1')", "Character.isLowerCase('a')", "Character.isLowerCase('A')", "Character.isWhitespace(' ')", "Character.isWhitespace('\\n')", "Character.isWhitespace('\\t')", "Character.isWhitespace('a')", "Character.isWhitespace('\\u001C')", "Character.isWhitespace('\\u000B')",
      "Character.toUpperCase('a')", "Character.toUpperCase('A')", "Character.toUpperCase('1')", "Character.toLowerCase('A')", "Character.toLowerCase('z')", "Character.toUpperCase('a') + 1", "Character.toUpperCase(97)", "\"\" + Character.toUpperCase('a')", "\"\" + Character.toUpperCase(97)",
      "Character.getNumericValue('7')", "Character.getNumericValue('a')", "Character.getNumericValue('Z')", "Character.getNumericValue('-')", "Character.toString('q')", "Character.isAlphabetic('q')", "Character.compare('a', 'c')", 'Character.MAX_VALUE + 0', 'Character.isDigit(53)',
    ],
  },
  'Math': {
    methods: '',
    calls: [
      'Math.abs(-5)', 'Math.abs(5)', 'Math.abs(-5.5)', 'Math.abs(-0.0)', 'Math.abs(-5L)', "Math.abs('a')", 'Math.max(3, 7)', 'Math.max(3, 7.5)', 'Math.max(3L, 7)', 'Math.min(-3, -7)', 'Math.max(0.0, -0.0)', 'Math.min(0.0, -0.0)', 'Math.max(0.0 / 0, 1)', "Math.max('a', 'b')", "Math.min('a', 100)",
      'Math.pow(2, 10)', 'Math.pow(2, 0)', 'Math.pow(0, 0)', 'Math.pow(10, 2)', 'Math.pow(-2, 3)', 'Math.pow(2, -2)', 'Math.pow(3, 4)', 'Math.pow(7, 2)', 'Math.pow(10, 15)', 'Math.pow(2, 62)', 'Math.pow(2, 100)', 'Math.pow(1, 1000)', 'Math.pow(-1, 7)', 'Math.pow(5, 1)', '(int) Math.pow(2, 31)', '(int) Math.pow(10, 9)', '(long) Math.pow(2, 62)', 'Math.pow(0, 5)', 'Math.pow(2, -1)',
      'Math.sqrt(16)', 'Math.sqrt(2)', 'Math.sqrt(-1)', 'Math.sqrt(0)', 'Math.sqrt(1e100)', '(int) Math.sqrt(26)', 'Math.sqrt(0.25)',
      'Math.floor(2.7)', 'Math.floor(-2.7)', 'Math.ceil(2.1)', 'Math.ceil(-2.1)', 'Math.ceil(-0.5)', 'Math.floor(5)', '(int) Math.ceil(7 / 2)', '(int) Math.ceil(7 / 2.0)',
      'Math.round(2.5)', 'Math.round(-2.5)', 'Math.round(2.4)', 'Math.round(-2.6)', 'Math.round(0.49999999999999994)', 'Math.round(1e18)', 'Math.round(1e19)', 'Math.round(0.0 / 0)', 'Math.round(5)', 'Math.round(16777217)', "Math.round('a')", 'Math.round(-0.5)', 'Math.round(2.5) / 2', 'Math.round(7 / 2)', 'Math.round(7 / 2.0)', 'Math.round(3.14159 * 100) / 100.0',
      'Math.floorMod(-7, 3)', 'Math.floorMod(7, -3)', 'Math.floorMod(7, 3)', 'Math.floorMod(-7, -3)', 'Math.floorMod(1, 0)', 'Math.floorDiv(-7, 2)', 'Math.floorDiv(7, 2)', 'Math.floorDiv(7, -2)', 'Math.floorDiv(Integer.MIN_VALUE, -1)',
      'Math.PI', 'Math.E', 'Math.PI * 2 * 2', '(int) Math.PI',
    ],
  },
  'StringBuilder': {
    methods: J`
      String build() { StringBuilder sb = new StringBuilder(); sb.append("a").append(1).append('c').append(2.5).append(true).append(10L); return sb.toString(); }
      String rev(String s) { return new StringBuilder(s).reverse().toString(); }
      String trap() { StringBuilder sb = new StringBuilder('a'); sb.append("b"); return sb.toString(); }
      String charPlus() { StringBuilder sb = new StringBuilder(); sb.append('a' + 1); sb.append((char) ('a' + 1)); return sb.toString(); }
      String edit() { StringBuilder sb = new StringBuilder("hello"); sb.insert(0, "[").insert(sb.length(), ']').deleteCharAt(1).setCharAt(1, 'E'); return sb.toString(); }
      String edit2() { StringBuilder sb = new StringBuilder("hello world"); sb.delete(0, 6); sb.insert(2, 42); sb.delete(3, 100); return sb + "|" + sb.length() + "|" + sb.charAt(0) + "|" + sb.indexOf("o") + "|" + sb.isEmpty(); }
      String shared() { StringBuilder a = new StringBuilder("x"); StringBuilder b = a; b.append("y"); return a + "" + (a == b); }
      String nulls() { String s = null; StringBuilder sb = new StringBuilder(); sb.append(s).append(new char[] {'h', 'i'}); return sb.toString(); }
      String sub() { StringBuilder sb = new StringBuilder("hello"); return sb.substring(1) + sb.substring(1, 3); }
      char bad(int i) { return new StringBuilder("abc").charAt(i); }
      String bad2(int i) { return new StringBuilder("abc").deleteCharAt(i).toString(); }
      String bad3(int i) { return new StringBuilder("abc").insert(i, "x").toString(); }
      String bad4(int a, int b) { return new StringBuilder("abc").delete(a, b).toString(); }
      String bad5(int a, int b) { return new StringBuilder("abc").substring(a, b); }
      String bad6(int i) { StringBuilder sb = new StringBuilder("abc"); sb.setCharAt(i, 'z'); return sb.toString(); }
      StringBuilder itself() { return new StringBuilder("made").append('!'); }
      String cap(int n) { return new StringBuilder(n).toString(); }
      String loop(int n) { StringBuilder sb = new StringBuilder(); for (int i = 0; i < n; i++) { sb.append(i); if (i < n - 1) sb.append(","); } return sb.toString(); }
    `,
    calls: ['build()', 'rev("hello")', 'rev("")', 'trap()', 'charPlus()', 'edit()', 'edit2()', 'shared()', 'nulls()', 'sub()', 'bad(3)', 'bad(-1)', 'bad(2)', 'bad2(3)', 'bad2(0)', 'bad3(4)', 'bad3(3)', 'bad3(-1)',
      'bad4(1, 99)', 'bad4(2, 1)', 'bad4(-1, 2)', 'bad4(3, 3)', 'bad4(4, 5)', 'bad5(1, 4)', 'bad5(2, 1)', 'bad5(0, 3)', 'bad6(3)', 'bad6(0)', 'itself()', 'cap(5)', 'cap(-1)', 'loop(5)'],
  },

  // ── arrays
  'arrays: making, reading, writing, and running off the end': {
    methods: J`
      int[] fresh(int n) { return new int[n]; }
      double[] freshD() { return new double[2]; }
      boolean[] freshB() { return new boolean[2]; }
      char[] freshC() { char[] cs = new char[2]; cs[0] = 'x'; return cs; }
      String[] freshS() { return new String[2]; }
      long[] freshL() { long[] xs = new long[2]; xs[1] = 5; return xs; }
      int get(int[] xs, int i) { return xs[i]; }
      int[] set(int[] xs, int i, int v) { xs[i] = v; return xs; }
      int len(int[] xs) { return xs.length; }
      int[] lit() { int[] xs = {3, 1, 2}; return xs; }
      int[] lit2() { return new int[] {3, 1, 2,}; }
      double[] widen() { double[] ds = {1, 2L, 'a', 2.5}; return ds; }
      int[] alias() { int[] a = {1, 2}; int[] b = a; b[0] = 9; return a; }
      boolean same() { int[] a = {1}; int[] b = {1}; int[] c = a; return a == c && a != b; }
      int[] copy(int[] xs) { int[] c = xs.clone(); c[0] = -1; return xs; }
      int sum(int[] xs) { int t = 0; for (int x : xs) t += x; return t; }
      double total(int[] xs) { double t = 0; for (double x : xs) t += x / 2; return t; }
      int[] doubled(int[] xs) { for (int x : xs) x = x * 2; return xs; }
      int[] doubledReally(int[] xs) { for (int i = 0; i < xs.length; i++) xs[i] *= 2; return xs; }
      String chars(String s) { String out = ""; for (char c : s.toCharArray()) out = c + out; return out; }
      int charIndex() { int[] counts = new int[128]; counts['a']++; counts['a'] += 2; return counts[97]; }
      int[] swap(int[] xs) { int t = xs[0]; xs[0] = xs[xs.length - 1]; xs[xs.length - 1] = t; return xs; }
      int whenBad() { int[] xs = new int[2]; int i = 0; try1(xs); return xs[0]; }
      void try1(int[] xs) { xs[0] = 7; }
      int evalOrder() { int[] xs = new int[2]; int i = 0; xs[i] = i = 1; return xs[0] * 10 + xs[1]; }
      int nullArray() { int[] xs = null; return xs.length; }
      int nullIndex() { int[] xs = null; return xs[0]; }
      int nullLoop() { int[] xs = null; int t = 0; for (int x : xs) t += x; return t; }
      String[] words() { String[] w = {"b", null, "a"}; return w; }
      int rhsFirst() { int[] xs = new int[1]; int n = 0; xs[5] = n = 3; return n; }
    `,
    calls: ['fresh(3)', 'fresh(0)', 'fresh(-1)', 'freshD()', 'freshB()', 'freshC()[0]', 'freshC()[1] + 0', 'freshS()', 'freshL()', 'get(new int[] {5, 6}, 1)', 'get(new int[] {5, 6}, 2)', 'get(new int[] {5, 6}, -1)', 'get(new int[0], 0)', 'get(null, 0)',
      'set(new int[3], 1, 9)', 'set(new int[3], 3, 9)', 'len(new int[7])', 'len(null)', 'lit()', 'lit2()', 'widen()', 'alias()', 'same()', 'copy(new int[] {1, 2})', 'sum(new int[] {1, 2, 3})', 'sum(new int[0])', 'total(new int[] {1, 2, 3})',
      'doubled(new int[] {1, 2})', 'doubledReally(new int[] {1, 2})', 'chars("abc")', 'charIndex()', 'swap(new int[] {1, 2, 3})', 'swap(new int[0])', 'whenBad()', 'evalOrder()', 'nullArray()', 'nullIndex()', 'nullLoop()', 'words()', 'rhsFirst()',
      'new int[] {1, 2, 3}.length', 'new int[2][3].length', 'new int[] {1, 2, 3}[1]', "new char[] {'a', 'b'}", 'new boolean[] {true, 1 < 0}', 'new double[] {1, 2.5}', 'new String[] {"a", "b"}.length', 'new long[] {1, 2L}'],
  },
  'arrays of arrays': {
    methods: J`
      int[][] grid() { int[][] g = new int[2][3]; g[1][2] = 5; g[0][0]++; return g; }
      int[][] lit() { int[][] g = {{1, 2}, {3}, {}}; return g; }
      int[][] ragged() { int[][] g = new int[2][]; g[0] = new int[] {1}; return g; }
      int rows(int[][] g) { return g.length; }
      int cols(int[][] g) { return g[0].length; }
      int total(int[][] g) { int t = 0; for (int[] row : g) for (int v : row) t += v; return t; }
      int totalIndexed(int[][] g) { int t = 0; for (int r = 0; r < g.length; r++) for (int c = 0; c < g[r].length; c++) t += g[r][c] * (r + 1); return t; }
      int[][] sharedRow() { int[] row = {1, 2}; int[][] g = {row, row}; g[0][0] = 9; return g; }
      String[][] names() { String[][] n = new String[1][2]; n[0][1] = "x"; return n; }
      char[][] board() { char[][] b = new char[2][2]; for (char[] row : b) Arrays.fill(row, '.'); b[1][0] = 'X'; return b; }
      int raggedNull() { int[][] g = new int[2][]; return g[1].length; }
      int bad() { return new int[2][-1].length; }
      int bad2() { return new int[-1][2].length; }
      int[] rowOf(int[][] g, int r) { return g[r]; }
      String deep(int[][] g) { return Arrays.deepToString(g); }
    `,
    calls: ['grid()', 'lit()', 'ragged()', 'rows(new int[4][2])', 'cols(new int[4][2])', 'total(new int[][] {{1, 2}, {3, 4}})', 'totalIndexed(new int[][] {{1, 2}, {3, 4}})', 'sharedRow()', 'names()', 'board()', 'raggedNull()', 'bad()', 'bad2()',
      'rowOf(new int[][] {{1}, {2, 3}}, 1)', 'rowOf(new int[][] {{1}, {2, 3}}, 2)', 'deep(new int[][] {{1}, {2, 3}})', 'deep(null)', 'cols(new int[0][0])', 'new int[0][5]', 'new int[2][0]'],
  },
  'the Arrays helpers': {
    methods: J`
      int[] sorted(int[] xs) { Arrays.sort(xs); return xs; }
      String[] sortedS(String[] xs) { Arrays.sort(xs); return xs; }
      double[] sortedD(double[] xs) { Arrays.sort(xs); return xs; }
      char[] sortedC(String s) { char[] cs = s.toCharArray(); Arrays.sort(cs); return cs; }
      long[] sortedL() { long[] xs = {5L, -1L, 3000000000L}; Arrays.sort(xs); return xs; }
      int[] filled(int n, int v) { int[] xs = new int[n]; Arrays.fill(xs, v); return xs; }
      double[] filledD() { double[] xs = new double[2]; Arrays.fill(xs, 1); return xs; }
      String str(int[] xs) { return Arrays.toString(xs); }
      String anagram(String a, String b) { char[] x = a.toCharArray(); char[] y = b.toCharArray(); Arrays.sort(x); Arrays.sort(y); return "" + Arrays.equals(x, y); }
    `,
    calls: ['sorted(new int[] {3, -1, 2, 2, 0})', 'sorted(new int[0])', 'sorted(null)', 'sortedS(new String[] {"pear", "Apple", "fig", "apple", ""})', 'sortedS(new String[] {"b", null})', 'sortedD(new double[] {2.5, -0.0, 0.0, 0.0 / 0, -1e9, 1.0 / 0})',
      'sortedC("hello")', 'sortedL()', 'filled(3, 7)', 'filledD()', 'str(new int[] {1, 2})', 'str(new int[0])', 'str(null)', 'anagram("listen", "silent")', 'anagram("a", "b")',
      'Arrays.toString(new double[] {1, 2.5, 1e10})', "Arrays.toString(new char[] {'a', 'b'})", 'Arrays.toString(new boolean[2])', 'Arrays.toString(new String[] {"a", null})', 'Arrays.toString(new long[] {1L})',
      'Arrays.equals(new int[] {1, 2}, new int[] {1, 2})', 'Arrays.equals(new int[] {1, 2}, new int[] {1, 3})', 'Arrays.equals(new int[] {1}, new int[] {1, 2})', 'Arrays.equals(new int[0], null)', 'Arrays.equals(new String[] {"a", null}, new String[] {"a", null})',
      'Arrays.equals(new double[] {0.0}, new double[] {-0.0})', 'Arrays.equals(new double[] {0.0 / 0}, new double[] {0.0 / 0})',
      'Arrays.copyOf(new int[] {1, 2, 3}, 2)', 'Arrays.copyOf(new int[] {1, 2, 3}, 5)', 'Arrays.copyOf(new int[] {1, 2, 3}, 0)', 'Arrays.copyOf(new int[] {1, 2, 3}, -1)', 'Arrays.copyOf(new String[] {"a"}, 2)', 'Arrays.copyOf(new boolean[] {true}, 2)',
      'Arrays.copyOfRange(new int[] {1, 2, 3, 4}, 1, 3)', 'Arrays.copyOfRange(new int[] {1, 2, 3, 4}, 2, 6)', 'Arrays.copyOfRange(new int[] {1, 2, 3, 4}, 4, 4)', 'Arrays.copyOfRange(new int[] {1, 2, 3, 4}, 5, 6)', 'Arrays.copyOfRange(new int[] {1, 2, 3, 4}, 3, 1)', 'Arrays.copyOfRange(new int[] {1, 2, 3, 4}, -1, 2)',
      'Arrays.deepToString(new int[][] {{1, 2}, null, {}})', 'Arrays.deepToString(new String[][] {{"a", null}})'],
  },

  // ── control flow
  'if, else and the dangling else': {
    methods: J`
      String size(int n) { if (n < 0) return "negative"; else if (n == 0) return "zero"; else if (n < 10) return "small"; return "large"; }
      int dangling(int a, int b) { int r = 0; if (a > 0) if (b > 0) r = 1; else r = 2; return r; }
      int noBraces(int a) { int r = 0; if (a > 0) r = 1; r += 10; return r; }
      int emptyThen(int a) { int r = 5; if (a > 0) { } else r = 6; return r; }
      boolean both(int a, int b) { return a > 0 && b > 0; }
      boolean shortCircuit(int a) { return a != 0 && 10 / a > 1; }
      boolean shortCircuitOr(int a) { return a == 0 || 10 / a > 1; }
      boolean eager(int a) { return a != 0 & 10 / a > 1; }
      int sideEffect() { int n = 0; if (n++ > 0 && n++ > 0) n += 10; if (n++ > 0 || n++ > 0) n += 100; return n; }
      int ternaryChain(int n) { return n < 0 ? -1 : n == 0 ? 0 : 1; }
      int assignInTest(int a) { int b; if ((b = a * 2) > 5) return b; return -b; }
      boolean boolAssign(boolean a) { boolean b; if (b = a) return b; return !b; }
    `,
    calls: ['size(-5)', 'size(0)', 'size(5)', 'size(50)', 'dangling(1, 1)', 'dangling(1, -1)', 'dangling(-1, 1)', 'noBraces(1)', 'noBraces(-1)', 'emptyThen(1)', 'emptyThen(-1)', 'both(1, 1)', 'both(1, -1)',
      'shortCircuit(0)', 'shortCircuit(2)', 'shortCircuitOr(0)', 'shortCircuitOr(20)', 'eager(0)', 'eager(2)', 'sideEffect()', 'ternaryChain(-9)', 'ternaryChain(0)', 'ternaryChain(9)', 'assignInTest(3)', 'assignInTest(1)', 'boolAssign(true)', 'boolAssign(false)'],
  },
  'loops: while, do, for, break and continue': {
    methods: J`
      int sumTo(int n) { int t = 0; for (int i = 1; i <= n; i++) t += i; return t; }
      int countdown(int n) { int steps = 0; while (n > 0) { n -= 3; steps++; } return steps; }
      int once(int n) { int c = 0; do { c++; n--; } while (n > 0); return c; }
      int firstMultiple(int k) { int i = 1; while (true) { if (i % k == 0 && i > 10) break; i++; } return i; }
      int skipOdds(int n) { int t = 0; for (int i = 0; i < n; i++) { if (i % 2 == 1) continue; t += i; } return t; }
      int nested(int n) { int c = 0; for (int i = 0; i < n; i++) for (int j = 0; j <= i; j++) { if (j == 2) break; c++; } return c; }
      int nestedContinue(int n) { int c = 0; for (int i = 0; i < n; i++) { for (int j = 0; j < n; j++) { if (j == i) continue; c++; } } return c; }
      int twoVars() { int t = 0; for (int i = 0, j = 10; i < j; i++, j--) t += j - i; return t; }
      int noInit(int n) { int i = 0; for (; i < n; ) i += 2; return i; }
      int forever() { int i = 0; for (;;) { if (++i > 5) return i; } }
      int whileReturn(int n) { while (n > 0) { if (n % 7 == 0) return n; n--; } return -1; }
      int doContinue() { int i = 0; int c = 0; do { i++; if (i % 2 == 0) continue; c++; } while (i < 6); return c; }
      int loopVarAfter() { int i; for (i = 0; i < 5; i++) { } return i; }
      int emptyBody(int n) { int i = 0; while (i++ < n); return i; }
      String countUp(int n) { String s = ""; for (int i = 0; i < n; i++) s += i; return s; }
      int scopeReuse() { int t = 0; for (int i = 0; i < 2; i++) { int k = i * 2; t += k; } for (int i = 0; i < 2; i++) { int k = 5; t += k; } return t; }
      int breakInDo() { int i = 0; do { if (i == 3) break; i++; } while (true); return i; }
      int charLoop() { int c = 0; for (char ch = 'a'; ch <= 'e'; ch++) c += ch - 'a'; return c; }
      int downBy(int n) { int c = 0; for (int i = n; i > 0; i /= 2) c++; return c; }
      long factorial(int n) { long f = 1; for (int i = 2; i <= n; i++) f *= i; return f; }
      int intFactorial(int n) { int f = 1; for (int i = 2; i <= n; i++) f *= i; return f; }
      double harmonic(int n) { double h = 0; for (int i = 1; i <= n; i++) h += 1.0 / i; return h; }
      int forEachBreak(int[] xs) { int at = -1; int i = 0; for (int x : xs) { if (x < 0) { at = i; break; } i++; } return at; }
      int doubleIt(int n) { for (int i = 0; i < 3; i++) n *= 2; return n; }
    `,
    calls: ['sumTo(10)', 'sumTo(0)', 'sumTo(-3)', 'countdown(10)', 'countdown(0)', 'once(0)', 'once(3)', 'firstMultiple(7)', 'skipOdds(7)', 'nested(5)', 'nestedContinue(4)', 'twoVars()', 'noInit(5)', 'forever()', 'whileReturn(20)', 'whileReturn(5)',
      'doContinue()', 'loopVarAfter()', 'emptyBody(3)', 'countUp(12)', 'scopeReuse()', 'breakInDo()', 'charLoop()', 'downBy(100)', 'factorial(20)', 'factorial(21)', 'intFactorial(12)', 'intFactorial(13)', 'intFactorial(34)', 'harmonic(10)',
      'forEachBreak(new int[] {3, 4, -1, -2})', 'forEachBreak(new int[] {1})', 'doubleIt(5)'],
  },
  'switch, old style: fall-through, default anywhere, and break': {
    methods: J`
      String day(int d) { String name; switch (d) { case 1: name = "Mon"; break; case 2: name = "Tue"; break; default: name = "?"; } return name; }
      int fall(int n) { int r = 0; switch (n) { case 1: r += 1; case 2: r += 10; case 3: r += 100; break; case 4: r += 1000; } return r; }
      int defaultFirst(int n) { int r = 0; switch (n) { default: r += 1; case 1: r += 10; break; case 2: r += 100; } return r; }
      int grouped(char c) { switch (c) { case 'a': case 'e': case 'i': case 'o': case 'u': return 1; case 'y': return 2; default: return 0; } }
      int onString(String s) { switch (s) { case "yes": return 1; case "no": return 0; default: return -1; } }
      int commas(int n) { switch (n) { case 1, 2, 3: return 10; case 4: return 20; } return 0; }
      int inLoop(int n) { int t = 0; for (int i = 0; i < n; i++) { switch (i % 3) { case 0: continue; case 1: t += 1; break; default: t += 10; } t += 100; } return t; }
      int shared(int n) { switch (n) { case 1: int x = 5; return x; case 2: x = 7; return x; default: return 0; } }
      int empty(int n) { switch (n) { } return n; }
      int constants(int n) { final int TWO = 2; switch (n) { case 1 + 0: return 1; case TWO: return 2; case 'a': return 97; case 10 / 3: return 3; } return 0; }
      int charOnInt(char c) { switch (c) { case 65: return 1; case 'B': return 2; } return 0; }
      int nested(int a, int b) { switch (a) { case 1: switch (b) { case 1: return 11; default: break; } return 10; default: return 0; } }
      int nullSwitch() { String s = null; switch (s) { case "a": return 1; default: return 0; } }
      int breakLoopInside(int n) { int c = 0; switch (n) { case 1: for (int i = 0; i < 5; i++) { if (i == 2) break; c++; } c += 10; break; default: c = -1; } return c; }
    `,
    calls: ['day(1)', 'day(2)', 'day(9)', 'fall(1)', 'fall(2)', 'fall(3)', 'fall(4)', 'fall(5)', 'defaultFirst(1)', 'defaultFirst(2)', 'defaultFirst(7)', "grouped('e')", "grouped('y')", "grouped('z')", 'onString("yes")', 'onString("no")', 'onString("Yes")', 'onString("")',
      'commas(2)', 'commas(4)', 'commas(5)', 'inLoop(7)', 'shared(1)', 'shared(2)', 'shared(3)', 'empty(4)', 'constants(1)', 'constants(2)', 'constants(97)', 'constants(3)', 'constants(4)', "charOnInt('A')", "charOnInt('B')", "charOnInt('C')",
      'nested(1, 1)', 'nested(1, 2)', 'nested(2, 1)', 'nullSwitch()', 'breakLoopInside(1)', 'breakLoopInside(2)'],
  },
  'switch with arrows, and switch as a value': {
    methods: J`
      String day(int d) { String name; switch (d) { case 1 -> name = "Mon"; case 2 -> name = "Tue"; default -> name = "?"; } return name; }
      int noFall(int n) { int r = 0; switch (n) { case 1 -> r += 1; case 2 -> r += 10; case 3 -> { r += 100; r *= 2; } } return r; }
      String value(int d) { return switch (d) { case 1, 7 -> "weekend"; case 2, 3, 4, 5, 6 -> "weekday"; default -> "?"; }; }
      int points(char grade) { return switch (grade) { case 'A' -> 4; case 'B' -> 3; case 'C' -> 2; default -> 0; }; }
      int block(int n) { int r = switch (n) { case 1 -> { int t = n * 10; yield t + 1; } case 2 -> 20; default -> { if (n < 0) yield -1; yield 0; } }; return r; }
      double mixed(int n) { return switch (n) { case 1 -> 1; case 2 -> 2.5; default -> 'a'; }; }
      char charResult(int n) { return switch (n) { case 1 -> 'x'; default -> 121; }; }
      String onString(String s) { return switch (s) { case "a", "b" -> s + "!"; default -> "none"; }; }
      int thrower(int n) { return switch (n) { case 1 -> 10; default -> throw new IllegalArgumentException("bad " + n); }; }
      int inExpr(int n) { return 1 + switch (n) { case 1 -> 10; default -> 20; } * 2; }
      int arrowInLoop(int n) { int t = 0; for (int i = 0; i < n; i++) { switch (i) { case 0 -> { continue; } case 1 -> t += 1; default -> { if (i == 3) break; t += 10; } } t += 100; } return t; }
      int yieldInLoop(int n) { return switch (n) { case 0 -> 0; default -> { int t = 0; for (int i = 0; i < n; i++) { if (i == 2) yield 99; t += i; } yield t; } }; }
      int nullArrow() { String s = null; return switch (s) { case "a" -> 1; default -> 0; }; }
      String nested(int a, int b) { return switch (a) { case 1 -> switch (b) { case 1 -> "one-one"; default -> "one-other"; }; default -> "other"; }; }
      int arrowThrow(int n) { switch (n) { case 1 -> throw new IllegalStateException(); default -> n++; } return n; }
      String nullResult(int n) { return switch (n) { case 1 -> "one"; default -> null; }; }
    `,
    calls: ['day(1)', 'day(2)', 'day(3)', 'noFall(1)', 'noFall(2)', 'noFall(3)', 'noFall(4)', 'value(1)', 'value(4)', 'value(9)', "points('A')", "points('C')", "points('Z')", 'block(1)', 'block(2)', 'block(3)', 'block(-3)',
      'mixed(1)', 'mixed(2)', 'mixed(3)', 'charResult(1)', 'charResult(2)', 'onString("a")', 'onString("c")', 'thrower(1)', 'thrower(2)', 'inExpr(1)', 'inExpr(2)', 'arrowInLoop(5)', 'yieldInLoop(0)', 'yieldInLoop(2)', 'yieldInLoop(5)', 'nullArrow()',
      'nested(1, 1)', 'nested(1, 2)', 'nested(2, 1)', 'arrowThrow(1)', 'arrowThrow(2)', 'nullResult(1)', 'nullResult(2)'],
  },
  'methods calling methods, recursion, and what a call can and cannot change': {
    methods: J`
      int fact(int n) { return n <= 1 ? 1 : n * fact(n - 1); }
      int fib(int n) { if (n < 2) return n; return fib(n - 1) + fib(n - 2); }
      boolean isEven(int n) { return n == 0 ? true : isOdd(n - 1); }
      boolean isOdd(int n) { return n == 0 ? false : isEven(n - 1); }
      int gcd(int a, int b) { return b == 0 ? a : gcd(b, a % b); }
      String reverse(String s) { return s.isEmpty() ? "" : reverse(s.substring(1)) + s.charAt(0); }
      void bump(int n) { n++; }
      void bumpFirst(int[] xs) { xs[0]++; }
      void replace(int[] xs) { xs = new int[] {9, 9}; }
      void addTo(StringBuilder sb) { sb.append("!"); }
      void rename(String s) { s = s + "!"; }
      int afterBump(int n) { bump(n); return n; }
      int afterBumpFirst() { int[] xs = {1, 2}; bumpFirst(xs); replace(xs); return xs[0]; }
      String afterAddTo() { StringBuilder sb = new StringBuilder("hi"); addTo(sb); String s = "hi"; rename(s); return sb + s; }
      double widenArg(double d) { return d / 2; }
      double callWiden() { return widenArg(7) + widenArg('a') + widenArg(3L); }
      long widenLong(long n) { return n * 1000000; }
      long callWidenLong() { return widenLong(1000000); }
      int argOrder() { int i = 1; return two(i++, i++) * 10 + i; }
      int two(int a, int b) { return a * 10 + b; }
      void early(int[] out, int n) { if (n < 0) return; out[0] = n; }
      int callEarly(int n) { int[] out = {-99}; early(out, n); return out[0]; }
      int sumDigits(int n) { return n < 10 ? n : n % 10 + sumDigits(n / 10); }
      int power(int base, int exp) { if (exp == 0) return 1; int half = power(base, exp / 2); return exp % 2 == 0 ? half * half : half * half * base; }
      int forever(int n) { return forever(n + 1); }
      int hanoi(int n) { return n == 0 ? 0 : 2 * hanoi(n - 1) + 1; }
      int binarySearch(int[] xs, int target, int lo, int hi) { if (lo > hi) return -1; int mid = (lo + hi) / 2; if (xs[mid] == target) return mid; return xs[mid] < target ? binarySearch(xs, target, mid + 1, hi) : binarySearch(xs, target, lo, mid - 1); }
      static int helper(int n) { return n * 2; }
      static int usesHelper(int n) { return helper(n) + 1; }
      int instanceCallsStatic(int n) { return helper(n) + usesHelper(n); }
      public final int modifiers(final int n) { final int k = n + 1; return k; }
    `,
    calls: ['fact(10)', 'fact(13)', 'fib(15)', 'isEven(10)', 'isOdd(7)', 'gcd(48, 18)', 'gcd(17, 0)', 'reverse("recursion")', 'reverse("")', 'afterBump(5)', 'afterBumpFirst()', 'afterAddTo()', 'callWiden()', 'callWidenLong()', 'argOrder()',
      'callEarly(5)', 'callEarly(-5)', 'sumDigits(98765)', 'power(3, 13)', 'power(2, 31)', 'hanoi(20)', 'binarySearch(new int[] {1, 3, 5, 7, 9, 11}, 7, 0, 5)', 'binarySearch(new int[] {1, 3, 5}, 4, 0, 2)',
      'instanceCallsStatic(4)', 'modifiers(4)', 'fact(fact(3))', 'two(fact(3), fib(6))'],
  },
  'overloading: the same name with different parameter types': {
    methods: J`
      String kind(int x) { return "int"; }
      String kind(double x) { return "double"; }
      String kind(String x) { return "String"; }
      String kind(char x) { return "char"; }
      String kind(long x) { return "long"; }
      String kind(boolean x) { return "boolean"; }
      String kind(int[] x) { return "int[]"; }
      String kind() { return "nothing"; }
      String kind(int a, int b) { return "int,int"; }
      String kind(int a, double b) { return "int,double"; }
      String kind(String a, int b) { return "String,int"; }
      String kind(int a, String b) { return "int,String"; }
      int half(int x) { return x / 2; }
      double half(double x) { return x / 2; }
      String wide(double x) { return "double"; }
      String wide(long x) { return "long"; }
      String only(double x) { return "double " + x; }
      String order(String burger) { return "1x " + burger; }
      String order(String burger, int qty) { return qty + "x " + burger; }
      String order(String burger, int qty, String note) { return qty + "x " + burger + " (" + note + ")"; }
      int twice(int n) { return n * 2; }
      String twice(String s) { return s + s; }
      String chain() { return twice(twice("ab")) + twice(twice(3)); }
    `,
    calls: ['kind(1)', 'kind(1.0)', 'kind("s")', "kind('c')", 'kind(1L)', 'kind(true)', 'kind(new int[1])', 'kind()', 'kind(1, 2)', 'kind(1, 2.0)', 'kind("a", 1)', 'kind(1, "a")',
      "kind('a', 'b')", "kind('a', 2.5)", 'kind(1 + 1L)', "kind('a' + 1)", 'kind(7 / 2)', 'kind(7 / 2.0)', 'kind("" + 1)', 'kind((char) 65)', 'kind(1 < 2)', 'kind(Math.round(2.5))', 'kind(Math.sqrt(4))',
      'half(7)', 'half(7.0)', "half('a')", 'half(7L)', 'wide(1)', "wide('a')", 'wide(1L)', 'wide(1.5)', 'only(3)', "only('a')", 'only(3L)',
      'order("Fry")', 'order("Fry", 3)', 'order("Fry", 3, "no salt")', 'chain()', 'twice(4) + twice("4")'],
  },
  'throwing, and which exception stops a method': {
    methods: J`
      int check(int n) { if (n < 0) throw new IllegalArgumentException("negative: " + n); return n; }
      int state() { throw new IllegalStateException(); }
      int runtime() { throw new RuntimeException("x"); }
      int unsupported() { throw new UnsupportedOperationException("not yet"); }
      int arith() { throw new ArithmeticException("mine"); }
      int after(int n) { int[] xs = new int[1]; xs[0] = check(n); return xs[0] + 1; }
      int first(int n) { return check(n) + 10 / n; }
      int npe() { throw new NullPointerException(); }
      int index() { throw new IndexOutOfBoundsException("at 5"); }
      int numberFormat() { throw new NumberFormatException("nope"); }
      int nullMessage() { throw new IllegalArgumentException(nothing()); }
      String nothing() { return null; }
    `,
    calls: ['check(5)', 'check(-1)', 'state()', 'runtime()', 'unsupported()', 'arith()', 'after(3)', 'after(-3)', 'first(0)', 'first(-1)', 'npe()', 'index()', 'numberFormat()', 'nullMessage()'],
  },
  'what a variable holds when it is declared in a loop, final, or var': {
    methods: J`
      int var1() { var n = 5; var d = 2.5; var s = "x"; var c = 'c'; var b = true; var l = 5L; var xs = new int[] {1, 2}; return n + (int) d + s.length() + c + (b ? 1 : 0) + (int) l + xs[1]; }
      String varTypes() { var a = 7 / 2; var b = 7 / 2.0; var c = 'a' + 1; var d = (char) ('a' + 1); var e = 1L + 1; return "" + a + b + c + d + e; }
      int finals() { final int a = 5; final int b = a * 2; final char c = 'a'; final String s = "x" + a; char d = a; return b + c + d + s.length(); }
      int forVar() { int t = 0; for (var i = 0; i < 3; i++) t += i; for (var x : new int[] {5, 6}) t += x; return t; }
      int scoped() { int t = 0; { int a = 1; t += a; } { int a = 2; t += a; } return t; }
      int constChar() { char c = 65; char d = 'a' + 1; final int K = 66; char e = K; char f = (char) 67; return c + d + e + f; }
      int deferred(boolean b) { int x; if (b) x = 1; else x = 2; return x; }
      int deferredSwitch(int n) { int x; switch (n) { case 1: x = 10; break; default: x = 20; } return x; }
      int deferredLoop() { int x; while (true) { x = 5; break; } return x; }
      int deferredTernary(boolean b) { int x; int y = b ? (x = 1) : (x = 2); return x + y; }
      int deferredAnd(int n) { int x; if (n > 0 && (x = n * 2) > 5) return x; return 0; }
      int deferredOr(int n) { int x; if (n < 0 || (x = n * 2) > 5) return -1; return x; }
      int deferredNot(int n) { int x; if (!(n > 0 && (x = n) > 0)) return 0; return x; }
      int deferredFor() { int x; for (;;) { x = 3; break; } return x; }
      int deferredDo() { int x; do { x = 4; } while (x < 0); return x; }
      int deferredArrow(int n) { int x; switch (n) { case 1 -> x = 10; case 2 -> x = 20; default -> x = 30; } return x; }
      int deferredThrow(int n) { int x; if (n > 0) x = n; else throw new IllegalArgumentException(); return x; }
      int deferredConstant() { int x; if (true) x = 1; return x; }
      int deadBranch() { int x; if (false) { x = 1; return x; } return 0; }
      int unusedUnassigned() { int x; int y = 5; return y; }
      int deferredSwitchExpr(int n) { int x; int y = switch (n) { case 1 -> x = 1; default -> { x = 2; yield 5; } }; return x + y; }
      int deferredWhileFalse(boolean b) { int x; while (b) { x = 1; b = false; } x = 2; return x; }
    `,
    calls: ['var1()', 'varTypes()', 'finals()', 'forVar()', 'scoped()', 'constChar()', 'deferred(true)', 'deferred(false)', 'deferredSwitch(1)', 'deferredSwitch(2)', 'deferredLoop()', 'deferredTernary(true)', 'deferredAnd(3)', 'deferredAnd(1)',
      'deferredOr(3)', 'deferredOr(1)', 'deferredNot(4)', 'deferredFor()', 'deferredDo()', 'deferredArrow(2)', 'deferredThrow(1)', 'deferredThrow(-1)', 'deferredConstant()', 'deadBranch()', 'unusedUnassigned()', 'deferredSwitchExpr(1)', 'deferredSwitchExpr(2)', 'deferredWhileFalse(true)'],
  },
  'how a method may end: every one of these compiles in Java': {
    methods: J`
      int whileTrue(int n) { while (true) { if (n > 5) return n; n++; } }
      int forEver(int n) { for (;;) { if (n > 5) return n; n++; } }
      int doTrue(int n) { do { if (n > 5) return n; n++; } while (true); }
      int ifElse(int n) { if (n > 0) { return 1; } else { return -1; } }
      int ifElseIf(int n) { if (n > 0) return 1; else if (n < 0) return -1; else return 0; }
      int throwsAtEnd(int n) { if (n > 0) return 1; throw new IllegalArgumentException(); }
      int switchAll(int n) { switch (n) { case 1: return 1; default: return 0; } }
      int switchArrowAll(int n) { switch (n) { case 1 -> { return 1; } default -> { return 0; } } }
      int constTrue(int n) { final boolean T = true; while (T) { if (n > 5) return n; n++; } }
      int constExpr(int n) { while (1 < 2) { if (n > 5) return n; n++; } }
      int ifFalse() { if (false) { return 1; } return 2; }
      int ifTrue() { if (true) { return 1; } return 2; }
      int whileBreak(int n) { while (true) { if (n > 5) break; n++; } return n; }
      int nestedBreak(int n) { while (true) { while (true) { break; } if (n++ > 3) return n; } }
      int blockReturn() { { return 5; } }
      int forNoBreak(int n) { for (int i = 0; ; i++) { if (i == n) return i * 2; } }
      int doWhileFalse(int n) { do { n++; } while (false); return n; }
      int labelFree(int n) { if (n > 0) { if (n > 10) return 2; else return 1; } else return 0; }
      void nothing() { }
      void earlyVoid(int n) { if (n > 0) return; }
      int usesVoid() { nothing(); earlyVoid(1); return 1; }
      int emptyStatements() { ; ; int a = 1;; return a; }
      int ifWithEmpty(int n) { if (n > 0) ; else n = -n; return n; }
      int switchFallToDefault(int n) { switch (n) { case 1: n += 1; default: return n; } }
      int continueThenEnd(int n) { int c = 0; for (int i = 0; i < n; i++) { if (i % 2 == 0) continue; c++; } return c; }
      int whileTrueContinue(int n) { while (true) { n++; if (n < 10) continue; return n; } }
      int throwInElse(int n) { if (n > 0) { return n; } else { throw new IllegalStateException(); } }
      int switchExprThrow(int n) { return switch (n) { case 0 -> throw new IllegalStateException(); default -> n; }; }
    `,
    calls: ['whileTrue(0)', 'forEver(0)', 'doTrue(0)', 'ifElse(3)', 'ifElseIf(0)', 'throwsAtEnd(1)', 'throwsAtEnd(0)', 'switchAll(1)', 'switchArrowAll(2)', 'constTrue(0)', 'constExpr(0)', 'ifFalse()', 'ifTrue()', 'whileBreak(0)', 'nestedBreak(0)',
      'blockReturn()', 'forNoBreak(4)', 'doWhileFalse(1)', 'labelFree(5)', 'usesVoid()', 'emptyStatements()', 'ifWithEmpty(-4)', 'switchFallToDefault(1)', 'continueThenEnd(7)', 'whileTrueContinue(0)', 'throwInElse(0)', 'switchExprThrow(0)', 'switchExprThrow(4)'],
  },
  'printing from inside a method': {
    methods: J`
      int noisy(int n) { System.out.println("n is " + n); System.out.print('a'); System.out.print(1); System.out.print(2.0); System.out.print(true); System.out.print(5L); System.out.println(); System.out.println('a' + 1); System.out.println((char) ('a' + 1)); return n * 2; }
      int sb() { StringBuilder s = new StringBuilder("sb"); System.out.println(s); String t = null; System.out.println(t); System.out.println(1 + 2 + "x" + 1 + 2); return 0; }
    `,
    calls: ['noisy(4)', 'sb()'],
  },
  'comments, layout and odd but legal spellings': {
    methods: J`
      int /* here */ commented(int a /* and here */) { // to the end of the line
        /* a
           block */ return a // + 100
            + 1; }
      int dense(int a){int b=a+1;if(a>0){b+=2;}else{b-=2;}return b;}
      int parens(int a) { return (((a))) + ((1)); }
      int parenTarget(int a) { (a) = 5; (a)++; return a; }
      int unaryRun(int a) { return - - -a + + +a - ~a; }
      int ternaryAssign(int a) { int b; b = a > 0 ? 1 : 2; return b; }
      int dollar$name(int _under) { int camelCase9 = _under; return camelCase9; }
      boolean notEquals(int a) { return !(a == 1) != (a != 1); }
      int tabs(int	a) {	return	a;	}
      int hexAndFriends() { return 0x1F + 0b11 + 010 + 1_0 + 'A' + (int) 1e2 + (int) 1.5e1 + (int) .5e1 + (int) 5. + (int) 1D; }
      long longLits() { return 5l + 0x10L + 0b1L + 07L; }
      String escapes() { return "tab\there\nnew \"quoted\" back\\slash A \101 \0end \s."; }
      int charEscapes() { return '\n' + '\t' + '\\' + '\'' + '"' + 'A' + '\101' + '\0' + '\s' + '\r' + '\b' + '\f'; }
      String unicodeText() { return "café ü"; }
    `,
    calls: ['commented(1)', 'dense(1)', 'dense(-1)', 'parens(4)', 'parenTarget(1)', 'unaryRun(5)', 'ternaryAssign(1)', 'dollar$name(3)', 'notEquals(1)', 'tabs(2)', 'hexAndFriends()', 'longLits()', 'escapes()', 'charEscapes()', 'unicodeText()', 'unicodeText().length()'],
  },
  // ── wrapper objects
  'a wrapper boxes, unboxes, and may be null': {
    methods: J`Integer box(int a) { Integer n = a; return n; }
      int unbox(Integer n) { return n; }
      int plus(Integer a, Integer b) { return a + b; }
      double widen(Integer a) { double d = a; return d; }
      long widenL(Integer a) { return a; }
      String show(Integer n) { return "n=" + n; }
      String val(Integer n) { return String.valueOf(n); }
      boolean isNull(Integer n) { return n == null; }
      boolean notNull(Double d) { return null != d; }
      int orZero(Integer n) { return n == null ? 0 : n; }
      Integer pick(boolean f, int a) { return f ? a : null; }
      Integer pick2(boolean f, Integer a) { return f ? a : 0; }
      Double half(Integer n) { if (n == null) return null; return n / 2.0; }
      boolean same(Integer a, Integer b) { return a.equals(b); }
      boolean eqPrim(Integer a, int b) { return a == b; }
      boolean eqD(Integer a, double b) { return a == b; }
      boolean less(Integer a, Double b) { return a < b; }
      long l(Long a) { return a + 1; }
      boolean flag(Boolean b) { if (b) return true; return !b; }
      boolean both(Boolean a, Boolean b) { return a && b; }
      char ch(Character c) { return c; }
      int code(Character c) { return c + 1; }
      String neg(Integer n) { return "" + -n + (n > 0); }
      int big(Integer a) { return a * a; }`,
    calls: ['box(5)', 'box(-1)', 'unbox(5)', 'unbox(null)', 'plus(2, 3)', 'plus(null, 3)', 'plus(2, null)', 'widen(7)', 'widen(null)', 'widenL(7)', 'show(5)', 'show(null)',
      'val(5)', 'val(null)', 'isNull(null)', 'isNull(0)', 'notNull(null)', 'notNull(1.5)', 'orZero(null)', 'orZero(9)', 'pick(true, 4)', 'pick(false, 4)',
      'pick2(true, 4)', 'pick2(false, 4)', 'pick2(true, null)', 'pick2(false, null)', 'half(5)', 'half(null)', 'same(5, 5)', 'same(1000, 1000)', 'same(5, 6)', 'same(5, null)', 'same(null, 5)',
      'eqPrim(1000, 1000)', 'eqPrim(null, 0)', 'eqD(2, 2.0)', 'less(1, 1.5)', 'less(null, 1.5)', 'less(1, null)', 'l(5L)', 'l(null)', 'l(Long.MAX_VALUE)',
      'flag(true)', 'flag(false)', 'flag(null)', 'both(false, null)', 'both(true, null)', 'both(null, true)', "ch('x')", 'ch(null)', "code('a')", 'code(null)',
      'neg(5)', 'neg(null)', 'big(46341)', 'big(null)'],
  },
  'changing a wrapper: += and ++ unbox, work, and box again': {
    methods: J`Integer count(Integer n) { n++; n += 5; return n; }
      Integer pre(Integer n) { int a = ++n; return a + n--; }
      Character next(Character c) { c++; return c; }
      Double grow(Double d, Integer by) { d *= by; d -= 1; return d; }
      Long big(Long a) { a += 1; a <<= 2; return a; }
      Boolean flip(Boolean b) { b ^= true; b &= b; return b; }
      Integer wrap(Integer n) { n += Integer.MAX_VALUE; return n; }
      int order(Integer n) { int[] seen = new int[1]; try2(seen); n += mark(seen); return seen[0]; }
      void try2(int[] seen) { seen[0] = 5; }
      int mark(int[] seen) { seen[0] = 9; return 1; }
      String text(Integer n) { String s = "v"; s += n; return s; }
      Integer[] cells(Integer[] xs) { xs[0]++; xs[1] += 10; return xs; }
      Integer shift(Integer n, Long by) { n <<= by; return n; }`,
    calls: ['count(1)', 'count(null)', 'pre(4)', 'pre(null)', "next('a')", 'next(null)', "next('\\uffff')", 'grow(2.5, 4)', 'grow(null, 4)', 'grow(2.5, null)', 'big(5L)', 'big(null)',
      'flip(true)', 'flip(false)', 'flip(null)', 'wrap(1)', 'order(1)', 'order(null)', 'text(5)', 'text(null)', 'cells(new Integer[] {1, 2})', 'cells(new Integer[] {1, null})',
      'cells(new Integer[] {null, 2})', 'cells(new Integer[2])', 'shift(1, 3L)', 'shift(1, null)'],
  },
  'arrays of wrappers start as null, and a for-each may unbox each one': {
    methods: J`int sum(Integer[] xs) { int t = 0; for (int x : xs) t += x; return t; }
      int sumSafe(Integer[] xs) { int t = 0; for (Integer x : xs) { if (x != null) t += x; } return t; }
      double sumD(Integer[] xs) { double t = 0; for (double x : xs) t += x; return t; }
      String boxed(int[] xs) { String s = ""; for (Integer x : xs) s += x; return s; }
      String sorted(Integer[] xs) { Arrays.sort(xs); return Arrays.toString(xs); }
      String sortedD(Double[] xs) { Arrays.sort(xs); return Arrays.toString(xs); }
      String sortedC(Character[] xs) { Arrays.sort(xs); return Arrays.toString(xs); }
      Integer[] fresh(int n) { return new Integer[n]; }
      Double[] made() { Double[] ds = {1.5, null, 2.0}; return ds; }
      Integer[] filled(int n) { Integer[] xs = new Integer[n]; for (int i = 0; i < n; i++) xs[i] = i * i; return xs; }
      int at(Integer[] xs, Integer i) { return xs[i]; }
      boolean eq(Integer[] a, Integer[] b) { return Arrays.equals(a, b); }
      int count(Integer[] xs) { int n = 0; for (Integer x : xs) if (x == null) n++; return n; }
      Boolean[] flags() { return new Boolean[2]; }
      Character[] letters() { Character[] cs = {'a', 66, null}; return cs; }`,
    calls: ['sum(new Integer[] {1, 2, 3})', 'sum(new Integer[] {1, null})', 'sum(new Integer[0])', 'sumSafe(new Integer[] {1, null, 5})', 'sumD(new Integer[] {1, 2})', 'boxed(new int[] {1, 2})',
      'sorted(new Integer[] {3, 1, 2})', 'sorted(new Integer[] {3, null})', 'sorted(new Integer[] {null})', 'sortedD(new Double[] {0.0, -0.0, Double.NaN, -1.5})', "sortedC(new Character[] {'b', 'A', 'a'})",
      'fresh(3)', 'made()', 'filled(4)', 'at(new Integer[] {7, 8}, 1)', 'at(new Integer[] {7, 8}, null)', 'at(new Integer[] {null}, 0)', 'at(new Integer[] {7}, 3)',
      'eq(new Integer[] {1, null}, new Integer[] {1, null})', 'eq(new Integer[] {1}, new Integer[] {2})', 'count(new Integer[] {null, 1, null})', 'flags()', 'letters()'],
  },
  'the methods of a wrapper, and making one with valueOf': {
    methods: J`String t(Integer n) { return n.toString(); }
      int iv(Double d) { return d.intValue(); }
      double dv(Integer n) { return n.doubleValue(); }
      long lv(Double d) { return d.longValue(); }
      int cmp(Integer a, Integer b) { return a.compareTo(b); }
      int cmpD(Double a, Double b) { return a.compareTo(b); }
      int cmpC(Character a, Character b) { return a.compareTo(b); }
      boolean eqD(Double a, Double b) { return a.equals(b); }
      boolean eqI(Integer a, int b) { return a.equals(b); }
      boolean eqC(Character a, char b) { return a.equals(b); }
      boolean bv(Boolean b) { return b.booleanValue(); }
      char cv(Character c) { return c.charValue(); }
      String td(Double d) { return d.toString() + "!"; }`,
    calls: ['t(5)', 't(null)', 'iv(3.99)', 'iv(-3.99)', 'iv(1e20)', 'iv(Double.NaN)', 'iv(null)', 'dv(7)', 'lv(1e19)', 'cmp(1, 2)', 'cmp(2, 2)', 'cmp(3, 2)', 'cmp(Integer.MIN_VALUE, 1)', 'cmp(1, null)', 'cmp(null, 1)',
      'cmpD(0.0, -0.0)', 'cmpD(Double.NaN, 1.0)', 'cmpD(1.5, 1.5)', "cmpC('a', 'd')", 'eqD(0.0, -0.0)', 'eqD(Double.NaN, Double.NaN)', 'eqD(1.5, 1.5)', 'eqD(1.5, null)',
      'eqI(5, 5)', 'eqI(5, 6)', "eqC('a', 'a')", 'bv(true)', 'bv(null)', "cv('z')", 'td(1.0)', 'td(1e10)',
      'Integer.valueOf(5)', 'Integer.valueOf("12") + 1', 'Integer.valueOf("x")', "Integer.valueOf('a')", 'Double.valueOf(3)', 'Double.valueOf("2.5")', 'Double.valueOf("abc")',
      'Long.valueOf(5)', 'Long.valueOf("99")', 'Boolean.valueOf("TRUE")', 'Boolean.valueOf("yes")', 'Boolean.valueOf(true)', "Character.valueOf('x')",
      'Integer.valueOf(7).equals(7)', 'Integer.valueOf(7) + 1', 'Integer.valueOf(1000) == 1000', 'Double.valueOf(2) / 4', '"" + Integer.valueOf(3) + Double.valueOf(3)'],
  },
  'which method a call picks when one takes the primitive and one the wrapper': {
    methods: J`int a(int x) { return 1; } int a(Integer x) { return 2; }
      int b(long x) { return 1; } int b(Integer x) { return 2; }
      int c(Integer x) { return 2; }
      int d(double x) { return 1; }
      int e(Long x) { return 2; } int e(double x) { return 1; }
      int go(Integer n) { return a(n); }
      int go2(Integer n) { return b(n); }
      int go3(Integer n) { return d(n); }
      int sw(Integer n) { switch (n) { case 1: return 10; case 2: return 20; default: return 0; } }
      String cast(Integer n) { return "" + (int) n + (double) n + (long) n; }
      String castUp(Character c) { return "" + (int) c + (char) c; }
      Integer back(int n) { return (Integer) n; }`,
    calls: ['a(5)', 'go(5)', 'go(null)', 'b(5)', 'go2(5)', 'c(5)', "d('a')", 'go3(4)', 'go3(null)', 'e(5)', 'e(5L)', 'sw(1)', 'sw(2)', 'sw(9)', 'sw(null)', 'cast(7)', 'cast(null)', "castUp('a')", 'back(3)',
      'Math.max(Integer.valueOf(3), 4)', 'Math.abs(Integer.valueOf(-3))', 'String.valueOf(Integer.valueOf(3))', '"abc".charAt(Integer.valueOf(1))', '"abc".substring(Integer.valueOf(1))',
      'Math.sqrt(Integer.valueOf(16))', 'Integer.parseInt("5") + Integer.valueOf(5)', 'Math.round(Double.valueOf(2.5))', 'Character.isDigit(Character.valueOf(\'5\'))'],
  },
  // ── formatted printing
  'String.format: places for values, widths, and decimal places': {
    methods: J`String money(double d) { return String.format("$%.2f", d); }
      String row(String name, int qty, double price) { return String.format("%-10s%5d%12.2f", name, qty, price); }
      String pct(int done, int all) { return String.format("%d of %d (%.1f%%)", done, all, 100.0 * done / all); }
      String pad(int n) { return String.format("[%5d][%-5d][%05d][%,d][%+d]", n, n, n, n, n); }
      String str(String t) { return String.format("[%s][%8s][%-8s][%.2s]", t, t, t, t); }
      String any(int a, double x, char c, boolean t, long p) { return String.format("%s %s %s %s %s %b %c", a, x, c, t, p, t, c); }
      String boxed(Integer n, Double d) { return String.format("%d %s %.1f %s", n, n, d, d); }
      String own(String name, int n) { return "%s has %d".formatted(name, n); }
      String lines(int a) { return String.format("a%nb%d%n", a); }
      String six(double d) { return String.format("%f", d); }
      String big(double d) { return String.format("%,.2f|%012.3f|%+.0f|%10.1f|%-10.1f|", d, d, d, d, d); }
      String few(int a) { return String.format("%d %d", a); }
      String extra(int a) { return String.format("%d", a, a, a); }
      String wrongD(double d) { return String.format("%d", d); }
      String wrongF(int a) { return String.format("%f", a); }
      String wrongC(String t) { return String.format("%c", t); }
      String wrongDs(String t) { return String.format("%d", t); }
      String wrongFc(char c) { return String.format("%.2f", c); }
      String plain(String f) { return String.format(f); }
      String given(String f, int a) { return String.format(f, a); }`,
    calls: ['money(3.14159)', 'money(2.5)', 'money(0.005)', 'money(1.005)', 'money(2.675)', 'money(-0.001)', 'money(1e10)', 'money(0)', 'row("Burger", 3, 8.5)', 'row("A very long name", 12345678, 1234567.891)',
      'pct(1, 3)', 'pct(0, 5)', 'pad(42)', 'pad(-42)', 'pad(1234567)', 'pad(0)', 'pad(Integer.MIN_VALUE)', 'str("hello")', 'str("")', 'str(null)', 'str("a longer piece of text")',
      "any(7, 2.5, 'k', true, 5000000000L)", "any(-1, 1e-5, ' ', false, -1L)", 'boxed(5, 2.25)', 'boxed(null, null)', 'own("Nia", 3)', 'own(null, 0)', 'lines(1)',
      'six(1.5)', 'six(0.1)', 'six(123456789.123456789)', 'six(1e-7)', 'six(5e-7)', 'six(Double.NaN)', 'six(1.0 / 0)', 'six(-1.0 / 0)', 'six(-0.0)', 'six(Double.MAX_VALUE)', 'six(Double.MIN_VALUE)',
      'big(1234567.891)', 'big(-1234567.891)', 'big(0.5)', 'big(-0.5)', 'big(999.9996)', 'big(0.0)', 'big(1e15)', 'few(1)', 'extra(1)', 'wrongD(1.5)', 'wrongF(1)', 'wrongC("a")', 'wrongDs("5")', "wrongFc('a')",
      'plain("no places")', 'plain("100%%")', 'plain(null)', 'plain("%d")', 'given("%d!", 5)', 'given("%s%s", 5)', 'given("%5d|%-5d|", 5)', 'given("%.1f", 5)'],
  },
  'printf prints as it goes, and has already printed what came before a value that does not fit': {
    methods: J`int a(double d) { System.out.printf("Total: %.2f%n", d); return 1; }
      int b(int n) { System.out.printf("%d items%n", n); System.out.printf("%5s|%n", "ab"); System.out.printf("done%n"); return 2; }
      int c(double d) { System.out.printf("before %s and %d after%n", d, d); return 3; }
      int d(int n) { System.out.printf("one %d two %d three%n", n); return 4; }
      int e(String f) { System.out.printf(f); return 5; }
      int g(int n) { System.out.format("%03d%n", n); return 6; }
      int h(String name, double avg) { for (int i = 0; i < 3; i++) { System.out.printf("%-6s%6.1f%n", name + i, avg * i); } return 7; }`,
    calls: ['a(3.14159)', 'a(2.0)', 'b(3)', 'c(1.5)', 'd(1)', 'e("plain")', 'e(null)', 'g(7)', 'h("row", 3.333)'],
  },
  // ── collections
  'ArrayList: add, insert, get, set, remove, search': {
    methods: J`String build() { ArrayList<String> xs = new ArrayList<>(); xs.add("Hotel California"); xs.add("Stairway"); xs.add(1, "Bohemian"); xs.add(0, "First"); xs.add(xs.size(), "Last"); return xs + " " + xs.size(); }
      ArrayList<String> abc() { return new ArrayList<>(Arrays.asList("a", "b", "c", "b")); }
      String get(int i) { return abc().get(i); }
      String set(int i) { ArrayList<String> xs = abc(); String old = xs.set(i, "z"); return old + xs; }
      String removeAt(int i) { ArrayList<String> xs = abc(); String old = xs.remove(i); return old + xs; }
      String removeIt(String s) { ArrayList<String> xs = abc(); boolean was = xs.remove(s); return was + "" + xs; }
      String insert(int i) { ArrayList<String> xs = abc(); xs.add(i, "z"); return "" + xs; }
      int find(String s) { return abc().indexOf(s); }
      int findLast(String s) { return abc().lastIndexOf(s); }
      boolean has(String s) { return abc().contains(s); }
      String cleared() { ArrayList<String> xs = abc(); xs.clear(); return xs + " " + xs.isEmpty() + xs.size(); }
      String nulls() { ArrayList<String> xs = new ArrayList<>(); xs.add(null); xs.add("a"); xs.add(null); return xs + " " + xs.indexOf(null) + xs.lastIndexOf(null) + xs.contains(null) + xs.remove(null) + xs; }
      String addAll() { ArrayList<String> xs = abc(); ArrayList<String> ys = new ArrayList<>(); boolean a = ys.addAll(xs); boolean b = ys.addAll(new ArrayList<>()); ys.addAll(ys); return a + "" + b + ys; }
      String typed() { ArrayList<String> xs = new ArrayList<String>(); xs.add("x"); ArrayList<String> ys = new ArrayList<>(10); ys.add("y"); var zs = new ArrayList<Double>(); zs.add(1.5); return "" + xs + ys + zs; }
      int negative() { ArrayList<String> xs = new ArrayList<>(-1); return xs.size(); }
      String toArr() { ArrayList<String> xs = abc(); String[] a = xs.toArray(new String[0]); String[] big = new String[6]; Arrays.fill(big, "?"); String[] b = xs.toArray(big); return Arrays.toString(a) + Arrays.toString(b) + (b == big); }
      String same() { ArrayList<String> xs = abc(); ArrayList<String> ys = xs; ys.add("d"); return (xs == ys) + "" + xs + xs.equals(abc()) + abc().equals(abc()); }
      boolean bool() { ArrayList<String> xs = new ArrayList<>(); return xs.add("a") && xs.remove("a") && !xs.remove("a"); }`,
    calls: ['build()', 'get(0)', 'get(3)', 'get(4)', 'get(-1)', 'set(1)', 'set(4)', 'removeAt(0)', 'removeAt(3)', 'removeAt(4)', 'removeIt("b")', 'removeIt("q")', 'removeIt(null)', 'insert(0)', 'insert(4)', 'insert(5)', 'insert(-1)',
      'find("b")', 'find("q")', 'find(null)', 'findLast("b")', 'has("c")', 'has("C")', 'cleared()', 'nulls()', 'addAll()', 'typed()', 'negative()', 'toArr()', 'same()', 'bool()', 'abc()', 'abc().size()', 'abc().isEmpty()',
      'new ArrayList<String>()', 'new ArrayList<String>().isEmpty()', 'abc().get(1).length()', 'abc().toString().length()'],
  },
  'a list of Integers: remove(int) removes by position, remove(Integer) by value': {
    methods: J`ArrayList<Integer> nums() { ArrayList<Integer> xs = new ArrayList<>(); for (int i = 5; i > 0; i--) { xs.add(i * 10); } xs.add(2); return xs; }
      String byIndex(int i) { ArrayList<Integer> xs = nums(); int old = xs.remove(i); return old + "" + xs; }
      String byValue(Integer v) { ArrayList<Integer> xs = nums(); boolean was = xs.remove(v); return was + "" + xs; }
      String byChar(char c) { ArrayList<Integer> xs = nums(); return xs.remove(c) + "" + xs; }
      int sum() { int t = 0; for (int x : nums()) { t += x; } return t; }
      int sumBoxed() { int t = 0; for (Integer x : nums()) { t += x; } return t; }
      double avg() { ArrayList<Integer> xs = nums(); int t = 0; for (int i = 0; i < xs.size(); i++) { t += xs.get(i); } return (double) t / xs.size(); }
      int holes() { ArrayList<Integer> xs = nums(); xs.add(null); int t = 0; for (int x : xs) { t += x; } return t; }
      String doubles() { ArrayList<Double> ds = new ArrayList<>(); ds.add(1.5); ds.add(2.0); ds.add(-0.0); ds.add(0.0 / 0); return ds + " " + ds.contains(0.0) + ds.contains(-0.0) + ds.indexOf(0.0 / 0) + ds.get(1); }
      String chars() { ArrayList<Character> cs = new ArrayList<>(); for (char c : "hello".toCharArray()) { cs.add(c); } return cs + " " + cs.indexOf('l') + cs.contains('z') + cs.get(0); }
      String longs() { ArrayList<Long> ls = new ArrayList<>(); ls.add(5L); ls.add(5000000000L); return ls + " " + ls.contains(5L) + ls.indexOf(5000000000L); }
      String bools() { ArrayList<Boolean> bs = new ArrayList<>(); bs.add(true); bs.add(false); bs.add(1 > 2); return bs + " " + bs.indexOf(false) + bs.get(0); }
      String setGet() { ArrayList<Integer> xs = nums(); xs.set(0, xs.get(0) + 1); xs.set(1, xs.get(1) * 2); return "" + xs; }
      int unbox() { ArrayList<Integer> xs = new ArrayList<>(); xs.add(null); return xs.get(0); }
      boolean has(int v) { return nums().contains(v); }
      int at(int v) { return nums().indexOf(v); }`,
    calls: ['nums()', 'byIndex(0)', 'byIndex(2)', 'byIndex(5)', 'byIndex(50)', 'byValue(50)', 'byValue(2)', 'byValue(7)', 'byValue(null)', "byChar('\\u0001')", 'sum()', 'sumBoxed()', 'avg()', 'holes()',
      'doubles()', 'chars()', 'longs()', 'bools()', 'setGet()', 'unbox()', 'has(30)', 'has(31)', 'at(2)', 'at(10)', 'at(99)'],
  },
  'LinkedList and the List type: the ends of a list, and one method that takes either kind': {
    methods: J`String queue() { LinkedList<String> q = new LinkedList<>(); q.addFirst("b"); q.addFirst("a"); q.addLast("c"); q.add("d"); q.add(1, "x"); return q + " " + q.peekFirst() + q.peekLast() + q.getFirst() + q.getLast() + q.size(); }
      String drain() { LinkedList<Integer> q = new LinkedList<>(Arrays.asList(1, 2, 3)); String s = ""; while (!q.isEmpty()) { s += q.removeFirst(); } return s + q + q.peekFirst() + q.peekLast() + q.poll(); }
      String stack() { LinkedList<String> st = new LinkedList<>(); st.push("a"); st.push("b"); st.push("c"); return st.pop() + st.peek() + st + st.removeLast() + st.remove() + st; }
      String empty(int which) { LinkedList<String> q = new LinkedList<>(); if (which == 0) { return q.removeFirst(); } if (which == 1) { return q.removeLast(); } if (which == 2) { return q.getFirst(); } if (which == 3) { return q.pop(); } if (which == 4) { return q.element(); } return "" + q.pollFirst() + q.pollLast() + q.offer("z") + q.offerFirst("y") + q; }
      int count(List<String> xs) { return xs.size(); }
      String first(List<String> xs) { if (xs.isEmpty()) { return "none"; } return xs.get(0); }
      String both() { List<String> a = new ArrayList<>(); List<String> b = new LinkedList<>(); a.add("x"); b.add("y"); b.add("z"); return first(a) + first(b) + count(a) + count(b) + first(new ArrayList<>()) + count(new LinkedList<>()); }
      String ends() { ArrayList<String> xs = new ArrayList<>(Arrays.asList("a", "b", "c")); xs.addFirst("0"); xs.addLast("9"); return xs.removeFirst() + xs.removeLast() + xs.getFirst() + xs.getLast() + xs; }
      String emptyArrayList(int which) { ArrayList<String> xs = new ArrayList<>(); if (which == 0) { return xs.removeFirst(); } if (which == 1) { return xs.getLast(); } return xs.get(0); }
      String linkedIndex(int i) { LinkedList<String> q = new LinkedList<>(Arrays.asList("a", "b")); return q.get(i) + q.set(i, "z") + q.remove(i) + q; }
      String coll() { Collection<String> c = new ArrayList<>(); c.add("a"); c.add("a"); Collection<String> d = new HashSet<>(c); return c + " " + d + c.size() + d.size() + c.contains("a") + d.remove("a") + d.isEmpty(); }
      String equal() { List<String> a = new ArrayList<>(Arrays.asList("a", "b")); List<String> b = new LinkedList<>(Arrays.asList("a", "b")); return a.equals(b) + "" + b.equals(a) + a.equals(null) + (a == a); }`,
    calls: ['queue()', 'drain()', 'stack()', 'empty(0)', 'empty(1)', 'empty(2)', 'empty(3)', 'empty(4)', 'empty(5)', 'both()', 'ends()', 'emptyArrayList(0)', 'emptyArrayList(1)', 'emptyArrayList(2)',
      'linkedIndex(0)', 'linkedIndex(1)', 'linkedIndex(2)', 'linkedIndex(-1)', 'coll()', 'equal()', 'count(new ArrayList<>())', 'first(new LinkedList<>(Arrays.asList("q")))', 'count(null)'],
  },
  'Arrays.asList is a fixed-size view of its array': {
    methods: J`String view() { String[] arr = {"c", "a", "b"}; List<String> xs = Arrays.asList(arr); xs.set(0, "z"); arr[1] = "y"; Collections.sort(xs); return xs + Arrays.toString(arr) + xs.size() + xs.get(2) + xs.contains("y") + xs.indexOf("z"); }
      String add() { List<String> xs = Arrays.asList("a", "b"); xs.add("c"); return "" + xs; }
      String remove() { List<String> xs = Arrays.asList("a", "b"); xs.remove(0); return "" + xs; }
      String removeMissing() { List<String> xs = Arrays.asList("a", "b"); return xs.remove("q") + "" + xs; }
      String removeThere() { List<String> xs = Arrays.asList("a", "b"); return xs.remove("a") + "" + xs; }
      String clear(int n) { List<String> xs = Arrays.asList(new String[n]); xs.clear(); return "" + xs; }
      String bad(int i) { List<Integer> xs = Arrays.asList(1, 2, 3); return "" + xs.get(i); }
      String copy() { List<Integer> xs = Arrays.asList(3, 1, 2); ArrayList<Integer> ys = new ArrayList<>(xs); ys.add(0); Collections.sort(ys); return xs + "" + ys; }
      String boxed() { Integer[] arr = {3, null, 1}; List<Integer> xs = Arrays.asList(arr); arr[1] = 2; return xs + " " + xs.size(); }
      String ends() { List<String> xs = Arrays.asList("a", "b"); return xs.getFirst() + xs.getLast(); }
      String addAll() { List<String> xs = Arrays.asList("a"); return xs.addAll(new ArrayList<>()) + "" + xs.addAll(Arrays.asList("b")); }
      String nullArray() { String[] arr = null; return "" + Arrays.asList(arr); }
      String mixed() { return "" + Arrays.asList(1.5, 2.0) + Arrays.asList('a', 'b') + Arrays.asList(true) + Arrays.asList(5L, 6L) + Arrays.asList("a", null) + Arrays.asList(1, null, 3); }`,
    calls: ['view()', 'add()', 'remove()', 'removeMissing()', 'removeThere()', 'clear(0)', 'clear(2)', 'bad(0)', 'bad(3)', 'bad(-1)', 'copy()', 'boxed()', 'ends()', 'addAll()', 'nullArray()', 'mixed()'],
  },
  'HashSet: no duplicates, and the order Java hands the elements back in': {
    methods: J`String artists() { HashSet<String> s = new HashSet<>(); boolean a = s.add("Queen"); boolean b = s.add("Beatles"); boolean c = s.add("Queen"); return a + "" + b + c + s.size() + s; }
      String album() { HashSet<String> s = new HashSet<>(); String[] a1 = {"Arctic Monkeys", "Kendrick Lamar", "Vampire Weekend"}; String[] a2 = {"Kendrick Lamar", "Arctic Monkeys", "Tame Impala"}; String[] a3 = {"Travis Scott", "Kendrick Lamar", "The Strokes"};
        for (String x : a1) { s.add(x); } for (String x : a2) { s.add(x); } for (String x : a3) { s.add(x); } String out = ""; for (String x : s) { out += x + "|"; } return out + s.size() + s.contains("Kendrick Lamar") + s.contains("Drake"); }
      String words(String text) { HashSet<String> s = new HashSet<>(); for (String w : text.split(" ")) { s.add(w); } return s + " " + s.size(); }
      String ints(int n, int step) { HashSet<Integer> s = new HashSet<>(); for (int i = 0; i < n; i++) { s.add(i * step - 40); } return "" + s; }
      String chars(String text) { HashSet<Character> s = new HashSet<>(); for (char c : text.toCharArray()) { s.add(c); } return s + " " + s.size(); }
      String doubles() { HashSet<Double> s = new HashSet<>(); s.add(1.5); s.add(0.0); s.add(-0.0); s.add(0.0 / 0); s.add(0.0 / 0); s.add(100.25); s.add(1e10); s.add(-3.75); return s + " " + s.size() + s.contains(0.0); }
      String longs() { HashSet<Long> s = new HashSet<>(); for (long i = 1; i < 2000000000000L; i *= 37) { s.add(i); s.add(-i); } return "" + s; }
      String bools() { HashSet<Boolean> s = new HashSet<>(); s.add(false); s.add(true); s.add(false); return "" + s; }
      String removing() { HashSet<String> s = new HashSet<>(Arrays.asList("Rock", "Jazz", "Classical", "Pop", "Folk")); boolean a = s.remove("Jazz"); boolean b = s.remove("Jazz"); return a + "" + b + s + s.size() + s.isEmpty(); }
      String cleared() { HashSet<String> s = new HashSet<>(Arrays.asList("a", "b")); s.clear(); s.add("z"); s.add("a"); return s + " " + s.size(); }
      String nullIn() { HashSet<String> s = new HashSet<>(); s.add("b"); s.add(null); s.add("a"); s.add(null); return s + " " + s.contains(null) + s.remove(null) + s; }
      String dedupe(int n) { ArrayList<Integer> xs = new ArrayList<>(); for (int i = 0; i < n; i++) { xs.add(i * i % 17); } HashSet<Integer> s = new HashSet<>(xs); ArrayList<Integer> back = new ArrayList<>(s); return xs.size() + " " + s + back; }
      String sized(int cap, int n) { HashSet<Integer> s = new HashSet<>(cap); for (int i = 0; i < n; i++) { s.add(i * 31); } return "" + s; }
      String ops() { HashSet<Integer> a = new HashSet<>(Arrays.asList(1, 2, 3, 4, 20, 40)); HashSet<Integer> b = new HashSet<>(Arrays.asList(3, 4, 5, 40)); HashSet<Integer> both = new HashSet<>(a); both.retainAll(b); HashSet<Integer> either = new HashSet<>(a); either.addAll(b);
        HashSet<Integer> only = new HashSet<>(a); only.removeAll(b); return both + "" + either + only + a.containsAll(both) + b.containsAll(a) + a.equals(b) + both.equals(new HashSet<>(Arrays.asList(40, 4, 3))); }
      String asSet() { Set<String> s = new HashSet<>(); s.add("x"); s.add("y"); s.add("x"); return s + " " + s.size(); }
      String grown() { HashSet<String> s = new HashSet<>(); for (int i = 0; i < 100; i++) { s.add("song" + i); } String out = ""; int n = 0; for (String x : s) { if (n++ < 30) { out += x.substring(4) + ","; } } return out + s.size(); }
      String shrink() { HashSet<Integer> s = new HashSet<>(); for (int i = 0; i < 200; i++) { s.add(i * 7); } for (int i = 0; i < 195; i++) { s.remove(i * 7); } s.add(3); s.add(100000); return "" + s; }
      String collide() { HashSet<String> s = new HashSet<>(); s.add("BB"); s.add("Aa"); s.add("AaAa"); s.add("BBBB"); s.add("AaBB"); s.add("C#"); s.add("Aa"); return s + " " + "Aa".hashCode() + "BB".hashCode(); }`,
    calls: ['artists()', 'album()', 'words("the quick brown fox jumps over the lazy dog and the cat")', 'words("")', 'words("a a a")', 'ints(5, 1)', 'ints(13, 1)', 'ints(13, 16)', 'ints(40, 7)', 'ints(30, -1000003)',
      'chars("hello world")', 'chars("The Quick Brown Fox")', 'doubles()', 'longs()', 'bools()', 'removing()', 'cleared()', 'nullIn()', 'dedupe(10)', 'dedupe(40)', 'dedupe(0)',
      'sized(0, 5)', 'sized(1, 5)', 'sized(2, 3)', 'sized(3, 20)', 'sized(100, 20)', 'sized(17, 40)', 'sized(-1, 1)', 'ops()', 'asSet()', 'grown()', 'shrink()', 'collide()'],
  },
  'HashMap: keys to values, and the order of keySet() and values()': {
    methods: J`HashMap<String, String> songs() { HashMap<String, String> m = new HashMap<>(); m.put("Purple Rain", "Prince"); m.put("Highway 61 Revisted", "Bob Dylan"); m.put("Dark Side of the Moon", "Pink Floyd"); m.put("Under the Pink", "Tori Amos"); return m; }
      String walk() { HashMap<String, String> m = songs(); String out = ""; for (String song : m.keySet()) { out += song + ">" + m.get(song) + "|"; } for (String artist : m.values()) { out += artist + ","; } return out + m.size(); }
      String puts() { HashMap<String, String> m = new HashMap<>(); String a = m.put("Yesterday", "Beatles"); String b = m.put("Hey Jude", "Beatles"); String c = m.put("Yesterday", "Paul McCartney"); return a + " " + b + " " + c + " " + m + m.size(); }
      String look(String title) { HashMap<String, String> m = songs(); String artist = m.get(title); if (artist != null) { return title + " is by " + artist; } return "Unknown " + title; }
      String checks() { HashMap<String, String> m = songs(); return "" + m.containsKey("Purple Rain") + m.containsKey("Prince") + m.containsValue("Prince") + m.containsValue("Purple Rain") + m.isEmpty() + m.size(); }
      String removes() { HashMap<String, String> m = songs(); String a = m.remove("Purple Rain"); String b = m.remove("Purple Rain"); return a + " " + b + " " + m + m.size(); }
      String cleared() { HashMap<String, String> m = songs(); m.clear(); m.put("z", "1"); m.put("a", "2"); return m + " " + m.size() + m.isEmpty(); }
      String counts(String text) { HashMap<String, Integer> m = new HashMap<>(); for (String w : text.split(" ")) { if (m.containsKey(w)) { m.put(w, m.get(w) + 1); } else { m.put(w, 1); } } return "" + m; }
      String letters(String text) { HashMap<Character, Integer> m = new HashMap<>(); for (char c : text.toCharArray()) { m.put(c, m.getOrDefault(c, 0) + 1); } return "" + m; }
      int missing() { HashMap<String, Integer> m = new HashMap<>(); return m.get("nobody"); }
      String ratings() { HashMap<String, Double> m = new HashMap<>(); m.put("Yesterday", 4.8); m.put("Imagine", 5.0); m.put("Help", 3.25); double t = 0; for (double r : m.values()) { t += r; } return m + " " + t + m.get("Imagine"); }
      String tracks(int n) { HashMap<Integer, String> m = new HashMap<>(); for (int i = n; i > 0; i--) { m.put(i * 3, "t" + i); } return m + m.get(3) + m.get(4) + m.containsKey(6); }
      String nulls() { HashMap<String, String> m = new HashMap<>(); m.put(null, "none"); m.put("a", null); m.put("b", "x"); return m + " " + m.get(null) + m.get("a") + m.containsKey("a") + m.containsKey("q") + m.containsValue(null) + m.getOrDefault("a", "d") + m.getOrDefault("q", "d") + m.putIfAbsent("a", "now") + m.putIfAbsent("b", "no") + m.putIfAbsent("c", "new") + m; }
      String views() { HashMap<String, Integer> m = new HashMap<>(); m.put("one", 1); m.put("two", 2); m.put("three", 3); Set<String> keys = m.keySet(); Collection<Integer> vals = m.values(); m.put("four", 4); boolean a = keys.remove("one"); boolean b = vals.remove(3);
        return keys + "" + vals + m + a + b + keys.size() + vals.size() + keys.contains("two") + vals.contains(2) + (keys == m.keySet()) + (vals == m.values()); }
      String viewAdd(int which) { HashMap<String, Integer> m = new HashMap<>(); m.put("a", 1); if (which == 0) { m.keySet().add("b"); } else { m.values().add(2); } return "" + m; }
      String copies() { HashMap<String, Integer> m = new HashMap<>(); for (int i = 0; i < 20; i++) { m.put("k" + i * 37, i); } HashMap<String, Integer> c = new HashMap<>(m); c.put("extra", -1); m.remove("k0"); Map<String, Integer> e = new HashMap<>(new HashMap<String, Integer>()); ArrayList<String> keys = new ArrayList<>(m.keySet()); Collections.sort(keys);
        return m + "|" + c + "|" + e + keys + Collections.max(m.values()) + m.equals(c) + c.equals(c); }
      String sized(int cap, int n) { HashMap<Integer, Integer> m = new HashMap<>(cap); for (int i = 0; i < n; i++) { m.put(i * 17 - 50, i); } return "" + m; }
      String asMap() { Map<String, Integer> m = new HashMap<>(); m.put("b", 2); m.put("a", 1); int t = 0; for (String k : m.keySet()) { t += m.get(k); } return m + " " + t; }
      String grown() { HashMap<String, Integer> m = new HashMap<>(); for (int i = 0; i < 300; i++) { m.put("song " + i * 7, i); } for (int i = 0; i < 290; i++) { m.remove("song " + i * 7); } return m + "" + m.size(); }`,
    calls: ['songs()', 'walk()', 'puts()', 'look("Purple Rain")', 'look("Yesterday")', 'look(null)', 'checks()', 'removes()', 'cleared()', 'counts("the cat and the hat and the bat")', 'counts("")', 'counts("to be or not to be that is the question")',
      'letters("mississippi")', 'letters("Hello, World!")', 'letters("")', 'missing()', 'ratings()', 'tracks(5)', 'tracks(14)', 'tracks(100)', 'nulls()', 'views()', 'viewAdd(0)', 'viewAdd(1)', 'copies()',
      'sized(0, 3)', 'sized(1, 6)', 'sized(5, 9)', 'sized(64, 9)', 'sized(12, 13)', 'sized(-5, 1)', 'asMap()', 'grown()', 'songs().size()', 'songs().get("Under the Pink").length()'],
  },
  'the Collections class: sort, reverse, max, min, frequency, binarySearch, swap': {
    methods: J`ArrayList<String> songs() { ArrayList<String> xs = new ArrayList<>(); xs.add("Stairway to Heaven"); xs.add("Bohemian Rhapsody"); xs.add("Hotel California"); xs.add("Imagine"); xs.add("Sweet Child O' Mine"); return xs; }
      String sorted() { ArrayList<String> xs = songs(); ArrayList<String> copy = new ArrayList<>(xs); Collections.sort(copy); return copy + "" + xs.get(0) + Collections.min(xs) + Collections.max(xs) + Collections.binarySearch(copy, "Hotel California") + Collections.binarySearch(copy, "Zebra") + Collections.binarySearch(copy, "Aardvark") + Collections.binarySearch(copy, "Jump"); }
      String reversed() { ArrayList<String> xs = songs(); Collections.reverse(xs); return "" + xs; }
      int freq(String s) { ArrayList<String> xs = new ArrayList<>(Arrays.asList("Beatles", "Queen", "Beatles", "Led Zeppelin", "Beatles", null)); return Collections.frequency(xs, s); }
      String nums() { ArrayList<Integer> xs = new ArrayList<>(Arrays.asList(30, -5, 100, 7, 7, 0)); int hi = Collections.max(xs); int lo = Collections.min(xs); Collections.sort(xs); Collections.swap(xs, 0, 5); return xs + " " + hi + lo + Collections.frequency(xs, 7) + Collections.binarySearch(xs, 30); }
      String caps() { ArrayList<String> xs = new ArrayList<>(Arrays.asList("banana", "Apple", "cherry", "apple", "Banana", "10", "9", "")); Collections.sort(xs); return "" + xs; }
      String doubles() { ArrayList<Double> xs = new ArrayList<>(Arrays.asList(2.5, -1.0, 0.0, -0.0, 0.0 / 0, 1e9)); Collections.sort(xs); return xs + "" + Collections.max(xs) + Collections.min(xs); }
      String others() { ArrayList<Character> cs = new ArrayList<>(Arrays.asList('z', 'A', 'm')); ArrayList<Boolean> bs = new ArrayList<>(Arrays.asList(true, false, true)); ArrayList<Long> ls = new ArrayList<>(Arrays.asList(5000000000L, -1L, 3L)); Collections.sort(cs); Collections.sort(bs); Collections.sort(ls); return "" + cs + bs + ls + Collections.max(cs) + Collections.min(bs) + Collections.max(ls); }
      String linked() { LinkedList<String> q = new LinkedList<>(Arrays.asList("c", "a", "b")); Collections.sort(q); Collections.reverse(q); return q + "" + Collections.max(q) + Collections.binarySearch(q, "a"); }
      String ofSet() { HashSet<Integer> s = new HashSet<>(Arrays.asList(4, 9, 2)); HashMap<String, Integer> m = new HashMap<>(); m.put("a", 5); m.put("b", 1); return "" + Collections.max(s) + Collections.min(s) + Collections.max(m.values()) + Collections.min(m.keySet()) + Collections.frequency(s, 9) + Collections.frequency(m.values(), 5); }
      String empty(int which) { ArrayList<String> xs = new ArrayList<>(); if (which == 0) { return Collections.max(xs); } if (which == 1) { return Collections.min(xs); } Collections.sort(xs); Collections.reverse(xs); return xs + "" + Collections.binarySearch(xs, "a") + Collections.frequency(xs, "a"); }
      String withNull(int which) { ArrayList<String> xs = new ArrayList<>(); xs.add("b"); xs.add(null); if (which == 0) { Collections.sort(xs); } if (which == 1) { return Collections.max(xs); } if (which == 2) { return "" + Collections.binarySearch(xs, null); } return "" + xs; }
      String oneNull() { ArrayList<String> xs = new ArrayList<>(); xs.add(null); Collections.sort(xs); return xs + "" + Collections.max(xs); }
      String swapBad(int i, int j) { ArrayList<String> xs = songs(); Collections.swap(xs, i, j); return xs.get(0); }
      String addAll() { ArrayList<String> xs = new ArrayList<>(); boolean a = Collections.addAll(xs, "c", "a"); boolean b = Collections.addAll(xs); HashSet<Integer> s = new HashSet<>(); boolean c = Collections.addAll(s, 1, 2, 1); boolean d = Collections.addAll(s, 2); return "" + a + b + c + d + xs + s; }
      String dupes() { ArrayList<Integer> xs = new ArrayList<>(Arrays.asList(1, 3, 3, 3, 3, 3, 5, 7)); return "" + Collections.binarySearch(xs, 3) + Collections.binarySearch(xs, 4) + Collections.binarySearch(xs, 8) + Collections.binarySearch(xs, 0); }`,
    calls: ['sorted()', 'reversed()', 'freq("Beatles")', 'freq("Queen")', 'freq("Kiss")', 'freq(null)', 'nums()', 'caps()', 'doubles()', 'others()', 'linked()', 'ofSet()', 'empty(0)', 'empty(1)', 'empty(2)',
      'withNull(0)', 'withNull(1)', 'withNull(2)', 'withNull(3)', 'oneNull()', 'swapBad(0, 4)', 'swapBad(0, 5)', 'swapBad(-1, 0)', 'swapBad(2, 2)', 'addAll()', 'dupes()'],
  },
  'a for-each loop over a collection, and what may be done to the collection inside it': {
    methods: J`String each() { ArrayList<String> xs = new ArrayList<>(Arrays.asList("a", "b", "c")); String s = ""; for (String x : xs) { s += x.toUpperCase(); } for (var x : xs) { s += x; } return s; }
      String setInside() { ArrayList<Integer> xs = new ArrayList<>(Arrays.asList(1, 2, 3)); int i = 0; String s = ""; for (int x : xs) { s += x; if (i < 2) { xs.set(i + 1, x * 10); } i++; } return s + xs; }
      String removeThenBreak() { ArrayList<String> xs = new ArrayList<>(Arrays.asList("a", "b", "c")); for (String x : xs) { if (x.equals("b")) { xs.remove(x); break; } } return "" + xs; }
      String addThenReturn() { HashSet<String> s = new HashSet<>(Arrays.asList("a", "b")); for (String x : s) { s.add(x + "!"); return s.size() + ""; } return "never"; }
      String putSameKey() { HashMap<String, Integer> m = new HashMap<>(); m.put("a", 1); m.put("b", 2); m.put("c", 3); String s = ""; for (String k : m.keySet()) { m.put(k, m.get(k) * 10); m.put("c", m.get("c") + 1); } for (int v : m.values()) { s += v + ","; } return s + m; }
      String valuesLive() { HashMap<String, Integer> m = new HashMap<>(); m.put("a", 1); m.put("b", 2); m.put("c", 3); String s = ""; for (int v : m.values()) { s += v; m.put("c", 99); m.put("b", 50); } return s; }
      String asListSort() { String[] arr = {"c", "b", "a"}; List<String> xs = Arrays.asList(arr); String s = ""; for (String x : xs) { s += x; Collections.sort(xs); } return s; }
      String linkedSort() { LinkedList<String> q = new LinkedList<>(Arrays.asList("c", "b", "a")); String s = ""; for (String x : q) { s += x; Collections.sort(q); Collections.reverse(q); Collections.reverse(q); } return s; }
      String reverseInside() { ArrayList<Integer> xs = new ArrayList<>(Arrays.asList(1, 2, 3, 4)); String s = ""; for (int x : xs) { s += x; Collections.reverse(xs); } return s + xs; }
      String nested() { ArrayList<Integer> xs = new ArrayList<>(Arrays.asList(1, 2, 3)); HashSet<Integer> seen = new HashSet<>(); int pairs = 0; for (int a : xs) { for (int b : xs) { if (a < b && seen.add(a * 10 + b)) { pairs++; } } } return pairs + "" + seen; }
      String overNull() { ArrayList<String> xs = null; String s = ""; for (String x : xs) { s += x; } return s; }
      String empties() { String s = "."; for (String x : new ArrayList<String>()) { s += x; } for (int k : new HashMap<Integer, String>().keySet()) { s += k; } for (String x : new HashSet<String>()) { s += x; } return s; }
      String byIndexRemove() { ArrayList<Integer> xs = new ArrayList<>(Arrays.asList(1, 2, 2, 3, 2)); for (int i = xs.size() - 1; i >= 0; i--) { if (xs.get(i) == 2) { xs.remove(i); } } return "" + xs; }
      String skipping() { ArrayList<Integer> xs = new ArrayList<>(Arrays.asList(1, 2, 2, 3, 2)); for (int i = 0; i < xs.size(); i++) { if (xs.get(i) == 2) { xs.remove(i); } } return "" + xs; }`,
    calls: ['each()', 'setInside()', 'removeThenBreak()', 'addThenReturn()', 'putSameKey()', 'valuesLive()', 'asListSort()', 'linkedSort()', 'reverseInside()', 'nested()', 'overNull()', 'empties()', 'byIndexRemove()', 'skipping()'],
  },
  'collections handed to a method and handed back, printed, joined to text, and compared with null': {
    methods: J`ArrayList<String> build() { ArrayList<String> xs = new ArrayList<>(); xs.add("Wish You Were Here"); xs.add("When Doves Cry"); xs.add(0, "Still Into You"); return xs; }
      void addTo(ArrayList<String> xs, String s) { xs.add(s); }
      String shared() { ArrayList<String> xs = build(); addTo(xs, "Kids"); addTo(xs, "Kids"); return xs.size() + "" + xs; }
      String show() { ArrayList<String> xs = build(); HashMap<String, Integer> m = new HashMap<>(); m.put("x", 1); HashSet<Double> s = new HashSet<>(); s.add(2.0); System.out.println(xs); System.out.print(m); System.out.println(s); System.out.println("got " + xs + m + s + m.keySet() + m.values()); return "Tracks: " + xs.size(); }
      HashMap<String, Integer> tally(String[] words) { HashMap<String, Integer> m = new HashMap<>(); for (String w : words) { m.put(w, m.getOrDefault(w, 0) + 1); } return m; }
      HashSet<String> unique(ArrayList<String> xs) { return new HashSet<>(xs); }
      List<Integer> evens(List<Integer> xs) { List<Integer> out = new ArrayList<>(); for (int x : xs) { if (x % 2 == 0) { out.add(x); } } return out; }
      Set<Character> letters(String s) { Set<Character> out = new HashSet<>(); for (char c : s.toCharArray()) { out.add(c); } return out; }
      Map<Integer, String> names() { Map<Integer, String> m = new HashMap<>(); m.put(2, "two"); m.put(1, "one"); return m; }
      String nothing() { ArrayList<String> xs = null; HashMap<String, String> m = null; return (xs == null) + "" + (m != null) + xs + m; }
      int sizeOf(ArrayList<String> xs) { if (xs == null) { return -1; } return xs.size(); }
      int over(List<String> xs) { return 1; } int over(ArrayList<String> xs) { return 2; } int over(Collection<String> xs) { return 3; }
      String picks() { ArrayList<String> a = new ArrayList<>(); List<String> b = a; LinkedList<String> c = new LinkedList<>(); HashSet<String> d = new HashSet<>(); Collection<String> e = a; return "" + over(a) + over(b) + over(c) + over(d) + over(e); }
      ArrayList<String> tern(boolean f) { ArrayList<String> a = new ArrayList<>(); a.add("a"); ArrayList<String> b = new ArrayList<>(); return f ? a : b; }
      Collection<Integer> vals() { HashMap<String, Integer> m = new HashMap<>(); m.put("a", 1); return m.values(); }`,
    calls: ['build()', 'shared()', 'show()', 'tally(new String[] {"a", "b", "a"})', 'tally(new String[0])', 'unique(build())', 'unique(new ArrayList<>())', 'evens(Arrays.asList(1, 2, 3, 4, 10))', 'evens(new LinkedList<>())',
      'letters("banana")', 'names()', 'nothing()', 'sizeOf(null)', 'sizeOf(build())', 'sizeOf(new ArrayList<>())', 'picks()', 'tern(true)', 'tern(false)', 'vals()', 'build().get(0)', 'build().contains("Kids")', 'names().get(1)', 'names().keySet()'],
  },
  // ── classes of the student's own. `classes` are declared beside the test class; `methods` are test code inside it.
  'a class with fields and a method, and objects that each have their own': {
    classes: J`class Potion { String name; int healingAmount; int price; double weight; boolean rare; char grade; long id; Potion next;
        String describe() { return name + " restores " + healingAmount + " health and costs " + price + " gold."; }
        int total() { return healingAmount + price; } }`,
    methods: J`Potion make(String n, int h, int p) { Potion x = new Potion(); x.name = n; x.healingAmount = h; x.price = p; return x; }
      String blank() { Potion p = new Potion(); return p.name + " " + p.healingAmount + " " + p.price + " " + p.weight + " " + p.rare + " " + (int) p.grade + " " + p.id + " " + (p.next == null) + " " + p.describe(); }
      String two() { Potion a = make("A", 10, 5); Potion b = make("B", 99, 50); a.price = 6; return a.describe() + b.describe() + (a == b) + (a != b) + (a == a); }
      String alias() { Potion a = make("A", 1, 1); Potion b = a; b.name = "changed"; b.healingAmount += 9; b.price++; ++b.price; a.price *= 2; return a.name + a.healingAmount + a.price + (a == b) + a.equals(b) + a.equals(make("A", 1, 1)) + a.equals(null); }
      int change(Potion p) { p.price = 100; p = new Potion(); p.price = 1; return p.price; }
      String passed() { Potion p = make("P", 1, 1); int inner = change(p); return inner + " " + p.price; }
      String nothing(int which) { Potion p = null; if (which == 0) { return p.name; } if (which == 1) { return p.describe(); } if (which == 2) { p.price = 5; } if (which == 3) { p.price++; } if (which == 4) { p.price += 2; } return "" + (p == null); }
      String chain() { Potion a = make("a", 1, 1); a.next = make("b", 2, 2); a.next.next = make("c", 3, 3); int t = 0; for (Potion at = a; at != null; at = at.next) { t += at.price; } return a.next.next.name + t + a.next.describe() + (a.next.next.next == null); }
      String chainNull() { Potion a = make("a", 1, 1); return a.next.name; }
      String fields() { Potion p = new Potion(); p.weight = 1 / 2; p.weight += 0.25; p.rare = !p.rare; p.grade = 'a'; p.grade++; p.grade += 1; p.id = Integer.MAX_VALUE; p.id++; p.id *= 2; return p.weight + " " + p.rare + " " + p.grade + " " + p.id + " " + p.total(); }
      String array() { Potion[] shelf = new Potion[3]; shelf[1] = make("mid", 5, 5); String s = ""; for (Potion p : shelf) { s += (p == null ? "-" : p.name); } shelf[1].price = 9; return s + shelf[1].total() + shelf.length; }
      String arrayNull() { Potion[] shelf = new Potion[2]; return shelf[0].describe(); }`,
    calls: ['blank()', 'two()', 'alias()', 'passed()', 'nothing(0)', 'nothing(1)', 'nothing(2)', 'nothing(3)', 'nothing(4)', 'nothing(5)', 'chain()', 'chainNull()', 'fields()', 'array()', 'arrayNull()',
      'make("Elixir", 30, 15).describe()', 'make("x", 1, 2).total()', 'new Potion().describe()', 'new Potion().price', 'make("x", 1, 2).name.length()'],
  },
  'constructors, this, and one constructor handing over to another': {
    classes: J`class Monster { String name; int health; int attackPower;
        Monster(String name, int health, int attackPower) { this.name = name; this.health = health; this.attackPower = attackPower; }
        Monster(String name) { this(name, 50, 10); }
        Monster() { this("Slime"); health = health / 2; }
        String roar() { return name + " roars with power " + attackPower + "!"; }
        String status() { return this.name + " [HP=" + this.health + ", ATK=" + attackPower + "]"; }
        Monster stronger() { attackPower += 5; return this; }
        boolean beats(Monster other) { return this.attackPower > other.attackPower; }
        Monster twin() { return new Monster(name, health, attackPower); } }
      class Weapon { String name; int damage; int price = 7; String label = "w" + price;
        Weapon(String n, int d) { name = n; damage = d; }
        Weapon(String name, int damage, int price) { name = name; this.damage = damage; this.price = price; return; }
        Weapon(int damage) { this("fist", damage); if (damage > 5) { return; } label = "weak"; } }
      class Plain { int n = 3; int twice = n * 2; String s; }`,
    methods: J`String all() { Monster d = new Monster("Dragon", 200, 50); Monster g = new Monster("Goblin"); Monster s = new Monster(); return d.status() + g.status() + s.status() + d.roar(); }
      String self() { Monster g = new Monster("Goblin"); Monster same = g.stronger().stronger(); Monster t = g.twin(); return g.status() + (same == g) + (t == g) + t.status() + g.beats(t) + t.stronger().beats(g); }
      String weapons() { Weapon a = new Weapon("Axe", 9); Weapon b = new Weapon("Bow", 4, 30); Weapon c = new Weapon(9); Weapon e = new Weapon(2); return a.name + a.damage + a.price + a.label + "|" + b.name + b.damage + b.price + b.label + "|" + c.name + c.label + "|" + e.name + e.label; }
      String plain() { Plain p = new Plain(); return p.n + " " + p.twice + " " + p.s; }
      boolean nullBeats() { return new Monster("a").beats(null); }`,
    calls: ['all()', 'self()', 'weapons()', 'plain()', 'nullBeats()', 'new Monster("Orc", 60, 10).roar()', 'new Monster().name', 'new Monster("x").health + new Monster().health', 'new Weapon(1).price'],
  },
  'private fields, with getters and setters that guard them': {
    classes: J`class Weapon { private String name; private int damage;
        Weapon(String name, int damage) { this.name = name; setDamage(damage); }
        public String getName() { return name; }
        public int getDamage() { return damage; }
        public void setDamage(int newDamage) { if (newDamage < 0) { damage = 0; } else if (newDamage > 100) { damage = 100; } else { damage = newDamage; } }
        public String describe() { return name + " deals " + damage + " damage."; }
        private int half() { return damage / 2; }
        public int halved() { return this.half() + half(); }
        public boolean sameAs(Weapon other) { return other != null && damage == other.damage && name.equals(other.name); }
        public void copyFrom(Weapon other) { this.damage = other.damage; other.name = name + "*"; } }
      class Monster { private String name; private int health;
        Monster(String name, int health) { this.name = name; this.health = health; }
        public int getHealth() { return health; }
        public void setHealth(int newHealth) { if (newHealth < 0) { this.health = 0; } else { this.health = newHealth; } }
        public void takeDamage(int amount) { health = health - amount; if (health < 0) { health = 0; } System.out.println(name + " takes " + amount + " damage and now has " + health + " health."); }
        public boolean isDefeated() { return health == 0; } }`,
    methods: J`String clamp(int d) { Weapon w = new Weapon("Sword", d); return w.getDamage() + " " + w.describe(); }
      String set(int d) { Weapon w = new Weapon("Axe", 40); w.setDamage(d); return w.getName() + w.getDamage() + w.halved(); }
      String peers() { Weapon a = new Weapon("A", 5); Weapon b = new Weapon("A", 5); Weapon c = new Weapon("C", 70); boolean same = a.sameAs(b); a.copyFrom(c); return same + "" + a.sameAs(c) + a.sameAs(null) + a.getDamage() + c.getName(); }
      String fight() { Monster m = new Monster("Dragon", 200); m.takeDamage(30); m.setHealth(-999); boolean gone = m.isDefeated(); m.setHealth(150); m.takeDamage(500); return gone + " " + m.getHealth() + m.isDefeated(); }`,
    calls: ['clamp(25)', 'clamp(-50)', 'clamp(999)', 'clamp(0)', 'clamp(100)', 'set(60)', 'set(-10)', 'set(150)', 'peers()', 'fight()', 'new Weapon("Club", -5).describe()', 'new Monster("x", 3).getHealth()'],
  },
  'objects working together: one object handed to another, and held by another': {
    classes: J`class Item { private String name; private int price;
        Item(String name, int price) { this.name = name; if (price < 0) { this.price = 0; } else { this.price = price; } }
        public String getName() { return name; }
        public int getPrice() { return price; } }
      class Hero { private String name; private int gold; private Item held; private int bought;
        Hero(String name, int gold) { this.name = name; this.gold = gold < 0 ? 0 : gold; }
        public String getName() { return name; }
        public int getGold() { return gold; }
        public boolean canAfford(Item item) { return gold >= item.getPrice(); }
        public String buyItem(Item item) { if (canAfford(item)) { gold -= item.getPrice(); held = item; bought++; return name + " buys " + item.getName() + " for " + item.getPrice() + " gold."; } return name + " cannot afford " + item.getName() + "."; }
        public String status() { return name + " has " + gold + " gold."; }
        public String holding() { return held.getName(); }
        public Item getHeld() { return held; }
        public int count() { return bought; }
        public void give(Hero other, int amount) { if (amount > gold) { amount = gold; } gold -= amount; other.gold += amount; } }
      class Store { private String name; private int sales;
        Store(String name) { this.name = name; }
        public String sell(String itemName, int price, Hero buyer) { Item item = new Item(itemName, price); String said = buyer.buyItem(item); if (buyer.getHeld() == item) { sales++; return buyer.getName() + " buys " + itemName + " from " + name + " for " + price + " gold."; } return said; }
        public int getSales() { return sales; } }`,
    methods: J`String shop() { Hero hero = new Hero("Aria", 40); Item p = new Item("Potion", 15); Item s = new Item("Shield", 30); String a = hero.buyItem(p); String b = hero.buyItem(s); return a + b + hero.status() + hero.holding() + hero.count() + (hero.getHeld() == p); }
      String exact() { Hero hero = new Hero("Aria", 20); Item potion = new Item("Potion", 20); return hero.canAfford(potion) + hero.buyItem(potion) + hero.getGold() + hero.canAfford(potion) + hero.canAfford(new Item("Free", -5)); }
      String empty() { Hero broke = new Hero("Bob", -10); return broke.getGold() + broke.status() + (broke.getHeld() == null) + broke.holding(); }
      String gift() { Hero a = new Hero("A", 30); Hero b = new Hero("B", 5); a.give(b, 12); b.give(a, 100); a.give(a, 3); return a.status() + b.status(); }
      String store() { Store st = new Store("Magic Shop"); Hero h = new Hero("Aria", 50); String a = st.sell("Potion", 20, h); String b = st.sell("Sword", 80, h); return a + b + st.getSales() + h.status(); }
      String noItem() { return new Hero("x", 5).buyItem(null); }`,
    calls: ['shop()', 'exact()', 'empty()', 'gift()', 'store()', 'noItem()', 'new Item("Cursed Ring", -5).getPrice()', 'new Hero("Aria", 50).canAfford(new Item("x", 50))'],
  },
  'toString, and collections of objects': {
    classes: J`class Monster { private String name; private int health;
        Monster(String name, int health) { this.name = name; this.health = health < 0 ? 0 : health; }
        public String getName() { return name; }
        public int getHealth() { return health; }
        public void takeDamage(int amount) { if (amount < 0) { return; } health -= amount; if (health < 0) { health = 0; } }
        public boolean isDefeated() { return health == 0; }
        @Override
        public String toString() { return name + " [HP=" + health + "]"; } }
      class Dungeon { private String name; private ArrayList<Monster> monsters;
        Dungeon(String name) { this.name = name; this.monsters = new ArrayList<>(); }
        public void addMonster(Monster m) { monsters.add(m); }
        public int getMonsterCount() { return monsters.size(); }
        public String listMonsters() { if (monsters.isEmpty()) { return "The dungeon is empty."; } String out = ""; for (int i = 0; i < monsters.size(); i++) { if (i > 0) { out += "\n"; } out += monsters.get(i); } return out; }
        public int attackAll(int damage) { for (Monster m : monsters) { m.takeDamage(damage); } int gone = 0; for (int i = monsters.size() - 1; i >= 0; i--) { if (monsters.get(i).isDefeated()) { monsters.remove(i); gone++; } } return gone; }
        public Monster strongest() { Monster best = null; for (Monster m : monsters) { if (best == null || m.getHealth() > best.getHealth()) { best = m; } } return best; }
        @Override public String toString() { return name + " (" + monsters.size() + " monsters)"; } }
      class Ghost { public String toString() { return null; } }
      class Loud { int n; public String toString() { n++; return "loud" + n; } }`,
    methods: J`Dungeon cave() { Dungeon d = new Dungeon("Dark Cave"); d.addMonster(new Monster("Goblin", 30)); d.addMonster(new Monster("Orc", 60)); d.addMonster(new Monster("Dragon", 200)); return d; }
      String printed() { Monster g = new Monster("Goblin", 30); System.out.println(g); System.out.print(g); System.out.println(); Monster none = null; System.out.println(none); return "it is " + g + "!" + none + g.toString().length(); }
      String listed() { ArrayList<Monster> ms = new ArrayList<>(); ms.add(new Monster("Goblin", 30)); ms.add(new Monster("Orc", 60)); ms.add(null); System.out.println(ms); return ms + " " + ms.size() + ms.get(1) + ms.toString().length() + String.format("%s|%10s|%-12s|", ms.get(0), ms.get(1), ms.get(2)); }
      String dungeon() { Dungeon d = cave(); String before = d + ": " + d.listMonsters(); int gone = d.attackAll(60); return before + " / " + gone + " / " + d + ": " + d.listMonsters() + " / " + d.strongest() + d.attackAll(-5) + d.attackAll(1000) + d.listMonsters() + d.strongest(); }
      String finding() { ArrayList<Monster> ms = new ArrayList<>(); Monster orc = new Monster("Orc", 60); ms.add(new Monster("Orc", 60)); ms.add(orc); ms.add(orc); return ms.indexOf(orc) + " " + ms.contains(orc) + ms.contains(new Monster("Orc", 60)) + ms.lastIndexOf(orc) + ms.remove(orc) + ms.size() + Collections.frequency(ms, orc) + ms.remove(new Monster("Orc", 60)); }
      String mapped() { HashMap<String, Monster> byName = new HashMap<>(); for (String n : new String[] {"Goblin", "Orc", "Imp"}) { byName.put(n, new Monster(n, n.length() * 10)); } byName.get("Orc").takeDamage(5); Monster none = byName.get("Dragon"); return byName + " " + byName.get("Orc") + none + byName.containsKey("Imp") + byName.values() + byName.get("Imp").getHealth(); }
      String linked() { LinkedList<Monster> q = new LinkedList<>(); q.addFirst(new Monster("b", 2)); q.addFirst(new Monster("a", 1)); q.addLast(new Monster("c", 3)); Monster first = q.removeFirst(); Collections.reverse(q); return first + "" + q + q.peekFirst().getName(); }
      String arrays() { Monster[] ms = { new Monster("a", 1), null, new Monster("c", 3) }; List<Monster> view = Arrays.asList(ms); ms[1] = new Monster("b", 2); return Arrays.toString(ms) + view + view.get(1).getName() + Arrays.asList(new Monster("z", 9)); }
      String ghost() { Ghost g = new Ghost(); Loud l = new Loud(); String s = "" + l + l; return g + "|" + g.toString() + "|" + s + l.n + String.valueOf(l.toString()); }
      int ghostLength() { return new Ghost().toString().length(); }`,
    calls: ['printed()', 'listed()', 'dungeon()', 'finding()', 'mapped()', 'linked()', 'arrays()', 'ghost()', 'ghostLength()', '"" + cave()', 'cave().getMonsterCount()', '"" + cave().strongest()', 'new Dungeon("Pit").listMonsters()', '"" + new Monster("x", -3)', '"" + new Dungeon("Pit")'],
  },
  'static fields and methods, and the order in which a new object is set up': {
    classes: J`class Counter { static int made; static String log = "start"; static int doubled = made * 2 + 1; int id; String tag = note("field");
        Counter() { this(100); log += " ctor0"; }
        Counter(int base) { made++; id = base + made; log += " ctor1"; }
        static String note(String what) { log += " " + what; return what + made; }
        static int count() { return made; }
        static void reset() { made = 0; log = ""; }
        int next() { return made + id; }
        static int twice(int n) { return n * 2; } }
      class Bank { static double rate = 0.5; static int[] slots = new int[3]; static final int LIMIT = 4; private static int secret = 7; double balance = rate * 10; int[] own = {1, 2};
        static int peek() { return secret; }
        void grow() { balance += balance * rate; slots[0]++; own[0]++; } }`,
    methods: J`int calls = 0;
      static int shared = 5;
      int bump() { calls++; shared += 2; return calls * 100 + shared; }
      String order() { Counter.reset(); Counter a = new Counter(); Counter b = new Counter(7); return Counter.log + "|" + a.id + " " + b.id + " " + a.tag + " " + b.tag + " " + Counter.count() + " " + a.next() + " " + Counter.made + Counter.twice(4); }
      String bank() { Bank a = new Bank(); Bank.rate = 0.25; Bank b = new Bank(); a.grow(); b.grow(); b.grow(); Bank.slots[2] = Bank.LIMIT; return a.balance + " " + b.balance + " " + Arrays.toString(Bank.slots) + a.own[0] + b.own[0] + Bank.peek() + (Bank.rate += 1); }
      String host() { return bump() + " " + bump() + " " + calls + " " + shared + " " + this.calls; }`,
    calls: ['Counter.doubled', 'order()', 'order()', 'Counter.count()', 'bank()', 'host()', 'host()', 'bump()', 'calls', 'shared', 'Counter.twice(Counter.made)'],
  },
  'evaluation order around objects, and fields of every kind': {
    classes: J`class Box { Integer boxed; Double ratio = 1.5; String text; StringBuilder sb = new StringBuilder("x"); ArrayList<String> items = new ArrayList<>(); HashMap<String, Integer> counts = new HashMap<>(); Box inner; int[] nums; long big = 1L << 40; char c = 'q'; boolean on = true;
        Box add(String s) { items.add(s); sb.append(s); if (counts.containsKey(s)) { counts.put(s, counts.get(s) + 1); } else { counts.put(s, 1); } return this; }
        int size() { return items.size(); }
        String note(String what, int v) { text = (text == null ? "" : text) + what; return what + v; } }`,
    methods: J`String log = "";
      int say(String s, int v) { log += s; return v; }
      Box none() { log += "T"; return null; }
      String fields() { Box b = new Box(); b.add("a").add("b").add("a"); b.inner = new Box(); b.inner.add("z"); b.nums = new int[] {4, 5}; b.nums[1] += 3; return b.boxed + " " + b.ratio + " " + b.text + " " + b.sb + b.items + b.counts + b.size() + b.inner.items + (b.inner.inner == null) + b.nums[1] + b.big + b.c + b.on; }
      String unbox(int which) { Box b = new Box(); if (which == 0) { int n = b.boxed; return "" + n; } if (which == 1) { b.boxed++; } if (which == 2) { b.boxed += 1; } if (which == 3) { b.boxed = 4; b.boxed++; b.boxed += 2; b.ratio /= 2; } return b.boxed + " " + b.ratio; }
      String callOnNull() { log = ""; try2(); return log; }
      void try2() { none().note("x", say("A", 1)); }
      String assignOnNull() { log = ""; try3(); return log; }
      void try3() { none().big = say("A", 1); }
      String compoundOnNull() { log = ""; try4(); return log; }
      void try4() { none().big += say("A", 1); }
      String logged() { return log; }
      String args() { Box b = new Box(); return b.note("a", say("1", 1)) + b.note("b", say("2", 2)) + b.text + log; }`,
    calls: ['fields()', 'unbox(0)', 'unbox(1)', 'unbox(2)', 'unbox(3)', 'callOnNull()', 'logged()', 'assignOnNull()', 'logged()', 'compoundOnNull()', 'logged()', 'args()'],
  },
};

/**
 * Whole problems, of the kind this is for: a correct answer, and the wrong
 * answers students actually write. A wrong answer must be wrong in exactly the
 * way Java makes it wrong.
 */
export const PROBLEMS = {
  'sum of two, doubled when equal': {
    methods: J`
      int right(int a, int b) { int sum = a + b; if (a == b) { sum = sum * 2; } return sum; }
      int wrong(int a, int b) { int sum = a + b; if (a == b) sum = sum + 2; return sum; }
    `,
    calls: ['right(1, 2)', 'right(3, 3)', 'wrong(3, 3)'],
  },
  'near a hundred': {
    methods: J`boolean right(int n) { return Math.abs(100 - n) <= 10 || Math.abs(200 - n) <= 10; } boolean wrong(int n) { return n >= 90 && n <= 110 || n >= 190 && n < 210; }`,
    calls: ['right(93)', 'right(89)', 'right(210)', 'wrong(210)', 'wrong(190)', 'right(-5)'],
  },
  'front and back of a string': {
    methods: J`
      String frontBack(String s) { if (s.length() <= 1) return s; return s.charAt(s.length() - 1) + s.substring(1, s.length() - 1) + s.charAt(0); }
      String wrongFrontBack(String s) { return s.charAt(s.length() - 1) + s.substring(1, s.length() - 1) + s.charAt(0); }
      String charsFirst(String s) { return s.charAt(0) + s.charAt(1) + s.substring(2); }
      String missingChar(String s, int n) { return s.substring(0, n) + s.substring(n + 1); }
      String front3(String s) { String f = s.length() >= 3 ? s.substring(0, 3) : s; return f + f + f; }
      String everyOther(String s) { String out = ""; for (int i = 0; i < s.length(); i += 2) out += s.charAt(i); return out; }
    `,
    calls: ['frontBack("code")', 'frontBack("a")', 'frontBack("ab")', 'frontBack("")', 'wrongFrontBack("a")', 'wrongFrontBack("")', 'charsFirst("hello")', 'charsFirst("h")', 'missingChar("kitten", 1)', 'missingChar("kitten", 6)', 'front3("Java")', 'front3("ab")', 'everyOther("Hello")'],
  },
  'counting in a string': {
    methods: J`
      int countChar(String s, char c) { int n = 0; for (int i = 0; i < s.length(); i++) if (s.charAt(i) == c) n++; return n; }
      int offByOne(String s, char c) { int n = 0; for (int i = 0; i <= s.length(); i++) if (s.charAt(i) == c) n++; return n; }
      int countWord(String s, String w) { int n = 0; for (int i = 0; i + w.length() <= s.length(); i++) if (s.substring(i, i + w.length()).equals(w)) n++; return n; }
      int vowels(String s) { int n = 0; for (char c : s.toLowerCase().toCharArray()) if ("aeiou".indexOf(c) >= 0) n++; return n; }
      boolean isPalindrome(String s) { for (int i = 0, j = s.length() - 1; i < j; i++, j--) if (s.charAt(i) != s.charAt(j)) return false; return true; }
      String doubleChars(String s) { String out = ""; for (int i = 0; i < s.length(); i++) { out = out + s.charAt(i) + s.charAt(i); } return out; }
      String doubleCharsWrong(String s) { String out = ""; for (int i = 0; i < s.length(); i++) { out += s.charAt(i) + s.charAt(i); } return out; }
      int digitSum(String s) { int t = 0; for (int i = 0; i < s.length(); i++) if (Character.isDigit(s.charAt(i))) t += s.charAt(i) - '0'; return t; }
      int digitSumWrong(String s) { int t = 0; for (int i = 0; i < s.length(); i++) if (Character.isDigit(s.charAt(i))) t += s.charAt(i); return t; }
      String caesar(String s, int k) { String out = ""; for (char c : s.toCharArray()) { if (Character.isLowerCase(c)) out += (char) ((c - 'a' + k) % 26 + 'a'); else out += c; } return out; }
      String caesarWrong(String s, int k) { String out = ""; for (char c : s.toCharArray()) { out += (c - 'a' + k) % 26 + 'a'; } return out; }
      String capitalize(String s) { if (s.isEmpty()) return s; return Character.toUpperCase(s.charAt(0)) + s.substring(1); }
      String capitalizeWrong(String s) { return s.substring(0, 1).toUpperCase() + s.substring(1); }
      String acronym(String s) { String out = ""; for (String w : s.split(" ")) if (!w.isEmpty()) out += Character.toUpperCase(w.charAt(0)); return out; }
      int wordCount(String s) { if (s.trim().isEmpty()) return 0; return s.trim().split(" ").length; }
    `,
    calls: ['countChar("banana", \'a\')', 'offByOne("banana", \'a\')', 'countWord("hi hi hip", "hi")', 'vowels("Education")', 'isPalindrome("racecar")', 'isPalindrome("ab")', 'isPalindrome("")', 'doubleChars("abc")', 'doubleCharsWrong("abc")',
      'digitSum("a1b22")', 'digitSumWrong("a1b22")', 'caesar("abc xyz", 3)', 'caesarWrong("ab", 1)', 'capitalize("java")', 'capitalize("")', 'capitalizeWrong("java")', 'capitalizeWrong("")', 'acronym("portable network graphics")', 'acronym("  two  spaces ")', 'wordCount("a b c")', 'wordCount("  ")', 'wordCount("a  b")'],
  },
  'arrays: the standard exercises': {
    methods: J`
      int max(int[] xs) { int m = xs[0]; for (int x : xs) if (x > m) m = x; return m; }
      int maxWrong(int[] xs) { int m = 0; for (int x : xs) if (x > m) m = x; return m; }
      double average(int[] xs) { int t = 0; for (int x : xs) t += x; return (double) t / xs.length; }
      double averageWrong(int[] xs) { int t = 0; for (int x : xs) t += x; return t / xs.length; }
      int[] reversed(int[] xs) { int[] out = new int[xs.length]; for (int i = 0; i < xs.length; i++) out[i] = xs[xs.length - 1 - i]; return out; }
      int[] reverseInPlaceWrong(int[] xs) { for (int i = 0; i < xs.length; i++) { int t = xs[i]; xs[i] = xs[xs.length - 1 - i]; xs[xs.length - 1 - i] = t; } return xs; }
      boolean contains(int[] xs, int v) { for (int x : xs) if (x == v) return true; return false; }
      int[] rotateLeft(int[] xs) { if (xs.length == 0) return xs; int first = xs[0]; for (int i = 0; i < xs.length - 1; i++) xs[i] = xs[i + 1]; xs[xs.length - 1] = first; return xs; }
      int[] rotateWrong(int[] xs) { for (int i = 0; i < xs.length; i++) xs[i] = xs[i + 1]; return xs; }
      int countEvens(int[] xs) { int c = 0; for (int x : xs) if (x % 2 == 0) c++; return c; }
      boolean isSorted(int[] xs) { for (int i = 1; i < xs.length; i++) if (xs[i - 1] > xs[i]) return false; return true; }
      int[] bubble(int[] xs) { for (int i = 0; i < xs.length; i++) for (int j = 0; j + 1 < xs.length - i; j++) if (xs[j] > xs[j + 1]) { int t = xs[j]; xs[j] = xs[j + 1]; xs[j + 1] = t; } return xs; }
      int[] prefixSums(int[] xs) { int[] out = new int[xs.length]; int run = 0; for (int i = 0; i < xs.length; i++) { run += xs[i]; out[i] = run; } return out; }
      int secondLargest(int[] xs) { int a = Integer.MIN_VALUE, b = Integer.MIN_VALUE; for (int x : xs) { if (x > a) { b = a; a = x; } else if (x > b) b = x; } return b; }
      String[] upper(String[] ws) { String[] out = new String[ws.length]; for (int i = 0; i < ws.length; i++) out[i] = ws[i].toUpperCase(); return out; }
      int longest(String[] ws) { int best = 0; for (String w : ws) best = Math.max(best, w.length()); return best; }
      boolean[] sieve(int n) { boolean[] composite = new boolean[n + 1]; for (int i = 2; i * i <= n; i++) if (!composite[i]) for (int j = i * i; j <= n; j += i) composite[j] = true; return composite; }
      int[] merge(int[] a, int[] b) { int[] out = new int[a.length + b.length]; int i = 0, j = 0, k = 0; while (i < a.length && j < b.length) out[k++] = a[i] <= b[j] ? a[i++] : b[j++]; while (i < a.length) out[k++] = a[i++]; while (j < b.length) out[k++] = b[j++]; return out; }
      int[] histogram(String s) { int[] counts = new int[26]; for (char c : s.toCharArray()) if (c >= 'a' && c <= 'z') counts[c - 'a']++; return counts; }
      int[][] transpose(int[][] m) { int[][] t = new int[m[0].length][m.length]; for (int r = 0; r < m.length; r++) for (int c = 0; c < m[0].length; c++) t[c][r] = m[r][c]; return t; }
      double[] scale(double[] ds, double k) { double[] out = new double[ds.length]; for (int i = 0; i < ds.length; i++) out[i] = ds[i] * k; return out; }
    `,
    calls: ['max(new int[] {3, 9, 2})', 'max(new int[] {-3, -9})', 'maxWrong(new int[] {-3, -9})', 'max(new int[0])', 'average(new int[] {1, 2})', 'averageWrong(new int[] {1, 2})', 'average(new int[0])', 'averageWrong(new int[0])',
      'reversed(new int[] {1, 2, 3})', 'reverseInPlaceWrong(new int[] {1, 2, 3})', 'contains(new int[] {1, 2}, 2)', 'contains(new int[0], 2)', 'rotateLeft(new int[] {1, 2, 3})', 'rotateLeft(new int[0])', 'rotateWrong(new int[] {1, 2, 3})',
      'countEvens(new int[] {2, 1, 2, 3, 4, -2, -3, 0})', 'isSorted(new int[] {1, 2, 2, 3})', 'isSorted(new int[] {2, 1})', 'bubble(new int[] {5, 2, 9, 1, 5, 6})', 'prefixSums(new int[] {1, 2, 3, 4})', 'secondLargest(new int[] {4, 9, 7})', 'secondLargest(new int[] {4})',
      'upper(new String[] {"a", "bc"})', 'upper(new String[] {"a", null})', 'longest(new String[] {"a", "abc", "ab"})', 'sieve(20)', 'merge(new int[] {1, 4, 9}, new int[] {2, 3, 10, 11})', 'histogram("hello world")',
      'transpose(new int[][] {{1, 2, 3}, {4, 5, 6}})', 'transpose(new int[0][0])', 'scale(new double[] {1.5, 2, 0.1}, 3)'],
  },
  'numbers: the standard exercises': {
    methods: J`
      boolean isPrime(int n) { if (n < 2) return false; for (int i = 2; i * i <= n; i++) if (n % i == 0) return false; return true; }
      int reverseDigits(int n) { int r = 0; while (n != 0) { r = r * 10 + n % 10; n /= 10; } return r; }
      int collatz(int n) { int steps = 0; while (n != 1) { n = n % 2 == 0 ? n / 2 : 3 * n + 1; steps++; } return steps; }
      String fizz(int n) { if (n % 15 == 0) return "FizzBuzz"; if (n % 3 == 0) return "Fizz"; if (n % 5 == 0) return "Buzz"; return String.valueOf(n); }
      String fizzWrong(int n) { if (n % 3 == 0) return "Fizz"; if (n % 5 == 0) return "Buzz"; if (n % 15 == 0) return "FizzBuzz"; return "" + n; }
      double celsius(double f) { return (f - 32) * 5 / 9; }
      double celsiusWrong(double f) { return (f - 32) * (5 / 9); }
      int celsiusInt(int f) { return (f - 32) * 5 / 9; }
      boolean leap(int y) { return y % 4 == 0 && (y % 100 != 0 || y % 400 == 0); }
      String binary(int n) { if (n == 0) return "0"; String s = ""; while (n > 0) { s = n % 2 + s; n /= 2; } return s; }
      int lcm(int a, int b) { int g = a; int h = b; while (h != 0) { int t = g % h; g = h; h = t; } return a / g * b; }
      double compound(double p, double rate, int years) { for (int i = 0; i < years; i++) p *= 1 + rate; return p; }
      double roundTo2(double d) { return Math.round(d * 100) / 100.0; }
      long roundWrong(double d) { return Math.round(d * 100) / 100; }
      int midpoint(int lo, int hi) { return (lo + hi) / 2; }
      int safeMidpoint(int lo, int hi) { return lo + (hi - lo) / 2; }
      boolean closeEnough(double a, double b) { return Math.abs(a - b) < 1e-9; }
      boolean equalDoubles() { return 0.1 + 0.2 == 0.3; }
      int percent(int part, int whole) { return part / whole * 100; }
      int percentRight(int part, int whole) { return part * 100 / whole; }
      String grade(int score) { if (score >= 90) return "A"; else if (score >= 80) return "B"; else if (score >= 70) return "C"; return "F"; }
      int hypot(int a, int b) { return (int) Math.sqrt(a * a + b * b); }
      boolean isSquare(int n) { int r = (int) Math.sqrt(n); return r * r == n; }
      int digits(int n) { return String.valueOf(Math.abs(n)).length(); }
      int parseSum(String a, String b) { return Integer.parseInt(a) + Integer.parseInt(b); }
      String timeOf(int minutes) { int h = minutes / 60; int m = minutes % 60; return h + ":" + (m < 10 ? "0" : "") + m; }
      char letterGrade(double avg) { return avg >= 89.5 ? 'A' : avg >= 79.5 ? 'B' : 'C'; }
      double bmi(double kg, double m) { return kg / (m * m); }
      int sumOfSquares(int n) { int t = 0; for (int i = 1; i <= n; i++) t += i * i; return t; }
      long sumOfSquaresLong(int n) { long t = 0; for (int i = 1; i <= n; i++) t += (long) i * i; return t; }
    `,
    calls: ['isPrime(1)', 'isPrime(2)', 'isPrime(97)', 'isPrime(91)', 'isPrime(7919)', 'reverseDigits(12345)', 'reverseDigits(-120)', 'reverseDigits(1999999999)', 'collatz(27)', 'fizz(15)', 'fizz(9)', 'fizz(7)', 'fizzWrong(15)',
      'celsius(212)', 'celsius(98.6)', 'celsiusWrong(212)', 'celsiusInt(100)', 'leap(1900)', 'leap(2000)', 'leap(2024)', 'binary(10)', 'binary(0)', 'lcm(4, 6)', 'lcm(5, 0)', 'compound(1000, 0.05, 10)', 'roundTo2(3.14159)', 'roundTo2(2.675)', 'roundTo2(-1.005)', 'roundWrong(3.14159)',
      'midpoint(2000000000, 2100000000)', 'safeMidpoint(2000000000, 2100000000)', 'closeEnough(0.1 + 0.2, 0.3)', 'equalDoubles()', 'percent(1, 4)', 'percentRight(1, 4)', 'percent(1, 0)', 'grade(85)', 'grade(12)', 'hypot(3, 4)', 'hypot(50000, 50000)', 'isSquare(49)', 'isSquare(50)', 'isSquare(-4)',
      'digits(-1234)', 'digits(Integer.MIN_VALUE)', 'parseSum("12", "30")', 'parseSum("12", "3 0")', 'timeOf(125)', 'timeOf(605)', "letterGrade(89.5)", 'letterGrade(79.49999)', 'bmi(70, 1.75)', 'sumOfSquares(2000)', 'sumOfSquaresLong(2000)'],
  },
};

/** javac refuses each of these. So must jtiny. (Each is one or more whole methods.) */
export const REJECTS = {
  // ── a method has to return
  'no return at all': J`int f(int a) { int b = a + 1; }`,
  'return only inside an if': J`int f(int a) { if (a > 0) { return 1; } }`,
  'return in if and else-if but no else': J`int f(int a) { if (a > 0) return 1; else if (a < 0) return -1; }`,
  'return only inside a loop': J`int f(int a) { for (int i = 0; i < a; i++) { return i; } }`,
  'return only inside a while with a real test': J`int f(int a) { while (a > 0) { return a; } }`,
  'a while (true) that can be broken out of': J`int f(int a) { while (true) { if (a > 0) break; a++; } }`,
  'a switch without a default': J`int f(int a) { switch (a) { case 1: return 1; case 2: return 2; } }`,
  'a switch whose last case falls out of the bottom': J`int f(int a) { switch (a) { case 1: return 1; default: a++; } }`,
  'an arrow switch with a case that does not return': J`int f(int a) { switch (a) { case 1 -> { return 1; } default -> a++; } }`,
  'a true that is only a variable': J`int f(int a) { boolean t = true; while (t) { if (a > 5) return a; a++; } }`,
  'printing instead of returning': J`int f(int a) { System.out.println(a + 1); }`,
  'do-while with a real test': J`int f(int a) { do { if (a > 5) return a; a++; } while (a < 100); }`,
  'if (true) is still an if': J`int f(int a) { if (true) { return 1; } }`,
  'for with a test': J`int f(int a) { for (int i = 0; i < 10; i++) { if (i == a) return i; } }`,
  // ── lines that can never run
  'a statement after return': J`int f(int a) { return a; a++; }`,
  'a statement after break': J`int f(int a) { while (a > 0) { break; a--; } return a; }`,
  'a statement after continue': J`int f(int a) { for (int i = 0; i < a; i++) { continue; a--; } return a; }`,
  'a statement after an endless loop': J`int f(int a) { while (true) { a++; } return a; }`,
  'a statement after for (;;)': J`int f(int a) { for (;;) { a++; } return a; }`,
  'a statement after throw': J`int f(int a) { throw new IllegalStateException(); return a; }`,
  'a statement after an if whose both arms return': J`int f(int a) { if (a > 0) return 1; else return 2; return 3; }`,
  'the body of while (false)': J`int f(int a) { while (false) { a++; } return a; }`,
  'the body of a for whose test is false': J`int f(int a) { for (int i = 0; false; i++) { a++; } return a; }`,
  'a second return': J`int f(int a) { return a; return a + 1; }`,
  'a statement after a switch that always returns': J`int f(int a) { switch (a) { case 1: return 1; default: return 2; } return 3; }`,
  'a statement after a break in a switch case': J`int f(int a) { switch (a) { case 1: break; a++; default: a--; } return a; }`,
  'a statement after do { } while (true)': J`int f(int a) { do { a++; } while (true); return a; }`,
  'code after a return inside a block': J`int f(int a) { { return a; } a++; }`,
  // ── a variable has to have a value
  'reading a variable that was never given a value': J`int f() { int x; return x; }`,
  'a value given only inside an if': J`int f(int a) { int x; if (a > 0) x = 1; return x; }`,
  'a value given only inside a loop': J`int f(int a) { int x; for (int i = 0; i < a; i++) x = i; return x; }`,
  'a value given only inside a while': J`int f(int a) { int x; while (a > 0) { x = a; a--; } return x; }`,
  'incrementing a variable with no value': J`int f() { int x; x++; return x; }`,
  'adding to a variable with no value': J`int f() { int x; x += 1; return x; }`,
  'a variable used in its own starting value': J`int f() { int x = x + 1; return x; }`,
  'a value given in only some cases of a switch': J`int f(int a) { int x; switch (a) { case 1: x = 1; break; case 2: x = 2; break; } return x; }`,
  'a value given on the right of &&, read when the && is false': J`int f(int a) { int x; if (a > 0 && (x = a) > 0) return 1; return x; }`,
  'a value given on the right of ||, read when the || is true': J`int f(int a) { int x; if (a > 0 || (x = a) > 0) return x; return 0; }`,
  'an array that was never made': J`int f() { int[] xs; xs[0] = 1; return 0; }`,
  'a String that was never given a value': J`String f() { String s; s += "a"; return s; }`,
  'a value given in one arm of ? : only': J`int f(boolean b) { int x; int y = b ? (x = 1) : 2; return x; }`,
  'a value given in an arrow switch with no default': J`int f(int a) { int x; switch (a) { case 1 -> x = 1; case 2 -> x = 2; } return x; }`,
  'a value given only when a case falls through': J`int f(int a) { int x; switch (a) { case 1: x = 1; default: return x; } }`,
  // ── types
  'a double into an int': J`int f(double d) { int x = d; return x; }`,
  'returning a double from an int method': J`int f(int a) { return a / 2.0; }`,
  'a long into an int': J`int f(long n) { int x = n; return x; }`,
  'returning Math.round as an int': J`int f(double d) { return Math.round(d); }`,
  'returning Math.pow as an int': J`int f(int a) { return Math.pow(a, 2); }`,
  'returning Math.sqrt as an int': J`int f(int a) { return Math.sqrt(a); }`,
  'an int into a char without a cast': J`char f(int n) { char c = n; return c; }`,
  'char plus one back into a char': J`char f(char c) { c = c + 1; return c; }`,
  'a constant too large for a char': J`char f() { char c = 70000; return c; }`,
  'a negative constant into a char': J`char f() { char c = -1; return c; }`,
  'an int into a String': J`String f(int n) { String s = n; return s; }`,
  'a char into a String': J`String f(char c) { String s = c; return s; }`,
  'returning a char from a String method': J`String f(String s) { return s.charAt(0); }`,
  'a String into an int': J`int f(String s) { int n = s; return n; }`,
  'a String into a char': J`char f(String s) { char c = s; return c; }`,
  'a one-letter String literal into a char': J`char f() { char c = "a"; return c; }`,
  'a boolean into an int': J`int f(boolean b) { int n = b; return n; }`,
  'an int used as an if test': J`int f(int a) { if (a) return 1; return 0; }`,
  'assignment used as an if test': J`int f(int a) { if (a = 5) return 1; return 0; }`,
  'an int used as a while test': J`int f(int a) { while (a) a--; return a; }`,
  'not on an int': J`boolean f(int a) { return !a; }`,
  'and between two ints': J`boolean f(int a, int b) { return a && b; }`,
  'minus on a String': J`String f(String s) { return s - 1; }`,
  'times on a String': J`String f(String s) { return s * 2; }`,
  'less-than between Strings': J`boolean f(String a, String b) { return a < b; }`,
  'a chained comparison': J`boolean f(int a) { return 1 < a < 10; }`,
  'comparing a String with a char': J`boolean f(String s) { return s == 'a'; }`,
  'comparing a String with an int': J`boolean f(String s) { return s == 5; }`,
  'comparing an int with a boolean': J`boolean f(int a) { return a == true; }`,
  'comparing an int with null': J`boolean f(int a) { return a == null; }`,
  'null into an int': J`int f() { int n = null; return n; }`,
  'casting a String to an int': J`int f(String s) { return (int) s; }`,
  'casting a boolean to an int': J`int f(boolean b) { return (int) b; }`,
  'casting an int to a boolean': J`boolean f(int n) { return (boolean) n; }`,
  'a method on an int': J`int f(int a) { return a.length(); }`,
  'equals on a char': J`boolean f(char c) { return c.equals('a'); }`,
  'length without parentheses on a String': J`int f(String s) { return s.length; }`,
  'length with parentheses on an array': J`int f(int[] xs) { return xs.length(); }`,
  'size on an array': J`int f(int[] xs) { return xs.size(); }`,
  'indexing a String': J`char f(String s) { return s[0]; }`,
  'a double as an array index': J`int f(int[] xs, double d) { return xs[d]; }`,
  'a long as an array index': J`int f(int[] xs, long n) { return xs[n]; }`,
  'a double as an array size': J`int[] f(double d) { return new int[d]; }`,
  'a String in an int array': J`int[] f() { int[] xs = {1, "2"}; return xs; }`,
  'a double in an int array': J`int[] f() { int[] xs = {1, 2.5}; return xs; }`,
  'an int array into a double array': J`double[] f(int[] xs) { double[] ds = xs; return ds; }`,
  'an int into an int array': J`int[] f() { int[] xs = 5; return xs; }`,
  'braces for a variable that is not an array': J`int f() { int x = {1, 2}; return x; }`,
  'braces as a later assignment': J`int[] f() { int[] xs; xs = {1, 2}; return xs; }`,
  'a void method used as a value': J`void g() { } int f() { int x = g(); return x; }`,
  'returning a value from a void method': J`void f(int a) { return a; }`,
  'return with no value in an int method': J`int f(int a) { return; }`,
  'the wrong number of arguments': J`int g(int a) { return a; } int f() { return g(1, 2); }`,
  'the wrong type of argument': J`int g(int a) { return a; } int f() { return g("1"); }`,
  'a double argument to an int parameter': J`int g(int a) { return a; } int f() { return g(1.5); }`,
  'a constant int argument to a char parameter': J`int g(char c) { return c; } int f() { return g(65); }`,
  'charAt given a String': J`char f(String s) { return s.charAt("0"); }`,
  'substring given a double': J`String f(String s) { return s.substring(1.0); }`,
  'Integer.parseInt given an int': J`int f(int n) { return Integer.parseInt(n); }`,
  'Math.max given a String': J`int f(String s) { return Math.max(s, 1); }`,
  'ternary arms of unrelated types into an int': J`int f(boolean b) { int x = b ? 1 : "two"; return x; }`,
  'a for-each over an int': J`int f(int n) { int t = 0; for (int x : n) t += x; return t; }`,
  'a for-each over a String': J`int f(String s) { int t = 0; for (char c : s) t += c; return t; }`,
  'a for-each variable of the wrong type': J`int f(double[] ds) { int t = 0; for (int d : ds) t += d; return t; }`,
  'a switch on a double': J`int f(double d) { switch (d) { case 1.0: return 1; default: return 0; } }`,
  'a switch on a boolean': J`int f(boolean b) { switch (b) { case true: return 1; default: return 0; } }`,
  'a switch on a long': J`int f(long n) { switch (n) { case 1: return 1; default: return 0; } }`,
  'a case that is not a constant': J`int f(int a, int b) { switch (a) { case b: return 1; default: return 0; } }`,
  'two cases with the same value': J`int f(int a) { switch (a) { case 1: return 1; case 1: return 2; default: return 0; } }`,
  'two cases the same once worked out': J`int f(int a) { switch (a) { case 97: return 1; case 'a': return 2; default: return 0; } }`,
  'a String case in an int switch': J`int f(int a) { switch (a) { case "1": return 1; default: return 0; } }`,
  'an int case in a String switch': J`int f(String s) { switch (s) { case 1: return 1; default: return 0; } }`,
  'a case too large for a char switch': J`int f(char c) { switch (c) { case 70000: return 1; default: return 0; } }`,
  'two defaults': J`int f(int a) { switch (a) { default: return 1; default: return 0; } }`,
  'a value switch with no default': J`int f(int a) { return switch (a) { case 1 -> 10; case 2 -> 20; }; }`,
  'mixing arrows and colons': J`int f(int a) { switch (a) { case 1 -> a++; case 2: a--; } return a; }`,
  'a value switch arm that ends without a value': J`int f(int a) { return switch (a) { case 1 -> { a++; } default -> 0; }; }`,
  'return inside a value switch': J`int f(int a) { return switch (a) { case 1 -> { return 5; } default -> 0; }; }`,
  'break out of a value switch': J`int f(int a) { while (true) { int x = switch (a) { case 1 -> { break; } default -> 0; }; return x; } }`,
  'bit-and between an int and a boolean': J`boolean f(int a, boolean b) { return a & b; }`,
  'shift on a double': J`double f(double d) { return d << 1; }`,
  'increment on a boolean': J`boolean f(boolean b) { b++; return b; }`,
  'increment on a String': J`String f(String s) { s++; return s; }`,
  'plus-equals a String onto an int': J`int f(int a) { a += "1"; return a; }`,
  'minus-equals on a String': J`String f(String s) { s -= "a"; return s; }`,
  'negating a boolean with minus': J`boolean f(boolean b) { return -b; }`,
  'negating a String': J`String f(String s) { return -s; }`,
  'tilde on a double': J`double f(double d) { return ~d; }`,
  'a StringBuilder into a String': J`String f() { StringBuilder sb = new StringBuilder(); return sb; }`,
  'a String into a StringBuilder': J`StringBuilder f() { StringBuilder sb = "x"; return sb; }`,
  'comparing a String with a StringBuilder': J`boolean f(String s, StringBuilder sb) { return s == sb; }`,
  'comparing arrays of different types': J`boolean f(int[] a, double[] b) { return a == b; }`,
  'var with no starting value': J`int f() { var x; x = 1; return x; }`,
  'var from null': J`int f() { var x = null; return 0; }`,
  'var from braces': J`int f() { var xs = {1, 2}; return 0; }`,
  'the length of an array assigned to': J`int f(int[] xs) { xs.length = 3; return 0; }`,
  'a long literal with no L': J`long f() { return 3000000000; }`,
  'an int literal one past the largest': J`int f() { return 2147483648; }`,
  'the largest negative written with parentheses': J`int f() { return -(2147483648); }`,
  'an octal literal with an 8': J`int f() { return 08; }`,
  'Math.round result into an int variable': J`int f(double d) { int r = Math.round(d * 10); return r; }`,
  'a long sum into an int': J`int f(int a, long b) { int c = a + b; return c; }`,
  'int times double into an int': J`int f(int a) { int c = a * 1.5; return c; }`,
  // ── names
  'a variable that does not exist': J`int f(int a) { return b; }`,
  'a variable used before it is declared': J`int f() { x = 5; int x; return x; }`,
  'a variable used outside its braces': J`int f(int a) { if (a > 0) { int b = 1; } return b; }`,
  'a loop variable used after the loop': J`int f() { for (int i = 0; i < 3; i++) { } return i; }`,
  'a for-each variable used after the loop': J`int f(int[] xs) { for (int x : xs) { } return x; }`,
  'a variable declared twice': J`int f() { int x = 1; int x = 2; return x; }`,
  'a variable with the name of a parameter': J`int f(int a) { int a = 2; return a; }`,
  'a loop variable with the name of a variable': J`int f() { int i = 0; for (int i = 0; i < 3; i++) { } return i; }`,
  'a variable redeclared in an inner block': J`int f() { int x = 1; { int x = 2; } return x; }`,
  'a for-each variable with the name of a parameter': J`int f(int[] xs, int x) { for (int x : xs) { } return 0; }`,
  'two parameters with the same name': J`int f(int a, int a) { return a; }`,
  'a method that does not exist': J`int f(int a) { return g(a); }`,
  'a method with the wrong capital letter': J`int helper(int a) { return a; } int f(int a) { return Helper(a); }`,
  'a variable with the wrong capital letter': J`int f(int count) { return Count; }`,
  'the same method twice': J`int f(int a) { return a; } int f(int a) { return a + 1; }`,
  'two methods that differ only in their return type': J`int f(int a) { return a; } double f(int a) { return a; }`,
  'two methods that differ only in their parameter names': J`int f(int a) { return a; } int f(int b) { return b; }`,
  'two methods that differ only in static': J`int f(int a) { return a; } static int f(int a) { return a; }`,
  'an overloaded call that fits two methods equally': J`int g(int a, double b) { return 1; } int g(double a, int b) { return 2; } int f() { return g(1, 1); }`,
  'an overloaded call that fits none': J`int g(int a) { return 1; } int g(String a) { return 2; } int f() { return g(1.5); }`,
  'an overloaded call with the wrong number of arguments': J`int g(int a) { return 1; } int g(int a, int b) { return 2; } int f() { return g(); }`,
  'null passed where two overloads take objects': J`int g(String a) { return 1; } int g(int[] a) { return 2; } int f() { return g(null); }`,
  'an overload chosen for its argument, then misused': J`int g(int a) { return 1; } String g(String a) { return a; } int f() { return g("x"); }`,
  'a String method that does not exist': J`int f(String s) { return s.size(); }`,
  'string with a small s': J`string f() { return "a"; }`,
  'a declaration as the body of an if': J`int f(int a) { if (a > 0) int b = 1; return a; }`,
  'assigning to a final variable': J`int f() { final int x = 1; x = 2; return x; }`,
  'incrementing a final variable': J`int f() { final int x = 1; x++; return x; }`,
  'assigning to a final parameter': J`int f(final int a) { a = 2; return a; }`,
  'a static method calling one that is not': J`int g() { return 1; } static int f() { return g(); }`,
  'a switch variable used after the switch': J`int f(int a) { switch (a) { case 1: int x = 1; break; } return x; }`,
  // ── statements and punctuation
  'a missing semicolon': J`int f(int a) { int b = a + 1 return b; }`,
  'a missing semicolon after return': J`int f(int a) { return a }`,
  'a value on a line by itself': J`int f(int a) { a + 1; return a; }`,
  'a comparison on a line by itself': J`int f(int a) { a == 1; return a; }`,
  'a variable on a line by itself': J`int f(int a) { a; return a; }`,
  'a parenthesised assignment as a statement': J`int f(int a) { (a = 1); return a; }`,
  'an unclosed brace': J`int f(int a) { if (a > 0) { return 1; return 0; }`,
  'an extra closing brace': J`int f(int a) { return a; } }`,
  'an unclosed parenthesis': J`int f(int a) { return (a + 1; }`,
  'an unclosed string': 'int f() { String s = "abc; return 0; }',
  'a string across two lines': 'String f() { return "ab\ncd"; }',
  'an empty char': "char f() { return ''; }",
  'a char with two letters': "char f() { return 'ab'; }",
  'an unknown escape': J`String f() { return "a\qb"; }`,
  'else without an if': J`int f(int a) { else { a++; } return a; }`,
  'break outside a loop': J`int f(int a) { break; }`,
  'continue outside a loop': J`int f(int a) { continue; }`,
  'continue in a switch that is not in a loop': J`int f(int a) { switch (a) { case 1: continue; } return a; }`,
  'case outside a switch': J`int f(int a) { case 1: return a; }`,
  'for with commas': J`int f(int a) { for (int i = 0, i < a, i++) { } return a; }`,
  'for with two parts': J`int f(int a) { for (int i = 0; i < a) { } return a; }`,
  'while with no test': J`int f(int a) { while () { } return a; }`,
  'if with no parentheses': J`int f(int a) { if a > 0 { return 1; } return 0; }`,
  'then': J`int f(int a) { if (a > 0) then return 1; return 0; }`,
  'elif': J`int f(int a) { if (a > 0) return 1; elif (a < 0) return -1; return 0; }`,
  'and spelled out': J`boolean f(int a) { return a > 0 and a < 5; }`,
  'not-equal spelled <>': J`boolean f(int a) { return a <> 5; }`,
  'three equals signs': J`boolean f(int a) { return a === 5; }`,
  'a power operator': J`int f(int a) { return a ** 2; }`,
  'a keyword as a variable name': J`int f() { int class = 1; return class; }`,
  'a name starting with a digit': J`int f() { int 2x = 1; return 2x; }`,
  'assigning to a number': J`int f(int a) { 5 = a; return a; }`,
  'assigning to a sum': J`int f(int a, int b) { a + b = 5; return a; }`,
  'assigning to a method call': J`int g() { return 1; } int f() { g() = 5; return 0; }`,
  'incrementing a number': J`int f() { return 5++; }`,
  'incrementing an increment': J`int f(int a) { return a++ ++; }`,
  'a single-quoted string': J`String f() { return 'hello'; }`,
  'do without while': J`int f(int a) { do { a++; } return a; }`,
  'do-while with no semicolon': J`int f(int a) { do { a++; } while (a < 5) return a; }`,
  'an empty array index': J`int f(int[] xs) { return xs[]; }`,
  'new array with size and values': J`int[] f() { return new int[2] {1, 2}; }`,
  'new array with neither': J`int[] f() { return new int[]; }`,
  'a method inside a method': J`int f(int a) { int g(int b) { return b; } return g(a); }`,
  'a return type missing': J`f(int a) { return a; }`,
  'a parameter with no type': J`int f(a) { return a; }`,
  'yield outside a switch': J`int f(int a) { yield a; }`,
  'an unfinished expression': J`int f(int a) { return a + ; }`,
  'two operators in a row': J`int f(int a) { return a * / 2; }`,
  'a ternary with no else part': J`int f(int a) { return a > 0 ? 1; }`,
  'a comment that never ends': J`int f(int a) { /* oops return a; }`,
  'a hash comment': 'int f(int a) {\n  # add one\n  return a + 1;\n}',
  'a semicolon after the method line': J`int f(int a); { return a; }`,
  'a missing closing parenthesis on a call': J`int f(String s) { return s.length(; }`,
  'a dot with nothing after it': J`int f(String s) { return s.; }`,
  'an else after two statements without braces': J`int f(int a) { if (a > 0) a++; a--; else a = 0; return a; }`,
  'throwing something that is not an exception': J`int f() { throw new String("x"); }`,
  'throwing a checked exception without declaring it': J`int f() { throw new Exception("x"); }`,
  'underscore as a number edge': J`int f() { return 1_; }`,
  'a float literal into a double is fine but an int from it is not': J`int f() { int x = 1.5f; return x; }`,
  // ── wrappers: Java boxes a primitive into its own wrapper and no other
  'an int into a Double': J`Double f() { Double d = 5; return d; }`,
  'an int into a Long': J`Long f() { Long n = 5; return n; }`,
  'a long into an Integer': J`Integer f() { Integer n = 5L; return n; }`,
  'a char into an Integer': J`Integer f() { Integer n = 'a'; return n; }`,
  'an int variable into a Character': J`Character f(int a) { Character c = a; return c; }`,
  'a constant too big for a Character': J`Character f() { Character c = 70000; return c; }`,
  'a Double into an int': J`int f(Double d) { int i = d; return i; }`,
  'a Double cast straight to int': J`int f(Double d) { return (int) d; }`,
  'an Integer cast to char': J`char f(Integer n) { return (char) n; }`,
  'an Integer into a boolean': J`boolean f(Integer n) { boolean b = n; return b; }`,
  'an Integer as a condition': J`int f(Integer n) { if (n) return 1; return 0; }`,
  'text into an Integer': J`Integer f() { Integer n = "5"; return n; }`,
  'null into an int': J`int f() { int n = null; return n; }`,
  'returning null as an int': J`int f() { return null; }`,
  'Character += 1': J`Character f(Character c) { c += 1; return c; }`,
  'Integer += a double': J`Integer f(Integer n) { n += 1.5; return n; }`,
  'Integer += a long': J`Integer f(Integer n) { n += 1L; return n; }`,
  'an int argument for a Long parameter': J`long g(Long a) { return a; } long f() { return g(5); }`,
  'an Integer argument for a Double parameter': J`double g(Double a) { return a; } double f(Integer n) { return g(n); }`,
  'an int[] as an Integer[]': J`Integer[] f() { Integer[] xs = new int[2]; return xs; }`,
  'an Integer[] as an int[]': J`int[] f() { int[] xs = new Integer[2]; return xs; }`,
  'for (int x : Double[])': J`int f(Double[] ds) { int t = 0; for (int x : ds) t += x; return t; }`,
  'for (Long x : int[])': J`long f(int[] xs) { long t = 0; for (Long x : xs) t += x; return t; }`,
  'an Integer has no length()': J`int f(Integer n) { return n.length(); }`,
  '++ on a Boolean': J`Boolean f(Boolean b) { b++; return b; }`,
  'a call that fits two boxed overloads': J`int g(Integer a, long b) { return 1; } int g(long a, Integer b) { return 2; } int f() { return g(1, 2); }`,
  // ── collections: what a list may hold, and which type may stand for which
  'a list of int': J`int f() { ArrayList<int> xs = new ArrayList<>(); return xs.size(); }`,
  'a number added to a list of Strings': J`int f() { ArrayList<String> xs = new ArrayList<>(); xs.add(5); return xs.size(); }`,
  'text added to a list of Integers': J`int f() { ArrayList<Integer> xs = new ArrayList<>(); xs.add("5"); return xs.size(); }`,
  'an int added to a list of Doubles': J`int f() { ArrayList<Double> xs = new ArrayList<>(); xs.add(5); return xs.size(); }`,
  'an element taken out as the wrong type': J`int f() { ArrayList<String> xs = new ArrayList<>(); int n = xs.get(0); return n; }`,
  'square brackets on a list': J`String f() { ArrayList<String> xs = new ArrayList<>(); return xs[0]; }`,
  'length on a list': J`int f() { ArrayList<String> xs = new ArrayList<>(); return xs.length; }`,
  'a list of Strings as a list of Integers': J`int f() { ArrayList<String> xs = new ArrayList<>(); ArrayList<Integer> ys = xs; return ys.size(); }`,
  'a List stored in an ArrayList variable': J`int f() { List<String> xs = new ArrayList<>(); ArrayList<String> ys = xs; return ys.size(); }`,
  'a set stored in a list variable': J`int f() { List<String> xs = new HashSet<>(); return xs.size(); }`,
  'new List': J`int f() { List<String> xs = new List<>(); return xs.size(); }`,
  'new Map': J`int f() { Map<String, Integer> m = new Map<>(); return m.size(); }`,
  'one type for a HashMap': J`int f() { HashMap<String> m = new HashMap<>(); return m.size(); }`,
  'two types for an ArrayList': J`int f() { ArrayList<String, Integer> xs = new ArrayList<>(); return xs.size(); }`,
  'empty angle brackets on the left': J`int f() { ArrayList<> xs = new ArrayList<String>(); return xs.size(); }`,
  'the wrong loop variable for a list': J`int f() { ArrayList<String> xs = new ArrayList<>(); int t = 0; for (int x : xs) { t += x; } return t; }`,
  'a for-each over a map': J`int f() { HashMap<String, Integer> m = new HashMap<>(); int t = 0; for (String k : m) { t++; } return t; }`,
  'a wrong value type in put': J`int f() { HashMap<String, Integer> m = new HashMap<>(); m.put("a", "b"); return m.size(); }`,
  'a wrong key type in put': J`int f() { HashMap<String, Integer> m = new HashMap<>(); m.put(1, 2); return m.size(); }`,
  'a value read out as text': J`String f() { HashMap<String, Integer> m = new HashMap<>(); String s = m.get("a"); return s; }`,
  'put with one argument': J`int f() { HashMap<String, Integer> m = new HashMap<>(); m.put("a"); return m.size(); }`,
  'a copy of a list of another type': J`int f() { ArrayList<Integer> xs = new ArrayList<>(); ArrayList<String> ys = new ArrayList<>(xs); return ys.size(); }`,
  'Collections.sort on an array': J`int f(int[] xs) { Collections.sort(xs); return xs[0]; }`,
  'Collections.max on a map': J`int f() { HashMap<String, Integer> m = new HashMap<>(); return Collections.max(m); }`,
  'a list handed to a method that takes an array': J`int g(String[] xs) { return xs.length; } int f() { ArrayList<String> xs = new ArrayList<>(); return g(xs); }`,
  'an ArrayList method on a set variable': J`int f() { Set<String> s = new HashSet<>(); s.add(0, "a"); return s.size(); }`,
  'LinkedList with a capacity': J`int f() { LinkedList<String> q = new LinkedList<>(10); return q.size(); }`,
  'a list of Strings returned as a list of Integers': J`ArrayList<Integer> f() { ArrayList<String> xs = new ArrayList<>(); return xs; }`,
  'a list where an int is wanted': J`int f() { ArrayList<Integer> xs = new ArrayList<>(); return xs + 1; }`,
  'set() result used as a boolean': J`boolean f() { ArrayList<String> xs = new ArrayList<>(); xs.add("a"); return xs.set(0, "b"); }`,
  // ── classes: what belongs to an object, what is private, and what a constructor may be
  'a private field read from outside': { classes: J`class Monster { private int health; }`, methods: J`int f() { Monster m = new Monster(); return m.health; }` },
  'a private field changed from outside': { classes: J`class Monster { private int health; }`, methods: J`int f() { Monster m = new Monster(); m.health = -999; return 0; }` },
  'a private method called from outside': { classes: J`class Monster { private int secret() { return 1; } }`, methods: J`int f() { return new Monster().secret(); }` },
  'a private constructor used from outside': { classes: J`class Monster { private Monster() { } }`, methods: J`int f() { Monster m = new Monster(); return 0; }` },
  'no constructor that takes nothing, once another is written': { classes: J`class Monster { String name; Monster(String name) { this.name = name; } }`, methods: J`int f() { Monster m = new Monster(); return 0; }` },
  'a constructor given the wrong types': { classes: J`class Monster { Monster(String name, int health) { } }`, methods: J`int f() { Monster m = new Monster(30, "Goblin"); return 0; }` },
  'a constructor given too few values': { classes: J`class Monster { Monster(String name, int health) { } }`, methods: J`int f() { Monster m = new Monster("Goblin"); return 0; }` },
  'a method with no return type, and not the name of the class': { classes: J`class Monster { int health; Mosnter(int h) { health = h; } }`, methods: J`int f() { return 0; }` },
  'a constructor that returns a value': { classes: J`class Monster { int health; Monster(int h) { health = h; return h; } }`, methods: J`int f() { return 0; }` },
  'this(…) outside a constructor': { classes: J`class Monster { int health; Monster(int h) { health = h; } void reset() { this(5); } }`, methods: J`int f() { return 0; }` },
  'a constructor that calls itself': { classes: J`class Monster { Monster(int h) { this(h); } }`, methods: J`int f() { return 0; }` },
  'two constructors that call each other': { classes: J`class Monster { Monster(int h) { this(); } Monster() { this(1); } }`, methods: J`int f() { return 0; }` },
  'a field of the object used in this(…)': { classes: J`class Monster { int base; Monster(int h) { } Monster() { this(base); } }`, methods: J`int f() { return 0; }` },
  'two constructors that take the same types': { classes: J`class Monster { Monster(int a) { } Monster(int b) { } }`, methods: J`int f() { return 0; }` },
  'two fields with one name': { classes: J`class Monster { int health; String health; }`, methods: J`int f() { return 0; }` },
  'two classes with one name': { classes: J`class Monster { } class Monster { }`, methods: J`int f() { return 0; }` },
  'a field that does not exist': { classes: J`class Monster { int health; }`, methods: J`int f() { Monster m = new Monster(); return m.heatlh; }` },
  'a method that does not exist': { classes: J`class Monster { int health; }`, methods: J`int f() { Monster m = new Monster(); return m.getHealth(); }` },
  'a field called like a method': { classes: J`class Monster { int health; }`, methods: J`int f() { Monster m = new Monster(); return m.health(); }` },
  'a method used like a field': { classes: J`class Monster { int getHealth() { return 1; } }`, methods: J`int f() { Monster m = new Monster(); return m.getHealth; }` },
  'this in a static method': { classes: J`class Monster { int health; static int f() { return this.health; } }`, methods: J`int f() { return 0; }` },
  'a field of the object in a static method': { classes: J`class Monster { int health; static int f() { return health; } }`, methods: J`int f() { return 0; }` },
  'a method of the object called from a static method': { classes: J`class Monster { int get() { return 1; } static int f() { return get(); } }`, methods: J`int f() { return 0; }` },
  'a method of the object called on the class': { classes: J`class Monster { int get() { return 1; } }`, methods: J`int f() { return Monster.get(); }` },
  'a field of the object read from the class': { classes: J`class Monster { int health; }`, methods: J`int f() { return Monster.health; }` },
  'a class used as a value': { classes: J`class Monster { }`, methods: J`int f() { Monster m = Monster; return 0; }` },
  'an object stored as text': { classes: J`class Monster { }`, methods: J`String f() { String s = new Monster(); return s; }` },
  'an object of one class stored as another': { classes: J`class Monster { } class Item { }`, methods: J`int f() { Monster m = new Item(); return 0; }` },
  'an object of another class handed to a method': { classes: J`class Monster { } class Item { } class Hero { void buy(Item i) { } }`, methods: J`int f() { new Hero().buy(new Monster()); return 0; }` },
  'two different classes compared with ==': { classes: J`class Monster { } class Item { }`, methods: J`boolean f() { return new Monster() == new Item(); }` },
  'arithmetic on an object': { classes: J`class Monster { int health; }`, methods: J`int f() { Monster m = new Monster(); return m + 1; }` },
  'an object as a condition': { classes: J`class Monster { }`, methods: J`int f() { Monster m = new Monster(); if (m) { return 1; } return 0; }` },
  'toString that is not public': { classes: J`class Monster { String toString() { return "m"; } }`, methods: J`int f() { return 0; }` },
  'toString that returns a number': { classes: J`class Monster { public int toString() { return 1; } }`, methods: J`int f() { return 0; }` },
  'a static toString': { classes: J`class Monster { public static String toString() { return "m"; } }`, methods: J`int f() { return 0; }` },
  '@Override on a method that replaces nothing': { classes: J`class Monster { @Override public String describe() { return "m"; } }`, methods: J`int f() { return 0; }` },
  '@Override on toString misspelled': { classes: J`class Monster { @Override public String tostring() { return "m"; } }`, methods: J`int f() { return 0; }` },
  '@Override on toString with a parameter': { classes: J`class Monster { @Override public String toString(int n) { return "m"; } }`, methods: J`int f() { return 0; }` },
  'a final field given a new value': { classes: J`class Monster { final int max = 5; void grow() { max = 6; } }`, methods: J`int f() { return 0; }` },
  'a void field': { classes: J`class Monster { void health; }`, methods: J`int f() { return 0; }` },
  'a field given a value of the wrong type': { classes: J`class Monster { int health = "full"; }`, methods: J`int f() { return 0; }` },
  'a field assigned the wrong type': { classes: J`class Monster { int health; void set(String s) { health = s; } }`, methods: J`int f() { return 0; }` },
  'a statement loose in a class': { classes: J`class Monster { int health; health = 5; }`, methods: J`int f() { return 0; }` },
  'a getter that returns nothing': { classes: J`class Monster { int health; int getHealth() { health = 1; } }`, methods: J`int f() { return 0; }` },
  'a field used before the line that declares it': { classes: J`class Monster { int a = b + 1; int b = 2; }`, methods: J`int f() { return 0; }` },
  'a field given its own value': { classes: J`class Monster { int a = a + 1; }`, methods: J`int f() { return 0; }` },
  'sorting a list of objects that have no order': { classes: J`class Monster { }`, methods: J`int f() { ArrayList<Monster> ms = new ArrayList<>(); Collections.sort(ms); return 0; }` },
  'a list of one class given an object of another': { classes: J`class Monster { } class Item { }`, methods: J`int f() { ArrayList<Monster> ms = new ArrayList<>(); ms.add(new Item()); return 0; }` },
  'an element of a list of objects taken out as text': { classes: J`class Monster { }`, methods: J`String f() { ArrayList<Monster> ms = new ArrayList<>(); return ms.get(0); }` },
  'a class that is never declared': J`int f() { Monster m = new Monster(); return 0; }`,
  'the length of an array given a new value': J`int f(int[] xs) { xs.length = 3; return 0; }`,
  'a constant of Math given a new value': J`double f() { Math.PI = 3; return 0; }`,
};

/**
 * Java runs each of these; jtiny says it does not. Whichever side refuses —
 * when it reads the method or when it runs — it must not produce an answer.
 */
export const REFUSES = {
  '== between two Strings': { methods: J`boolean f(String a, String b) { return a == b; }`, calls: ['f("a", "a")'] },
  '!= between two Strings': { methods: J`boolean f(String a) { return a != "x"; }`, calls: ['f("a")'] },
  'equals between a String and a char': { methods: J`boolean f(String s) { return s.equals('a'); }`, calls: ['f("a")'] },
  'joining an array to a String': { methods: J`String f(int[] xs) { return "" + xs; }`, calls: ['f(new int[1]).length() > 0'] },
  'printing an array': { methods: J`int f(int[] xs) { System.out.println(xs.length); return 0; } int g(int[] xs) { System.out.println(xs); return 0; }`, calls: ['f(new int[1])'] },
  'equals on an array': { methods: J`boolean f(int[] a, int[] b) { return a.equals(b); }`, calls: ['f(new int[1], new int[1])'] },
  'float': { methods: J`float f(float a) { return a / 2; }`, calls: ['f(3) > 1'] },
  'a float literal': { methods: J`double f() { return 1.5f; }`, calls: ['f()'] },
  'byte and short': { methods: J`int f() { byte b = 5; short s = 6; return b + s; }`, calls: ['f()'] },
  '== between two Integers': { methods: J`boolean f(Integer a, Integer b) { return a == b; }`, calls: ['f(5, 5)'] },
  '!= between two Doubles': { methods: J`boolean f(Double a, Double b) { return a != b; }`, calls: ['f(5.0, 5.0)'] },
  'Byte, Short and Float': { methods: J`int f() { Short s = 6; return s + 1; }`, calls: ['f()'] },
  'changing a list inside a for-each over it': { methods: J`String f() { ArrayList<String> xs = new ArrayList<>(Arrays.asList("a", "b", "c", "d")); try2(xs); return "" + xs; } void try2(ArrayList<String> xs) { for (String x : xs) { if (x.equals("c")) { xs.remove(x); } } }`, calls: ['f()'] },
  'adding to a set inside a for-each over it': { methods: J`int f() { HashSet<Integer> s = new HashSet<>(Arrays.asList(1, 2, 3)); int n = 0; for (int x : s) { if (n++ == 1) { s.add(x + 100); } } return n; }`, calls: ['f()'] },
  'sorting an ArrayList inside a for-each over it': { methods: J`int f() { ArrayList<Integer> xs = new ArrayList<>(Arrays.asList(1, 2, 3)); int n = 0; for (int x : xs) { n++; if (n == 3) { Collections.sort(xs); } } return n; }`, calls: ['f()'] },
  'a HashSet with many keys in one slot, which Java rearranges into a tree': { methods: J`String f() { HashSet<Integer> s = new HashSet<>(); for (int i = 0; i < 100; i++) { s.add(i * 65537 - 40); } return "" + s; }`, calls: ['f()'] },
  'an object with no toString, printed': { classes: J`class Monster { int health; }`, methods: J`String f() { Monster m = new Monster(); return "" + m; }`, calls: ['f().length() > 0'] },
  'a list of objects with no toString, printed': { classes: J`class Monster { }`, methods: J`int f() { ArrayList<Monster> ms = new ArrayList<>(); ms.add(new Monster()); System.out.println(ms.size()); return ("" + ms).length(); }`, calls: ['f() > 0'] },
  'this(…) that is not the first line, which Java 25 allows': { classes: J`class Monster { int health; Monster(int h) { health += h; } Monster() { health = 1; this(5); } }`, methods: J`int f() { return new Monster().health; }`, calls: ['f()'] },
  'a set of objects': { classes: J`class Monster { }`, methods: J`int f() { HashSet<Monster> ms = new HashSet<>(); ms.add(new Monster()); return ms.size(); }`, calls: ['f()'] },
  'objects as the keys of a map': { classes: J`class Monster { }`, methods: J`int f() { HashMap<Monster, Integer> ms = new HashMap<>(); return ms.size(); }`, calls: ['f()'] },
  'hashCode of an object': { classes: J`class Monster { }`, methods: J`boolean f() { return new Monster().hashCode() == 0; }`, calls: ['f() || true'] },
  'a class that extends another': { classes: J`class Monster { int health; } class Dragon extends Monster { }`, methods: J`int f() { return new Dragon().health; }`, calls: ['f()'] },
  'an interface': { classes: J`interface Fighter { int power(); } class Monster implements Fighter { public int power() { return 3; } }`, methods: J`int f() { return new Monster().power(); }`, calls: ['f()'] },
  'a static method called through an object': { classes: J`class Monster { static int count() { return 3; } }`, methods: J`int f() { Monster m = new Monster(); return m.count(); }`, calls: ['f()'] },
  'a final field given its value in the constructor': { classes: J`class Monster { final int max; Monster() { max = 5; } }`, methods: J`int f() { return new Monster().max; }`, calls: ['f()'] },
  'a class of your own called Character': { classes: J`class Character { int gold = 5; }`, methods: J`int f() { return new Character().gold; }`, calls: ['f()'] },
  'equals written for the class': { classes: J`class Monster { int h; public boolean equals(Object o) { return true; } }`, methods: J`boolean f() { return new Monster().equals(new Monster()); }`, calls: ['f()'] },
  'a field assigned before the line that declares it': { classes: J`class Monster { int a = (b = 5) + 1; int b; }`, methods: J`int f() { return new Monster().a; }`, calls: ['f()'] },
  'Collections.shuffle': { methods: J`int f() { ArrayList<Integer> xs = new ArrayList<>(Arrays.asList(1, 2, 3)); Collections.shuffle(xs); return xs.size(); }`, calls: ['f()'] },
  'a list of lists': { methods: J`int f() { ArrayList<ArrayList<String>> xs = new ArrayList<>(); return xs.size(); }`, calls: ['f()'] },
  'a map of lists': { methods: J`int f() { HashMap<String, ArrayList<String>> m = new HashMap<>(); return m.size(); }`, calls: ['f()'] },
  'a TreeMap': { methods: J`int f() { TreeMap<String, Integer> m = new TreeMap<>(); m.put("a", 1); return m.size(); }`, calls: ['f()'] },
  'entrySet': { methods: J`int f() { HashMap<String, Integer> m = new HashMap<>(); m.put("a", 1); int t = 0; for (Map.Entry<String, Integer> e : m.entrySet()) { t += e.getValue(); } return t; }`, calls: ['f()'] },
  'a raw ArrayList': { methods: J`int f() { ArrayList xs = new ArrayList(); xs.add("a"); return xs.size(); }`, calls: ['f()'] },
  'contains with a value of another type': { methods: J`boolean f() { ArrayList<Long> xs = new ArrayList<>(); xs.add(5L); return xs.contains(5); }`, calls: ['f()'] },
  'a new collection whose type nothing gives': { methods: J`int f() { return new ArrayList<>().size(); }`, calls: ['f()'] },
  'Arrays.asList of an int array': { methods: J`int f() { int[] xs = {1, 2, 3}; return Arrays.asList(xs).size(); }`, calls: ['f()'] },
  'an iterator': { methods: J`int f() { ArrayList<String> xs = new ArrayList<>(); return xs.iterator().hasNext() ? 1 : 0; }`, calls: ['f()'] },
  'a lambda': { methods: J`int f() { ArrayList<Integer> xs = new ArrayList<>(Arrays.asList(1, 2, 3)); xs.removeIf(x -> x > 1); return xs.size(); }`, calls: ['f()'] },
  'List.of': { methods: J`int f() { return List.of(1, 2).size(); }`, calls: ['f()'] },
  'try and catch': { methods: J`int f(int a) { try { return 10 / a; } catch (ArithmeticException e) { return -1; } }`, calls: ['f(0)'] },
  'a format in hexadecimal': { methods: J`String f(int n) { return String.format("%x", n); }`, calls: ['f(255)'] },
  'a format in scientific notation': { methods: J`String f(double d) { return String.format("%e", d); }`, calls: ['f(3.14159)'] },
  'a numbered format argument': { methods: J`String f(int n) { return String.format("%1$d %1$d", n); }`, calls: ['f(5)'] },
  'an array handed to a format': { methods: J`String f(String[] xs) { return String.format("%s %s", xs); }`, calls: ['f(new String[] {"a", "b"})'] },
  'a regular expression in split': { methods: J`int f(String s) { return s.split("\\s+").length; }`, calls: ['f("a  b")'] },
  'a dot in split': { methods: J`int f(String s) { return s.split(".").length; }`, calls: ['f("a.b")'] },
  'replaceAll': { methods: J`String f(String s) { return s.replaceAll("a", "b"); }`, calls: ['f("aa")'] },
  'matches': { methods: J`boolean f(String s) { return s.matches("[a-z]+"); }`, calls: ['f("aa")'] },
  'a lambda': { methods: J`int f() { Runnable r = () -> { }; return 0; }`, calls: ['f()'] },
  'a labelled break': { methods: J`int f() { outer: for (int i = 0; i < 3; i++) { for (int j = 0; j < 3; j++) { if (j == 1) break outer; } } return 1; }`, calls: ['f()'] },
  'Math.random': { methods: J`boolean f() { return Math.random() < 2; }`, calls: ['f()'] },
  'a power that does not come out exact': { methods: J`double f(double b, double e) { return Math.pow(b, e); }`, calls: ['f(1.1, 2) > 1', 'f(2, 0.5) > 1', 'f(3, 40) > 1', 'f(3, -1) < 1'] },
  'Math.sin': { methods: J`double f() { return Math.sin(0); }`, calls: ['f()'] },
  'toUpperCase on text that is not plain English': { methods: J`String f(String s) { return s.toUpperCase(); }`, calls: [J`f("straße")`] },
  'isLetter on a character that is not plain English': { methods: J`boolean f(char c) { return Character.isLetter(c); }`, calls: [J`f('é')`] },
  'reversing a StringBuilder that holds an emoji': { methods: J`String f(String s) { return new StringBuilder(s).reverse().toString(); }`, calls: [J`f("a😀b").length() == 4`] },
  'a cast to an object type': { methods: J`String f(String s) { return (String) s; }`, calls: ['f("a")'] },
  'instanceof': { methods: J`boolean f(String s) { return s instanceof String; }`, calls: ['f("a")'] },
  'assert': { methods: J`int f(int a) { assert a > 0; return a; }`, calls: ['f(1)'] },
  'a C-style array declaration': { methods: J`int f() { int xs[] = {1, 2}; return xs[0]; }`, calls: ['f()'] },
  'varargs': { methods: J`int f(int... xs) { return xs.length; }`, calls: ['f(1, 2)'] },
  'a text block': { methods: 'String f() { return """\n  hi\n  """; }', calls: ['f()'] },
  'a final variable given its value later': { methods: J`int f() { final int x; x = 5; return x; }`, calls: ['f()'] },
  'a ternary whose results are different types': { methods: J`String f(boolean b) { return "" + (b ? 1 : "one"); }`, calls: ['f(true)'] },
  'recursion deeper than this box goes': { methods: J`int f(int n) { return n == 0 ? 0 : 1 + f(n - 1); }`, calls: ['f(2000)'] },
  'Math.round of a long': { methods: J`long f(long n) { return Math.round(n); }`, calls: ['f(5L)'] },
  'Scanner': { methods: J`int f() { Scanner in = new Scanner(System.in); return in.nextInt(); }`, calls: ['1'] },
  'an if that ends at a stray semicolon': { methods: J`int f(int a) { if (a > 0); return 1; }`, calls: ['f(1)'] },
  'an underscore as a name': { methods: J`int f(int[] xs) { int n = 0; for (int _ : xs) n++; return n; }`, calls: ['f(new int[3])'] },
  'a yield statement in an old-style value switch': { methods: J`int f(int a) { return switch (a) { case 1: yield 10; default: yield 20; }; }`, calls: ['f(1)'] },
};

// ─── generated cases ─────────────────────────────────────────────────────────

/** A small deterministic generator, so that a failure can be reproduced by its seed. */
export function randomSource(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = list => list[Math.floor(next() * list.length)];
  return { next, pick, int: n => Math.floor(next() * n) };
}

const INT_LITERALS = ['0', '1', '2', '3', '7', '10', '31', '32', '33', '100', '255', '65535', '65536', '1000000', '2147483647', '(-1)', '(-2)', '(-7)', '(-100)', 'Integer.MIN_VALUE', '46341', '0x7f', "'a'", "'0'"];
const LONG_LITERALS = ['0L', '1L', '3L', '63L', '64L', '4294967296L', '9223372036854775807L', '(-1L)', '(-5L)', 'Long.MIN_VALUE', '1000000007L', '123456789012L'];
const DOUBLE_LITERALS = ['0.0', '1.0', '0.5', '0.1', '2.5', '3.75', '1e10', '1e-5', '123456.789', '(-0.0)', '(-2.5)', '1e300', '0.3', '7.0', '1.0E7', '0.001', '9999999.0', '1e21', '4.9E-324', '100.0'];
const CHAR_LITERALS = ["'a'", "'z'", "'A'", "'0'", "' '", "'~'"];

/** A random, well-typed Java expression of the wanted type, over the variables a b p q x y c t. */
export function randomExpression(rng, type, depth) {
  const sub = t => randomExpression(rng, t, depth - 1);
  const leaf = depth <= 0 || rng.next() < 0.18;
  const numeric = () => rng.pick(['int', 'int', 'long', 'double', 'char']);
  switch (type) {
    case 'int':
      if (leaf) return rng.pick([...INT_LITERALS.filter(l => l[0] !== "'"), 'a', 'b', 'a', 'b']);
      switch (rng.int(12)) {
        case 0: case 1: case 2: return `(${sub(rng.pick(['int', 'int', 'char']))} ${rng.pick(['+', '-', '*', '/', '%'])} ${sub(rng.pick(['int', 'int', 'char']))})`;
        case 3: return `(${sub('int')} ${rng.pick(['&', '|', '^'])} ${sub('int')})`;
        case 4: return `(${sub(rng.pick(['int', 'char']))} ${rng.pick(['<<', '>>', '>>>'])} ${sub(rng.pick(['int', 'long', 'char']))})`;
        case 5: return `(${rng.pick(['-', '~', '+'])}${sub(rng.pick(['int', 'char']))})`;
        case 6: return `((int) ${sub(rng.pick(['long', 'double', 'char']))})`;
        case 7: return `(${sub('boolean')} ? ${sub('int')} : ${sub('int')})`;
        case 8: return `Math.${rng.pick(['max', 'min'])}(${sub('int')}, ${sub(rng.pick(['int', 'char']))})`;
        case 9: return `Math.abs(${sub('int')})`;
        case 10: return `(${sub('boolean')} ? ${sub('char')} : ${sub('int')})`;
        default: return `(${sub('int')} ${rng.pick(['+', '-', '*'])} ${sub('int')})`;
      }
    case 'long':
      if (leaf) return rng.pick([...LONG_LITERALS, 'p', 'q', 'p']);
      switch (rng.int(9)) {
        case 0: case 1: return `(${sub('long')} ${rng.pick(['+', '-', '*', '/', '%'])} ${sub(rng.pick(['long', 'int', 'char']))})`;
        case 2: return `(${sub('int')} ${rng.pick(['+', '-', '*', '/', '%'])} ${sub('long')})`;
        case 3: return `(${sub('long')} ${rng.pick(['&', '|', '^'])} ${sub(rng.pick(['long', 'int']))})`;
        case 4: return `(${sub('long')} ${rng.pick(['<<', '>>', '>>>'])} ${sub(rng.pick(['int', 'long']))})`;
        case 5: return `(${rng.pick(['-', '~'])}${sub('long')})`;
        case 6: return `((long) ${sub(rng.pick(['int', 'double', 'char']))})`;
        case 7: return `(${sub('boolean')} ? ${sub('long')} : ${sub(rng.pick(['long', 'int']))})`;
        default: return `Math.${rng.pick(['max', 'min'])}(${sub('long')}, ${sub(rng.pick(['int', 'long']))})`;
      }
    case 'double':
      if (leaf) return rng.pick([...DOUBLE_LITERALS, 'x', 'y', 'x']);
      switch (rng.int(9)) {
        case 0: case 1: case 2: return `(${sub('double')} ${rng.pick(['+', '-', '*', '/', '%'])} ${sub(numeric())})`;
        case 3: return `(${sub(rng.pick(['int', 'long', 'char']))} ${rng.pick(['+', '-', '*', '/'])} ${sub('double')})`;
        case 4: return `((double) ${sub(rng.pick(['int', 'long', 'char']))})`;
        case 5: return `(-${sub('double')})`;
        case 6: return rng.next() < 0.25 ? `Math.abs(${sub('double')})`   // Math.abs of an int would be an int
          : `Math.${rng.pick(['floor', 'ceil', 'sqrt'])}(${sub(rng.pick(['double', 'double', 'int']))})`;
        case 7: return `(${sub('boolean')} ? ${sub('double')} : ${sub(numeric())})`;
        default: return `Math.${rng.pick(['max', 'min'])}(${sub('double')}, ${sub(numeric())})`;
      }
    case 'char':
      if (leaf) return rng.pick([...CHAR_LITERALS, 'c', 'c']);
      switch (rng.int(3)) {
        case 0: return `((char) ${sub(rng.pick(['int', 'long', 'double']))})`;
        case 1: return `(${sub('boolean')} ? ${sub('char')} : ${sub('char')})`;
        default: return `((char) (${sub('char')} + ${sub('int')}))`;
      }
    case 'boolean':
      if (leaf) return rng.pick(['true', 'false', 't', 't']);
      switch (rng.int(7)) {
        case 0: case 1: case 2: return `(${sub(numeric())} ${rng.pick(['<', '<=', '>', '>=', '==', '!='])} ${sub(numeric())})`;
        case 3: return `(${sub('boolean')} ${rng.pick(['&&', '||', '&', '|', '^', '==', '!='])} ${sub('boolean')})`;
        case 4: return `(!${sub('boolean')})`;
        case 5: return `(Math.round(${sub('double')}) ${rng.pick(['<', '==', '>'])} ${sub(rng.pick(['int', 'long']))})`;
        default: return `(${sub('boolean')} ? ${sub('boolean')} : ${sub('boolean')})`;
      }
    default: {   // String
      // Whatever stands before the first piece of text is added up as numbers, so no boolean may go there.
      const length = 2 + rng.int(3);
      const at = rng.int(length + 1);
      const parts = Array.from({ length }, (_, i) => sub(rng.pick(i < at ? ['int', 'long', 'double', 'char'] : ['int', 'long', 'double', 'char', 'boolean', 'int', 'double'])));
      parts.splice(at, 0, '"|"');
      return parts.join(' + ');
    }
  }
}

export const FUZZ_PARAMETERS = 'int a, int b, long p, long q, double x, double y, char c, boolean t';
export const FUZZ_ARGUMENTS = [
  "7, -3, 123456789012L, -5L, 2.5, -0.75, 'k', true",
  "0, 2147483647, 0L, 1L, 0.1, 1e15, '0', false",
  "-2147483648, 13, -9223372036854775808L, 40L, -1e-7, 3.0, 'Z', true",
];

/** `count` cases of `perCase` random expressions each, every one called with each argument set. */
export function fuzzCases(seed, count, perCase = 12, depth = 4) {
  const rng = randomSource(seed);
  const cases = [];
  for (let i = 0; i < count; i++) {
    const methods = [];
    const calls = [];
    for (let k = 0; k < perCase; k++) {
      const type = rng.pick(['int', 'long', 'double', 'char', 'boolean', 'String', 'int', 'double', 'String']);
      const expr = randomExpression(rng, type, depth);
      methods.push(`  String m${k}(${FUZZ_PARAMETERS}) { return "" + (${expr}); }`);
      for (const args of FUZZ_ARGUMENTS) calls.push(`m${k}(${args})`);
    }
    cases.push({ methods: methods.join('\n'), calls });
  }
  return cases;
}

/** Bit patterns of doubles worth printing: the edges of Java's two notations, and a spread of everything else. */
export function interestingDoubles(seed, random) {
  const values = [];
  const bitsOf = v => { const dv = new DataView(new ArrayBuffer(8)); dv.setFloat64(0, v); return dv.getBigUint64(0); };
  const add = v => { if (Number.isFinite(v)) values.push(bitsOf(v)); };
  for (let e = -324; e <= 308; e++) for (const d of [1, 2, 5, 9, 1.5, 9.9, 1.2345, 4.9]) add(Number(`${d}e${e}`));
  for (let e = -1074; e <= 1023; e += 7) { add(2 ** e); add(-(2 ** e)); add(2 ** e * 3); }
  for (const v of [0.001, 0.0009999999999999998, 0.0010000000000000002, 1e7, 9999999.999999998, 10000000.000000002, 1e-3, 123456789, 0.1, 0.2, 0.3, 1 / 3, 2 / 3,
    100, 1e21, 1e22, 1e23, 5e-324, 1.7976931348623157e308, 2.2250738585072014e-308, 4.35, 2.675, 1.005, 0.30000000000000004, 9007199254740992, 9007199254740993, 123.456, -42.5, 3.0, 1e16, 12345678.9]) { add(v); add(-v); }
  for (let i = 1; i <= 400; i++) { add(i / 10); add(i / 100); add(i * 1000.5); add(i * 1e5); }
  const rng = randomSource(seed);
  for (let i = 0; i < random; i++) {
    const hi = BigInt(Math.floor(rng.next() * 0x100000000));
    const lo = BigInt(Math.floor(rng.next() * 0x100000000));
    const bits = (hi << 32n) | lo;
    if (((bits >> 52n) & 0x7FFn) !== 0x7FFn) values.push(bits);
    add(Math.round(rng.next() * 1e6) / 10 ** rng.int(9));          // short decimals, the kind a student sees
    add((rng.next() - 0.5) * 10 ** (rng.int(40) - 20));
  }
  return values;
}

// ─── generated method bodies ─────────────────────────────────────────────────
//
// Random nests of if / loop / switch / break / return around variables that may
// or may not have been given a value. About half are programs javac rejects —
// a missing return, an unreachable line, a variable that might have no value —
// and jtiny has to reject exactly the same ones, then agree on what the rest return.

export const FLOW_ARGUMENTS = ['1, 2, true', '-1, 0, false', '3, 7, true', '2, 2, false'];

// Every loop begins with this, so that a program Java accepts also finishes.
const GUARD = 'if (g++ > 30) return -7;';

function flowBody(rng) {
  const scopes = [[]];
  let next = 0;
  const visible = () => scopes.flat();
  const readable = () => {
    const all = visible();
    const likely = all.filter(v => v.assigned);
    if (likely.length && rng.next() < 0.85) return rng.pick(likely).name;
    if (all.length && rng.next() < 0.9) return rng.pick(all).name;
    return rng.pick(['a', 'b', 'v0', 'zz']);
  };
  const writable = () => {
    const all = visible();
    if (!all.length) return null;
    return rng.pick(all);
  };
  const value = () => {
    switch (rng.int(9)) {
      case 0: return 'a';
      case 1: return 'b';
      case 2: return String(rng.int(5));
      case 3: case 4: return readable();
      case 5: return `${readable()} + 1`;
      case 6: return 'a + b';
      case 7: { const w = writable(); if (w) { w.assigned = rng.next() < 0.6; return `(${w.name} = a)`; } return 'a'; }
      default: return `(t ? ${readable()} : a)`;
    }
  };
  const test = () => {
    switch (rng.int(14)) {
      case 0: case 1: return 't';
      case 2: return '!t';
      case 3: return 'a > b';
      case 4: return 'a == 1';
      case 5: return 'true';
      case 6: return rng.next() < 0.3 ? 'false' : 'b > 0';
      case 7: return `${readable()} > 0`;
      case 8: { const w = writable(); return w ? `(${w.name} = a) > 0` : 'a > 0'; }
      case 9: { const w = writable(); return w ? `t && (${w.name} = b) > 1` : 't'; }
      case 10: { const w = writable(); return w ? `t || (${w.name} = b) > 1` : 't'; }
      case 11: { const w = writable(); return w ? `!(t && (${w.name} = b) > 1)` : '!t'; }
      case 12: return 'a > 0 && b > 0';
      default: return '1 < 2';
    }
  };
  const pad = depth => '    ' + '  '.repeat(depth);

  // Returns the lines of a run of statements. `ctx` says what encloses them.
  const run = (depth, ctx, budget) => {
    const lines = [];
    const count = 1 + rng.int(budget);
    for (let i = 0; i < count; i++) {
      const [text, leaves] = statement(depth, ctx);
      lines.push(text);
      if (leaves && rng.next() < 0.88) break;   // mostly stop after a line that leaves; sometimes leave an unreachable one
    }
    return lines.join('\n');
  };
  const block = (depth, ctx, opening = '') => {
    scopes.push([]);
    const body = (opening ? `${pad(depth + 1)}${opening}\n` : '') + run(depth + 1, ctx, 3);
    scopes.pop();
    return `{\n${body}\n${pad(depth)}}`;
  };

  // Returns [text, whether control certainly leaves].
  function statement(depth, ctx) {
    const p = pad(depth);
    const deep = depth >= 3;
    const roll = rng.int(deep ? 9 : 22);
    switch (roll) {
      case 0: { const name = `v${next++}`; scopes[scopes.length - 1].push({ name, assigned: false }); return [`${p}int ${name};`, false]; }
      case 1: case 2: { const init = value(); const name = `v${next++}`; scopes[scopes.length - 1].push({ name, assigned: true }); return [`${p}int ${name} = ${init};`, false]; }
      case 3: case 4: {
        const w = writable();
        if (!w) return [`${p}a++;`, false];
        const form = rng.int(5);
        if (form === 0) return [`${p}${w.name}++;`, false];
        if (form === 1) return [`${p}${w.name} += ${value()};`, false];
        const v = value();
        w.assigned = true;
        return [`${p}${w.name} = ${v};`, false];
      }
      case 5: return [`${p}return ${value()};`, true];
      case 6:
        if (ctx.loop || ctx.sw || rng.next() < 0.05) return [`${p}break;`, true];
        return [`${p}b++;`, false];
      case 7:
        if (ctx.loop || rng.next() < 0.04) return [`${p}continue;`, true];
        return [`${p}a--;`, false];
      case 8: return rng.next() < 0.3 ? [`${p}throw new IllegalStateException();`, true] : [`${p}g += 0;`, false];
      case 9: case 10: case 11: case 12: {
        const c = test();
        const then = block(depth, ctx);
        if (rng.next() < 0.5) return [`${p}if (${c}) ${then}`, false];
        return [`${p}if (${c}) ${then} else ${block(depth, ctx)}`, false];
      }
      case 13: case 14: return [`${p}while (${test()}) ${block(depth, { loop: true }, GUARD)}`, false];
      case 15: {
        const head = rng.next() < 0.6 ? `int i${next} = 0; i${next} < 3; i${next++}++` : rng.next() < 0.5 ? ';;' : `; ${test()};`;
        return [`${p}for (${head}) ${block(depth, { loop: true }, GUARD)}`, false];
      }
      case 16: { const body = block(depth, { loop: true }, GUARD); return [`${p}do ${body} while (${test()});`, false]; }
      case 17: case 18: {
        const arrow = rng.next() < 0.5;
        const withDefault = rng.next() < 0.6;
        const inner = { loop: ctx.loop, sw: true };
        scopes.push([]);
        const cases = [];
        const labels = ['1', '2', '3'].slice(0, 1 + rng.int(3));
        if (withDefault) labels.splice(rng.int(labels.length + 1), 0, 'default');
        for (const label of labels) {
          const head = label === 'default' ? 'default' : `case ${label}`;
          if (arrow) cases.push(`${pad(depth + 1)}${head} -> ${block(depth + 1, inner)}`);
          else cases.push(`${pad(depth + 1)}${head}:\n${run(depth + 2, inner, 2)}`);
        }
        scopes.pop();
        return [`${p}switch (a) {\n${cases.join('\n')}\n${p}}`, false];
      }
      case 19: return [`${p}${block(depth, ctx)}`, false];
      default: {
        const w = writable();
        if (w && rng.next() < 0.5) { w.assigned = true; return [`${p}${w.name} = ${rng.int(9)};`, false]; }
        return [`${p}b += ${value()};`, false];
      }
    }
  }

  let body = run(0, {}, 5);
  if (rng.next() < 0.7) body += `\n    return ${value()};`;
  return body;
}

/** `count` generated methods, each called with every argument set. */
export function flowCases(seed, count) {
  const rng = randomSource(seed);
  return Array.from({ length: count }, () => ({
    methods: `  int m(int a, int b, boolean t) {\n    int g = 0;\n${flowBody(rng)}\n  }`,
    calls: FLOW_ARGUMENTS.map(args => `m(${args})`),
  }));
}

// ─── generated type puzzles ──────────────────────────────────────────────────
//
// Expressions put together with no regard for type, stored into a variable of a
// random type. Most are type errors. javac decides which; jtiny has to make the
// same decision — or decline to say — and never accept one javac turns down.

export const TYPE_PARAMETERS = 'int a, long p, double x, char c, boolean t, String s, int[] xs';
export const TYPE_ARGUMENTS = ["7, 5000000000L, 2.5, 'k', true, \"hello\", new int[] {4, 5, 6}", "-3, -2L, -0.5, '0', false, \"\", new int[1]"];

const TYPE_LEAVES = ['1', '0', '65', '70000', '(-1)', "'a'", "'7'", '2.5', '0.0', '3L', 'true', 'false', '"s"', '"12"', 'null',
  'a', 'a', 'p', 'x', 'c', 'c', 't', 's', 's', 'K', 'xs', 'xs.length', 'Integer.MAX_VALUE'];
const PLAIN_WORDS = { leaves: TYPE_LEAVES, names: ['a', 'p', 'x', 'c', 't', 's'], casts: ['int', 'long', 'double', 'char', 'boolean'] };

// The same puzzles with wrapper objects in them: where Java boxes, where it unboxes, and where it will do neither.
export const BOX_PARAMETERS = `${TYPE_PARAMETERS}, Integer I, Integer N, Double D, Character C, Boolean B, Long L, Integer[] ws`;
export const BOX_ARGUMENTS = [
  `${TYPE_ARGUMENTS[0]}, 40, null, 2.5, 'k', true, 9L, new Integer[] {1, null, 3}`,
  `${TYPE_ARGUMENTS[1]}, -3, 1000, null, null, null, null, new Integer[2]`,
  `${TYPE_ARGUMENTS[0]}, 0, 0, -0.0, '7', false, -1L, new Integer[] {5}`,
];
const BOX_NAMES = ['I', 'I', 'N', 'D', 'C', 'B', 'L'];
const BOX_WORDS = {
  leaves: [...TYPE_LEAVES, 'I', 'I', 'I', 'N', 'D', 'D', 'C', 'B', 'L', 'ws', 'ws[0]', 'ws[1]', 'I', 'D', 'C', 'B'],
  names: ['a', 'p', 'x', 'c', 't', 's', ...BOX_NAMES, 'ws[0]'],
  casts: ['int', 'long', 'double', 'char', 'boolean', 'int', 'double', 'Integer', 'Double'],
  more(rng, sub) {
    switch (rng.int(9)) {
      case 0: case 1: return `${rng.pick(BOX_NAMES)}.equals(${sub()})`;
      case 2: return `${rng.pick(BOX_NAMES)}.${rng.pick(['intValue', 'doubleValue', 'toString', 'longValue', 'booleanValue', 'charValue'])}()`;
      case 3: return `${rng.pick(BOX_NAMES)}.compareTo(${sub()})`;
      case 4: case 5: return `${rng.pick(['Integer', 'Double', 'Long', 'Boolean', 'Character'])}.valueOf(${sub()})`;
      case 6: return `(${rng.pick(BOX_NAMES)} ${rng.pick(['==', '!=', '<', '+', '*'])} ${sub()})`;
      case 7: return `(${rng.pick(BOX_NAMES)} ${rng.pick(['=', '+=', '-=', '*=', '&=', '<<='])} ${sub()})`;
      default: return `${rng.pick(['++', '--', '-', '!', '~'])}${rng.pick(BOX_NAMES)}`;
    }
  },
};

const TYPE_BINARY = ['+', '+', '-', '*', '/', '%', '<', '>', '<=', '==', '!=', '&&', '||', '&', '|', '^', '<<', '>>'];

export function typeExpression(rng, depth, words = PLAIN_WORDS) {
  const sub = () => typeExpression(rng, depth - 1, words);
  if (depth <= 0 || rng.next() < 0.3) return rng.pick(words.leaves);
  if (words.more && rng.next() < 0.25) return words.more(rng, sub);
  switch (rng.int(22)) {
    case 0: case 1: case 2: case 3: case 4: return `(${sub()} ${rng.pick(TYPE_BINARY)} ${sub()})`;
    case 5: return `(${rng.pick(['-', '!', '~', '+'])}${sub()})`;
    case 6: case 7: return `(${sub()} ? ${sub()} : ${sub()})`;
    case 8: case 9: return `((${rng.pick(words.casts)}) ${sub()})`;
    case 10: return `s.${rng.pick(['length', 'isEmpty', 'trim', 'toUpperCase', 'toCharArray'])}()`;
    case 11: return `s.${rng.pick(['charAt', 'substring', 'indexOf', 'equals', 'contains', 'startsWith', 'compareTo', 'repeat', 'concat'])}(${sub()})`;
    case 12: return `Math.${rng.pick(['max', 'min'])}(${sub()}, ${sub()})`;
    case 13: return `Math.${rng.pick(['abs', 'round', 'sqrt', 'floor'])}(${sub()})`;
    case 14: return `String.valueOf(${sub()})`;
    case 15: return `Character.${rng.pick(['toUpperCase', 'isDigit', 'isLetter', 'getNumericValue'])}(${sub()})`;
    case 16: return `xs[${sub()}]`;
    case 17: return `Integer.parseInt(${sub()})`;
    case 18: return `(${rng.pick(words.names)} ${rng.pick(['=', '=', '+=', '-=', '*=', '/=', '&=', '<<='])} ${sub()})`;
    case 19: return `${rng.pick(words.names)}${rng.pick(['++', '--'])}`;
    case 20: return `s.substring(${sub()}, ${sub()})`;
    default: return `s.replace(${sub()}, ${sub()})`;
  }
}

/** `count` cases of `perCase` methods, each `T v = <anything>; return "" + v;`. One method per case, since any may fail to compile. */
export function typeCases(seed, count, depth = 2) {
  const rng = randomSource(seed);
  return Array.from({ length: count }, () => {
    const type = rng.pick(['int', 'int', 'long', 'double', 'char', 'boolean', 'String', 'var']);
    return {
      methods: `  String m(${TYPE_PARAMETERS}) { final int K = 66; ${type} v = ${typeExpression(rng, depth)}; return "" + v; }`,
      calls: TYPE_ARGUMENTS.map(args => `m(${args})`),
    };
  });
}

/** The wrapper version of `typeCases`: the result may also be stored in an Integer, a Double and so on. */
export function boxCases(seed, count, depth = 2) {
  const rng = randomSource(seed);
  return Array.from({ length: count }, () => {
    const type = rng.pick(['int', 'long', 'double', 'char', 'boolean', 'String', 'var', 'Integer', 'Integer', 'Double', 'Character', 'Boolean', 'Long']);
    return {
      methods: `  String m(${BOX_PARAMETERS}) { final int K = 66; ${type} v = ${typeExpression(rng, depth, BOX_WORDS)}; return "" + v; }`,
      calls: BOX_ARGUMENTS.map(args => `m(${args})`),
    };
  });
}

// ─── generated formats ───────────────────────────────────────────────────────
//
// String.format and printf with formats put together at random — many of them wrong in ways Java
// only finds out when it runs — and %.Nf across doubles chosen to sit on a rounding boundary.

const FORMAT_PARAMETERS = 'int a, long p, double x, char c, boolean t, String s, Integer I, Double D';
const FORMAT_ARGUMENTS = ["1234567, -5000000000L, 2.675, 'k', true, \"hello\", 40, 0.125", "-3, 0L, -1234.5, '0', false, \"\", null, null", "0, 99L, 1e-4, 'Z', true, null, -7, 1e9"];

function randomFormat(rng) {
  const parts = [];
  const values = [];
  const count = 1 + rng.int(4);
  for (let i = 0; i < count; i++) {
    parts.push(rng.pick(['', '', ' ', 'n=', ': ', '$', '|', ' of ']));
    const wild = rng.next() < 0.12;   // now and then, a format with no regard for what goes with what
    const conv = rng.pick(wild ? ['d', 's', 'f', 'b', 'c', 'x', 'S', 'e'] : ['d', 'd', 'd', 's', 's', 'f', 'f', 'f', 'f', 'b', 'c', 'n', '%']);
    const numeric = conv === 'd' || conv === 'f';
    const width = rng.next() < 0.5 ? '' : String(rng.pick([1, 3, 6, 10, 14]));
    const flags = wild ? rng.pick(['-', '0', ',', '+', ',0', '+,', '-0', ' ', ''])
      : rng.next() < 0.5 ? '' : rng.pick(numeric ? (width ? ['-', '0', ',', '+', ',0', '+,', '+0', '-,', '-+'] : [',', '+', '+,']) : (width ? ['-'] : ['']));
    const precision = (wild ? rng.next() < 0.6 : conv === 'd' || conv === 'b' || conv === 'c' || rng.next() < 0.4) ? '' : '.' + rng.pick([0, 1, 2, 3, 8]);
    parts.push(conv === 'n' || conv === '%' ? (rng.next() < 0.9 ? `%${conv}` : `%${width}${conv}`) : `%${flags}${width}${precision}${conv}`);
    if (conv !== 'n' && conv !== '%' && rng.next() < 0.95) {
      // usually a value of the right kind, sometimes not
      const right = { d: ['a', 'p', 'I', 'a + 1'], f: ['x', 'D', 'x * 3', 'x / 7'], s: ['s', 'a', 'x', 'c', 't', 'I', 'D', 'p'], b: ['t', 'a > 0'], c: ['c'] }[conv];
      values.push(right && rng.next() < 0.85 ? rng.pick(right) : rng.pick(['a', 'p', 'x', 'c', 't', 's', 'I', 'D']));
    }
  }
  return { format: parts.join(''), values };
}

/** `count` cases: half return String.format, half print with printf. */
export function formatCases(seed, count) {
  const rng = randomSource(seed);
  return Array.from({ length: count }, (_, i) => {
    const { format, values } = randomFormat(rng);
    const inside = [`"${format}"`, ...values].join(', ');
    return {
      methods: i % 2 ? `  int m(${FORMAT_PARAMETERS}) { System.out.printf(${inside}); System.out.println(); return 0; }`
        : `  String m(${FORMAT_PARAMETERS}) { return String.format(${inside}); }`,
      calls: FORMAT_ARGUMENTS.map(args => `m(${args})`),
    };
  });
}

/** Doubles written with a few decimal places — 1.005, 2.675, 0.125 — which is where rounding to 2 places is decided. */
export function roundingCases(seed, count, perCase = 150) {
  const rng = randomSource(seed);
  const one = () => {
    const kind = rng.int(6);
    const whole = rng.pick([0, 0, 1, 2, 9, 10, 99, 100, 999, 1234, 99999, 1234567]);
    const places = 1 + rng.int(kind === 0 ? 4 : 9);
    let fraction = '';
    for (let k = 0; k < places; k++) fraction += kind === 1 ? '9' : String(rng.int(10));
    if (kind === 2) fraction = fraction.slice(0, -1) + '5';
    if (kind === 3) return `${rng.int(1000)}.${rng.int(10)}e${rng.int(40) - 20}`;
    if (kind === 4) return `${whole}.${fraction} / ${1 + rng.int(9)}.0`;
    return `${rng.next() < 0.2 ? '-' : ''}${whole}.${fraction}`;
  };
  return Array.from({ length: count }, () => ({
    methods: '  String m(double x) { return String.format("%.0f %.1f %.2f %.3f %,.2f %f %012.4f %+.1f %.10f", x, x, x, x, x, x, x, x, x); }',
    calls: Array.from({ length: perCase }, () => `m(${one()})`),
  }));
}

// ─── generated collection work ───────────────────────────────────────────────
//
// One method that does a long, pseudo-random run of adds, removes and lookups on a list, two sets and
// three maps, and prints them all at the end. The run is steered by its arguments, so each call is a
// different history — and the order a HashSet or a HashMap prints in depends on all of it: which keys,
// in what order, how often the table grew, what was removed in between.

const COLLECTION_METHOD = String.raw`  String m(int seed, int steps, int range, int spread) {
    ArrayList<Integer> list = new ArrayList<>();
    LinkedList<String> queue = new LinkedList<>();
    HashSet<Integer> ints = new HashSet<>();
    HashSet<String> words = new HashSet<>();
    HashMap<Integer, Integer> byInt = new HashMap<>();
    HashMap<String, Integer> byWord = new HashMap<>();
    HashMap<Character, Integer> byChar = new HashMap<>();
    HashMap<Long, Double> byLong = new HashMap<>();
    HashSet<Double> reals = new HashSet<>();
    int x = seed;
    for (int i = 0; i < steps; i++) {
      x = x * 1103515245 + 12345;
      int k = ((x >>> 8) % range - range / 3) * spread;
      int op = (x >>> 20) % 11;
      String word = "w" + k;
      if (op < 4) {
        list.add(k); ints.add(k); words.add(word); byInt.put(k, i); byWord.put(word, i);
        byChar.put((char) ('a' + (k & 63)), i); byLong.put(k * 2654435761L, k / 4.0); reals.add(k * 0.37); if (reals.size() < 30) { reals.add(k / 8.0); } queue.addLast(word);
      } else if (op == 4) {
        list.remove(Integer.valueOf(k)); ints.remove(k); words.remove(word); byInt.remove(k); byWord.remove(word); byLong.remove(k * 2654435761L); reals.remove(k * 0.37); reals.remove(k / 8.0);
      } else if (op == 5) {
        if (!list.isEmpty()) { list.remove(list.size() / 2); }
        if (!queue.isEmpty()) { queue.removeFirst(); }
      } else if (op == 6) {
        byInt.put(k, byInt.getOrDefault(k, 0) - 1); byWord.putIfAbsent(word, -i);
      } else if (op == 7) {
        if (ints.contains(k) != byInt.containsKey(k) && i < 0) { return "impossible"; }
        if (list.size() > 3) { list.set(1, list.get(0) + list.indexOf(k)); }
      } else if (op == 8 && (x & 4096) != 0) {
        ints = new HashSet<>(ints); byWord = new HashMap<>(byWord); words = new HashSet<>(list.size() + 1); for (int v : list) { words.add("w" + v); }
      } else if (op == 9 && (x & 12288) == 0) {
        ints.clear(); byInt.clear(); reals.clear();
      } else {
        queue.addFirst(word); byChar.remove((char) ('a' + (k & 63)));
      }
    }
    String keys = "";
    for (int key : byInt.keySet()) { keys += key + ">" + byInt.get(key) + " "; }
    int total = 0;
    for (int v : byWord.values()) { total += v; }
    ArrayList<Integer> sorted = new ArrayList<>(ints);
    Collections.sort(sorted);
    return list + " | " + queue + " | " + ints + " | " + words + " | " + byInt + " | " + byWord + " | " + byChar + " | " + byLong + " | " + reals + " | " + keys + total + sorted
      + byInt.keySet() + byWord.values() + (sorted.isEmpty() ? "" : "" + Collections.max(sorted) + Collections.min(ints));
  }`;

/** `count` cases of `perCase` calls each: short runs and long ones, keys packed together and keys far apart. */
export function collectionCases(seed, count, perCase = 25) {
  const rng = randomSource(seed);
  return Array.from({ length: count }, () => ({
    methods: COLLECTION_METHOD,
    calls: Array.from({ length: perCase }, () => {
      const steps = rng.pick([3, 8, 13, 20, 40, 90, 200, 500]);
      const range = rng.pick([4, 9, 17, 40, 100, 1000, 100000]);
      const spread = rng.pick([1, 1, 1, 1, 3, 10, 100, 1000003, -7, 31]);
      return `m(${rng.int(1000000)}, ${steps}, ${range}, ${spread})`;
    }),
  }));
}

// ─── generated collection puzzles ────────────────────────────────────────────
//
// A method call picked with no regard for what it is called on or handed, stored in a variable of a
// random type. javac decides which of these compile; jtiny has to agree, or say that it will not say.

const COLLECTION_SETUP = String.raw`    String[] arr = {"b", "a", "c"};
    ArrayList<String> as = new ArrayList<>(Arrays.asList("b", "a", "b")); ArrayList<Integer> ai = new ArrayList<>(Arrays.asList(3, 1, 2)); List<String> ls = new LinkedList<>(as);
    LinkedList<String> ks = new LinkedList<>(); ks.add("k"); HashSet<String> hs = new HashSet<>(as); Set<Integer> si = new HashSet<>(ai);
    HashMap<String, Integer> m = new HashMap<>(); m.put("a", 1); m.put("b", 2); Map<Integer, String> mi = new HashMap<>(); mi.put(1, "one"); Collection<String> cs = m.keySet();`;
const COLLECTION_NAMES = ['as', 'as', 'ai', 'ls', 'ks', 'hs', 'si', 'm', 'm', 'mi', 'cs'];
const COLLECTION_LEAVES = [...COLLECTION_NAMES, 's', 's', 'a', 'a', 'I', 'x', 'c', 'arr', '"a"', '"k"', '1', '0', '2', 'null', '1.5', "'a'", 'true',
  'new ArrayList<>()', 'new HashSet<String>()', 'new LinkedList<Integer>()', 'm.keySet()', 'm.values()', 'Arrays.asList(arr)', 'as.get(0)', 'm.get(s)', 'ai.get(a)', 'as.size()'];
const COLLECTION_CALLS = ['add', 'add', 'remove', 'remove', 'get', 'get', 'set', 'contains', 'indexOf', 'size', 'isEmpty', 'addAll', 'put', 'put', 'containsKey', 'containsValue',
  'keySet', 'values', 'getOrDefault', 'addFirst', 'removeFirst', 'peekFirst', 'clear', 'equals', 'toString', 'removeAll', 'retainAll', 'containsAll', 'putIfAbsent',
  'lastIndexOf', 'getFirst', 'getLast', 'addLast', 'removeLast', 'length', 'push', 'pop', 'poll'];
const COLLECTION_TYPES = ['int', 'boolean', 'String', 'Integer', 'var', 'var', 'double', 'ArrayList<String>', 'List<String>', 'List<Integer>', 'Set<String>', 'Set<Integer>',
  'Collection<String>', 'Collection<Integer>', 'HashMap<String, Integer>', 'Map<String, Integer>', 'Map<Integer, String>', 'LinkedList<String>', 'HashSet<String>', 'ArrayList<Integer>'];

function collectionExpression(rng, depth) {
  const sub = () => (depth <= 0 || rng.next() < 0.6 ? rng.pick(COLLECTION_LEAVES) : collectionExpression(rng, depth - 1));
  const some = n => Array.from({ length: n }, sub).join(', ');
  switch (rng.int(14)) {
    case 0: case 1: case 2: case 3: case 4: case 5:
      return `${rng.next() < 0.8 ? rng.pick(COLLECTION_NAMES) : sub()}.${rng.pick(COLLECTION_CALLS)}(${some(rng.pick([0, 1, 1, 1, 2, 2]))})`;
    case 6: case 7: return `Collections.${rng.pick(['sort', 'max', 'min', 'frequency', 'reverse', 'binarySearch', 'swap', 'addAll'])}(${some(rng.pick([1, 1, 2, 2, 3]))})`;
    case 8: return `new ${rng.pick(['ArrayList', 'LinkedList', 'HashSet', 'HashMap'])}<${rng.pick(['', '', '', 'String', 'Integer', 'String, Integer'])}>(${some(rng.pick([0, 0, 1]))})`;
    case 9: return `Arrays.asList(${some(rng.pick([1, 1, 2, 3]))})`;
    case 10: return `(${sub()} ${rng.pick(['==', '!=', '+'])} ${sub()})`;
    case 11: return `(t ? ${sub()} : ${sub()})`;
    default: return sub();
  }
}

/** `count` cases: half store the result in a variable of a random type, half are a statement whose effect is printed. */
export function collectionTypeCases(seed, count, depth = 1) {
  const rng = randomSource(seed);
  return Array.from({ length: count }, (_, i) => {
    const expression = collectionExpression(rng, depth);
    const after = 'return "" + as + ai + ls + ks + hs + si + m + mi + cs;';
    const body = i % 2 ? `${expression}; ${after}` : `${rng.pick(COLLECTION_TYPES)} v = ${expression}; return v + " " + as + ai + ls + ks + hs + si + m + mi + cs;`;
    return {
      methods: `  String m(String s, int a, Integer I, double x, char c, boolean t) {\n${COLLECTION_SETUP}\n    ${body}\n  }`,
      calls: ['m("a", 1, 2, 1.5, \'b\', true)', 'm("zz", 0, null, -1.0, \'a\', false)'],
    };
  });
}

// ─── generated object puzzles ────────────────────────────────────────────────
//
// Two small classes, and one line that uses them with no regard for what is private, what is static,
// what is null or what type anything has. javac decides which lines compile; jtiny has to agree.

const OBJECT_CLASSES = String.raw`class Item { private String name; int price; static int made; private static int hidden = 3; final int tax = 2; Integer boxed;
  Item(String name, int price) { this.name = name; this.price = price; made++; }
  Item(String name) { this(name, 1); }
  public String getName() { return name; }
  private int secret() { return price * 2; }
  public int twice() { return secret() + hidden; }
  static int count() { return made; }
  public Item cheaper(Item other) { return other.price < price ? other : this; }
  public void setPrice(int price) { this.price = price < 0 ? 0 : price; }
  public String toString() { return name + "$" + price; } }
class Hero { String name; private int gold = 10; Item held; ArrayList<Item> bag = new ArrayList<>(); Hero friend; double luck = 0.5;
  Hero(String name) { this.name = name; }
  int getGold() { return gold; }
  void take(Item i) { held = i; bag.add(i); gold -= i.price; }
  boolean has(Item i) { return bag.contains(i); }
  Hero meet(Hero other) { friend = other; return this; }
  static Hero named(String n) { return new Hero(n); } }`;
const OBJECT_SETUP = 'Item i = new Item("axe", 5); Item j = new Item("bow"); Hero h = new Hero("Ann"); Hero g = null; h.take(i); ArrayList<Item> items = new ArrayList<>(); items.add(j);';
const OBJECT_AFTER = 'i + " " + j + " " + h.getGold() + h.bag + h.name + Item.count() + items + (h.held == i) + (h.friend == null)';
const OBJECTS = ['i', 'i', 'j', 'h', 'h', 'g', 'h.held', 'h.friend', 'items.get(0)', 'this', 'Item', 'Hero', 'new Item("z", 9)', 'Hero.named("Bo")', 'h.bag', 'items', 's'];
const OBJECT_LEAVES = [...OBJECTS, 'a', 'a', 's', 't', 'null', '1', '0', '"x"', '2.5', 'i.price', 'h.name', 'Item.made', 'h.luck', 'i.boxed'];
const OBJECT_FIELDS = ['name', 'price', 'made', 'hidden', 'tax', 'boxed', 'gold', 'held', 'bag', 'friend', 'luck', 'length', 'size'];
const OBJECT_METHODS = ['getName', 'secret', 'twice', 'count', 'cheaper', 'setPrice', 'toString', 'getGold', 'take', 'has', 'meet', 'named', 'equals', 'add', 'contains', 'indexOf', 'size', 'get', 'remove', 'length'];
const OBJECT_TYPES = ['int', 'int', 'String', 'boolean', 'double', 'Item', 'Item', 'Hero', 'var', 'var', 'ArrayList<Item>', 'Integer'];

function objectExpression(rng, depth) {
  const sub = () => (depth <= 0 || rng.next() < 0.65 ? rng.pick(OBJECT_LEAVES) : objectExpression(rng, depth - 1));
  const obj = () => (rng.next() < 0.85 ? rng.pick(OBJECTS) : sub());
  const some = n => Array.from({ length: n }, sub).join(', ');
  switch (rng.int(16)) {
    case 0: case 1: case 2: return `${obj()}.${rng.pick(OBJECT_FIELDS)}`;
    case 3: case 4: case 5: case 6: return `${obj()}.${rng.pick(OBJECT_METHODS)}(${some(rng.pick([0, 0, 1, 1, 1, 2]))})`;
    case 7: return `new ${rng.pick(['Item', 'Item', 'Hero'])}(${some(rng.pick([0, 1, 1, 2, 2, 3]))})`;
    case 8: return `(${obj()}.${rng.pick(OBJECT_FIELDS)} ${rng.pick(['=', '=', '+=', '-='])} ${sub()})`;
    case 9: return `${obj()}.${rng.pick(OBJECT_FIELDS)}${rng.pick(['++', '--'])}`;
    case 10: return `(${sub()} ${rng.pick(['==', '!=', '+', '<'])} ${sub()})`;
    case 11: return `(t ? ${sub()} : ${sub()})`;
    case 12: return `${rng.pick(['getName', 'count', 'twice', 'named', 'getGold'])}(${some(rng.pick([0, 1]))})`;
    case 13: return `(${rng.pick(['i', 'j', 'h', 'g', 'a', 's'])} = ${sub()})`;
    default: return sub();
  }
}

/** `count` cases: half store the result in a variable of a random type, half are a statement whose effect is printed. */
export function objectCases(seed, count, depth = 1) {
  const rng = randomSource(seed);
  return Array.from({ length: count }, (_, k) => {
    const expression = objectExpression(rng, depth);
    const body = k % 2 ? `${expression}; return ${OBJECT_AFTER};` : `${rng.pick(OBJECT_TYPES)} v = ${expression}; return v + " " + ${OBJECT_AFTER};`;
    return {
      classes: OBJECT_CLASSES,
      methods: `  String m(int a, String s, boolean t) {\n    ${OBJECT_SETUP}\n    ${body}\n  }`,
      calls: ['m(1, "axe", true)', 'm(-4, null, false)'],
    };
  });
}
