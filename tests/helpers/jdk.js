// tests/helpers/jdk.js — the real JDK, as the oracle for the practice Java.
//
// src/jtiny.js is hand-written, and its whole value is that it never runs a
// program differently from Java. The way to know is to ask Java: hand the same
// methods and the same calls to javac + the JVM and to jtiny, and require the
// same answers — including the same exception, and the same refusal to compile.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileJava, evaluateJava, callJava, assembleJava, javaFromJson, javaText, javaRepr, javaDouble, parseJavaSignature, JavaError } from '../../src/jtiny.js';

const MINIMUM_JAVA = 25;   // the Java sets teach Java 25, and a few cases here need it

/** A working JDK of a recent enough version, as { java, version }, or null. */
export function findJdk() {
  for (const name of [process.env.LOTRD_JAVA, 'java'].filter(Boolean)) {
    try {
      const r = spawnSync(name, ['-version'], { encoding: 'utf8', timeout: 30000 });
      const m = /version "(\d+)/.exec(`${r.stderr}${r.stdout}`);
      if (r.status === 0 && m && Number(m[1]) >= MINIMUM_JAVA) return { java: name, version: Number(m[1]) };
    } catch (_) { /* try the next one */ }
  }
  return null;
}

// What prints a result. Overloads rather than Object, so a char stays a char
// and an int[] is printed by its values. The $ keeps these clear of any name a
// test case might use.
const SHOW = `
  static String $show(int v) { return String.valueOf(v); }
  static String $show(long v) { return String.valueOf(v); }
  static String $show(double v) { return String.valueOf(v); }
  static String $show(char v) { return String.valueOf(v); }
  static String $show(boolean v) { return String.valueOf(v); }
  static String $show(String v) { return v == null ? "null" : "\\"" + v + "\\""; }
  static String $show(StringBuilder v) { return v == null ? "null" : "\\"" + v + "\\""; }
  static String $show(Integer v) { return String.valueOf(v); }
  static String $show(Long v) { return String.valueOf(v); }
  static String $show(Double v) { return String.valueOf(v); }
  static String $show(Character v) { return String.valueOf(v); }
  static String $show(Boolean v) { return String.valueOf(v); }
  static String $show(Integer[] v) { return java.util.Arrays.toString(v); }
  static String $show(Long[] v) { return java.util.Arrays.toString(v); }
  static String $show(Double[] v) { return java.util.Arrays.toString(v); }
  static String $show(Character[] v) { return java.util.Arrays.toString(v); }
  static String $show(Boolean[] v) { return java.util.Arrays.toString(v); }
  static String $show(Collection<?> v) { return String.valueOf(v); }
  static String $show(Map<?, ?> v) { return String.valueOf(v); }
  @SafeVarargs static <T> ArrayList<T> $list(T... xs) { return new ArrayList<>(Arrays.asList(xs)); }
  @SafeVarargs static <T> LinkedList<T> $linked(T... xs) { return new LinkedList<>(Arrays.asList(xs)); }
  @SafeVarargs static <T> HashSet<T> $set(T... xs) { HashSet<T> s = new HashSet<>(); for (T x : xs) s.add(x); return s; }
  @SuppressWarnings("unchecked") static <K, V> HashMap<K, V> $map(Object... kv) { HashMap<K, V> m = new HashMap<>(); for (int i = 0; i < kv.length; i += 2) m.put((K) kv[i], (V) kv[i + 1]); return m; }
  static String $show(int[] v) { return java.util.Arrays.toString(v); }
  static String $show(long[] v) { return java.util.Arrays.toString(v); }
  static String $show(double[] v) { return java.util.Arrays.toString(v); }
  static String $show(char[] v) { return java.util.Arrays.toString(v); }
  static String $show(boolean[] v) { return java.util.Arrays.toString(v); }
  static String $show(String[] v) { return java.util.Arrays.toString(v); }
  static String $show(int[][] v) { return java.util.Arrays.deepToString(v); }
  static String $show(double[][] v) { return java.util.Arrays.deepToString(v); }
  static String $show(char[][] v) { return java.util.Arrays.deepToString(v); }
  static String $show(boolean[][] v) { return java.util.Arrays.deepToString(v); }
  static String $show(String[][] v) { return java.util.Arrays.deepToString(v); }
`;

/** The same rendering, for a jtiny value. */
export function show(value, type) {
  if (type === 'String' || type === 'StringBuilder') return value === null ? 'null' : `"${javaText(value, type)}"`;
  return javaText(value, type);
}

/** A value from a question file's test table, written as the Java expression that makes it. */
export function javaLiteral(value, type) {
  if (value === null) return 'null';
  if (type.endsWith('[]')) {
    const elem = type.slice(0, -2);
    const braces = (v, t) => (v === null ? 'null' : `{${v.map(x => (t.endsWith('[]') ? braces(x, t.slice(0, -2)) : javaLiteral(x, t))).join(', ')}}`);
    return `new ${type} ${braces(value, elem)}`;
  }
  if (type.endsWith('>')) {
    // A collection: made by a helper, with the element type spelled out so that an empty one, or a null in one, is still typed.
    const base = type.slice(0, type.indexOf('<'));
    const [K, V] = type.slice(type.indexOf('<') + 1, -1).split(',');
    const element = (v, t) => (v === null ? `(${t}) null` : javaLiteral(v, t));
    if (V) return `this.<${K}, ${V}>$map(${value.map(([k, v]) => `${element(k, K)}, ${element(v, V)}`).join(', ')})`;
    const helper = base === 'LinkedList' ? '$linked' : base === 'HashSet' || base === 'Set' ? '$set' : '$list';
    return `this.<${K}>${helper}(${value.map(v => element(v, K)).join(', ')})`;
  }
  const WRAPPED = { Integer: 'int', Long: 'long', Double: 'double', Character: 'char', Boolean: 'boolean' };
  if (WRAPPED[type]) return javaLiteral(value, WRAPPED[type]);
  switch (type) {
    case 'long': return `${value}L`;
    case 'double':
      if (value === 'NaN' || Number.isNaN(value)) return 'Double.NaN';
      if (value === 'Infinity' || value === Infinity) return 'Double.POSITIVE_INFINITY';
      if (value === '-Infinity' || value === -Infinity) return 'Double.NEGATIVE_INFINITY';
      return value < 0 || Object.is(value, -0) ? `(${javaDouble(value)})` : javaDouble(value);
    case 'char': return javaRepr(value.charCodeAt(0), 'char');
    case 'String': return javaRepr(value, 'String');
    case 'int': return value < 0 ? `(${value})` : String(value);
    default: return String(value);
  }
}

/** A Java write-the-code question as a comparison case: its reference solution, called with every row of its table. */
export function caseForProblem(question) {
  const sig = parseJavaSignature(question.signature);
  return {
    methods: `${sig.header} {\n${question.solution}\n}`,
    calls: question.tests.map(t => `${sig.name}(${t.args.map((a, i) => javaLiteral(a, sig.params[i].type)).join(', ')})`),
  };
}

/**
 * A question's reference solution on jtiny, the way the game runs it: each row's arguments are made from
 * the question file, not written as Java. (A map argument has no Java expression that jtiny runs.)
 */
export function runProblemOnJtiny(question) {
  const sig = parseJavaSignature(question.signature);
  let method;
  try {
    const program = compileJava(assembleJava(question.signature, question.solution).source);
    method = program.methods.get(sig.name).find(m => m.paramTypes.join() === sig.params.map(p => p.type).join());
  } catch (err) {
    if (!(err instanceof JavaError)) throw err;
    return { compiled: false, compileError: err.message, unsupported: err.unsupported, out: '' };
  }
  let out = '';
  let refused = null;
  for (const row of question.tests) {
    const result = callJava(method, row.args.map((a, i) => javaFromJson(a, sig.params[i].type)));
    out += result.machine.out;
    if (result.error) {
      if (result.error.exception) out += `!${result.error.exception}\n`;
      else { out += '?refused\n'; refused = refused || result.error.message; }
    } else {
      out += show(result.value, sig.ret) + '\n';
    }
  }
  return { compiled: true, compileError: null, out, refused };
}

/** One test case as a Java class: its methods, and each call printed or its exception named. */
export function javaClassFor({ methods, calls }, className) {
  const body = calls.map(call =>
    `    try { System.out.println($show(${call})); } catch (Throwable t) { System.out.println("!" + t.getClass().getSimpleName()); }`).join('\n');
  return `import java.util.*;\npublic class ${className} {\n${methods}\n${SHOW}\n  void $run() {\n${body}\n  }\n` +
    `  public static void main(String[] args) { new ${className}().$run(); }\n}\n`;
}

// Compiles and runs every case in ONE JVM, and compiles them together — some
// fifty times faster than one at a time. javac stops at the first kind of error
// it meets (it will not look for a missing return in a file while another has a
// syntax error), so the files that failed are set aside and the rest compiled
// again, until a round comes back clean. What is left compiles; what was set
// aside does not, and its first error is kept.
const DRIVER = `
import javax.tools.*;
import java.io.*;
import java.lang.reflect.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

public class Driver {
  static final JavaCompiler JC = ToolProvider.getSystemJavaCompiler();
  static final Base64.Encoder B64 = Base64.getEncoder();

  /** One round. Returns the first error of each file that has one; empty when everything compiled. */
  static Map<Integer, String> compile(Path src, Path out, Collection<Integer> which) throws IOException {
    Map<Integer, String> errors = new TreeMap<>();
    List<Path> sources = new ArrayList<>();
    for (int i : which) sources.add(src.resolve("P" + i + ".java"));
    DiagnosticCollector<JavaFileObject> diags = new DiagnosticCollector<>();
    try (StandardJavaFileManager fm = JC.getStandardFileManager(diags, null, StandardCharsets.UTF_8)) {
      boolean ok = JC.getTask(null, fm, diags,
          List.of("-d", out.toString(), "-proc:none", "-nowarn", "-encoding", "UTF-8", "-Xmaxerrs", "1000000", "--should-stop=ifError=FLOW"), null,
          fm.getJavaFileObjectsFromPaths(sources)).call();
      if (ok) return errors;
      for (Diagnostic<? extends JavaFileObject> d : diags.getDiagnostics()) {
        if (d.getKind() != Diagnostic.Kind.ERROR || d.getSource() == null) continue;
        String name = Paths.get(d.getSource().toUri()).getFileName().toString();
        int i = Integer.parseInt(name.substring(1, name.length() - 5));
        errors.putIfAbsent(i, d.getLineNumber() + ": " + d.getMessage(Locale.ENGLISH));
      }
      if (errors.isEmpty()) for (int i : which) errors.put(i, "javac failed without naming a file");
      return errors;
    }
  }

  static String run(Path classes, String name, PrintStream real) throws Exception {
    ByteArrayOutputStream buf = new ByteArrayOutputStream();
    PrintStream ps = new PrintStream(buf, true, "UTF-8");
    System.setOut(ps);
    String err = "";
    try (URLClassLoader loader = new URLClassLoader(new URL[] { classes.toUri().toURL() })) {
      loader.loadClass(name).getMethod("main", String[].class).invoke(null, (Object) new String[0]);
    } catch (InvocationTargetException e) {
      err = e.getCause().getClass().getSimpleName();
    } catch (Throwable t) {
      err = t.getClass().getSimpleName();
    } finally {
      System.setOut(real);
    }
    ps.flush();
    return "R\\t" + B64.encodeToString(buf.toByteArray()) + "\\t" + err;
  }

  public static void main(String[] args) throws Exception {
    Path dir = Paths.get(args[0]);
    int n = Integer.parseInt(args[1]);
    PrintStream real = System.out;
    Path classes = dir.resolve("classes");
    Files.createDirectories(classes);

    Map<Integer, String> failed = new TreeMap<>();
    Set<Integer> remaining = new TreeSet<>();
    for (int i = 0; i < n; i++) remaining.add(i);
    while (!remaining.isEmpty()) {
      Map<Integer, String> errors = compile(dir.resolve("src"), classes, remaining);
      if (errors.isEmpty()) break;
      failed.putAll(errors);
      remaining.removeAll(errors.keySet());
    }

    String[] lines = new String[n];
    for (int i = 0; i < n; i++) {
      lines[i] = failed.containsKey(i)
          ? "C\\t" + B64.encodeToString(failed.get(i).getBytes(StandardCharsets.UTF_8)) + "\\t"
          : run(classes, "P" + i, real);
    }
    real.print(String.join("\\n", lines));
    real.flush();
  }
}
`;

/**
 * Run cases — each { methods, calls } — on the JDK. Returns, in order,
 * { compiled, compileError, out } where `out` is one line per call: the result,
 * or "!" and the exception's class name.
 */
export function runOnJdk(jdk, cases) {
  if (cases.length === 0) return [];
  const dir = mkdtempSync(join(tmpdir(), 'lotrd-jdk-'));
  try {
    mkdirSync(join(dir, 'src'));
    cases.forEach((c, i) => writeFileSync(join(dir, 'src', `P${i}.java`), javaClassFor(c, `P${i}`), 'utf8'));
    writeFileSync(join(dir, 'Driver.java'), DRIVER, 'utf8');
    const r = spawnSync(jdk.java, ['-Dfile.encoding=UTF-8', join(dir, 'Driver.java'), dir, String(cases.length)],
      { encoding: 'utf8', timeout: 600000, maxBuffer: 256 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(`The JDK driver failed: ${r.stderr || r.error}`);
    return r.stdout.split('\n').map(line => {
      const [kind, payload, err] = line.split('\t');
      const text = Buffer.from(payload || '', 'base64').toString('utf8').replace(/\r\n/g, '\n');
      return kind === 'C' ? { compiled: false, compileError: text, out: '' } : { compiled: true, compileError: null, out: text, crashed: err || null };
    });
  } finally {
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 5 }); } catch (_) { /* best effort */ }
  }
}

/**
 * The same case on jtiny. `compiled` is false when it refused the methods. A
 * call it refused to finish — a limit, or something it does not run — is
 * written "?refused", which never matches anything Java prints.
 */
export function runOnJtiny({ methods, calls }, limits = {}) {
  let program;
  try {
    program = compileJava(methods);
  } catch (err) {
    if (!(err instanceof JavaError)) throw err;
    return { compiled: false, compileError: err.message, unsupported: err.unsupported, out: '' };
  }
  let out = '';
  let refused = null;
  for (const call of calls) {
    let result;
    try {
      result = evaluateJava(program, call, limits);
    } catch (err) {
      if (!(err instanceof JavaError)) throw err;
      return { compiled: false, compileError: `in the call ${call}: ${err.message}`, unsupported: err.unsupported, out };
    }
    out += result.machine.out;
    if (result.error) {
      if (result.error.exception) out += `!${result.error.exception}\n`;
      else { out += '?refused\n'; refused = refused || result.error.message; }
    } else {
      out += show(result.value, result.type) + '\n';
    }
  }
  // Half of a surrogate pair on its own cannot be written as UTF-8; Java's output stream prints "?" for it.
  out = out.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '?');
  return { compiled: true, compileError: null, out, refused };
}
