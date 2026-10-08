/**
 * jtiny.js — a small Java, for writing one method and seeing what it returns.
 *
 * This is not a Java implementation. It runs the slice of Java a student writes
 * in a CodingBat-style exercise — a method that takes values and returns one —
 * and it holds itself to one rule, the same one pytiny.js keeps:
 *
 *     it may REFUSE a program, but it may never run one differently from Java.
 *
 * Java's meaning lives in its types (7 / 2 is 3, 7 / 2.0 is 3.5, 'a' + 1 is 98,
 * "" + 'a' + 1 is "a1"), so this is built the way a compiler is, in four passes:
 *
 *   1. tokenize + parse      text → tree
 *   2. check                 every expression gets its Java type; every implicit
 *                            conversion Java would insert is written into the tree
 *   3. flow                  Java's two famous compile errors, by Java's own rules:
 *                            "missing return statement" / "unreachable statement",
 *                            and "variable might not have been initialized"
 *   4. compile + run         the typed tree becomes closures and is run under a
 *                            step budget, a clock, a depth cap and a size cap
 *
 * What it runs: int, long, double, boolean, char, String, StringBuilder and
 * arrays of them; every operator; if / else, while, do, for, for-each, switch
 * (both forms, and as an expression), break, continue, return, throw; helper
 * methods and recursion; and the library methods listed in the tables below.
 *
 * What it refuses, by name: byte / short / float, collections and generics,
 * wrapper objects, classes and fields, try / catch, lambdas, labels, regular
 * expressions, formatted printing — and == between two Strings, which Java
 * answers by object identity; .equals() is what a student means.
 *
 * Everything here is checked against the real JDK in tests/jtiny-differential.test.js.
 *
 * Nothing here can reach the host page: student text is tokenized and walked as
 * data, never passed to eval or Function.
 */

// ─── Errors ──────────────────────────────────────────────────────────────────

/**
 * Anything that stops a student's method.
 *   kind 'syntax'  — it would not compile (or uses something this box does not run)
 *   kind 'runtime' — Java threw: `exception` is the class name, e.g. ArithmeticException
 *   kind 'limit'   — it ran too long, too deep or too big
 * `unsupported` marks a refusal: valid Java, perhaps, that this box does not run.
 */
export class JavaError extends Error {
    constructor(message, { line = null, hint = null, kind = 'runtime', exception = null, unsupported = false } = {}) {
        super(message);
        this.name = 'JavaError';
        this.line = line;
        this.hint = hint;
        this.kind = kind;
        this.exception = exception;
        this.unsupported = unsupported;
    }
}

const compileError = (msg, line, hint = null) => new JavaError(msg, { line, hint, kind: 'syntax' });
const notYet = (msg, line, hint = null) => new JavaError(msg, { line, hint, kind: 'syntax', unsupported: true });
const thrown = (exception, detail = null, hint = null) =>
    new JavaError(detail === null ? exception : `${exception}: ${detail}`, { kind: 'runtime', exception, hint });
const refusal = (msg, hint = null) => new JavaError(msg, { kind: 'runtime', hint, unsupported: true });
const limitError = (msg, hint = null) => new JavaError(msg, { kind: 'limit', hint });

const BOX = 'this practice box';

// ─── Tokenizer ───────────────────────────────────────────────────────────────

const KEYWORDS = new Set([
    'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const',
    'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float',
    'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native',
    'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp',
    'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'void',
    'volatile', 'while', 'true', 'false', 'null', '_',
]);

const PRIMITIVE_WORDS = new Set(['int', 'long', 'double', 'boolean', 'char', 'byte', 'short', 'float']);

const OPERATORS = [
    '>>>=', '<<=', '>>=', '>>>', '...', '->', '::', '++', '--', '&&', '||', '==', '!=', '<=', '>=',
    '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>',
    '+', '-', '*', '/', '%', '=', '<', '>', '!', '~', '?', ':', ';', ',', '.', '(', ')', '{', '}',
    '[', ']', '&', '|', '^', '@',
];

const RE_HEX = /0[xX][0-9a-fA-F_]+[lL]?/y;
const RE_BIN = /0[bB][01_]+[lL]?/y;
const RE_FLOAT = /(?:\d[\d_]*\.(?:\d[\d_]*)?(?:[eE][+-]?\d[\d_]*)?|\.\d[\d_]*(?:[eE][+-]?\d[\d_]*)?|\d[\d_]*[eE][+-]?\d[\d_]*)[fFdD]?|\d[\d_]*[fFdD]/y;
const RE_INT = /\d[\d_]*[lL]?/y;
const RE_IDENT = /[A-Za-z_$][A-Za-z0-9_$]*/y;

const SIMPLE_ESCAPES = { b: '\b', t: '\t', n: '\n', f: '\f', r: '\r', s: ' ', '"': '"', "'": "'", '\\': '\\' };

/** One escape sequence, starting just after the backslash. Returns [text, nextIndex]. */
function readEscape(src, i, line) {
    const c = src[i];
    if (c in SIMPLE_ESCAPES) return [SIMPLE_ESCAPES[c], i + 1];
    if (c >= '0' && c <= '7') {
        const m = /^(?:[0-3][0-7]{0,2}|[4-7][0-7]?)/.exec(src.slice(i, i + 3));
        return [String.fromCharCode(parseInt(m[0], 8)), i + m[0].length];
    }
    if (c === 'u') {
        const m = /^u+([0-9a-fA-F]{4})/.exec(src.slice(i, i + 12));
        if (!m) throw compileError('A \\u escape needs exactly four hex digits after it.', line);
        const code = parseInt(m[1], 16);
        // Java translates \u escapes before it reads the program, so these five would
        // end the literal or the line rather than stand for a character.
        if ([0x0a, 0x0d, 0x22, 0x27, 0x5c].includes(code)) {
            throw notYet(`${BOX} does not read \\u${m[1]} inside a literal.`, line, 'Write \\n, \\", \\\' or \\\\ instead.');
        }
        return [String.fromCharCode(code), i + m[0].length];
    }
    throw compileError(`\\${c ?? ''} is not an escape Java knows.`, line,
        'The escapes are \\n (new line), \\t (tab), \\" (quote), \\\' (apostrophe) and \\\\ (backslash).');
}

function parseDigits(text, line) {
    if (/^_|_$|__(?=\D)|_[.eElLfFdD]|[.eExXbB+-]_/.test(text)) {
        throw compileError('An underscore in a number has to sit between two digits.', line);
    }
    return text.replace(/_/g, '');
}

export function tokenize(source) {
    const src = String(source).replace(/\r\n?/g, '\n');
    const tokens = [];
    let i = 0;
    let line = 1;
    const push = (t, extra) => tokens.push({ t, line, ...extra });
    const match = re => { re.lastIndex = i; const m = re.exec(src); return m ? m[0] : null; };

    while (i < src.length) {
        const c = src[i];
        if (c === '\n') { line++; i++; continue; }
        if (c === ' ' || c === '\t' || c === '\f') { i++; continue; }
        if (c === '/' && src[i + 1] === '/') {
            while (i < src.length && src[i] !== '\n') i++;
            continue;
        }
        if (c === '/' && src[i + 1] === '*') {
            const end = src.indexOf('*/', i + 2);
            if (end < 0) throw compileError('This /* comment is never closed with */.', line);
            for (let k = i; k < end; k++) if (src[k] === '\n') line++;
            i = end + 2;
            continue;
        }

        // Numbers. A leading dot counts only when a digit follows it.
        if ((c >= '0' && c <= '9') || (c === '.' && src[i + 1] >= '0' && src[i + 1] <= '9')) {
            const startLine = line;
            let text = match(RE_HEX) || match(RE_BIN);
            let kind = text ? 'radix' : null;
            if (!text) { text = match(RE_FLOAT); kind = text ? 'float' : null; }
            if (!text) { text = match(RE_INT); kind = 'int'; }
            i += text.length;
            if (i < src.length && /[A-Za-z0-9_$]/.test(src[i])) {
                throw compileError(`"${text}${src[i]}…" is not a number Java can read.`, startLine,
                    'A name cannot begin with a digit, and a number cannot have letters in it.');
            }
            if (kind === 'float') {
                if (/[fF]$/.test(text)) {
                    throw notYet(`${BOX} has no float type, so ${text} cannot be used.`, startLine, 'Leave off the f to make it a double.');
                }
                const digits = parseDigits(text.replace(/[dD]$/, ''), startLine);
                const value = Number(digits);
                if (!Number.isFinite(value)) throw compileError(`${text} is too large to be a double.`, startLine);
                if (value === 0 && /[1-9]/.test(digits.split(/[eE]/)[0])) throw compileError(`${text} is too small to be a double.`, startLine);
                push('double', { value });
                continue;
            }
            const isLong = /[lL]$/.test(text);
            let body = parseDigits(isLong ? text.slice(0, -1) : text, startLine);
            let big;
            let decimal = false;
            if (kind === 'radix') {
                big = BigInt(body);
            } else if (body.length > 1 && body[0] === '0') {
                if (/[89]/.test(body)) {
                    throw compileError(`${text} starts with 0, so Java reads it as base 8 — and 8 and 9 are not base-8 digits.`, startLine,
                        'Remove the leading zero.');
                }
                big = BigInt('0o' + body.slice(1));
            } else {
                big = BigInt(body);
                decimal = true;
            }
            push('int', { big, decimal, isLong, text });
            continue;
        }

        const ident = match(RE_IDENT);
        if (ident) {
            i += ident.length;
            if (KEYWORDS.has(ident)) push('kw', { v: ident });
            else push('id', { v: ident });
            continue;
        }

        if (c === '"') {
            if (src.startsWith('"""', i)) {
                throw notYet(`${BOX} does not read text blocks (""").`, line, 'Use an ordinary "..." string, with \\n where you want a new line.');
            }
            let text = '';
            let k = i + 1;
            for (;;) {
                if (k >= src.length || src[k] === '\n') {
                    throw compileError('This string is never closed.', line, 'A string starts and ends with " on the same line.');
                }
                if (src[k] === '"') break;
                if (src[k] === '\\') { const [ch, next] = readEscape(src, k + 1, line); text += ch; k = next; continue; }
                text += src[k++];
            }
            i = k + 1;
            push('str', { value: text });
            continue;
        }

        if (c === "'") {
            let k = i + 1;
            let ch;
            if (k >= src.length || src[k] === '\n' || src[k] === "'") {
                throw compileError("A char literal needs exactly one character between the apostrophes.", line,
                    "For an empty piece of text use a String: \"\".");
            }
            if (src[k] === '\\') { [ch, k] = readEscape(src, k + 1, line); } else { ch = src[k++]; }
            if (src[k] !== "'") {
                throw compileError("A char holds exactly one character, so only one can go between apostrophes.", line,
                    'Text of any other length is a String and goes in double quotes: "like this".');
            }
            i = k + 1;
            push('char', { value: ch.charCodeAt(0) });
            continue;
        }

        const op = OPERATORS.find(o => src.startsWith(o, i));
        if (op) { i += op.length; push('op', { v: op }); continue; }

        if ('‘’“”'.includes(c)) {
            throw compileError(`${c} is a curly quote, which Java does not read as a quote.`, line,
                'Retype it as a straight quote: " for a String or \' for a char.');
        }
        if (c === '#') throw compileError('# does not start a comment in Java.', line, 'A Java comment starts with //');
        throw compileError(`Java has no use for the character ${c} here.`, line);
    }
    tokens.push({ t: 'eof', line });
    return tokens;
}

// ─── Parser ──────────────────────────────────────────────────────────────────

const BINARY_PRECEDENCE = {
    '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5, '==': 6, '!=': 6, '<': 7, '>': 7, '<=': 7, '>=': 7,
    '<<': 8, '>>': 8, '>>>': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10,
};
const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=', '>>>=']);
const MODIFIERS = new Set(['public', 'private', 'protected', 'static', 'final', 'abstract', 'synchronized', 'native', 'strictfp']);

// Statements this box does not run, with what to say about each.
const NOT_YET_STATEMENTS = new Map([
    ['try', 'try / catch is not available here yet.'],
    ['catch', 'try / catch is not available here yet.'],
    ['finally', 'try / catch is not available here yet.'],
    ['synchronized', 'synchronized blocks are not available here.'],
    ['assert', 'assert is not available here.'],
    ['class', 'Declaring a class inside a method is not available here.'],
    ['interface', 'Declaring an interface is not available here.'],
    ['enum', 'Declaring an enum is not available here yet.'],
    ['goto', 'goto is not part of Java.'],
]);

const describeToken = t => {
    if (t.t === 'eof') return 'the end of your code';
    if (t.t === 'str') return 'a string';
    if (t.t === 'char') return 'a char';
    if (t.t === 'int' || t.t === 'double') return 'a number';
    return `"${t.v}"`;
};

class Parser {
    constructor(tokens) {
        this.tokens = tokens;
        this.p = 0;
        this.switchExprDepth = 0;
        this.inCaseLabel = false;   // `case 1 ->` is not a lambda
    }

    get tok() { return this.tokens[this.p]; }
    peek(n = 1) { return this.tokens[Math.min(this.p + n, this.tokens.length - 1)]; }
    next() { return this.tokens[this.p++]; }
    isOp(v, t = this.tok) { return t.t === 'op' && t.v === v; }
    isKw(v, t = this.tok) { return t.t === 'kw' && t.v === v; }
    isId(t = this.tok) { return t.t === 'id'; }
    eatOp(v) { if (this.isOp(v)) { this.p++; return true; } return false; }
    eatKw(v) { if (this.isKw(v)) { this.p++; return true; } return false; }

    fail(message, hint = null, token = this.tok) { throw compileError(message, token.line, hint); }

    expectOp(v, where) {
        if (this.isOp(v)) return this.next();
        const before = this.tokens[Math.max(0, this.p - 1)];
        if (v === ';') {
            // The missing semicolon belongs to the line that should have ended with it.
            throw compileError(`Java expected a ; ${where || 'at the end of this statement'}.`, before.line,
                `Found ${describeToken(this.tok)} instead.`);
        }
        const word = v === '(' && /^after (if|while|for|switch)$/.exec(where || '');
        throw compileError(`Java expected ${v} ${where || 'here'}, but found ${describeToken(this.tok)}.`,
            this.tok.t === 'eof' ? before.line : this.tok.line,
            word ? `In Java the part after ${word[1]} always goes in parentheses: ${word[1]} (…) {` : null);
    }

    expectIdent(what) {
        if (this.isId()) return this.next();
        if (this.tok.t === 'kw') {
            if (this.tok.v === '_') throw notYet(`${BOX} does not use _ as a name.`, this.tok.line);
            this.fail(`"${this.tok.v}" is a Java keyword, so it cannot be ${what}.`);
        }
        this.fail(`Java expected ${what} here, but found ${describeToken(this.tok)}.`);
    }

    // ── types

    /** True when a type starts here AND a declaration follows: `int x`, `String[] a`, `var n`. */
    startsDeclaration() {
        const t = this.tok;
        if (this.isKw('final')) return true;
        if (t.t === 'kw' && PRIMITIVE_WORDS.has(t.v)) {
            // `int.class` and the like are not declarations, but nothing here uses them.
            return true;
        }
        if (t.t !== 'id') return false;
        if (t.v === 'yield' && this.switchExprDepth) return false;      // yield total;
        const n = this.peek();
        if (n.t === 'id') return true;                                  // String s, var n
        if (this.isOp('[', n) && this.isOp(']', this.peek(2))) return true;   // String[] a
        if (this.isOp('<', n) && /^[A-Z]/.test(t.v)) {
            // List<Integer> xs — a generic type, if the angle brackets close and a name follows.
            let depth = 0;
            for (let k = this.p + 1; k < this.tokens.length; k++) {
                const x = this.tokens[k];
                if (this.isOp('<', x)) depth++;
                else if (this.isOp('>', x)) depth--;
                else if (this.isOp('>>', x)) depth -= 2;
                else if (!(x.t === 'id' || this.isOp(',', x) || this.isOp('?', x) || this.isOp('[', x) || this.isOp(']', x) ||
                    (x.t === 'kw' && (PRIMITIVE_WORDS.has(x.v) || x.v === 'extends' || x.v === 'super')))) return false;
                if (depth <= 0) return this.tokens[k + 1].t === 'id';
            }
        }
        return false;
    }

    parseType({ allowVoid = false } = {}) {
        const t = this.tok;
        let base;
        if (t.t === 'kw' && (PRIMITIVE_WORDS.has(t.v) || (allowVoid && t.v === 'void'))) {
            base = this.next().v;
        } else if (t.t === 'id') {
            base = this.next().v;
            while (this.isOp('.') && this.peek().t === 'id') { this.next(); base = this.next().v; }   // java.util.List → List
            if (this.isOp('<')) {
                throw notYet(`${BOX} does not have ${base}<…> or any other generic type yet.`, t.line,
                    'Arrays work: int[], String[], double[].');
            }
        } else {
            this.fail(`Java expected a type here (int, String, boolean …), but found ${describeToken(t)}.`);
        }
        let dims = 0;
        while (this.isOp('[') && this.isOp(']', this.peek())) { this.p += 2; dims++; }
        if (base === 'void' && dims) this.fail('void cannot be an array.');
        return { base, dims, line: t.line };
    }

    // ── a pasted class, or a run of methods

    parseProgram() {
        while (this.isKw('import') || this.isKw('package')) {
            while (!this.isOp(';') && this.tok.t !== 'eof') this.next();
            this.expectOp(';', 'at the end of the import line');
        }
        let start = this.p;
        while (this.tok.t === 'kw' && MODIFIERS.has(this.tok.v)) this.next();
        let methods;
        if (this.isKw('class')) {
            this.next();
            const name = this.expectIdent('the name of the class');
            if (this.isKw('extends') || this.isKw('implements')) {
                throw notYet(`${BOX} does not run classes that extend or implement anything.`, name.line);
            }
            this.expectOp('{', 'after the class name');
            methods = this.parseMembers(true);
            this.expectOp('}', 'to close the class');
            if (this.tok.t !== 'eof') this.fail(`There is code after the end of class ${name.v}.`, 'Check that every { has exactly one matching }.');
        } else {
            this.p = start;
            methods = this.parseMembers(false);
            if (this.tok.t !== 'eof') {
                if (this.isOp('}')) this.fail('There is one more } than there are {.', 'Every { needs exactly one matching }.');
                this.fail('This line is outside the method.', 'Check that every { has a matching } — a } too early ends the method before this line.');
            }
        }
        return { methods };
    }

    parseMembers(inClass) {
        const methods = [];
        for (;;) {
            if (this.tok.t === 'eof' || this.isOp('}')) break;
            if (this.eatOp(';')) continue;
            const first = this.tok;
            const mods = new Set();
            if (this.isOp('@')) throw notYet(`${BOX} does not read annotations such as @Override.`, first.line, 'Remove that line.');
            while (this.tok.t === 'kw' && MODIFIERS.has(this.tok.v)) mods.add(this.next().v);
            if (this.isKw('class') || this.isKw('interface') || this.isKw('enum') || (this.isId() && this.tok.v === 'record' && this.peek().t === 'id')) {
                throw notYet(`${BOX} runs methods, not ${inClass ? 'nested ' : ''}classes.`, first.line, 'Write the method the problem asks for.');
            }
            const looksLikeMethod = (this.isKw('void') || this.isId() || (this.tok.t === 'kw' && PRIMITIVE_WORDS.has(this.tok.v)));
            if (!looksLikeMethod) {
                if (!inClass) break;
                this.fail(`Java expected a method here, but found ${describeToken(this.tok)}.`);
            }
            if (this.isId() && this.isOp('(', this.peek())) {
                throw notYet(`${BOX} does not run constructors.`, first.line, 'A method needs a return type before its name: public int total(...)');
            }
            const save = this.p;
            const ret = this.parseType({ allowVoid: true });
            if (!this.isId() || !this.isOp('(', this.peek())) {
                if (this.isId() && (this.isOp('=', this.peek()) || this.isOp(';', this.peek()) || this.isOp(',', this.peek()))) {
                    throw notYet(`${BOX} does not have fields — variables declared outside a method.`, first.line,
                        'Declare the variable inside the method that uses it.');
                }
                if (!inClass && mods.size === 0) { this.p = save; break; }
                this.fail(`Java expected a method name and ( here, but found ${describeToken(this.tok)}.`);
            }
            const name = this.next();
            this.next();   // (
            const params = [];
            while (!this.isOp(')')) {
                if (params.length) this.expectOp(',', 'between parameters');
                const isFinal = this.eatKw('final');
                const type = this.parseType();
                if (this.isOp('...')) throw notYet(`${BOX} does not have varargs (...).`, this.tok.line, 'Take an array instead: int[] nums');
                const pname = this.expectIdent('a parameter name');
                if (this.isOp('[')) throw notYet(`${BOX} wants the [] on the type: int[] ${pname.v}`, pname.line);
                params.push({ type, name: pname.v, isFinal, line: pname.line });
            }
            this.next();   // )
            if (this.isKw('throws')) {
                throw notYet(`${BOX} does not use throws clauses.`, this.tok.line, 'Remove "throws …" from the method line.');
            }
            if (!this.isOp('{')) {
                if (this.isOp(';')) this.fail(`The method ${name.v} has no body.`, 'After the ) comes { … } with the code inside.');
                this.fail(`Java expected { to open the body of ${name.v}, but found ${describeToken(this.tok)}.`);
            }
            const body = this.parseBlock();
            methods.push({
                name: name.v, ret, params, body, line: name.line, endLine: this.tokens[this.p - 1].line,
                isStatic: mods.has('static'), mods,
            });
        }
        return methods;
    }

    // ── statements

    parseBlock() {
        const open = this.expectOp('{');
        const body = [];
        while (!this.isOp('}')) {
            if (this.tok.t === 'eof') {
                throw compileError('A { is never closed.', open.line, 'Every { needs a matching }.');
            }
            body.push(this.parseBlockStatement());
        }
        const close = this.next();
        return { k: 'block', body, line: open.line, endLine: close.line };
    }

    /** A statement where a declaration is allowed: directly inside { }. */
    parseBlockStatement() {
        if (this.isId() && this.tok.v === 'var' && this.peek().t === 'id') return this.parseLocal(true);
        if (this.startsDeclaration()) return this.parseLocal(true);
        return this.parseStatement();
    }

    parseLocal(wantSemicolon) {
        const line = this.tok.line;
        const isFinal = this.eatKw('final');
        const type = this.parseType();
        const decls = [];
        do {
            const name = this.expectIdent('a variable name');
            if (this.isOp('[')) throw notYet(`${BOX} wants the [] on the type: ${type.base}[] ${name.v}`, name.line);
            let init = null;
            if (this.eatOp('=')) init = this.isOp('{') ? this.parseArrayInit() : this.parseExpr();
            decls.push({ name: name.v, init, line: name.line });
        } while (this.eatOp(','));
        if (wantSemicolon) this.expectOp(';', 'at the end of this declaration');
        return { k: 'local', type, decls, isFinal, line };
    }

    /** The body of an if or a loop: any statement except a bare declaration. */
    parseSubStatement() {
        if (!this.isOp('{') && ((this.isId() && this.tok.v === 'var' && this.peek().t === 'id') || this.startsDeclaration())) {
            this.fail('A variable cannot be declared here without braces around it.',
                'Put { } around the body — a variable declared there would vanish at once anyway.');
        }
        return this.parseStatement();
    }

    parseStatement() {
        const t = this.tok;
        const line = t.line;
        if (this.isOp('{')) return this.parseBlock();
        if (this.eatOp(';')) return { k: 'empty', line };

        if (t.t === 'kw') {
            if (NOT_YET_STATEMENTS.has(t.v)) throw notYet(NOT_YET_STATEMENTS.get(t.v), line);
            switch (t.v) {
                case 'if': {
                    this.next();
                    this.expectOp('(', 'after if');
                    const cond = this.parseExpr();
                    this.expectOp(')', 'to close the condition');
                    const emptyThen = this.isOp(';');
                    const then = this.parseSubStatement();
                    const otherwise = this.eatKw('else') ? this.parseSubStatement() : null;
                    if (emptyThen && !otherwise) {
                        // Legal Java, and almost never meant: the if ends at the ; and what follows always runs.
                        throw notYet('There is a ; straight after the if (…). Java reads that as an if that does nothing, so the line after it would always run.', line, 'Remove that ;');
                    }
                    return { k: 'if', cond, then, otherwise, line };
                }
                case 'else':
                    this.fail('This else has no if to belong to.', 'An else comes straight after the } of its if (or after its one-line body).');
                    break;
                case 'while': {
                    this.next();
                    this.expectOp('(', 'after while');
                    const cond = this.parseExpr();
                    this.expectOp(')', 'to close the condition');
                    const body = this.parseSubStatement();
                    return { k: 'while', cond, body, line };
                }
                case 'do': {
                    this.next();
                    const body = this.parseSubStatement();
                    if (!this.eatKw('while')) this.fail('A do loop ends with while (…);');
                    this.expectOp('(', 'after while');
                    const cond = this.parseExpr();
                    this.expectOp(')', 'to close the condition');
                    this.expectOp(';', 'after the while (…) that ends a do loop');
                    return { k: 'do', cond, body, line };
                }
                case 'for': return this.parseFor();
                case 'return': {
                    this.next();
                    const e = this.isOp(';') ? null : this.parseExpr();
                    this.expectOp(';', 'after the return');
                    return { k: 'return', e, line };
                }
                case 'break':
                case 'continue':
                    this.next();
                    if (this.isId()) throw notYet(`${BOX} does not have labelled ${t.v}.`, line);
                    this.expectOp(';', `after ${t.v}`);
                    return { k: t.v, line };
                case 'throw': {
                    this.next();
                    const e = this.parseExpr();
                    this.expectOp(';', 'after the throw');
                    return { k: 'throw', e, line };
                }
                case 'switch': {
                    // `switch (x) { … }` at the start of a statement is a switch statement.
                    this.next();
                    return this.parseSwitch(line, false);
                }
                case 'case':
                case 'default':
                    this.fail(`"${t.v}" only belongs inside a switch.`);
                    break;
                default:
                    break;
            }
        }

        if (this.isId() && this.isOp(':', this.peek())) throw notYet(`${BOX} does not have labels.`, line);
        if (this.isId() && t.v === 'yield' && !this.isOp('=', this.peek()) && !this.isOp('.', this.peek()) && !this.isOp('(', this.peek())) {
            if (!this.switchExprDepth) this.fail('yield only belongs inside a switch that produces a value.');
            this.next();
            const e = this.parseExpr();
            this.expectOp(';', 'after the yield');
            return { k: 'yield', e, line };
        }

        const e = this.parseExpr();
        this.checkStatementExpression(e);
        this.expectOp(';', 'at the end of this statement');
        return { k: 'expr', e, line };
    }

    checkStatementExpression(e) {
        if (e.k === 'assign' || e.k === 'incdec' || e.k === 'call' || e.k === 'new') return;
        const hint = e.k === 'binary' && e.op === '=='
            ? '== compares two values. To store a value, use a single ='
            : 'A statement has to DO something: store a value, call a method, or return.';
        throw compileError('This line works out a value and then does nothing with it, which Java does not allow.', e.line, hint);
    }

    parseFor() {
        const line = this.next().line;
        this.expectOp('(', 'after for');
        // for (int x : xs) — a declaration followed by a colon
        if ((this.isId() && this.tok.v === 'var' && this.peek().t === 'id') || this.startsDeclaration()) {
            const save = this.p;
            const isFinal = this.eatKw('final');
            const type = this.parseType();
            if (this.isId() && this.isOp(':', this.peek())) {
                const name = this.next();
                this.next();
                const iter = this.parseExpr();
                this.expectOp(')', 'to close the for');
                const body = this.parseSubStatement();
                return { k: 'foreach', type, name: name.v, isFinal, iter, body, line, nameLine: name.line };
            }
            this.p = save;
        }
        let init = [];
        if (!this.isOp(';')) {
            if ((this.isId() && this.tok.v === 'var' && this.peek().t === 'id') || this.startsDeclaration()) {
                init = [this.parseLocal(false)];
            } else {
                do {
                    const e = this.parseExpr();
                    this.checkStatementExpression(e);
                    init.push({ k: 'expr', e, line: e.line });
                } while (this.eatOp(','));
            }
        }
        if (this.isOp(')') || this.isOp(',')) {
            this.fail('The three parts of a for loop are separated by semicolons.', 'for (int i = 0; i < n; i++)');
        }
        this.expectOp(';', 'after the first part of the for');
        const cond = this.isOp(';') ? null : this.parseExpr();
        if (this.isOp(')') || this.isOp(',')) {
            this.fail('The three parts of a for loop are separated by semicolons.', 'for (int i = 0; i < n; i++)');
        }
        this.expectOp(';', 'after the condition of the for');
        const update = [];
        if (!this.isOp(')')) {
            do {
                const e = this.parseExpr();
                this.checkStatementExpression(e);
                update.push(e);
            } while (this.eatOp(','));
        }
        this.expectOp(')', 'to close the for');
        const body = this.parseSubStatement();
        return { k: 'for', init, cond, update, body, line };
    }

    /** After the word `switch`. `asExpr` is true when its value is being used. */
    parseSwitch(line, asExpr) {
        this.expectOp('(', 'after switch');
        const sel = this.parseExpr();
        this.expectOp(')', 'to close the switch');
        this.expectOp('{', 'to open the switch');
        const cases = [];
        let arrow = null;
        if (asExpr) this.switchExprDepth++;
        while (!this.isOp('}')) {
            const caseLine = this.tok.line;
            const labels = [];
            let isDefault = false;
            if (this.eatKw('default')) {
                isDefault = true;
            } else if (this.eatKw('case')) {
                do {
                    if (this.isKw('null') || this.isKw('default')) throw notYet(`${BOX} does not have "case null" or "case …, default".`, caseLine);
                    this.inCaseLabel = true;
                    labels.push(this.parseTernary());
                    this.inCaseLabel = false;
                    if (this.isId()) throw notYet(`${BOX} does not have pattern matching in switch.`, caseLine);
                } while (this.eatOp(','));
            } else if (this.tok.t === 'eof') {
                throw compileError('This switch is never closed with }.', line);
            } else {
                this.fail(`Inside a switch, Java expected "case" or "default" here, but found ${describeToken(this.tok)}.`);
            }
            let isArrow;
            if (this.eatOp('->')) isArrow = true;
            else if (this.eatOp(':')) isArrow = false;
            else this.fail(`Java expected -> or : after the ${isDefault ? 'default' : 'case label'}.`);
            if (arrow === null) arrow = isArrow;
            else if (arrow !== isArrow) this.fail('A switch uses either "case x:" or "case x ->" throughout — not a mixture.');

            if (isArrow) {
                let body;
                if (this.isOp('{')) body = this.parseBlock();
                else if (this.isKw('throw')) body = this.parseStatement();
                else {
                    const e = this.parseExpr();
                    if (!asExpr) this.checkStatementExpression(e);
                    this.expectOp(';', 'after this case');
                    body = { k: asExpr ? 'value' : 'expr', e, line: e.line };
                }
                cases.push({ labels, isDefault, body, line: caseLine });
            } else {
                // case 1: case 2: … share one group of statements
                const stmts = [];
                while (!this.isKw('case') && !this.isKw('default') && !this.isOp('}')) {
                    if (this.tok.t === 'eof') throw compileError('This switch is never closed with }.', line);
                    stmts.push(this.parseBlockStatement());
                }
                cases.push({ labels, isDefault, stmts, line: caseLine });
            }
        }
        if (asExpr) this.switchExprDepth--;
        const close = this.next();
        if (asExpr && arrow === false) {
            throw notYet(`${BOX} only runs a value-producing switch written with arrows: case 1 -> …`, line);
        }
        return { k: asExpr ? 'switchexpr' : 'switch', sel, cases, arrow: arrow !== false, line, endLine: close.line };
    }

    // ── expressions

    parseArrayInit() {
        const open = this.next();
        const elems = [];
        while (!this.isOp('}')) {
            elems.push(this.isOp('{') ? this.parseArrayInit() : this.parseExpr());
            if (!this.eatOp(',')) break;
        }
        this.expectOp('}', 'to close the list of array values');
        return { k: 'arrinit', elems, line: open.line };
    }

    parseExpr() {
        const left = this.parseTernary();
        if (this.tok.t === 'op' && ASSIGN_OPS.has(this.tok.v)) {
            const op = this.next();
            let target = left;
            while (target.k === 'paren') target = target.e;
            if (target.k !== 'name' && target.k !== 'index') {
                if (target.k === 'field') {
                    throw compileError(target.name === 'length'
                        ? 'The length of an array cannot be changed.'
                        : 'Only a variable or an array element can be given a value here.', op.line);
                }
                throw compileError('The left side of = has to be a variable (or an array element).', op.line,
                    op.v === '=' ? 'To compare two values use ==' : null);
            }
            const e = this.isOp('{') && op.v === '='
                ? this.fail('A { … } list of values can only be used when the array is declared.', 'Elsewhere, write: new int[] { 1, 2, 3 }')
                : this.parseExpr();
            return { k: 'assign', op: op.v, target, e, line: op.line };
        }
        return left;
    }

    parseTernary() {
        const cond = this.parseBinary(1);
        if (!this.isOp('?')) return cond;
        const q = this.next();
        const a = this.parseExpr();
        this.expectOp(':', 'between the two results of a ? :');
        const b = this.parseTernaryOrLambda();
        return { k: 'cond', c: cond, a, b, line: q.line };
    }

    parseTernaryOrLambda() { return this.parseTernary(); }

    parseBinary(minPrec) {
        let left = this.parseUnary();
        for (;;) {
            const t = this.tok;
            if (this.isKw('instanceof')) throw notYet(`${BOX} does not have instanceof.`, t.line);
            if (t.t !== 'op') break;
            const prec = BINARY_PRECEDENCE[t.v];
            if (prec === undefined || prec < minPrec) break;
            this.next();
            const right = this.parseBinary(prec + 1);
            left = { k: 'binary', op: t.v, l: left, r: right, line: t.line };
        }
        return left;
    }

    parseUnary() {
        const t = this.tok;
        if (t.t === 'op') {
            if (t.v === '+' || t.v === '-' || t.v === '!' || t.v === '~') {
                this.next();
                // -2147483648 is legal though 2147483648 is not: the sign is read with the digits.
                const n = this.tok;
                if (t.v === '-' && n.t === 'int' && n.decimal &&
                    ((!n.isLong && n.big === 2147483648n) || (n.isLong && n.big === 9223372036854775808n))) {
                    this.next();
                    return n.isLong
                        ? { k: 'lit', type: 'long', value: -9223372036854775808n, line: t.line }
                        : { k: 'lit', type: 'int', value: -2147483648, line: t.line };
                }
                return { k: 'unary', op: t.v, e: this.parseUnary(), line: t.line };
            }
            if (t.v === '++' || t.v === '--') {
                this.next();
                const target = this.parseUnary();
                return { k: 'incdec', op: t.v, prefix: true, target: this.incTarget(target, t), line: t.line };
            }
            if (t.v === '(') {
                // (int) x — a cast, when a type and ) come next
                const n = this.peek();
                if (n.t === 'kw' && PRIMITIVE_WORDS.has(n.v)) {
                    this.next();
                    const type = this.parseType();
                    this.expectOp(')', 'to close the cast');
                    return { k: 'cast', to: type, e: this.parseUnary(), line: t.line };
                }
                if (n.t === 'id' && /^[A-Z]/.test(n.v)) {
                    // (String) x, (Integer) x, (String[]) x: a cast to an object type, if what follows could be its operand
                    let k = this.p + 2;
                    while (this.isOp('[', this.tokens[k]) && this.isOp(']', this.tokens[k + 1])) k += 2;
                    const after = this.tokens[k + 1];
                    if (this.isOp(')', this.tokens[k]) && after &&
                        (after.t === 'id' || after.t === 'str' || after.t === 'char' || after.t === 'int' || after.t === 'double' ||
                            this.isOp('(', after) || this.isOp('!', after) || this.isOp('~', after) ||
                            (after.t === 'kw' && ['new', 'this', 'true', 'false', 'null', 'super'].includes(after.v)))) {
                        throw notYet(`${BOX} does not have casts to object types such as (${n.v}).`, t.line,
                            n.v === 'String' ? 'To turn a value into text use String.valueOf(x) or "" + x' : null);
                    }
                }
            }
        }
        return this.parsePostfix();
    }

    incTarget(target, opToken) {
        let inner = target;
        while (inner.k === 'paren') inner = inner.e;
        if (inner.k !== 'name' && inner.k !== 'index') {
            throw compileError(`${opToken.v} needs a variable to change, and this is not one.`, opToken.line);
        }
        return inner;
    }

    parsePostfix() {
        let e = this.parsePrimary();
        for (;;) {
            const t = this.tok;
            if (this.isOp('.')) {
                this.next();
                if (this.isKw('new') || this.isKw('this') || this.isKw('class') || this.isKw('super')) {
                    throw notYet(`${BOX} does not have .${this.tok.v} expressions.`, t.line);
                }
                const name = this.expectIdent('a method or field name after the dot');
                if (this.isOp('(')) {
                    const args = this.parseArgs();
                    e = { k: 'call', target: e, name: name.v, args, line: name.line };
                } else {
                    e = { k: 'field', target: e, name: name.v, line: name.line };
                }
            } else if (this.isOp('[')) {
                this.next();
                if (this.isOp(']')) this.fail('There is nothing between the [ ] here.', 'To use one element give its position: nums[0]');
                const i = this.parseExpr();
                this.expectOp(']', 'to close the index');
                e = { k: 'index', target: e, i, line: t.line };
            } else if (this.isOp('++') || this.isOp('--')) {
                this.next();
                e = { k: 'incdec', op: t.v, prefix: false, target: this.incTarget(e, t), line: t.line };
            } else if (this.isOp('::')) {
                throw notYet(`${BOX} does not have method references (::).`, t.line);
            } else if (this.isOp('->') && !this.inCaseLabel) {
                throw notYet(`${BOX} does not have lambdas (->).`, t.line);
            } else break;
        }
        return e;
    }

    parseArgs() {
        this.expectOp('(');
        const args = [];
        while (!this.isOp(')')) {
            if (args.length) this.expectOp(',', 'between arguments');
            args.push(this.parseExpr());
        }
        this.next();
        return args;
    }

    parsePrimary() {
        const t = this.next();
        const line = t.line;
        switch (t.t) {
            case 'int': {
                if (t.isLong) {
                    const max = t.decimal ? 9223372036854775807n : 0xFFFFFFFFFFFFFFFFn;
                    if (t.big > max) throw compileError(`${t.text} is too large even for a long.`, line);
                    return { k: 'lit', type: 'long', value: BigInt.asIntN(64, t.big), line };
                }
                const max = t.decimal ? 2147483647n : 0xFFFFFFFFn;
                if (t.big > max) {
                    throw compileError(`${t.text} is too large for an int (the largest is 2147483647).`, line,
                        'Add an L to make it a long: ' + t.text + 'L');
                }
                return { k: 'lit', type: 'int', value: Number(BigInt.asIntN(32, t.big)), line };
            }
            case 'double': return { k: 'lit', type: 'double', value: t.value, line };
            case 'char': return { k: 'lit', type: 'char', value: t.value, line };
            case 'str': return { k: 'lit', type: 'String', value: t.value, line };
            case 'id':
                if (this.isOp('(')) return { k: 'call', target: null, name: t.v, args: this.parseArgs(), line };
                if (this.isOp('->') && !this.inCaseLabel) throw notYet(`${BOX} does not have lambdas (->).`, line);
                return { k: 'name', name: t.v, line };
            case 'kw':
                if (t.v === 'true' || t.v === 'false') return { k: 'lit', type: 'boolean', value: t.v === 'true', line };
                if (t.v === 'null') return { k: 'lit', type: 'null', value: null, line };
                if (t.v === 'new') return this.parseNew(line);
                if (t.v === 'switch') return this.parseSwitch(line, true);
                if (t.v === 'this' || t.v === 'super') throw notYet(`${BOX} does not have "${t.v}" — there are no objects of your own here yet.`, line);
                if (PRIMITIVE_WORDS.has(t.v)) {
                    throw compileError(`A declaration such as "${t.v} x" cannot go in the middle of an expression.`, line,
                        'Declare the variable on its own line first.');
                }
                if (t.v === '_') throw notYet(`${BOX} does not use _ as a name.`, line);
                break;
            case 'op':
                if (t.v === '(') {
                    // (a, b) -> …  and  () -> …
                    let depth = 1;
                    let k = this.p;
                    for (; k < this.tokens.length && depth > 0; k++) {
                        if (this.isOp('(', this.tokens[k])) depth++;
                        else if (this.isOp(')', this.tokens[k])) depth--;
                    }
                    if (this.isOp('->', this.tokens[k]) && !this.inCaseLabel) throw notYet(`${BOX} does not have lambdas (->).`, line);
                    const e = this.parseExpr();
                    this.expectOp(')', 'to close the (');
                    return { k: 'paren', e, line };
                }
                if (t.v === '{') throw compileError('A { … } list of values can only be used when the array is declared.', line, 'Elsewhere, write: new int[] { 1, 2, 3 }');
                break;
            default:
                break;
        }
        this.p--;
        if (t.t === 'eof') {
            const before = this.tokens[Math.max(0, this.p - 1)];
            throw compileError('Your code ends in the middle of an expression.', before.line);
        }
        this.fail(`Java expected a value here, but found ${describeToken(t)}.`);
        return null;
    }

    parseNew(line) {
        const t = this.tok;
        let base;
        if (t.t === 'kw' && PRIMITIVE_WORDS.has(t.v)) base = this.next().v;
        else {
            base = this.expectIdent('a type after new').v;
            while (this.isOp('.') && this.peek().t === 'id') { this.next(); base = this.next().v; }
            if (this.isOp('<')) throw notYet(`${BOX} does not have ${base}<…> or any other generic type yet.`, line, 'Arrays work: new int[5], new String[3].');
        }
        if (this.isOp('(')) {
            const args = this.parseArgs();
            if (this.isOp('{')) throw notYet(`${BOX} does not have anonymous classes.`, line);
            return { k: 'new', base, args, line };
        }
        if (!this.isOp('[')) this.fail(`After "new ${base}" Java expected [ for an array or ( for an object.`);
        const sizes = [];
        let empty = 0;
        while (this.isOp('[')) {
            this.next();
            if (this.isOp(']')) { this.next(); empty++; continue; }
            if (empty) this.fail('Once one [] of a new array is left empty, the ones after it must be empty too.');
            sizes.push(this.parseExpr());
            this.expectOp(']', 'to close the array size');
        }
        const type = { base, dims: sizes.length + empty, line };
        if (this.isOp('{')) {
            if (sizes.length) this.fail('Give a new array either a size or a { … } list of values, not both.');
            return { k: 'newarr', type, sizes: [], init: this.parseArrayInit(), line };
        }
        if (!sizes.length) this.fail('A new array needs a size: new ' + base + '[5]', 'Or list its values: new ' + base + '[] { 1, 2, 3 }');
        return { k: 'newarr', type, sizes, init: null, line };
    }
}

export function parseJava(source) {
    return new Parser(tokenize(source)).parseProgram();
}

// ─── Types ───────────────────────────────────────────────────────────────────
//
// A type is a string: 'int', 'long', 'double', 'boolean', 'char', 'String',
// 'StringBuilder', an array of any of those ('int[]', 'String[][]'), 'void' for
// a method that returns nothing, and 'null' for the literal null.

const PRIMITIVES = new Set(['int', 'long', 'double', 'boolean', 'char']);
const NUMERIC = new Set(['char', 'int', 'long', 'double']);
const INTEGRAL = new Set(['char', 'int', 'long']);
const RANK = { char: 0, int: 1, long: 2, double: 3 };

const isArray = t => t.endsWith('[]');
const elemOf = t => t.slice(0, -2);
const isReference = t => t === 'String' || t === 'StringBuilder' || t === 'null' || isArray(t);

const promote = (a, b) => (a === 'double' || b === 'double' ? 'double' : a === 'long' || b === 'long' ? 'long' : 'int');

const aType = t => (t === 'null' ? 'null' : /^[aeiou]/i.test(t) ? `an ${t}` : `a ${t}`);

const NOT_YET_TYPES = new Map([
    ['byte', 'the byte type'], ['short', 'the short type'], ['float', 'the float type'],
    ['Integer', 'the wrapper type Integer'], ['Double', 'the wrapper type Double'], ['Boolean', 'the wrapper type Boolean'],
    ['Character', 'the wrapper type Character'], ['Long', 'the wrapper type Long'],
    ['Object', 'the Object type'], ['List', 'lists'], ['ArrayList', 'lists'], ['LinkedList', 'lists'],
    ['Map', 'maps'], ['HashMap', 'maps'], ['TreeMap', 'maps'], ['Set', 'sets'], ['HashSet', 'sets'], ['TreeSet', 'sets'],
    ['Scanner', 'Scanner (there is no keyboard input here)'], ['Random', 'Random (a test needs the same answer every time)'],
    ['StringBuffer', 'StringBuffer'], ['BigInteger', 'BigInteger'], ['BigDecimal', 'BigDecimal'],
    ['Stack', 'Stack'], ['Queue', 'Queue'], ['Deque', 'Deque'], ['Optional', 'Optional'],
]);
const TYPE_HINTS = { byte: 'Use int.', short: 'Use int.', float: 'Use double.', Integer: 'Use int.', Double: 'Use double.',
    Boolean: 'Use boolean.', Character: 'Use char.', Long: 'Use long.', StringBuffer: 'Use StringBuilder.' };

function resolveType(node, { allowVoid = false } = {}) {
    const { base, dims, line } = node;
    let name;
    if (PRIMITIVES.has(base) || base === 'String' || base === 'StringBuilder') name = base;
    else if (base === 'void' && allowVoid) name = 'void';
    else if (base === 'string') throw compileError('Java spells the type String, with a capital S.', line);
    else if (NOT_YET_TYPES.has(base)) throw notYet(`${BOX} does not have ${NOT_YET_TYPES.get(base)} yet.`, line, TYPE_HINTS[base] ?? null);
    else if (base === 'var') throw compileError('var can only be used for a local variable that is given a value straight away.', line);
    else throw notYet(`${BOX} does not know the type "${base}".`, line, 'The types here are int, long, double, boolean, char, String, StringBuilder, and arrays of them.');
    return name + '[]'.repeat(dims);
}

// ─── Values ──────────────────────────────────────────────────────────────────
//
// Because every expression's type is known before it runs, values carry no tags:
//   int, char, double → a JS number (int kept in 32 bits, char in 16)
//   long              → a BigInt kept in 64 bits
//   boolean           → true / false
//   String            → a JS string, or null
//   arrays            → a JArray, or null       StringBuilder → a JBuilder, or null

class JArray {
    constructor(type, items) { this.type = type; this.a = items; }   // type is the ELEMENT type
}
class JBuilder {
    constructor(s = '') { this.s = s; }
}

const wrap64 = v => BigInt.asIntN(64, v);
const INT_MIN = -2147483648;
const INT_MAX = 2147483647;
const LONG_MIN = -(2n ** 63n);
const LONG_MAX = 2n ** 63n - 1n;

const divideByZero = () => thrown('ArithmeticException', '/ by zero',
    'A whole number cannot be divided by zero. Check that the divisor is not 0 before dividing.');

function doubleToInt(x) {
    if (x !== x) return 0;
    if (x >= INT_MAX) return INT_MAX;
    if (x <= INT_MIN) return INT_MIN;
    return Math.trunc(x) | 0;
}
function doubleToLong(x) {
    if (x !== x) return 0n;
    if (x >= 9223372036854775807) return LONG_MAX;
    if (x <= -9223372036854775808) return LONG_MIN;
    return BigInt(Math.trunc(x));
}

/** The function that converts a value of one primitive type to another; null when nothing changes. */
function converter(from, to) {
    if (from === to) return null;
    switch (`${from}>${to}`) {
        case 'char>int': case 'char>double': case 'int>double': return null;
        case 'int>char': return v => v & 0xFFFF;
        case 'int>long': case 'char>long': return v => BigInt(v);
        case 'long>int': return v => Number(BigInt.asIntN(32, v));
        case 'long>char': return v => Number(BigInt.asUintN(16, v));
        case 'long>double': return v => Number(v);
        case 'double>int': return doubleToInt;
        case 'double>char': return v => doubleToInt(v) & 0xFFFF;
        case 'double>long': return doubleToLong;
        default: return null;   // reference types and null: nothing to do
    }
}

/**
 * Double.toString, exactly: the shortest digits that name this double and no
 * other, laid out Java's way (always a decimal point; E-notation below 0.001
 * and from 10,000,000 up). JS produces the same shortest digits; one rule
 * differs — where a single digit would do, Java uses the closest two-digit
 * value instead, which is how Double.MIN_VALUE comes to print as 4.9E-324.
 */
export function javaDouble(x) {
    if (x !== x) return 'NaN';
    if (x === Infinity) return 'Infinity';
    if (x === -Infinity) return '-Infinity';
    if (x === 0) return Object.is(x, -0) ? '-0.0' : '0.0';
    const sign = x < 0 ? '-' : '';
    const a = Math.abs(x);
    let [mantissa, exponent] = a.toExponential().split('e');
    let digits = mantissa.replace('.', '');
    let e = Number(exponent);
    if (digits.length === 1) {
        const two = a.toExponential(1);
        const [m2, e2] = two.split('e');
        let pick = null;
        if (Number(two) === a) pick = [m2, e2];
        else {
            // The closest two-digit value names a different double; try its neighbour on the other side.
            const step = Number(`1e${Number(e2) - 1}`);
            const other = (Number(two) > a ? Number(two) - step : Number(two) + step).toExponential(1);
            if (Number(other) === a) pick = other.split('e');
        }
        if (pick) { digits = pick[0].replace('.', ''); e = Number(pick[1]); }
        digits = digits.replace(/0+$/, '') || '0';
    }
    if (a >= 1e-3 && a < 1e7) {
        if (e >= 0) {
            const whole = digits.slice(0, e + 1).padEnd(e + 1, '0');
            return `${sign}${whole}.${digits.slice(e + 1) || '0'}`;
        }
        return `${sign}0.${'0'.repeat(-e - 1)}${digits}`;
    }
    return `${sign}${digits[0]}.${digits.slice(1) || '0'}E${e}`;
}

/** How a value of this type reads when Java joins it to a String. */
function textOf(type) {
    switch (type) {
        case 'int': return v => String(v);
        case 'long': return v => v.toString();
        case 'double': return javaDouble;
        case 'char': return v => String.fromCharCode(v);
        case 'boolean': return v => (v ? 'true' : 'false');
        case 'String': return v => (v === null ? 'null' : v);
        case 'StringBuilder': return v => (v === null ? 'null' : v.s);
        case 'null': return () => 'null';
        default: return null;   // arrays: refused where they would be printed
    }
}

// ─── The running machine ─────────────────────────────────────────────────────

export const JAVA_LIMITS = {
    steps: 3_000_000,   // loop turns and method calls
    milliseconds: 2000,
    depth: 400,         // nested method calls; real Java allows thousands, a beginner needs dozens
};
const CELL_LIMIT = 2_000_000;    // array elements made in one run
const TEXT_LIMIT = 2_000_000;    // characters in one String
const OUTPUT_LINE_LIMIT = 60;
const OUTPUT_CHAR_LIMIT = 4000;

// The machine whose program is running. Library functions reach their limits through it.
let M = null;

class Machine {
    constructor({ steps, milliseconds, depth, now = () => Date.now() } = {}) {
        this.stepLimit = steps ?? JAVA_LIMITS.steps;
        this.depthLimit = depth ?? JAVA_LIMITS.depth;
        this.now = now;
        this.deadline = now() + (milliseconds ?? JAVA_LIMITS.milliseconds);
        this.steps = 0;
        this.depth = 0;
        this.cells = 0;
        this.ret = undefined;
        this.out = '';
        this.outputTruncated = false;
        this.printed = false;
    }

    print(text) {
        this.printed = true;
        if (this.outputTruncated) return;
        this.out += text;
        if (this.out.length > OUTPUT_CHAR_LIMIT || this.out.split('\n').length > OUTPUT_LINE_LIMIT + 1) {
            this.out = this.out.slice(0, OUTPUT_CHAR_LIMIT).split('\n').slice(0, OUTPUT_LINE_LIMIT).join('\n') + '\n… (more output not shown)';
            this.outputTruncated = true;
        }
    }

    outputLines() {
        if (this.out === '') return [];
        const lines = this.out.split('\n');
        if (lines[lines.length - 1] === '') lines.pop();
        return lines;
    }
}

function tick() {
    if (++M.steps > M.stepLimit) {
        throw limitError('Your code ran for too long and was stopped.',
            'This usually means a loop that never ends. Check that something in the loop moves it toward its stopping condition.');
    }
    if ((M.steps & 0x1FFF) === 0 && M.now() > M.deadline) {
        throw limitError('Your code ran for too long and was stopped.',
            'This usually means a loop that never ends. Check that something in the loop moves it toward its stopping condition.');
    }
}

function work(n) {
    M.steps += n >> 4;
    if (M.steps > M.stepLimit) throw limitError('Your code ran for too long and was stopped.', 'It is doing a very large amount of work on text or arrays.');
}

function text(s) {
    if (s.length > TEXT_LIMIT) throw limitError('A String grew past two million characters and the run was stopped.', 'Check for a loop that keeps adding to the same String.');
    if (s.length > 64) work(s.length);
    return s;
}

function cells(n) {
    M.cells += n;
    if (M.cells > CELL_LIMIT) throw limitError('Your code made arrays with more than two million elements in all, and was stopped.');
}

const nullPointer = what => thrown('NullPointerException', null,
    `${what} is null — there is no object there to use. Check for null first, or make sure the variable was given a real value.`);

function arrayIndex(index, length) {
    return thrown('ArrayIndexOutOfBoundsException', `Index ${index} out of bounds for length ${length}`,
        length === 0 ? 'The array is empty, so it has no positions at all.'
            : `The array has ${length} element${length === 1 ? '' : 's'}, so its positions run from 0 to ${length - 1}.`);
}
function stringIndex(detail, length) {
    return thrown('StringIndexOutOfBoundsException', detail,
        length === 0 ? 'The text is empty, so it has no positions at all.'
            : `The text has ${length} character${length === 1 ? '' : 's'}, so its positions run from 0 to ${length - 1}.`);
}

const DEFAULTS = { int: 0, char: 0, double: 0, long: 0n, boolean: false };
const defaultOf = type => (type in DEFAULTS ? DEFAULTS[type] : null);

function newArray(elemType, length) {
    if (length < 0) throw thrown('NegativeArraySizeException', String(length), 'An array cannot have a negative number of elements.');
    cells(length);
    return new JArray(elemType, new Array(length).fill(defaultOf(elemType)));
}

// ─── Operators ───────────────────────────────────────────────────────────────

const ARITHMETIC = {
    int: {
        '+': (a, b) => (a + b) | 0,
        '-': (a, b) => (a - b) | 0,
        '*': Math.imul,
        '/': (a, b) => { if (b === 0) throw divideByZero(); return (a / b) | 0; },
        '%': (a, b) => { if (b === 0) throw divideByZero(); return (a % b) | 0; },
        '&': (a, b) => a & b,
        '|': (a, b) => a | b,
        '^': (a, b) => a ^ b,
    },
    long: {
        '+': (a, b) => wrap64(a + b),
        '-': (a, b) => wrap64(a - b),
        '*': (a, b) => wrap64(a * b),
        '/': (a, b) => { if (b === 0n) throw divideByZero(); return wrap64(a / b); },
        '%': (a, b) => { if (b === 0n) throw divideByZero(); return a % b; },
        '&': (a, b) => a & b,
        '|': (a, b) => a | b,
        '^': (a, b) => a ^ b,
    },
    double: {
        '+': (a, b) => a + b,
        '-': (a, b) => a - b,
        '*': (a, b) => a * b,
        '/': (a, b) => a / b,
        '%': (a, b) => a % b,
    },
    boolean: {
        '&': (a, b) => a && b,
        '|': (a, b) => a || b,
        '^': (a, b) => a !== b,
    },
};

const COMPARISON = {
    '<': (a, b) => a < b,
    '<=': (a, b) => a <= b,
    '>': (a, b) => a > b,
    '>=': (a, b) => a >= b,
    '==': (a, b) => a === b,
    '!=': (a, b) => a !== b,
};

/** x << n and friends. Java uses only the low 5 bits of n for an int, the low 6 for a long. */
function shifter(op, leftType, rightIsLong) {
    if (leftType === 'int') {
        const n = rightIsLong ? r => Number(r & 31n) : r => r;
        if (op === '<<') return (a, r) => a << n(r);
        if (op === '>>') return (a, r) => a >> n(r);
        return (a, r) => (a >>> n(r)) | 0;
    }
    const n = rightIsLong ? r => r & 63n : r => BigInt(r & 63);
    if (op === '<<') return (a, r) => wrap64(a << n(r));
    if (op === '>>') return (a, r) => a >> n(r);
    return (a, r) => wrap64(BigInt.asUintN(64, a) >> n(r));
}

/** The function for a checked binary node, shared by constant folding and by the compiler. */
function binaryFunction(n) {
    const op = n.op;
    if (n.mode === 'concat') {
        const lt = textOf(n.l.type);
        const rt = textOf(n.r.type);
        return (a, b) => text(lt(a) + rt(b));
    }
    if (n.mode === 'shift') return shifter(op, n.optype, n.r.type === 'long');
    if (op in COMPARISON) return COMPARISON[op];
    return ARITHMETIC[n.optype][op];
}

function unaryFunction(op, type) {
    if (op === '!') return a => !a;
    if (op === '+') return a => a;
    if (op === '-') return type === 'int' ? a => (-a) | 0 : type === 'long' ? a => wrap64(-a) : a => -a;
    return type === 'int' ? a => ~a : a => ~a;   // ~ on a BigInt stays in range
}

const stepper = (type, by) => (type === 'int' ? v => (v + by) | 0
    : type === 'char' ? v => (v + by) & 0xFFFF
        : type === 'long' ? v => wrap64(v + BigInt(by))
            : v => v + by);

// ─── The library ─────────────────────────────────────────────────────────────
//
// Each entry is a list of overloads, MOST SPECIFIC FIRST, since the first one the
// arguments fit is the one used — which is the one Java would choose, given that
// order. A parameter list is written as a string: 'int String'. In it, T[] stands
// for any array and T for its element type.

const sig = (params, ret, fn, extra = {}) => ({ params: params.trim() ? params.trim().split(/\s+/) : [], ret, fn, ...extra });

const isAscii = s => /^[\x00-\x7F]*$/.test(s);
function plain(s, what) {
    if (!isAscii(s)) {
        throw refusal(`${what} is only available here for plain English text — this text has other characters in it.`);
    }
    return s;
}
function plainChar(c, what) {
    if (c < 0 || c > 127) throw refusal(`${what} is only available here for plain English characters.`);
    return c;
}

const notNull = (v, what) => { if (v === null) throw nullPointer(what); return v; };

const isJavaSpace = c => (c >= 9 && c <= 13) || (c >= 28 && c <= 32);

function stripWhitespace(s, front, back) {
    let a = 0;
    let b = s.length;
    if (front) while (a < b && isJavaSpace(plainChar(s.charCodeAt(a), 'strip()'))) a++;
    if (back) while (b > a && isJavaSpace(plainChar(s.charCodeAt(b - 1), 'strip()'))) b--;
    return s.slice(a, b);
}

function indexOfChar(s, ch, from) {
    if (ch < 0 || ch > 0x10FFFF) return -1;
    if (ch > 0xFFFF) throw refusal('Searching for characters outside the basic set is not available here.');
    return s.indexOf(String.fromCharCode(ch), from);
}
function lastIndexOfChar(s, ch, from) {
    if (ch < 0 || ch > 0x10FFFF || from < 0) return -1;
    if (ch > 0xFFFF) throw refusal('Searching for characters outside the basic set is not available here.');
    return s.lastIndexOf(String.fromCharCode(ch), from);
}

function substring(s, begin, end) {
    if (begin < 0 || begin > end || end > s.length) {
        throw stringIndex(`begin ${begin}, end ${end}, length ${s.length}`, s.length);
    }
    return s.slice(begin, end);
}

function compareStrings(a, b) {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
        const d = a.charCodeAt(i) - b.charCodeAt(i);
        if (d !== 0) return d;
    }
    return a.length - b.length;
}

function hashOfString(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
    return h;
}

function replaceAllLiteral(s, target, replacement) {
    if (target === '') {
        work(s.length);
        return text(replacement + Array.from({ length: s.length }, (_, i) => s[i] + replacement).join(''));
    }
    return text(s.split(target).join(replacement));
}

/** String.split with a pattern that is plain text. Java's rule: trailing empty pieces are dropped. */
function splitLiteral(s, pattern) {
    if (/[\\[\](){}.*+?^$|]/.test(pattern)) {
        throw refusal(`split() here only takes plain text to split on — "${pattern}" contains a regular-expression symbol.`,
            'A space " ", a comma "," or a dash "-" all work.');
    }
    let parts;
    if (pattern === '') parts = s === '' ? [''] : Array.from(s);
    else {
        parts = s.split(pattern);
        if (parts.length > 1) while (parts.length && parts[parts.length - 1] === '') parts.pop();
    }
    if (pattern === '' && !isAscii(s)) throw refusal('split("") is only available here for plain English text.');
    cells(parts.length);
    return new JArray('String', parts);
}

function parseIntStrict(s, bits) {
    if (s === null) throw thrown('NumberFormatException', 'Cannot parse null string: null', 'The text to convert is null.');
    if (!/^[+-]?\d+$/.test(s)) {
        if (!isAscii(s)) throw refusal('Turning text into a number is only available here for plain English digits.');
        throw thrown('NumberFormatException', `For input string: "${s}"`,
            s.trim() !== s ? 'The text has a space in it. Use .trim() first.' : 'The text is not a whole number, so it cannot be converted.');
    }
    const big = BigInt(s);
    const [min, max] = bits === 32 ? [BigInt(INT_MIN), BigInt(INT_MAX)] : [LONG_MIN, LONG_MAX];
    if (big < min || big > max) {
        throw thrown('NumberFormatException', `For input string: "${s}"`, `That number is too large for ${bits === 32 ? 'an int' : 'a long'}.`);
    }
    return bits === 32 ? Number(big) : big;
}

function parseDoubleStrict(s) {
    if (s === null) throw nullPointer('The text given to Double.parseDouble');
    let a = 0;
    let b = s.length;
    while (a < b && s.charCodeAt(a) <= 32) a++;
    while (b > a && s.charCodeAt(b - 1) <= 32) b--;
    const t = s.slice(a, b);
    const m = /^([+-]?)(NaN|Infinity|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?[fFdD]?)$/.exec(t);
    if (!m) {
        if (/^[+-]?0[xX]/.test(t) || !isAscii(t)) throw refusal('That form of number is not available to Double.parseDouble here.');
        throw thrown('NumberFormatException', t === '' ? 'empty String' : `For input string: "${t}"`, 'The text is not a number, so it cannot be converted.');
    }
    const value = m[2] === 'NaN' ? NaN : m[2] === 'Infinity' ? Infinity : Number(m[2].replace(/[fFdD]$/, ''));
    return m[1] === '-' ? -value : value;
}

function exactPower(x, y) {
    const whole = v => Number.isInteger(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER;
    const cannot = () => refusal(`Math.pow(${javaDouble(x)}, ${javaDouble(y)}) is not available here: ${BOX} only does powers of whole numbers that come out exact.`,
        'To square a number, multiply it by itself: x * x');
    if (!whole(x) || !whole(y) || Object.is(x, -0) || Math.abs(y) > 2000) throw cannot();
    if (y === 0) return 1;
    if (x === 0) { if (y < 0) throw cannot(); return 0; }
    if (x === 1) return 1;
    if (x === -1) return y % 2 === 0 ? 1 : -1;
    const n = Math.abs(y);
    if (Math.log2(Math.abs(x)) * n > 1100) throw cannot();
    const big = BigInt(x) ** BigInt(n);
    const result = Number(big);
    if (!Number.isFinite(result) || BigInt(result) !== big) throw cannot();
    if (y > 0) return result;
    // A negative power is exact only when the answer is 1 over a power of two.
    const magnitude = big < 0n ? -big : big;
    if ((magnitude & (magnitude - 1n)) !== 0n) throw cannot();
    const inverse = 1 / result;
    if (inverse === 0 || !Number.isFinite(inverse)) throw cannot();
    return inverse;
}

function compareDoubles(a, b) {
    if (a < b) return -1;
    if (a > b) return 1;
    if (a === b) {
        if (a !== 0) return 0;
        const an = Object.is(a, -0);
        const bn = Object.is(b, -0);
        return an === bn ? 0 : an ? -1 : 1;
    }
    return a !== a ? (b !== b ? 0 : 1) : -1;
}

const elementEquals = type => (type === 'double' ? Object.is : (a, b) => a === b);

function arraysEqual(a, b) {
    if (a === b) return true;
    if (a === null || b === null || a.a.length !== b.a.length) return false;
    const same = elementEquals(a.type);
    work(a.a.length);
    return a.a.every((v, i) => same(v, b.a[i]));
}

function arrayText(arr, what) {
    if (arr === null) return 'null';
    if (isArray(arr.type)) {
        throw refusal(`${what} on an array of arrays prints codes, not values.`, 'Use Arrays.deepToString(grid) for an array of arrays.');
    }
    const show = textOf(arr.type);
    return text('[' + arr.a.map(show).join(', ') + ']');
}

function deepText(arr) {
    if (arr === null) return 'null';
    if (!isArray(arr.type)) return arrayText(arr);
    return text('[' + arr.a.map(deepText).join(', ') + ']');
}

function sortArray(arr) {
    notNull(arr, 'The array given to Arrays.sort');
    work(arr.a.length * 16);
    if (arr.type === 'String') {
        if (arr.a.includes(null)) throw nullPointer('An element of the array being sorted');
        arr.a.sort(compareStrings);
    } else if (arr.type === 'double') arr.a.sort(compareDoubles);
    else arr.a.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
}

function copyOfRange(arr, from, to) {
    notNull(arr, 'The array being copied');
    const length = arr.a.length;
    if (from > to) throw thrown('IllegalArgumentException', `${from} > ${to}`, 'The start of the range comes after its end.');
    if (from < 0 || from > length) throw arrayIndex(from, length);
    cells(to - from);
    const items = arr.a.slice(from, Math.min(to, length));
    while (items.length < to - from) items.push(defaultOf(arr.type));
    return new JArray(arr.type, items);
}

const STRING_METHODS = {
    length: [sig('', 'int', s => s.length)],
    charAt: [sig('int', 'char', (s, i) => {
        if (i < 0 || i >= s.length) throw stringIndex(`Index ${i} out of bounds for length ${s.length}`, s.length);
        return s.charCodeAt(i);
    })],
    substring: [
        sig('int', 'String', (s, begin) => {
            if (begin < 0 || begin > s.length) throw stringIndex(`begin ${begin}, end ${s.length}, length ${s.length}`, s.length);
            return s.slice(begin);
        }),
        sig('int int', 'String', substring),
    ],
    indexOf: [
        sig('String', 'int', (s, x) => s.indexOf(notNull(x, 'The text given to indexOf'))),
        sig('String int', 'int', (s, x, from) => s.indexOf(notNull(x, 'The text given to indexOf'), from)),
        sig('int', 'int', (s, ch) => indexOfChar(s, ch, 0)),
        sig('int int', 'int', indexOfChar),
    ],
    lastIndexOf: [
        sig('String', 'int', (s, x) => s.lastIndexOf(notNull(x, 'The text given to lastIndexOf'))),
        sig('String int', 'int', (s, x, from) => (from < 0 ? (notNull(x, 'The text given to lastIndexOf'), -1) : s.lastIndexOf(notNull(x, 'The text given to lastIndexOf'), from))),
        sig('int', 'int', (s, ch) => lastIndexOfChar(s, ch, s.length)),
        sig('int int', 'int', lastIndexOfChar),
    ],
    equals: [sig('String', 'boolean', (s, x) => s === x)],
    equalsIgnoreCase: [sig('String', 'boolean', (s, x) => x !== null && plain(s, 'equalsIgnoreCase()').toLowerCase() === plain(x, 'equalsIgnoreCase()').toLowerCase())],
    compareTo: [sig('String', 'int', (s, x) => compareStrings(s, notNull(x, 'The text given to compareTo')))],
    compareToIgnoreCase: [sig('String', 'int', (s, x) => compareStrings(plain(s, 'compareToIgnoreCase()').toLowerCase(), plain(notNull(x, 'The text given to compareToIgnoreCase'), 'compareToIgnoreCase()').toLowerCase()))],
    contains: [
        sig('String', 'boolean', (s, x) => s.includes(notNull(x, 'The text given to contains'))),
        sig('StringBuilder', 'boolean', null, { refuse: 'contains() with a StringBuilder — give it a String, with .toString()' }),
    ],
    startsWith: [
        sig('String', 'boolean', (s, x) => s.startsWith(notNull(x, 'The text given to startsWith'))),
        sig('String int', 'boolean', (s, x, at) => { notNull(x, 'The text given to startsWith'); return at >= 0 && at <= s.length - x.length && s.startsWith(x, at); }),
    ],
    endsWith: [sig('String', 'boolean', (s, x) => s.endsWith(notNull(x, 'The text given to endsWith')))],
    isEmpty: [sig('', 'boolean', s => s.length === 0)],
    isBlank: [sig('', 'boolean', s => stripWhitespace(s, true, false).length === 0)],
    toUpperCase: [sig('', 'String', s => plain(s, 'toUpperCase()').toUpperCase())],
    toLowerCase: [sig('', 'String', s => plain(s, 'toLowerCase()').toLowerCase())],
    trim: [sig('', 'String', s => {
        let a = 0;
        let b = s.length;
        while (a < b && s.charCodeAt(a) <= 32) a++;
        while (b > a && s.charCodeAt(b - 1) <= 32) b--;
        return s.slice(a, b);
    })],
    strip: [sig('', 'String', s => stripWhitespace(s, true, true))],
    stripLeading: [sig('', 'String', s => stripWhitespace(s, true, false))],
    stripTrailing: [sig('', 'String', s => stripWhitespace(s, false, true))],
    replace: [
        sig('char char', 'String', (s, a, b) => s.split(String.fromCharCode(a)).join(String.fromCharCode(b))),
        sig('String String', 'String', (s, a, b) => replaceAllLiteral(s, notNull(a, 'The text to find'), notNull(b, 'The replacement text'))),
        ...['StringBuilder String', 'String StringBuilder', 'StringBuilder StringBuilder'].map(ps =>
            sig(ps, 'String', null, { refuse: 'replace() with a StringBuilder — give it Strings, with .toString()' })),
    ],
    concat: [sig('String', 'String', (s, x) => text(s + notNull(x, 'The text given to concat')))],
    repeat: [sig('int', 'String', (s, n) => {
        if (n < 0) throw thrown('IllegalArgumentException', `count is negative: ${n}`, 'A piece of text cannot be repeated a negative number of times.');
        if (s.length * n > TEXT_LIMIT) throw limitError('A String grew past two million characters and the run was stopped.');
        return text(s.repeat(n));
    })],
    toCharArray: [sig('', 'char[]', s => { cells(s.length); return new JArray('char', Array.from({ length: s.length }, (_, i) => s.charCodeAt(i))); })],
    split: [sig('String', 'String[]', (s, pattern) => splitLiteral(s, notNull(pattern, 'The text given to split')))],
    hashCode: [sig('', 'int', hashOfString)],
    toString: [sig('', 'String', s => s)],
};

// Real String methods this box does not run, and what to say about each.
const STRING_NOT_YET = {
    format: 'String.format', formatted: 'formatted()', matches: 'matches() (regular expressions)',
    replaceAll: 'replaceAll() (regular expressions) — replace() does plain text', replaceFirst: 'replaceFirst() (regular expressions)',
    chars: 'chars() (streams)', lines: 'lines() (streams)', codePointAt: 'codePointAt()', intern: 'intern()', getBytes: 'getBytes()',
};

function builderIndex(sb, i) {
    if (i < 0 || i >= sb.s.length) throw stringIndex(`index ${i},length ${sb.s.length}`, sb.s.length);
}
const appendWith = type => {
    const show = textOf(type);
    return (sb, v) => { sb.s = text(sb.s + show(v)); return sb; };
};
const insertWith = type => {
    const show = textOf(type);
    return (sb, at, v) => {
        if (at < 0 || at > sb.s.length) throw stringIndex(`offset ${at}, length ${sb.s.length}`, sb.s.length);
        sb.s = text(sb.s.slice(0, at) + show(v) + sb.s.slice(at));
        return sb;
    };
};
const APPENDABLE = ['char', 'int', 'long', 'double', 'boolean', 'String', 'StringBuilder'];

const BUILDER_METHODS = {
    append: [
        ...APPENDABLE.map(t => sig(t, 'StringBuilder', appendWith(t))),
        sig('char[]', 'StringBuilder', (sb, arr) => { sb.s = text(sb.s + String.fromCharCode(...notNull(arr, 'The array given to append').a)); return sb; }),
        sig('T[]', 'StringBuilder', null, { refuse: 'append of an array — it adds a code such as [I@1b6d3586; use Arrays.toString' }),
    ],
    insert: [
        ...APPENDABLE.map(t => sig(`int ${t}`, 'StringBuilder', insertWith(t))),
        sig('int T[]', 'StringBuilder', null, { refuse: 'insert of an array' }),
    ],
    toString: [sig('', 'String', sb => sb.s)],
    length: [sig('', 'int', sb => sb.s.length)],
    isEmpty: [sig('', 'boolean', sb => sb.s.length === 0)],
    charAt: [sig('int', 'char', (sb, i) => { builderIndex(sb, i); return sb.s.charCodeAt(i); })],
    reverse: [sig('', 'StringBuilder', sb => {
        if (/[\uD800-\uDFFF]/.test(sb.s)) throw refusal('reverse() is only available here for text without emoji or other paired characters.');
        work(sb.s.length);
        sb.s = Array.from(sb.s).reverse().join('');
        return sb;
    })],
    deleteCharAt: [sig('int', 'StringBuilder', (sb, i) => { builderIndex(sb, i); sb.s = sb.s.slice(0, i) + sb.s.slice(i + 1); return sb; })],
    delete: [sig('int int', 'StringBuilder', (sb, start, end) => {
        const stop = Math.min(end, sb.s.length);
        if (start < 0 || start > stop) throw stringIndex(`start ${start}, end ${stop}, length ${sb.s.length}`, sb.s.length);
        sb.s = sb.s.slice(0, start) + sb.s.slice(stop);
        return sb;
    })],
    setCharAt: [sig('int char', 'void', (sb, i, c) => { builderIndex(sb, i); sb.s = sb.s.slice(0, i) + String.fromCharCode(c) + sb.s.slice(i + 1); })],
    indexOf: [sig('String', 'int', (sb, x) => sb.s.indexOf(notNull(x, 'The text given to indexOf')))],
    substring: [
        sig('int', 'String', (sb, begin) => substringOfBuilder(sb, begin, sb.s.length)),
        sig('int int', 'String', (sb, begin, end) => substringOfBuilder(sb, begin, end)),
    ],
};

function substringOfBuilder(sb, start, end) {
    if (start < 0 || start > end || end > sb.s.length) throw stringIndex(`start ${start}, end ${end}, length ${sb.s.length}`, sb.s.length);
    return sb.s.slice(start, end);
}

const ARRAY_METHODS = {
    clone: [sig('', 'SELF', arr => { cells(arr.a.length); return new JArray(arr.type, arr.a.slice()); })],
};

const charTest = (name, test) => [
    sig('char', 'boolean', c => test(plainChar(c, `Character.${name}`))),
    sig('int', 'boolean', c => test(plainChar(c, `Character.${name}`))),
];
const isDigit = c => c >= 48 && c <= 57;
const isUpper = c => c >= 65 && c <= 90;
const isLower = c => c >= 97 && c <= 122;
const isLetter = c => isUpper(c) || isLower(c);
const toUpper = c => (isLower(plainChar(c, 'Character.toUpperCase')) ? c - 32 : c);
const toLower = c => (isUpper(plainChar(c, 'Character.toLowerCase')) ? c + 32 : c);

const printWith = (type, newline) => {
    const show = textOf(type);
    return v => M.print(show(v) + newline);
};
const PRINTABLE = ['char', 'int', 'long', 'double', 'boolean', 'String', 'StringBuilder'];

const PRINT_METHODS = {
    println: [sig('', 'void', () => M.print('\n')), ...PRINTABLE.map(t => sig(t, 'void', printWith(t, '\n')))],
    print: PRINTABLE.map(t => sig(t, 'void', printWith(t, ''))),
};

const number2 = fnFor => [
    sig('int int', 'int', fnFor('int')),
    sig('long long', 'long', fnFor('long')),
    sig('double double', 'double', fnFor('double')),
];

const anyArray = t => !isArray(t);   // one-dimensional only
const sortable = t => t !== 'boolean' && !isArray(t) && t !== 'StringBuilder';

const STATICS = {
    Math: {
        fields: { PI: ['double', Math.PI], E: ['double', Math.E] },
        methods: {
            abs: [
                sig('int', 'int', a => (a < 0 ? (-a) | 0 : a)),
                sig('long', 'long', a => (a < 0n ? wrap64(-a) : a)),
                sig('double', 'double', Math.abs),
            ],
            max: number2(t => (t === 'double' ? Math.max : (a, b) => (a >= b ? a : b))),
            min: number2(t => (t === 'double' ? Math.min : (a, b) => (a <= b ? a : b))),
            pow: [sig('double double', 'double', exactPower)],
            sqrt: [sig('double', 'double', Math.sqrt)],
            floor: [sig('double', 'double', Math.floor)],
            ceil: [sig('double', 'double', Math.ceil)],
            // Math.round of an int picks Java's float version, which returns an int.
            round: [
                sig('int', 'int', a => doubleToInt(Math.round(Math.fround(a)))),
                sig('long', 'int', null, { refuse: 'Math.round of a long — a long is already a whole number' }),
                sig('double', 'long', a => doubleToLong(Math.round(a))),
            ],
            floorMod: [
                sig('int int', 'int', (a, b) => { if (b === 0) throw divideByZero(); const r = a % b; return (r !== 0 && (r ^ b) < 0 ? r + b : r) | 0; }),
            ],
            floorDiv: [
                sig('int int', 'int', (a, b) => { if (b === 0) throw divideByZero(); const q = (a / b) | 0; return ((a % b !== 0) && ((a ^ b) < 0) ? q - 1 : q) | 0; }),
            ],
        },
        notYet: {
            random: 'Math.random() — a test needs the same answer every time',
            sin: 'Math.sin()', cos: 'Math.cos()', tan: 'Math.tan()', log: 'Math.log()', log10: 'Math.log10()', exp: 'Math.exp()',
            cbrt: 'Math.cbrt()', hypot: 'Math.hypot()', rint: 'Math.rint()', signum: 'Math.signum()',
        },
    },
    Integer: {
        fields: { MAX_VALUE: ['int', INT_MAX], MIN_VALUE: ['int', INT_MIN] },
        methods: {
            parseInt: [sig('String', 'int', s => parseIntStrict(s, 32))],
            toString: [sig('int', 'String', a => String(a))],
            compare: [sig('int int', 'int', (a, b) => (a < b ? -1 : a > b ? 1 : 0))],
            max: [sig('int int', 'int', (a, b) => (a >= b ? a : b))],
            min: [sig('int int', 'int', (a, b) => (a <= b ? a : b))],
            sum: [sig('int int', 'int', (a, b) => (a + b) | 0)],
            signum: [sig('int', 'int', a => (a > 0 ? 1 : a < 0 ? -1 : 0))],
            toBinaryString: [sig('int', 'String', a => (a >>> 0).toString(2))],
            toHexString: [sig('int', 'String', a => (a >>> 0).toString(16))],
        },
        notYet: { valueOf: 'Integer.valueOf() — it makes an Integer object; Integer.parseInt gives an int' },
    },
    Long: {
        fields: { MAX_VALUE: ['long', LONG_MAX], MIN_VALUE: ['long', LONG_MIN] },
        methods: {
            parseLong: [sig('String', 'long', s => parseIntStrict(s, 64))],
            toString: [sig('long', 'String', a => a.toString())],
            compare: [sig('long long', 'int', (a, b) => (a < b ? -1 : a > b ? 1 : 0))],
        },
        notYet: { valueOf: 'Long.valueOf()' },
    },
    Double: {
        fields: {
            MAX_VALUE: ['double', Number.MAX_VALUE], MIN_VALUE: ['double', Number.MIN_VALUE],
            POSITIVE_INFINITY: ['double', Infinity], NEGATIVE_INFINITY: ['double', -Infinity], NaN: ['double', NaN],
        },
        methods: {
            parseDouble: [sig('String', 'double', parseDoubleStrict)],
            toString: [sig('double', 'String', javaDouble)],
            isNaN: [sig('double', 'boolean', a => a !== a)],
            compare: [sig('double double', 'int', compareDoubles)],
        },
        notYet: { valueOf: 'Double.valueOf() — Double.parseDouble gives a double' },
    },
    Boolean: {
        fields: {},
        methods: {
            parseBoolean: [sig('String', 'boolean', s => s !== null && s.length === 4 && plain(s, 'Boolean.parseBoolean').toLowerCase() === 'true')],
            toString: [sig('boolean', 'String', b => (b ? 'true' : 'false'))],
        },
        notYet: {},
    },
    Character: {
        fields: { MAX_VALUE: ['char', 0xFFFF], MIN_VALUE: ['char', 0] },
        methods: {
            isDigit: charTest('isDigit', isDigit),
            isLetter: charTest('isLetter', isLetter),
            isLetterOrDigit: charTest('isLetterOrDigit', c => isLetter(c) || isDigit(c)),
            isAlphabetic: [sig('int', 'boolean', c => isLetter(plainChar(c, 'Character.isAlphabetic')))],
            isUpperCase: charTest('isUpperCase', isUpper),
            isLowerCase: charTest('isLowerCase', isLower),
            isWhitespace: charTest('isWhitespace', isJavaSpace),
            toUpperCase: [sig('char', 'char', toUpper), sig('int', 'int', toUpper)],
            toLowerCase: [sig('char', 'char', toLower), sig('int', 'int', toLower)],
            toString: [sig('char', 'String', c => String.fromCharCode(c))],
            getNumericValue: [
                sig('char', 'int', c => (isDigit(plainChar(c, 'Character.getNumericValue')) ? c - 48 : isLetter(c) ? (c | 32) - 87 : -1)),
                sig('int', 'int', c => (isDigit(plainChar(c, 'Character.getNumericValue')) ? c - 48 : isLetter(c) ? (c | 32) - 87 : -1)),
            ],
            compare: [sig('char char', 'int', (a, b) => a - b)],
        },
        notYet: { valueOf: 'Character.valueOf()' },
    },
    String: {
        fields: {},
        methods: {
            valueOf: [
                ...['char', 'int', 'long', 'double', 'boolean'].map(t => sig(t, 'String', textOf(t))),
                sig('char[]', 'String', arr => String.fromCharCode(...notNull(arr, 'The array given to String.valueOf').a)),
                sig('String', 'String', s => (s === null ? 'null' : s)),
                sig('StringBuilder', 'String', sb => (sb === null ? 'null' : sb.s)),
                sig('T[]', 'String', null, { refuse: 'String.valueOf of an array — it gives a code such as [I@1b6d3586; use Arrays.toString' }),
            ],
            join: [
                sig('String String[]', 'String', (d, arr) => text(notNull(arr, 'The array given to String.join').a.map(s => (s === null ? 'null' : s)).join(notNull(d, 'The text to join with')))),
                sig('String String', 'String', (d, ...items) => text(items.map(s => (s === null ? 'null' : s)).join(notNull(d, 'The text to join with'))), { variadic: true }),
            ],
        },
        notYet: { format: 'String.format — build the text with + instead' },
    },
    Arrays: {
        fields: {},
        methods: {
            toString: [sig('T[]', 'String', arr => arrayText(arr, 'Arrays.toString'))],
            deepToString: [sig('T[]', 'String', deepText, { where: () => true })],
            sort: [sig('T[]', 'void', sortArray, { where: sortable })],
            equals: [sig('T[] T[]', 'boolean', arraysEqual, { where: anyArray })],
            fill: [sig('T[] T', 'void', (arr, v) => { notNull(arr, 'The array given to Arrays.fill').a.fill(v); work(arr.a.length); }, { where: anyArray })],
            copyOf: [sig('T[] int', 'T[]', (arr, n) => {
                if (n < 0) { notNull(arr, 'The array being copied'); throw thrown('NegativeArraySizeException', String(n), 'An array cannot have a negative number of elements.'); }
                return copyOfRange(arr, 0, n);
            })],
            copyOfRange: [sig('T[] int int', 'T[]', copyOfRange)],
        },
        notYet: { asList: 'Arrays.asList() (lists)', stream: 'Arrays.stream() (streams)' },
    },
};

const NOT_YET_CLASSES = new Map([
    ['Scanner', 'Scanner — there is no keyboard input here; the values arrive as the method\'s parameters'],
    ['Random', 'Random — a test needs the same answer every time'],
    ['Collections', 'Collections'], ['List', 'lists'], ['ArrayList', 'lists'], ['Map', 'maps'], ['HashMap', 'maps'],
    ['Set', 'sets'], ['HashSet', 'sets'], ['Objects', 'Objects'], ['Stream', 'streams'], ['IntStream', 'streams'],
    ['Thread', 'threads'], ['LocalDate', 'dates'], ['Optional', 'Optional'],
]);

// Exceptions a method may throw without declaring them.
const THROWABLE = new Set([
    'RuntimeException', 'IllegalArgumentException', 'IllegalStateException', 'ArithmeticException',
    'IndexOutOfBoundsException', 'ArrayIndexOutOfBoundsException', 'StringIndexOutOfBoundsException',
    'NullPointerException', 'UnsupportedOperationException', 'NumberFormatException', 'NegativeArraySizeException',
]);

// ─── Names ───────────────────────────────────────────────────────────────────

function editDistance(a, b) {
    const rows = [...Array(b.length + 1).keys()];
    for (let i = 1; i <= a.length; i++) {
        let prev = rows[0];
        rows[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const temp = rows[j];
            rows[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, rows[j], rows[j - 1]);
            prev = temp;
        }
    }
    return rows[b.length];
}

function suggestName(name, candidates) {
    let best = null;
    let bestScore = Infinity;
    for (const c of candidates) {
        if (c.toLowerCase() === name.toLowerCase()) return c;
        const d = editDistance(name.toLowerCase(), c.toLowerCase());
        if (d < bestScore) { bestScore = d; best = c; }
    }
    return bestScore <= Math.max(1, Math.floor(name.length / 3)) ? best : null;
}

// ─── Pass 2: types ───────────────────────────────────────────────────────────
//
// Gives every expression its Java type, resolves every name, and writes each
// conversion Java would insert silently into the tree as a `conv` node, so that
// by the time anything runs there are no decisions left about types.
//
// A constant expression (JLS 15.29) gets `.const = { v }`. Java's rules lean on
// these: `char c = 65;` compiles because 65 is a constant that fits, and
// `while (true)` ends a method's need for a return because true is a constant.

const fitsChar = node => node.const && node.type === 'int' && node.const.v >= 0 && node.const.v <= 0xFFFF;

function stripParens(node) {
    while (node.k === 'paren') node = node.e;
    return node;
}

/** Wrap a typed node in a conversion to `to` (which the caller has shown to be legal). */
function convert(node, to) {
    if (node.type === to) return node;
    const out = { k: 'conv', from: node.type, to, e: node, type: to, line: node.line };
    if (node.const) {
        const fn = converter(node.type, to);
        out.const = { v: fn ? fn(node.const.v) : node.const.v };
    }
    return out;
}

/** May a value of type `from` be passed where `to` is wanted, with no cast? */
function passable(from, to) {
    if (from === to) return true;
    if (from === 'null') return isReference(to);
    return NUMERIC.has(from) && NUMERIC.has(to) && RANK[from] < RANK[to];
}

class Checker {
    constructor(program) {
        this.methods = new Map();
        for (const m of program.methods) {
            m.retType = resolveType(m.ret, { allowVoid: true });
            m.paramTypes = m.params.map(p => resolveType(p.type));
            const list = this.methods.get(m.name) || [];
            for (const other of list) {
                if (other.params.length === m.params.length) {
                    if (other.paramTypes.join() === m.paramTypes.join()) {
                        throw compileError(`The method ${m.name} is written twice with the same parameters.`, m.line);
                    }
                    throw notYet(`${BOX} cannot tell apart two methods named ${m.name} that take the same number of values.`, m.line,
                        'Give the second one a different name.');
                }
            }
            list.push(m);
            this.methods.set(m.name, list);
        }
        for (const m of program.methods) this.checkMethod(m);
    }

    // ── scopes

    lookup(name) {
        for (let i = this.scopes.length - 1; i >= 0; i--) {
            const sym = this.scopes[i].get(name);
            if (sym) return sym;
        }
        return null;
    }

    declare(name, type, line, isFinal = false) {
        const earlier = this.lookup(name);
        if (earlier) {
            throw compileError(earlier.isParam ? `${name} is already the name of one of this method's parameters.` : `The variable ${name} is already declared in this method.`, line,
                earlier.isParam ? `Use ${name} as it is, or pick a different name for the new variable.`
                    : `A variable is declared once. To give it a new value later, leave the type off: ${name} = …;`);
        }
        const sym = { name, type, slot: this.method.frameSize++, isFinal, constVal: undefined, line };
        this.scopes[this.scopes.length - 1].set(name, sym);
        return sym;
    }

    visibleNames() {
        const names = [];
        for (const scope of this.scopes) names.push(...scope.keys());
        return names;
    }

    checkMethod(m) {
        this.method = m;
        m.frameSize = 0;
        this.scopes = [new Map()];
        this.ctx = [];
        m.paramSyms = m.params.map((p, i) => Object.assign(this.declare(p.name, m.paramTypes[i], p.line, p.isFinal), { isParam: true }));
        for (const s of m.body.body) this.stmt(s);
    }

    // ── statements

    block(node) {
        this.scopes.push(new Map());
        for (const s of node.body) this.stmt(s);
        this.scopes.pop();
    }

    inLoop(body) {
        this.ctx.push({ kind: 'loop' });
        this.stmt(body);
        this.ctx.pop();
    }

    stmt(s) {
        switch (s.k) {
            case 'block': this.block(s); break;
            case 'empty': break;
            case 'local': this.local(s); break;
            case 'expr': s.e = this.expr(s.e); break;
            case 'if':
                s.cond = this.condition(s.cond, 'An if');
                this.stmt(s.then);
                if (s.otherwise) this.stmt(s.otherwise);
                break;
            case 'while':
                s.cond = this.condition(s.cond, 'A while loop');
                this.inLoop(s.body);
                break;
            case 'do':
                this.inLoop(s.body);
                s.cond = this.condition(s.cond, 'A do-while loop');
                break;
            case 'for':
                this.scopes.push(new Map());
                for (const i of s.init) this.stmt(i);
                if (s.cond) s.cond = this.condition(s.cond, 'A for loop');
                s.update = s.update.map(u => this.expr(u));
                this.inLoop(s.body);
                this.scopes.pop();
                break;
            case 'foreach': this.forEach(s); break;
            case 'break': {
                const at = this.nearest(c => c.kind !== 'switchexpr' ? true : null);
                if (!at) {
                    throw compileError(this.ctx.some(c => c.kind === 'switchexpr')
                        ? 'break cannot leave a switch that produces a value.' : 'break only belongs inside a loop or a switch.', s.line);
                }
                break;
            }
            case 'continue': {
                const at = this.nearest(c => (c.kind === 'loop' ? true : c.kind === 'switch' ? undefined : null));
                if (!at) {
                    throw compileError(this.ctx.some(c => c.kind === 'switchexpr')
                        ? 'continue cannot leave a switch that produces a value.' : 'continue only belongs inside a loop.', s.line);
                }
                break;
            }
            case 'return': this.returns(s); break;
            case 'throw': this.throws(s); break;
            case 'yield': {
                const target = this.nearest(c => (c.kind === 'switchexpr' ? true : undefined));
                if (!target) throw compileError('yield only belongs inside a switch that produces a value.', s.line);
                s.e = this.value(s.e);
                target.results.push(s);
                break;
            }
            case 'switch': this.switch(s, false); break;
            default: throw new Error(`unexpected statement ${s.k}`);
        }
    }

    /** Walk outward through the enclosing loops and switches; the test answers true (found), null (blocked) or undefined (keep going). */
    nearest(test) {
        for (let i = this.ctx.length - 1; i >= 0; i--) {
            const answer = test(this.ctx[i]);
            if (answer === true) return this.ctx[i];
            if (answer === null) return null;
        }
        return null;
    }

    local(s) {
        const isVar = s.type.base === 'var' && s.type.dims === 0;
        const declared = isVar ? null : resolveType(s.type);
        for (const d of s.decls) {
            if (isVar) {
                if (s.decls.length > 1) throw compileError('var declares one variable at a time.', s.line);
                if (!d.init) throw compileError(`var needs a starting value to work out the type from: var ${d.name} = …;`, d.line);
                if (d.init.k === 'arrinit') throw compileError('var cannot work out a type from a { … } list.', d.line, 'Write the type: int[] nums = { 1, 2, 3 };');
                d.init = this.value(d.init);
                if (d.init.type === 'null') throw compileError('var cannot work out a type from null.', d.line);
                d.sym = this.declare(d.name, d.init.type, d.line, s.isFinal);
            } else {
                // The name is in scope inside its own starting value, which is how Java
                // comes to say "might not have been initialized" for int x = x + 1;
                d.sym = this.declare(d.name, declared, d.line, s.isFinal);
                if (d.init) {
                    d.init = d.init.k === 'arrinit' ? this.arrayInit(d.init, declared) : this.assignable(this.value(d.init), declared, d.line, `the variable ${d.name}`);
                }
            }
            if (s.isFinal) {
                if (!d.init) throw notYet(`${BOX} needs a final variable to be given its value where it is declared.`, d.line);
                if (d.init.const && (PRIMITIVES.has(d.sym.type) || d.sym.type === 'String')) d.sym.constVal = d.init.const.v;
            }
        }
    }

    forEach(s) {
        s.iter = this.value(s.iter);
        const t = s.iter.type;
        if (!isArray(t)) {
            if (t === 'String') {
                throw compileError('A for-each loop cannot walk through a String directly.', s.line,
                    'Walk through its characters instead: for (char c : text.toCharArray())');
            }
            throw compileError(`A for-each loop needs an array after the colon, and this is ${aType(t)}.`, s.line);
        }
        const elem = elemOf(t);
        this.scopes.push(new Map());
        let type;
        if (s.type.base === 'var' && s.type.dims === 0) type = elem;
        else {
            type = resolveType(s.type);
            if (!passable(elem, type)) {
                throw compileError(`The array holds ${elem} values, which cannot go into the ${type} variable ${s.name}.`, s.nameLine,
                    `Declare the loop variable as ${elem}: for (${elem} ${s.name} : …)`);
            }
        }
        s.sym = this.declare(s.name, type, s.nameLine, s.isFinal);
        s.conv = converter(elem, type);
        this.inLoop(s.body);
        this.scopes.pop();
    }

    returns(s) {
        if (this.ctx.some(c => c.kind === 'switchexpr')) {
            throw compileError('return cannot be used inside a switch that produces a value.', s.line, 'Give the value with -> or yield, and return the whole switch.');
        }
        const ret = this.method.retType;
        if (ret === 'void') {
            if (s.e) throw compileError(`${this.method.name} is declared void, so it cannot return a value.`, s.line);
            return;
        }
        if (!s.e) {
            throw compileError(`${this.method.name} has to return ${aType(ret)}, and this return gives nothing back.`, s.line, 'Write the value after the word return.');
        }
        s.e = this.assignable(this.value(s.e), ret, s.line, 'the return value', true);
    }

    throws(s) {
        const e = s.e;
        if (e.k !== 'new') throw notYet(`${BOX} only throws a new exception: throw new IllegalArgumentException("why");`, s.line);
        if (!THROWABLE.has(e.base)) {
            if (/Exception$|Error$|^Throwable$/.test(e.base)) {
                throw notYet(`${BOX} cannot throw ${e.base}.`, s.line, 'IllegalArgumentException and IllegalStateException are the usual ones for a method to throw.');
            }
            throw compileError(`${e.base} is not an exception, so it cannot be thrown.`, s.line);
        }
        if (e.args.length > 1) throw notYet(`${BOX} gives an exception at most one thing: its message.`, s.line);
        e.args = e.args.map(a => this.value(a));
        if (e.args.length && e.args[0].type !== 'String' && e.args[0].type !== 'null') {
            throw compileError(`The message of an exception is a String, and this is ${aType(e.args[0].type)}.`, s.line);
        }
    }

    condition(node, what) {
        const e = this.value(node);
        if (e.type !== 'boolean') {
            const inner = stripParens(e);
            const hint = inner.k === 'assign' && inner.op === '='
                ? 'A single = stores a value. To compare two values use =='
                : e.type === 'int' ? 'Java does not treat a number as true or false. Compare it with something: x != 0' : null;
            throw compileError(`${what} needs a true-or-false test in its ( ), and this is ${aType(e.type)}.`, node.line, hint);
        }
        return e;
    }

    // ── conversions

    /** Assignment conversion (JLS 5.2): what `T x = value` and `return value` allow. */
    assignable(node, to, line, where, isReturn = false) {
        const from = node.type;
        if (passable(from, to)) return convert(node, to);
        if (to === 'char' && fitsChar(node)) return convert(node, to);   // a constant int that fits
        if (NUMERIC.has(from) && NUMERIC.has(to)) {
            const hint = to === 'char'
                ? 'A whole number is not a char without a cast: (char) value'
                : `If losing the ${from === 'double' ? 'decimal part' : 'extra range'} is what you want, say so with a cast: (${to}) value`;
            throw compileError(`${aType(from)[0].toUpperCase() + aType(from).slice(1)} cannot be stored in ${where} (${aType(to)}) without a cast — Java will not shrink it for you.`, line, hint);
        }
        let hint = null;
        if (to === 'String' && PRIMITIVES.has(from)) hint = from === 'char' ? 'To turn a char into text: "" + c or String.valueOf(c)' : 'To turn a value into text: String.valueOf(x) or "" + x';
        else if (from === 'String' && to === 'int') hint = 'To read a number out of text: Integer.parseInt(text)';
        else if (from === 'String' && to === 'char') hint = 'A String is not a char, even when it is one character long. Take a character out with .charAt(0)';
        else if (from === 'String' && to === 'double') hint = 'To read a number out of text: Double.parseDouble(text)';
        else if (from === 'boolean' || to === 'boolean') hint = 'true/false and numbers do not mix in Java.';
        else if (from === 'null') hint = `null means "no object", and ${to} is not an object type.`;
        else if (from === 'StringBuilder' && to === 'String') hint = 'Turn the StringBuilder into a String with .toString()';
        const lead = isReturn ? `This method returns ${aType(to)}, but this return gives back ${aType(from)}.` : `${aType(from)[0].toUpperCase() + aType(from).slice(1)} cannot be stored in ${where}, which is ${aType(to)}.`;
        throw compileError(lead, line, hint);
    }

    arrayInit(init, type) {
        if (!isArray(type)) {
            throw compileError(`A { … } list makes an array, and this variable is ${aType(type)}.`, init.line, `Declare it as an array: ${type}[] name = { … };`);
        }
        const elem = elemOf(type);
        init.elems = init.elems.map(e => (e.k === 'arrinit' ? this.arrayInit(e, elem) : this.assignable(this.value(e), elem, e.line, `an element of the ${type} array`)));
        init.type = type;
        return init;
    }

    // ── expressions

    /** An expression whose value is used: a void method call is not one. */
    value(node) {
        const e = this.expr(node);
        if (e.type === 'void') {
            throw compileError(`${e.name ? e.name + '()' : 'This method'} does not return anything, so there is no value here to use.`, e.line);
        }
        return e;
    }

    expr(n) {
        switch (n.k) {
            case 'lit':
                if (n.type !== 'null') n.const = { v: n.value };
                return n;
            case 'paren': {
                n.e = this.expr(n.e);
                n.type = n.e.type;
                if (n.e.const) n.const = n.e.const;
                return n;
            }
            case 'name': return this.name(n);
            case 'unary': return this.unary(n);
            case 'binary': return this.binary(n);
            case 'assign': return this.assign(n);
            case 'incdec': return this.incdec(n);
            case 'cond': return this.conditional(n);
            case 'cast': return this.cast(n);
            case 'index': return this.index(n);
            case 'field': return this.field(n);
            case 'call': return this.call(n);
            case 'new': return this.create(n);
            case 'newarr': return this.newArray(n);
            case 'switchexpr': return this.switch(n, true);
            case 'arrinit':
                throw compileError('A { … } list of values can only be used when the array is declared.', n.line, 'Elsewhere, write: new int[] { 1, 2, 3 }');
            default: throw new Error(`unexpected expression ${n.k}`);
        }
    }

    name(n) {
        const sym = this.lookup(n.name);
        if (!sym) {
            if (STATICS[n.name] || NOT_YET_CLASSES.has(n.name) || n.name === 'System') {
                throw compileError(`${n.name} is a class, not a value. It needs a dot and a method after it.`, n.line);
            }
            const near = suggestName(n.name, this.visibleNames());
            throw compileError(`There is no variable called ${n.name} here.`, n.line,
                near ? `Did you mean ${near}?${near.toLowerCase() === n.name.toLowerCase() ? ' Java treats capital and small letters as different.' : ''}`
                    : 'A variable has to be declared, with its type, before it is used — and it only exists inside the { } it was declared in.');
        }
        n.sym = sym;
        n.type = sym.type;
        if (sym.constVal !== undefined) n.const = { v: sym.constVal };
        return n;
    }

    unary(n) {
        const e = this.value(n.e);
        const t = e.type;
        const bad = hint => compileError(`The operator ${n.op} cannot be used on ${aType(t)}.`, n.line, hint);
        if (n.op === '!') {
            if (t !== 'boolean') throw bad('! flips a true-or-false value. To test a number, compare it: x != 0');
            n.type = 'boolean';
        } else if (n.op === '~') {
            if (!INTEGRAL.has(t)) throw bad(null);
            n.type = t === 'long' ? 'long' : 'int';
        } else {
            if (!NUMERIC.has(t)) throw bad(t === 'boolean' ? 'To flip a true-or-false value use !' : null);
            n.type = t === 'char' ? 'int' : t;
        }
        n.e = n.op === '!' ? e : convert(e, n.type);
        if (n.e.const) n.const = { v: unaryFunction(n.op, n.type)(n.e.const.v) };
        return n;
    }

    binary(n) {
        const op = n.op;
        const l = this.value(n.l);
        const r = this.value(n.r);
        const lt = l.type;
        const rt = r.type;
        n.l = l;
        n.r = r;
        const bad = hint => compileError(`The operator ${op} cannot be used between ${aType(lt)} and ${aType(rt)}.`, n.line, hint);

        if (op === '&&' || op === '||') {
            if (lt !== 'boolean' || rt !== 'boolean') {
                throw bad(`${op} joins two true-or-false tests, such as x > 0 ${op} x < 10`);
            }
            n.type = 'boolean';
            if (l.const && r.const) n.const = { v: op === '&&' ? l.const.v && r.const.v : l.const.v || r.const.v };
            return n;
        }

        if (op === '+' && (lt === 'String' || rt === 'String')) {
            const other = lt === 'String' ? rt : lt;
            if (isArray(other)) {
                throw notYet('Joining an array to a String shows a code such as [I@1b6d3586, not the values in it.', n.line,
                    'Use Arrays.toString(nums) to get the values as text.');
            }
            n.mode = 'concat';
            n.type = 'String';
        } else if (['+', '-', '*', '/', '%'].includes(op)) {
            if (!NUMERIC.has(lt) || !NUMERIC.has(rt)) {
                throw bad(lt === 'boolean' || rt === 'boolean' ? 'true/false values cannot be used in arithmetic.'
                    : (lt === 'String' || rt === 'String') ? 'Only + works on a String. To do arithmetic, turn the text into a number first: Integer.parseInt(text)' : null);
            }
            n.optype = promote(lt, rt);
            n.l = convert(l, n.optype);
            n.r = convert(r, n.optype);
            n.type = n.optype;
        } else if (op === '<<' || op === '>>' || op === '>>>') {
            if (!INTEGRAL.has(lt) || !INTEGRAL.has(rt)) throw bad('Shifts work on whole numbers.');
            n.mode = 'shift';
            n.optype = lt === 'long' ? 'long' : 'int';
            n.l = convert(l, n.optype);
            n.r = convert(r, rt === 'long' ? 'long' : 'int');
            n.type = n.optype;
        } else if (op === '<' || op === '>' || op === '<=' || op === '>=') {
            if (!NUMERIC.has(lt) || !NUMERIC.has(rt)) {
                const inner = stripParens(l);
                const chained = lt === 'boolean' && inner.k === 'binary' && ['<', '>', '<=', '>='].includes(inner.op);
                throw bad(lt === 'String' && rt === 'String' ? 'To put two Strings in order use a.compareTo(b), which is negative when a comes first.'
                    : chained ? 'Java cannot chain comparisons the way mathematics does. Write two and join them: low <= n && n <= high' : null);
            }
            n.optype = promote(lt, rt);
            n.l = convert(l, n.optype);
            n.r = convert(r, n.optype);
            n.type = 'boolean';
        } else if (op === '==' || op === '!=') {
            if (NUMERIC.has(lt) && NUMERIC.has(rt)) {
                n.optype = promote(lt, rt);
                n.l = convert(l, n.optype);
                n.r = convert(r, n.optype);
            } else if (lt === 'boolean' && rt === 'boolean') {
                n.optype = 'boolean';
            } else if (isReference(lt) && isReference(rt) && (lt === rt || lt === 'null' || rt === 'null')) {
                if (lt === 'String' && rt === 'String') {
                    throw notYet(`${op} between two Strings asks whether they are the very same object, not whether they hold the same text, so ${BOX} does not run it.`, n.line,
                        op === '==' ? 'Compare text with .equals(): a.equals(b)' : 'Compare text with .equals(): !a.equals(b)');
                }
                n.optype = 'ref';
            } else {
                throw bad((lt === 'String' && rt === 'char') || (lt === 'char' && rt === 'String')
                    ? 'A String and a char are different types. Compare one character with: text.charAt(0) == \'a\''
                    : 'These two can never be equal, because they are different types.');
            }
            n.type = 'boolean';
        } else {   // & | ^
            if (lt === 'boolean' && rt === 'boolean') {
                n.optype = 'boolean';
                n.type = 'boolean';
            } else if (INTEGRAL.has(lt) && INTEGRAL.has(rt)) {
                n.optype = promote(lt, rt);
                n.l = convert(l, n.optype);
                n.r = convert(r, n.optype);
                n.type = n.optype;
            } else {
                throw bad(null);
            }
        }

        if (n.l.const && n.r.const) {
            try {
                n.const = { v: binaryFunction(n)(n.l.const.v, n.r.const.v) };
            } catch (err) {
                if (!(err instanceof JavaError)) throw err;   // 1 / 0 is not a constant; it throws when it runs
            }
        }
        return n;
    }

    /** The variable or array element on the left of an assignment, or under ++. */
    target(node, verb) {
        const t = this.expr(node);
        if (t.k === 'name' && t.sym.isFinal) {
            throw compileError(`${t.name} is final, so it cannot be ${verb}.`, node.line, 'Remove the word final from its declaration if it needs to change.');
        }
        delete t.const;
        return t;
    }

    assign(n) {
        const target = this.target(n.target, 'given a new value');
        n.target = target;
        const T = target.type;
        n.type = T;
        if (n.op === '=') {
            n.e = this.assignable(this.value(n.e), T, n.line, target.k === 'name' ? `the variable ${target.name}` : 'this array element');
            return n;
        }
        const op = n.op.slice(0, -1);
        n.binop = op;
        const e = this.value(n.e);
        const R = e.type;
        const bad = hint => compileError(`${n.op} cannot be used with ${aType(T)} on the left and ${aType(R)} on the right.`, n.line, hint);
        if (T === 'String' && op === '+') {
            if (isArray(R)) throw notYet('Joining an array to a String shows a code such as [I@1b6d3586, not the values in it.', n.line, 'Use Arrays.toString(nums) to get the values as text.');
            n.mode = 'concat';
            n.e = e;
        } else if (T === 'boolean' && R === 'boolean' && (op === '&' || op === '|' || op === '^')) {
            n.optype = 'boolean';
            n.e = e;
        } else if (op === '<<' || op === '>>' || op === '>>>') {
            if (!INTEGRAL.has(T) || !INTEGRAL.has(R)) throw bad('Shifts work on whole numbers.');
            n.mode = 'shift';
            n.optype = T === 'long' ? 'long' : 'int';
            n.e = convert(e, R === 'long' ? 'long' : 'int');
        } else if (NUMERIC.has(T) && NUMERIC.has(R)) {
            if ((op === '&' || op === '|' || op === '^') && (T === 'double' || R === 'double')) throw bad(null);
            n.optype = promote(T, R);
            n.e = convert(e, n.optype);
        } else {
            throw bad(T !== 'String' && R === 'String' ? `${target.k === 'name' ? target.name : 'The left side'} is ${aType(T)}, so text cannot be added to it.` : null);
        }
        return n;
    }

    incdec(n) {
        const target = this.target(n.target, 'changed');
        if (!NUMERIC.has(target.type)) {
            throw compileError(`${n.op} works on numbers, and this is ${aType(target.type)}.`, n.line);
        }
        n.target = target;
        n.type = target.type;
        return n;
    }

    conditional(n) {
        n.c = this.condition(n.c, 'A ? :');
        const a = this.value(n.a);
        const b = this.value(n.b);
        const at = a.type;
        const bt = b.type;
        let type;
        if (at === bt) type = at;
        else if (NUMERIC.has(at) && NUMERIC.has(bt)) {
            if ((at === 'char' && fitsChar(b)) || (bt === 'char' && fitsChar(a))) type = 'char';
            else type = promote(at, bt);
        } else if (at === 'null' && isReference(bt)) type = bt;
        else if (bt === 'null' && isReference(at)) type = at;
        else {
            throw notYet(`The two results of this ? : are different types (${at} and ${bt}), which ${BOX} does not run.`, n.line,
                'Make both results the same type.');
        }
        n.a = convert(a, type);
        n.b = convert(b, type);
        n.type = type;
        if (n.c.const && n.a.const && n.b.const) n.const = { v: n.c.const.v ? n.a.const.v : n.b.const.v };
        return n;
    }

    cast(n) {
        const to = resolveType(n.to);
        const e = this.value(n.e);
        const from = e.type;
        if (from !== to && !(NUMERIC.has(from) && NUMERIC.has(to))) {
            const hint = from === 'String' && to === 'int' ? 'A cast cannot read a number out of text. Use Integer.parseInt(text)'
                : from === 'String' && to === 'double' ? 'A cast cannot read a number out of text. Use Double.parseDouble(text)'
                    : from === 'String' && to === 'char' ? 'Take a character out of a String with .charAt(0)'
                        : (from === 'boolean' || to === 'boolean') ? 'Java does not convert between true/false and numbers. Use a test instead: flag ? 1 : 0' : null;
            throw compileError(`${aType(from)[0].toUpperCase() + aType(from).slice(1)} cannot be cast to ${aType(to)}.`, n.line, hint);
        }
        if (from === to) {
            // Still a cast: (int) x is not something that can be assigned to.
            return { k: 'paren', e, type: to, const: e.const, line: n.line, wasCast: true };
        }
        return convert(e, to);
    }

    index(n) {
        n.target = this.value(n.target);
        const t = n.target.type;
        if (!isArray(t)) {
            throw compileError(`[ ] picks an element out of an array, and this is ${aType(t)}.`, n.line,
                t === 'String' ? 'To get one character of a String use .charAt(i)' : null);
        }
        const i = this.value(n.i);
        if (i.type !== 'int' && i.type !== 'char') {
            throw compileError(`An array position has to be an int, and this is ${aType(i.type)}.`, n.line,
                i.type === 'double' ? 'Cast it: nums[(int) x]' : i.type === 'long' ? 'Cast it: nums[(int) n]' : null);
        }
        n.i = i;
        n.type = elemOf(t);
        return n;
    }

    /** Is this node the name of a class (rather than a variable that happens to share the name)? */
    className(node) {
        return node && node.k === 'name' && !this.lookup(node.name) ? node.name : null;
    }

    field(n) {
        const cls = this.className(n.target);
        if (cls) {
            if (cls === 'System') throw compileError(`System.${n.name} is not a value on its own.`, n.line, 'To print, write System.out.println(…)');
            const group = STATICS[cls];
            if (!group) this.unknownClass(cls, n.line);
            const f = group.fields[n.name];
            if (!f) {
                const near = suggestName(n.name, Object.keys(group.fields));
                throw compileError(`${BOX} does not know ${cls}.${n.name}.`, n.line,
                    n.name in group.methods ? `${cls}.${n.name} is a method, so it needs ( ) after it.` : near ? `Did you mean ${cls}.${near}?` : null);
            }
            return { k: 'lit', type: f[0], value: f[1], const: { v: f[1] }, line: n.line };
        }
        n.target = this.value(n.target);
        const t = n.target.type;
        if (isArray(t) && n.name === 'length') { n.type = 'int'; return n; }
        if (n.name === 'length' && (t === 'String' || t === 'StringBuilder')) {
            throw compileError(`For ${aType(t)}, length is a method, so it needs ( ) after it.`, n.line, 'text.length() — only an array uses .length without the ( ).');
        }
        throw compileError(isArray(t) ? `An array has no .${n.name} — its only field is .length.` : `${aType(t)[0].toUpperCase() + aType(t).slice(1)} has no field called ${n.name}.`, n.line,
            t === 'String' && n.name in STRING_METHODS ? `${n.name} is a method, so it needs ( ) after it.` : null);
    }

    unknownClass(cls, line) {
        if (NOT_YET_CLASSES.has(cls)) throw notYet(`${BOX} does not have ${NOT_YET_CLASSES.get(cls)}.`, line);
        if (/^[a-z]/.test(cls)) {
            const near = suggestName(cls, [...this.visibleNames(), ...Object.keys(STATICS)]);
            throw compileError(`There is no variable called ${cls} here.`, line, near ? `Did you mean ${near}?` : null);
        }
        const near = suggestName(cls, Object.keys(STATICS));
        throw notYet(`${BOX} does not know a class called ${cls}.`, line, near ? `Did you mean ${near}?` : null);
    }

    /** Pick the overload these arguments fit, and convert the arguments to its parameter types. */
    overload(sigs, args, selfType, describe, line) {
        const types = args.map(a => a.type);
        let nullMatches = 0;
        const bareNull = types.includes('null');
        let chosen = null;
        for (const s of sigs) {
            let params = s.params;
            if (s.variadic) {
                if (types.length < params.length - 1) continue;
                params = [...params.slice(0, -1), ...Array(types.length - params.length + 1).fill(params[params.length - 1])];
            }
            if (params.length !== types.length) continue;
            let T = null;
            let ok = true;
            const concrete = [];
            for (let i = 0; i < params.length && ok; i++) {
                let p = params[i];
                if (p === 'T[]') {
                    if (T === null) {
                        if (!isArray(types[i])) { ok = false; break; }
                        T = elemOf(types[i]);
                        if (s.where && !s.where(T)) { ok = false; break; }
                    }
                    p = T + '[]';
                } else if (p === 'T') {
                    p = T;
                }
                if (!passable(types[i], p)) ok = false;
                concrete.push(p);
            }
            if (!ok) continue;
            const ret = s.ret === 'T[]' ? T + '[]' : s.ret === 'T' ? T : s.ret === 'SELF' ? selfType : s.ret;
            if (bareNull && s.refuse) continue;
            if (bareNull) {
                // A bare null fits every object parameter. Where that leaves a choice, Java either
                // calls it ambiguous or picks by rules not kept here — so it is declined.
                if (++nullMatches > 1) throw notYet(`${BOX} cannot tell which form of ${describe.replace(/^The \w+ method /, '')} a bare null is meant for.`, line, 'Put the null in a variable of the type you mean first.');
                chosen = chosen || { s, ret, concrete };
                continue;
            }
            if (s.refuse) throw notYet(`${BOX} does not have ${s.refuse}.`, line);
            return { fn: s.fn, ret, args: args.map((a, i) => convert(a, concrete[i])) };
        }
        if (chosen) {
            if (chosen.s.refuse) throw notYet(`${BOX} does not have ${chosen.s.refuse}.`, line);
            return { fn: chosen.s.fn, ret: chosen.ret, args: args.map((a, i) => convert(a, chosen.concrete[i])) };
        }
        const given = types.length ? `(${types.join(', ')})` : 'nothing in its ( )';
        const forms = sigs.map(s => `(${s.params.join(', ')}${s.variadic ? '…' : ''})`).filter((f, i, all) => all.indexOf(f) === i);
        throw compileError(`${describe} cannot be given ${given}.`, line,
            `It takes ${forms.length === 1 ? forms[0] : 'one of: ' + forms.join('  ')}`);
    }

    call(n) {
        n.args = n.args.map(a => this.value(a));

        // a method written by the student
        if (n.target === null) {
            const list = this.methods.get(n.name);
            if (!list) {
                const hint = n.name === 'println' || n.name === 'print' ? 'To print, write System.out.println(…)'
                    : ['length', 'charAt', 'substring', 'equals', 'indexOf'].includes(n.name) ? `${n.name}() belongs to a String: text.${n.name}(…)`
                        : ['abs', 'max', 'min', 'pow', 'sqrt', 'round'].includes(n.name) ? `${n.name}() belongs to Math: Math.${n.name}(…)`
                            : (near => (near ? `Did you mean ${near}()?` : null))(suggestName(n.name, [...this.methods.keys()]));
                throw compileError(`There is no method called ${n.name}() here.`, n.line, hint);
            }
            const m = list.find(x => x.params.length === n.args.length);
            if (!m) {
                const want = list[0].params.length;
                throw compileError(`${n.name}() takes ${want} value${want === 1 ? '' : 's'}, but this call gives it ${n.args.length}.`, n.line);
            }
            n.args = n.args.map((a, i) => {
                if (!passable(a.type, m.paramTypes[i])) {
                    throw compileError(`${n.name}() wants ${aType(m.paramTypes[i])} for ${m.params[i].name}, and this call gives it ${aType(a.type)}.`, n.line);
                }
                return convert(a, m.paramTypes[i]);
            });
            if (this.method.isStatic && !m.isStatic) {
                throw compileError(`${this.method.name} is static, so it cannot call ${m.name}(), which is not.`, n.line, `Make ${m.name} static too, or remove static from ${this.method.name}.`);
            }
            n.method = m;
            n.type = m.retType;
            return n;
        }

        // System.out.println
        const t = n.target;
        if (t.k === 'field' && this.className(t.target) === 'System') {
            if (t.name !== 'out') throw notYet(`${BOX} only has System.out.`, n.line);
            const sigs = PRINT_METHODS[n.name];
            if (!sigs) {
                if (n.name === 'printf' || n.name === 'format') throw notYet(`${BOX} does not have System.out.${n.name} yet.`, n.line, 'Build the text with + and use println.');
                throw compileError(`System.out has no method called ${n.name}().`, n.line, 'The two here are System.out.println(…) and System.out.print(…).');
            }
            if (n.args.length === 1 && isArray(n.args[0].type)) {
                throw notYet('Printing an array shows a code such as [I@1b6d3586, not the values in it.', n.line, 'Use System.out.println(Arrays.toString(nums));');
            }
            n.target = null;
            return this.builtin(n, sigs, null, `System.out.${n.name}()`);
        }

        // Math.max, Integer.parseInt, …
        const cls = this.className(t);
        if (cls) {
            const group = STATICS[cls];
            if (!group) this.unknownClass(cls, n.line);
            const sigs = group.methods[n.name];
            if (!sigs) {
                if (group.notYet[n.name]) throw notYet(`${BOX} does not have ${group.notYet[n.name]}.`, n.line);
                const near = suggestName(n.name, Object.keys(group.methods));
                throw notYet(`${BOX} does not know ${cls}.${n.name}().`, n.line, near ? `Did you mean ${cls}.${near}()?` : null);
            }
            n.target = null;
            return this.builtin(n, sigs, null, `${cls}.${n.name}()`);
        }

        // text.length(), sb.append(…), nums.clone()
        n.target = this.value(t);
        const rt = n.target.type;
        if (rt === 'String' || rt === 'StringBuilder') {
            const table = rt === 'String' ? STRING_METHODS : BUILDER_METHODS;
            const sigs = table[n.name];
            if (!sigs) {
                if (rt === 'String' && STRING_NOT_YET[n.name]) throw notYet(`${BOX} does not have ${STRING_NOT_YET[n.name]}.`, n.line);
                if (n.name === 'equals' || n.name === 'compareTo') throw notYet(`${BOX} does not have ${rt}.${n.name}().`, n.line, 'Compare the text: a.toString().equals(b.toString())');
                const near = suggestName(n.name, Object.keys(table));
                throw notYet(`${BOX} does not know a ${rt} method called ${n.name}().`, n.line,
                    n.name === 'size' ? 'The number of characters is .length()' : near ? `Did you mean .${near}()?` : null);
            }
            if (rt === 'String' && n.name === 'equals' && n.args.length === 1 && n.args[0].type !== 'String' && n.args[0].type !== 'null') {
                throw notYet(`.equals() here compares a String with a String, and this gives it ${aType(n.args[0].type)} — which in Java is never equal to a String.`, n.line,
                    n.args[0].type === 'char' ? 'To compare one character: text.charAt(0) == \'a\'' : null);
            }
            return this.builtin(n, sigs, rt, `${rt === 'String' ? 'The String method' : 'The StringBuilder method'} ${n.name}()`);
        }
        if (isArray(rt)) {
            if (n.name === 'length') throw compileError('For an array, length is not a method, so it has no ( ).', n.line, 'nums.length — only a String uses .length() with the ( ).');
            if (n.name === 'equals') throw notYet(`.equals() on an array asks whether two names share ONE array, not whether the values match, so ${BOX} does not run it.`, n.line, 'Use Arrays.equals(a, b).');
            if (n.name === 'toString') throw notYet('.toString() on an array gives a code such as [I@1b6d3586, not the values in it.', n.line, 'Use Arrays.toString(nums).');
            const sigs = ARRAY_METHODS[n.name];
            if (!sigs) throw compileError(`An array has no method called ${n.name}().`, n.line, n.name === 'size' ? 'The number of elements is nums.length' : 'Helpers for arrays live in Arrays: Arrays.sort(nums), Arrays.toString(nums).');
            return this.builtin(n, sigs, rt, `The array method ${n.name}()`);
        }
        throw compileError(`${aType(rt)[0].toUpperCase() + aType(rt).slice(1)} is a plain value, not an object, so it has no methods to call with a dot.`, n.line,
            n.name === 'equals' ? 'Compare plain values with ==' : n.name === 'toString' ? 'To turn it into text: String.valueOf(x) or "" + x'
                : n.name === 'length' ? 'Only Strings and arrays have a length.' : null);
    }

    builtin(n, sigs, selfType, describe) {
        const found = this.overload(sigs, n.args, selfType, describe, n.line);
        n.k = 'builtin';
        n.fn = found.fn;
        n.args = found.args;
        n.type = found.ret;
        n.describe = describe;
        return n;
    }

    create(n) {
        n.args = n.args.map(a => this.value(a));
        if (n.base === 'StringBuilder') {
            const found = this.overload([
                sig('', 'StringBuilder', () => new JBuilder()),
                sig('String', 'StringBuilder', s => new JBuilder(notNull(s, 'The text given to new StringBuilder'))),
                // new StringBuilder('a') is the classic trap: the char widens to an int, read as a starting capacity.
                sig('int', 'StringBuilder', n2 => { if (n2 < 0) throw thrown('NegativeArraySizeException', String(n2)); return new JBuilder(); }),
            ], n.args, null, 'new StringBuilder()', n.line);
            Object.assign(n, { k: 'builtin', target: null, fn: found.fn, args: found.args, type: 'StringBuilder', describe: 'new StringBuilder()', isNew: true });
            return n;
        }
        if (n.base === 'String') {
            const found = this.overload([
                sig('', 'String', () => ''),
                sig('String', 'String', s => notNull(s, 'The text given to new String')),
                sig('char[]', 'String', arr => String.fromCharCode(...notNull(arr, 'The array given to new String').a)),
            ], n.args, null, 'new String()', n.line);
            Object.assign(n, { k: 'builtin', target: null, fn: found.fn, args: found.args, type: 'String', describe: 'new String()', isNew: true });
            return n;
        }
        if (THROWABLE.has(n.base) || /Exception$/.test(n.base)) throw notYet(`${BOX} only makes an exception in order to throw it: throw new ${n.base}(…);`, n.line);
        if (PRIMITIVES.has(n.base)) throw compileError(`${n.base} is a plain value type, so there is nothing to make with new.`, n.line, `Just write the value: ${n.base} x = …;`);
        if (NOT_YET_TYPES.has(n.base)) throw notYet(`${BOX} does not have ${NOT_YET_TYPES.get(n.base)} yet.`, n.line, TYPE_HINTS[n.base] ?? null);
        throw notYet(`${BOX} cannot make a new ${n.base}.`, n.line, 'It can make arrays, Strings and StringBuilders.');
    }

    newArray(n) {
        const type = resolveType(n.type);
        n.type = type;
        if (n.init) {
            n.init = this.arrayInit(n.init, type);
            return n;
        }
        n.sizes = n.sizes.map(s => {
            const e = this.value(s);
            if (e.type !== 'int' && e.type !== 'char') {
                throw compileError(`The size of an array has to be an int, and this is ${aType(e.type)}.`, s.line, e.type === 'double' ? 'Cast it: new int[(int) x]' : null);
            }
            return e;
        });
        return n;
    }

    switch(n, asExpr) {
        n.sel = this.value(n.sel);
        const selType = n.sel.type;
        if (selType !== 'int' && selType !== 'char' && selType !== 'String') {
            throw compileError(`A switch chooses on an int, a char or a String, and this is ${aType(selType)}.`, n.line,
                selType === 'boolean' ? 'For a true-or-false choice use if / else.' : selType === 'double' ? 'A double cannot be matched exactly; use if / else if with ranges.' : null);
        }
        const seen = new Set();
        let hasDefault = false;
        const entry = { kind: asExpr ? 'switchexpr' : 'switch', results: [] };
        this.ctx.push(entry);
        this.scopes.push(new Map());   // a switch written with colons is one scope from top to bottom
        for (const c of n.cases) {
            if (c.isDefault) {
                if (hasDefault) throw compileError('This switch has two defaults.', c.line);
                hasDefault = true;
            }
            c.values = c.labels.map(label => {
                const e = this.value(label);
                if (!e.const) {
                    throw compileError('A case has to be a fixed value written into the program — a number, a char or a "string" — not something worked out while it runs.', c.line);
                }
                let ok;
                if (selType === 'String') ok = e.type === 'String';
                else if (selType === 'int') ok = e.type === 'int' || e.type === 'char';
                else ok = e.type === 'char' || fitsChar(e);
                if (!ok) throw compileError(`This switch chooses on ${aType(selType)}, so a case cannot be ${aType(e.type)}.`, c.line);
                const key = typeof e.const.v + ':' + e.const.v;
                if (seen.has(key)) throw compileError('Two cases in this switch have the same value.', c.line);
                seen.add(key);
                return e.const.v;
            });
            if (n.arrow) {
                const b = c.body;
                if (b.k === 'value') { b.e = this.value(b.e); entry.results.push(b); }
                else this.stmt(b);
            } else {
                for (const s of c.stmts) this.stmt(s);
            }
        }
        this.scopes.pop();
        this.ctx.pop();
        n.hasDefault = hasDefault;
        if (!asExpr) return n;

        if (!hasDefault) {
            throw compileError('A switch that produces a value has to cover every possibility, and this one has no default.', n.line, 'Add: default -> …;');
        }
        const results = entry.results;
        if (results.length === 0) throw compileError('This switch never produces a value.', n.line);
        const types = results.map(r => r.e.type);
        let type;
        if (types.every(t => t === types[0])) type = types[0];
        else if (types.every(t => NUMERIC.has(t))) {
            if (types.includes('double')) type = 'double';
            else if (types.includes('long')) type = 'long';
            else if (types.includes('char') && results.every(r => r.e.type === 'char' || fitsChar(r.e))) type = 'char';
            else type = 'int';
        } else {
            const refs = types.filter(t => t !== 'null');
            if (refs.length && refs.every(t => t === refs[0]) && isReference(refs[0])) type = refs[0];
            else throw notYet(`The results of this switch are different types (${[...new Set(types)].join(', ')}), which ${BOX} does not run.`, n.line, 'Make every result the same type.');
        }
        if (type === 'null') throw notYet(`${BOX} does not run a switch whose every result is null.`, n.line);
        for (const r of results) r.e = convert(r.e, type);
        n.type = type;
        return n;
    }
}

// ─── Pass 3: flow ────────────────────────────────────────────────────────────
//
// Two things Java decides before a program runs, by rules written down in the
// language specification, and so decided here by the same rules:
//
//   • which statements can be reached, and whether a method can run off its end
//     (JLS 14.22) — "unreachable statement", "missing return statement";
//   • whether a variable is certain to hold a value where it is read (JLS 16) —
//     "variable might not have been initialized".
//
// Both lean on constants: `while (true)` cannot be left except by break, and Java
// knows it. The state carried through is the set of variables that might NOT
// have a value yet. NONE is also the state of a point that is never reached,
// where every variable declared so far counts as having one — but a variable
// declared after that point starts without, exactly as javac has it.

const NONE = new Set();
const meet = (a, b) => (a.size === 0 ? b : b.size === 0 ? a : new Set([...a, ...b]));
const given = (s, slot) => {
    if (!s.has(slot)) return s;
    const out = new Set(s);
    out.delete(slot);
    return out;
};
const ungiven = (s, slot) => (s.has(slot) ? s : new Set(s).add(slot));

const isTrue = e => Boolean(e && e.const && e.const.v === true);
const isFalse = e => Boolean(e && e.const && e.const.v === false);

class Flow {
    constructor(method) {
        this.method = method;
        this.targets = [];
        this.S = NONE;
        let alive = true;
        for (const s of method.body.body) {
            if (!alive) throw this.unreachable(s);
            alive = this.stmt(s);
        }
        if (alive && method.retType !== 'void') {
            const text = JSON.stringify(method.body, (k, v) => (k === 'sym' || k === 'method' ? undefined : typeof v === 'bigint' ? String(v) : v));
            const hint = !text.includes('"k":"return"')
                ? (text.includes('"describe":"System.out.print') ? 'Printing shows a value on the screen; a test looks at what the method RETURNS. Use return.' : 'End the method with return and the answer.')
                : 'A return inside an if or a loop might be skipped. Add a return at the end for the case where none of them ran.';
            throw compileError(`${method.name} has to return ${aType(method.retType)} however it ends, and Java can see a way to reach the end of it without one.`, method.endLine, hint);
        }
    }

    unreachable(s) {
        return compileError('This line can never run, which Java does not allow.', s.line,
            'The line before it always leaves — with return, break or continue — or is a loop that never ends.');
    }

    // ── expressions: which variables might still have no value afterwards

    read(sym, S, line) {
        if (S.has(sym.slot)) {
            throw compileError(`The variable ${sym.name} might not have been given a value by the time this line runs.`, line,
                isArray(sym.type) ? `Declaring an array does not make one. Make it where it is declared: ${sym.type} ${sym.name} = new ${elemOf(sym.type)}[size];`
                    : `Java has to be certain. Give it a starting value where it is declared: ${sym.type} ${sym.name} = ${sym.type === 'boolean' ? 'false' : sym.type === 'String' ? '""' : PRIMITIVES.has(sym.type) ? '0' : 'new StringBuilder()'};`);
        }
    }

    /** For a true-or-false expression: [the state when it is true, the state when it is false]. */
    cond(e, S) {
        if (e.const) return e.const.v ? [S, NONE] : [NONE, S];
        switch (e.k) {
            case 'paren': case 'conv': return this.cond(e.e, S);
            case 'unary':
                if (e.op === '!') { const [t, f] = this.cond(e.e, S); return [f, t]; }
                break;
            case 'binary':
                if (e.op === '&&') {
                    const [t1, f1] = this.cond(e.l, S);
                    const [t2, f2] = this.cond(e.r, t1);
                    return [t2, meet(f1, f2)];
                }
                if (e.op === '||') {
                    const [t1, f1] = this.cond(e.l, S);
                    const [t2, f2] = this.cond(e.r, f1);
                    return [meet(t1, t2), f2];
                }
                break;
            case 'cond': {
                const [tc, fc] = this.cond(e.c, S);
                const [ta, fa] = this.cond(e.a, tc);
                const [tb, fb] = this.cond(e.b, fc);
                return [meet(ta, tb), meet(fa, fb)];
            }
            default: break;
        }
        const s = this.plain(e, S);
        return [s, s];
    }

    expr(e, S) {
        if (e.type === 'boolean') {
            const [t, f] = this.cond(e, S);
            return meet(t, f);
        }
        return this.plain(e, S);
    }

    all(list, S) {
        for (const e of list) S = e.k === 'arrinit' ? this.all(e.elems, S) : this.expr(e, S);
        return S;
    }

    plain(e, S) {
        if (e.const) return S;
        switch (e.k) {
            case 'lit': return S;
            case 'name': this.read(e.sym, S, e.line); return S;
            case 'paren': case 'conv': case 'unary': return this.expr(e.e, S);
            case 'binary': return this.expr(e.r, this.expr(e.l, S));
            case 'assign': {
                const t = e.target;
                if (t.k === 'name') {
                    if (e.op !== '=') this.read(t.sym, S, e.line);
                    return given(this.expr(e.e, S), t.sym.slot);
                }
                return this.expr(e.e, this.expr(t.i, this.expr(t.target, S)));
            }
            case 'incdec': {
                const t = e.target;
                if (t.k === 'name') { this.read(t.sym, S, e.line); return S; }
                return this.expr(t.i, this.expr(t.target, S));
            }
            case 'cond': {
                const [t, f] = this.cond(e.c, S);
                return meet(this.expr(e.a, t), this.expr(e.b, f));
            }
            case 'index': return this.expr(e.i, this.expr(e.target, S));
            case 'field': return this.expr(e.target, S);
            case 'call': return this.all(e.args, S);
            case 'builtin': return this.all(e.args, e.target ? this.expr(e.target, S) : S);
            case 'new': return this.all(e.args, S);
            case 'newarr': return e.init ? this.all(e.init.elems, S) : this.all(e.sizes, S);
            case 'switchexpr': return this.switchExpr(e, S);
            default: throw new Error(`unexpected expression ${e.k}`);
        }
    }

    // ── statements: returns whether the statement can finish and let the next one run

    jump(S) { this.S = NONE; return S; }

    target(test) {
        for (let i = this.targets.length - 1; i >= 0; i--) if (test(this.targets[i])) return this.targets[i];
        return null;
    }

    stmt(s) {
        switch (s.k) {
            case 'block': {
                let alive = true;
                for (const x of s.body) {
                    if (!alive) throw this.unreachable(x);
                    alive = this.stmt(x);
                }
                return alive;
            }
            case 'empty': return true;
            case 'local':
                for (const d of s.decls) {
                    // Not given a value yet while its own starting value is being worked out: int x = x + 1;
                    const during = ungiven(this.S, d.sym.slot);
                    if (!d.init) this.S = during;
                    else this.S = given(d.init.k === 'arrinit' ? this.all(d.init.elems, during) : this.expr(d.init, during), d.sym.slot);
                }
                return true;
            case 'expr': this.S = this.expr(s.e, this.S); return true;
            case 'if': {
                const [t, f] = this.cond(s.cond, this.S);
                this.S = t;
                const a = this.stmt(s.then);
                const afterThen = a ? this.S : NONE;
                this.S = f;
                const b = s.otherwise ? this.stmt(s.otherwise) : true;
                this.S = meet(afterThen, b ? this.S : NONE);
                return a || b;
            }
            case 'while': {
                const [t, f] = this.cond(s.cond, this.S);
                if (isFalse(s.cond)) throw this.unreachable(s.body);
                const loop = { kind: 'loop', breaks: [], continues: [] };
                this.targets.push(loop);
                this.S = t;
                this.stmt(s.body);
                this.targets.pop();
                this.S = loop.breaks.reduce(meet, f);
                return !isTrue(s.cond) || loop.breaks.length > 0;
            }
            case 'do': {
                const loop = { kind: 'loop', breaks: [], continues: [] };
                this.targets.push(loop);
                const bodyEnds = this.stmt(s.body);
                this.targets.pop();
                const reachesTest = bodyEnds || loop.continues.length > 0;
                const [, f] = this.cond(s.cond, loop.continues.reduce(meet, bodyEnds ? this.S : NONE));
                this.S = loop.breaks.reduce(meet, reachesTest ? f : NONE);
                return (reachesTest && !isTrue(s.cond)) || loop.breaks.length > 0;
            }
            case 'for': {
                for (const i of s.init) this.stmt(i);
                const forever = !s.cond || isTrue(s.cond);
                const [t, f] = s.cond ? this.cond(s.cond, this.S) : [this.S, NONE];
                if (isFalse(s.cond)) throw this.unreachable(s.body);
                const loop = { kind: 'loop', breaks: [], continues: [] };
                this.targets.push(loop);
                this.S = t;
                const bodyEnds = this.stmt(s.body);
                this.targets.pop();
                this.all(s.update, loop.continues.reduce(meet, bodyEnds ? this.S : NONE));
                this.S = loop.breaks.reduce(meet, f);
                return !forever || loop.breaks.length > 0;
            }
            case 'foreach': {
                const after = this.expr(s.iter, this.S);
                const loop = { kind: 'loop', breaks: [], continues: [] };
                this.targets.push(loop);
                this.S = given(after, s.sym.slot);
                this.stmt(s.body);
                this.targets.pop();
                this.S = loop.breaks.reduce(meet, after);
                return true;
            }
            case 'break':
                this.target(t => t.kind !== 'switchexpr').breaks.push(this.jump(this.S));
                return false;
            case 'continue':
                this.target(t => t.kind === 'loop').continues.push(this.jump(this.S));
                return false;
            case 'return':
                if (s.e) this.expr(s.e, this.S);
                this.S = NONE;
                return false;
            case 'throw':
                this.all(s.e.args, this.S);
                this.S = NONE;
                return false;
            case 'yield':
                this.target(t => t.kind === 'switchexpr').yields.push(this.expr(s.e, this.S));
                this.S = NONE;
                return false;
            case 'switch': return this.switchStmt(s);
            default: throw new Error(`unexpected statement ${s.k}`);
        }
    }

    switchStmt(s) {
        const start = this.expr(s.sel, this.S);
        const sw = { kind: 'switch', breaks: [] };
        this.targets.push(sw);
        const exits = s.hasDefault ? [] : [start];   // no default: the whole switch may be skipped
        let ends = !s.hasDefault;
        if (s.arrow) {
            for (const c of s.cases) {
                this.S = start;
                if (this.stmt(c.body)) { exits.push(this.S); ends = true; }
            }
        } else {
            let previousEnds = false;
            let previous = NONE;
            // The switch is one scope, so a variable declared under one case can be named under a
            // later one — but arriving there directly, it has not been given its value.
            let direct = start;
            for (const c of s.cases) {
                this.S = previousEnds ? meet(direct, previous) : direct;   // falling through from the case above
                let alive = true;
                for (const x of c.stmts) {
                    if (!alive) throw this.unreachable(x);
                    alive = this.stmt(x);
                    if (x.k === 'local') for (const d of x.decls) direct = ungiven(direct, d.sym.slot);
                }
                previousEnds = alive;
                previous = this.S;
            }
            if (s.cases.length === 0 || previousEnds) { exits.push(s.cases.length ? previous : start); ends = true; }
        }
        this.targets.pop();
        this.S = [...exits, ...sw.breaks].reduce(meet, NONE);
        return ends || sw.breaks.length > 0;
    }

    switchExpr(e, S) {
        const saved = this.S;
        const start = this.expr(e.sel, S);
        const sw = { kind: 'switchexpr', yields: [] };
        this.targets.push(sw);
        for (const c of e.cases) {
            const b = c.body;
            if (b.k === 'value') { sw.yields.push(this.expr(b.e, start)); continue; }
            this.S = start;
            if (this.stmt(b)) {
                throw compileError('This case reaches its end without giving the switch a value.', b.endLine ?? b.line, 'End it with: yield theValue;');
            }
        }
        this.targets.pop();
        this.S = saved;
        return sw.yields.reduce(meet, NONE);
    }
}

// ─── Pass 4: compile ─────────────────────────────────────────────────────────
//
// The checked tree becomes closures over a frame — an array with one slot per
// variable of the method. A statement returns 0 when it simply finishes, or one
// of the signals below, which each enclosing loop or switch either answers or
// hands on outward.

const BRK = 1;
const CNT = 2;
const RET = 3;
const YLD = 4;

/** Stamp the line on an error from library code, which does not know where it was called. */
function at(err, line) {
    if (err instanceof JavaError && err.line === null) err.line = line;
    return err;
}

function checkIndex(arr, i, line) {
    if (arr === null) throw at(nullPointer('The array'), line);
    if (i < 0 || i >= arr.a.length) throw at(arrayIndex(i, arr.a.length), line);
}

function invoke(method, frame, line) {
    tick();
    if (++M.depth > M.depthLimit) {
        throw at(limitError(`StackOverflowError: ${method.name}() is ${M.depthLimit} calls deep and still calling.`,
            'A method that calls itself needs a case where it stops — and each call has to move toward that case.'), line);
    }
    const signal = method.code(frame);
    M.depth--;
    if (signal === RET) {
        const v = M.ret;
        M.ret = undefined;
        return v;
    }
    return undefined;
}

function compoundFunction(n) {
    const T = n.type;
    if (n.mode === 'concat') {
        const lt = textOf(T);
        const rt = textOf(n.e.type);
        return (a, b) => text(lt(a) + rt(b));
    }
    const up = converter(T, n.optype) || (v => v);
    const back = converter(n.optype, T) || (v => v);
    const op = n.mode === 'shift' ? shifter(n.binop, n.optype, n.e.type === 'long') : ARITHMETIC[n.optype][n.binop];
    return (a, b) => back(op(up(a), b));
}

function compileArrayInit(init) {
    const elem = elemOf(init.type);
    const items = init.elems.map(e => (e.k === 'arrinit' ? compileArrayInit(e) : cx(e)));
    return f => {
        cells(items.length);
        const out = new Array(items.length);
        for (let i = 0; i < items.length; i++) out[i] = items[i](f);
        return new JArray(elem, out);
    };
}

function buildArray(type, sizes, k) {
    const elem = elemOf(type);
    const arr = newArray(elem, sizes[k]);
    if (k < sizes.length - 1) for (let i = 0; i < sizes[k]; i++) arr.a[i] = buildArray(elem, sizes, k + 1);
    return arr;
}

/** Which case a switch value selects: a lookup from value to position, and the default's position. */
function caseTable(cases) {
    const table = new Map();
    let fallback = -1;
    cases.forEach((c, i) => {
        if (c.isDefault) fallback = i;
        for (const v of c.values) table.set(v, i);
    });
    return { table, fallback };
}

function cx(n) {
    if (n.const) { const v = n.const.v; return () => v; }
    const line = n.line;
    switch (n.k) {
        case 'lit': { const v = n.value; return () => v; }
        case 'paren': return cx(n.e);
        case 'conv': {
            const inner = cx(n.e);
            const fn = converter(n.from, n.to);
            return fn ? f => fn(inner(f)) : inner;
        }
        case 'name': { const slot = n.sym.slot; return f => f[slot]; }
        case 'unary': {
            const fn = unaryFunction(n.op, n.type);
            const e = cx(n.e);
            return f => fn(e(f));
        }
        case 'binary': {
            const l = cx(n.l);
            const r = cx(n.r);
            if (n.op === '&&') return f => l(f) && r(f);
            if (n.op === '||') return f => l(f) || r(f);
            const fn = binaryFunction(n);
            const canThrow = n.mode === 'concat' || ((n.op === '/' || n.op === '%') && n.optype !== 'double');
            if (!canThrow) return f => fn(l(f), r(f));
            return f => {
                const a = l(f);
                const b = r(f);
                try { return fn(a, b); } catch (err) { throw at(err, line); }
            };
        }
        case 'assign': {
            const t = n.target;
            const e = cx(n.e);
            if (n.op === '=') {
                if (t.k === 'name') { const slot = t.sym.slot; return f => (f[slot] = e(f)); }
                const arr = cx(t.target);
                const idx = cx(t.i);
                return f => {
                    const a = arr(f);
                    const i = idx(f);
                    const v = e(f);
                    checkIndex(a, i, line);
                    return (a.a[i] = v);
                };
            }
            const combine = compoundFunction(n);
            if (t.k === 'name') {
                const slot = t.sym.slot;
                return f => {
                    const old = f[slot];
                    const b = e(f);
                    try { return (f[slot] = combine(old, b)); } catch (err) { throw at(err, line); }
                };
            }
            const arr = cx(t.target);
            const idx = cx(t.i);
            return f => {
                const a = arr(f);
                const i = idx(f);
                checkIndex(a, i, line);
                const old = a.a[i];
                const b = e(f);
                try { return (a.a[i] = combine(old, b)); } catch (err) { throw at(err, line); }
            };
        }
        case 'incdec': {
            const t = n.target;
            const step = stepper(n.type, n.op === '++' ? 1 : -1);
            if (t.k === 'name') {
                const slot = t.sym.slot;
                return n.prefix ? f => (f[slot] = step(f[slot])) : f => { const old = f[slot]; f[slot] = step(old); return old; };
            }
            const arr = cx(t.target);
            const idx = cx(t.i);
            return f => {
                const a = arr(f);
                const i = idx(f);
                checkIndex(a, i, line);
                const old = a.a[i];
                const now = step(old);
                a.a[i] = now;
                return n.prefix ? now : old;
            };
        }
        case 'cond': {
            const c = cx(n.c);
            const a = cx(n.a);
            const b = cx(n.b);
            return f => (c(f) ? a(f) : b(f));
        }
        case 'index': {
            const arr = cx(n.target);
            const idx = cx(n.i);
            return f => {
                const a = arr(f);
                const i = idx(f);
                if (a === null) throw at(nullPointer('The array'), line);
                if (i < 0 || i >= a.a.length) throw at(arrayIndex(i, a.a.length), line);
                return a.a[i];
            };
        }
        case 'field': {
            const arr = cx(n.target);
            return f => {
                const a = arr(f);
                if (a === null) throw at(nullPointer('The array whose .length was asked for'), line);
                return a.a.length;
            };
        }
        case 'call': {
            const m = n.method;
            const args = n.args.map(cx);
            const count = args.length;
            return f => {
                const frame = new Array(m.frameSize);
                for (let i = 0; i < count; i++) frame[i] = args[i](f);
                return invoke(m, frame, line);
            };
        }
        case 'builtin': {
            const fn = n.fn;
            const args = n.args.map(cx);
            const recv = n.target ? cx(n.target) : null;
            const what = `The ${n.target ? n.target.type : ''} that .${n.name}() was called on`;
            if (recv) {
                if (args.length === 0) {
                    return f => {
                        const r = recv(f);
                        if (r === null) throw at(nullPointer(what), line);
                        try { return fn(r); } catch (err) { throw at(err, line); }
                    };
                }
                if (args.length === 1) {
                    const a0 = args[0];
                    return f => {
                        const r = recv(f);
                        const x = a0(f);
                        if (r === null) throw at(nullPointer(what), line);
                        try { return fn(r, x); } catch (err) { throw at(err, line); }
                    };
                }
                return f => {
                    const r = recv(f);
                    const xs = args.map(a => a(f));
                    if (r === null) throw at(nullPointer(what), line);
                    try { return fn(r, ...xs); } catch (err) { throw at(err, line); }
                };
            }
            if (args.length === 1) {
                const a0 = args[0];
                return f => {
                    const x = a0(f);
                    try { return fn(x); } catch (err) { throw at(err, line); }
                };
            }
            return f => {
                const xs = args.map(a => a(f));
                try { return fn(...xs); } catch (err) { throw at(err, line); }
            };
        }
        case 'newarr': {
            if (n.init) return compileArrayInit(n.init);
            const sizes = n.sizes.map(cx);
            const type = n.type;
            return f => {
                const lengths = sizes.map(s => s(f));
                for (const len of lengths) {
                    if (len < 0) throw at(thrown('NegativeArraySizeException', String(len), 'An array cannot have a negative number of elements.'), line);
                }
                try { return buildArray(type, lengths, 0); } catch (err) { throw at(err, line); }
            };
        }
        case 'switchexpr': {
            const sel = cx(n.sel);
            const { table, fallback } = caseTable(n.cases);
            const onString = n.sel.type === 'String';
            const arms = n.cases.map(c => {
                if (c.body.k === 'value') return cx(c.body.e);
                const body = cs(c.body);
                return f => {
                    const signal = body(f);
                    if (signal !== YLD) throw new Error('a switch case ended without a value');
                    const v = M.ret;
                    M.ret = undefined;
                    return v;
                };
            });
            return f => {
                const v = sel(f);
                if (onString && v === null) throw at(nullPointer('The String this switch chooses on'), line);
                const i = table.get(v);
                return arms[i === undefined ? fallback : i](f);
            };
        }
        default: throw new Error(`cannot compile expression ${n.k}`);
    }
}

function loopBody(signal) {
    // what a loop does with its body's signal: 0 → carry on, BRK → leave, anything else → hand on
    return signal === 0 || signal === CNT ? 0 : signal;
}

function cs(s) {
    const line = s.line;
    switch (s.k) {
        case 'block': {
            const list = s.body.map(cs);
            if (list.length === 0) return () => 0;
            if (list.length === 1) return list[0];
            const count = list.length;
            return f => {
                for (let i = 0; i < count; i++) {
                    const signal = list[i](f);
                    if (signal !== 0) return signal;
                }
                return 0;
            };
        }
        case 'empty': return () => 0;
        case 'local': {
            const inits = s.decls.filter(d => d.init).map(d => [d.sym.slot, d.init.k === 'arrinit' ? compileArrayInit(d.init) : cx(d.init)]);
            if (inits.length === 0) return () => 0;
            if (inits.length === 1) {
                const [slot, init] = inits[0];
                return f => { f[slot] = init(f); return 0; };
            }
            return f => {
                for (const [slot, init] of inits) f[slot] = init(f);
                return 0;
            };
        }
        case 'expr': {
            const e = cx(s.e);
            return f => { e(f); return 0; };
        }
        case 'if': {
            const c = cx(s.cond);
            const a = cs(s.then);
            const b = s.otherwise ? cs(s.otherwise) : null;
            return b ? f => (c(f) ? a(f) : b(f)) : f => (c(f) ? a(f) : 0);
        }
        case 'while': {
            const c = cx(s.cond);
            const body = cs(s.body);
            return f => {
                for (;;) {
                    tick();
                    if (!c(f)) return 0;
                    const signal = loopBody(body(f));
                    if (signal !== 0) return signal === BRK ? 0 : signal;
                }
            };
        }
        case 'do': {
            const c = cx(s.cond);
            const body = cs(s.body);
            return f => {
                for (;;) {
                    tick();
                    const signal = loopBody(body(f));
                    if (signal !== 0) return signal === BRK ? 0 : signal;
                    if (!c(f)) return 0;
                }
            };
        }
        case 'for': {
            const init = s.init.map(cs);
            const c = s.cond ? cx(s.cond) : null;
            const update = s.update.map(cx);
            const body = cs(s.body);
            return f => {
                for (const i of init) i(f);
                for (;;) {
                    tick();
                    if (c !== null && !c(f)) return 0;
                    const signal = loopBody(body(f));
                    if (signal !== 0) return signal === BRK ? 0 : signal;
                    for (let k = 0; k < update.length; k++) update[k](f);
                }
            };
        }
        case 'foreach': {
            const iter = cx(s.iter);
            const slot = s.sym.slot;
            const conv = s.conv;
            const body = cs(s.body);
            return f => {
                const arr = iter(f);
                if (arr === null) throw at(nullPointer('The array this loop walks through'), line);
                const items = arr.a;
                for (let i = 0; i < items.length; i++) {
                    tick();
                    f[slot] = conv ? conv(items[i]) : items[i];
                    const signal = loopBody(body(f));
                    if (signal !== 0) return signal === BRK ? 0 : signal;
                }
                return 0;
            };
        }
        case 'break': return () => BRK;
        case 'continue': return () => CNT;
        case 'return': {
            if (!s.e) return () => { M.ret = undefined; return RET; };
            const e = cx(s.e);
            return f => { M.ret = e(f); return RET; };
        }
        case 'yield': {
            const e = cx(s.e);
            return f => { M.ret = e(f); return YLD; };
        }
        case 'throw': {
            const name = s.e.base;
            const message = s.e.args.length ? cx(s.e.args[0]) : null;
            return f => {
                const detail = message ? message(f) : null;
                throw at(thrown(name, detail, 'Your own code threw this, on the line shown.'), line);
            };
        }
        case 'switch': {
            const sel = cx(s.sel);
            const { table, fallback } = caseTable(s.cases);
            const onString = s.sel.type === 'String';
            const pick = f => {
                const v = sel(f);
                if (onString && v === null) throw at(nullPointer('The String this switch chooses on'), line);
                const i = table.get(v);
                return i === undefined ? fallback : i;
            };
            if (s.arrow) {
                const arms = s.cases.map(c => cs(c.body));
                return f => {
                    const i = pick(f);
                    if (i < 0) return 0;
                    const signal = arms[i](f);
                    return signal === BRK ? 0 : signal;
                };
            }
            // Written with colons: one run of statements, entered at the matching case and left by break.
            const flat = [];
            const starts = s.cases.map(c => {
                const start = flat.length;
                for (const x of c.stmts) flat.push(cs(x));
                return start;
            });
            return f => {
                const i = pick(f);
                if (i < 0) return 0;
                for (let k = starts[i]; k < flat.length; k++) {
                    const signal = flat[k](f);
                    if (signal !== 0) return signal === BRK ? 0 : signal;
                }
                return 0;
            };
        }
        default: throw new Error(`cannot compile statement ${s.k}`);
    }
}

// ─── Running ─────────────────────────────────────────────────────────────────

/** Text → a program whose methods are checked and ready to call. Throws JavaError if it would not compile. */
export function compileJava(source) {
    const program = parseJava(source);
    const checker = new Checker(program);
    for (const m of program.methods) {
        new Flow(m);
        m.code = cs(m.body);
    }
    return { methods: checker.methods, checker };
}

function inMachine(limits, run) {
    const machine = new Machine(limits);
    const previous = M;
    M = machine;
    try {
        return { value: run(), machine, error: null };
    } catch (err) {
        if (err instanceof RangeError) {
            return { value: undefined, machine, error: limitError('StackOverflowError: the calls went too deep.', 'A method that calls itself needs a case where it stops.') };
        }
        if (err instanceof JavaError) return { value: undefined, machine, error: err };
        throw err;
    } finally {
        M = previous;
    }
}

/** Call one method of a compiled program with ready-made Java values. */
export function callJava(method, args, limits = {}) {
    return inMachine(limits, () => {
        const frame = new Array(method.frameSize);
        args.forEach((a, i) => { frame[i] = a; });
        return invoke(method, frame, null);
    });
}

/**
 * Evaluate one expression — `scoreUp(new int[] {1, 2, 3})` — against a compiled
 * program. This is how the comparison with the real JDK calls a method without
 * going through JSON. Returns { value, type, machine, error }.
 */
export function evaluateJava(program, expression, limits = {}) {
    const parser = new Parser(tokenize(expression));
    const tree = parser.parseExpr();
    if (parser.tok.t !== 'eof') throw compileError('There is more after the end of the expression.', parser.tok.line);
    const checker = program.checker;
    checker.method = { name: '(test)', isStatic: false, frameSize: 0, retType: 'void' };
    checker.scopes = [new Map()];
    checker.ctx = [];
    const typed = checker.expr(tree);
    const run = cx(typed);
    const result = inMachine(limits, () => run([]));
    return { ...result, type: typed.type };
}

// ─── Values in and out ───────────────────────────────────────────────────────

/** A value from a question file → the Java value of the given type. Throws a plain Error on an author's mistake. */
export function javaFromJson(value, type) {
    const wrong = () => new Error(`${JSON.stringify(value)} is not a valid ${type}`);
    if (isArray(type)) {
        if (value === null) return null;
        if (!Array.isArray(value)) throw wrong();
        return new JArray(elemOf(type), value.map(v => javaFromJson(v, elemOf(type))));
    }
    switch (type) {
        case 'int':
            if (!Number.isInteger(value) || value < INT_MIN || value > INT_MAX) throw wrong();
            return value;
        case 'long':
            if (typeof value === 'string' && /^-?\d+$/.test(value)) return wrap64(BigInt(value));
            if (!Number.isSafeInteger(value)) throw wrong();
            return BigInt(value);
        case 'double':
            if (value === 'NaN') return NaN;
            if (value === 'Infinity') return Infinity;
            if (value === '-Infinity') return -Infinity;
            if (typeof value !== 'number') throw wrong();
            return value;
        case 'char':
            if (typeof value !== 'string' || value.length !== 1) throw wrong();
            return value.charCodeAt(0);
        case 'boolean':
            if (typeof value !== 'boolean') throw wrong();
            return value;
        case 'String':
            if (value !== null && typeof value !== 'string') throw wrong();
            return value;
        default:
            throw new Error(`a test cannot pass or expect a ${type}`);
    }
}

const ESCAPES = { '\n': '\\n', '\t': '\\t', '\r': '\\r', '\b': '\\b', '\f': '\\f', '\\': '\\\\' };
function quote(s, mark) {
    let out = mark;
    for (const ch of s) {
        if (ch === mark) out += '\\' + ch;
        else if (ch in ESCAPES) out += ESCAPES[ch];
        else if (ch < ' ') out += '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0');
        else out += ch;
    }
    return out + mark;
}

/** A Java value written the way a student would write it in code: "text", 'c', 3.0, [1, 2, 3]. */
export function javaRepr(value, type) {
    if (type === 'void') return '(nothing)';
    if (value === null || value === undefined) return 'null';
    if (isArray(type)) return '[' + value.a.map(v => javaRepr(v, elemOf(type))).join(', ') + ']';
    switch (type) {
        case 'char': return quote(String.fromCharCode(value), "'");
        case 'String': return quote(value, '"');
        case 'StringBuilder': return quote(value.s, '"');
        default: return textOf(type)(value);
    }
}

/** A Java value as String.valueOf / Arrays.toString would print it — no quotes. */
export function javaText(value, type) {
    if (isArray(type)) return value === null ? 'null' : '[' + value.a.map(v => javaText(v, elemOf(type))).join(', ') + ']';
    return type === 'void' ? '' : textOf(type)(value);
}

const DOUBLE_TOLERANCE = 1e-9;

/** Is this the expected answer? Exact for everything but double, where the last few bits depend on the order of the arithmetic. */
export function javaEquals(actual, expected, type) {
    if (actual === null || expected === null || actual === undefined) return actual === expected;
    if (isArray(type)) {
        return actual.a.length === expected.a.length && actual.a.every((v, i) => javaEquals(v, expected.a[i], elemOf(type)));
    }
    if (type === 'double') {
        if (actual === expected || (actual !== actual && expected !== expected)) return true;
        if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;   // infinity is not close to anything
        return Math.abs(actual - expected) <= DOUBLE_TOLERANCE * Math.max(1, Math.abs(actual), Math.abs(expected));
    }
    if (type === 'StringBuilder') return actual.s === expected.s;
    return actual === expected;
}

// ─── Problems ────────────────────────────────────────────────────────────────
//
// A problem gives a method's first line and a table of calls; the student writes
// the body. Each call runs in its own fresh machine and is reported on its own row.

const headerOf = signature => String(signature ?? '').trim().replace(/\{\s*$/, '').trim();

/** `public int sumDouble(int a, int b)` → { name, ret, params: [{ type, name }], header }. */
export function parseJavaSignature(signature) {
    const header = headerOf(signature);
    let method;
    try {
        const program = parseJava(`${header} {}`);
        if (program.methods.length !== 1) throw new Error('not one method');
        [method] = program.methods;
        return {
            name: method.name,
            ret: resolveType(method.ret, { allowVoid: true }),
            params: method.params.map(p => ({ type: resolveType(p.type), name: p.name })),
            header,
        };
    } catch (err) {
        throw new Error(`"${signature}" is not a Java method line this box can use (${err.message}). It looks like: public int add(int a, int b)`);
    }
}

/** Did the student paste whole methods (or a whole class) rather than write a body? */
function looksPasted(raw) {
    let tokens;
    try { tokens = tokenize(raw); } catch (_) { return false; }
    let p = 0;
    const isOp = (v, t) => t && t.t === 'op' && t.v === v;
    while (tokens[p].t === 'kw' && tokens[p].v === 'import') {
        while (tokens[p].t !== 'eof' && !isOp(';', tokens[p])) p++;
        p++;
        if (p >= tokens.length) return false;
    }
    while (tokens[p].t === 'kw' && MODIFIERS.has(tokens[p].v)) p++;
    const t = tokens[p];
    if (t.t === 'kw' && t.v === 'class') return true;
    if (!(t.t === 'id' || (t.t === 'kw' && (PRIMITIVE_WORDS.has(t.v) || t.v === 'void')))) return false;
    p++;
    while (isOp('[', tokens[p]) && isOp(']', tokens[p + 1])) p += 2;
    return tokens[p].t === 'id' && isOp('(', tokens[p + 1]);
}

/**
 * Put the student's text under the method line. The box holds a body, but a
 * student who pastes the whole method — or a whole class around it — gets that
 * run as written. Returns { source, lineOffset, pasted }.
 */
export function assembleJava(signature, body) {
    const raw = String(body ?? '').replace(/\r\n?/g, '\n');
    if (raw.trim().length === 0) {
        throw compileError('You have not written any code yet.', 1, 'Write the lines that work out the answer, and end with a return.');
    }
    if (looksPasted(raw)) return { source: raw, lineOffset: 0, pasted: true };
    return { source: `${headerOf(signature)} {\n${raw}\n}\n`, lineOffset: 1, pasted: false };
}

/** How a call is written out for the results table: `sumDouble(1, 2)`. */
export function describeJavaCall(name, args, types) {
    return `${name}(${args.map((a, i) => javaRepr(a, types[i])).join(', ')})`;
}

const TOTAL_RUN_MS = 5000;

function failed(error, cases) {
    return { ok: false, error, results: cases.map(() => null), passed: 0, total: cases.length, printedOnly: false };
}

/**
 * Run one problem's test table against a student's body. Returns the same shape
 * pytiny's runner does, so the results table and the grading treat the two alike:
 *   { ok, error, results: [{ call, expectedRepr, actualRepr, passed, output, error }], passed, total, printedOnly }
 */
export function runJavaTestCases({ signature, body, tests, limits = {}, now = () => Date.now() }) {
    const cases = Array.isArray(tests) ? tests : [];
    const want = parseJavaSignature(signature);
    const types = want.params.map(p => p.type);
    const bodyLines = String(body ?? '').replace(/\r\n?/g, '\n').split('\n').length;

    let lineOffset = 0;
    const report = err => ({
        message: err.message,
        hint: err.hint ?? null,
        line: err.line === null || err.line === undefined ? null : Math.min(bodyLines, Math.max(1, err.line - lineOffset)),
        kind: err.kind ?? 'runtime',
    });

    let program;
    let pasted = false;
    try {
        const assembled = assembleJava(signature, body);
        lineOffset = assembled.lineOffset;
        pasted = assembled.pasted;
        program = compileJava(assembled.source);
    } catch (err) {
        if (err instanceof JavaError) return failed(report(err), cases);
        throw err;
    }

    const method = (program.methods.get(want.name) || []).find(m => m.params.length === types.length);
    if (!method || method.retType !== want.ret || method.paramTypes.join() !== types.join()) {
        const near = !method && suggestName(want.name, [...program.methods.keys()]);
        return failed({
            message: method ? `${want.name}() is not declared the way the problem asks.` : `I could not find a method called ${want.name}().`,
            hint: `${near ? `You wrote ${near}(). ` : ''}The problem needs: ${want.header}`,
            line: null,
            kind: 'syntax',
        }, cases);
    }
    void pasted;

    const results = [];
    const startedAt = now();
    for (const testCase of cases) {
        const args = (testCase.args || []).map((a, i) => javaFromJson(a, types[i]));
        const expected = javaFromJson(testCase.expect, want.ret);
        const row = {
            call: describeJavaCall(want.name, args, types),
            expectedRepr: javaRepr(expected, want.ret),
            actualRepr: null,
            passed: false,
            output: [],
            error: null,
        };
        if (now() - startedAt > TOTAL_RUN_MS) {
            row.error = { message: 'This run was stopped — the earlier tests took too long.', hint: null, line: null, kind: 'limit' };
            results.push(row);
            continue;
        }
        const run = callJava(method, args, { ...limits, now });
        if (run.error) row.error = report(run.error);
        else {
            row.actualRepr = javaRepr(run.value, want.ret);
            row.passed = javaEquals(run.value, expected, want.ret);
        }
        row.output = run.machine.outputLines();
        results.push(row);
    }

    return {
        ok: true,
        error: null,
        results,
        passed: results.filter(r => r.passed).length,
        total: results.length,
        printedOnly: false,
    };
}

/** Run a Java write-the-code question. */
export function runJavaProblem(question, body, options = {}) {
    return runJavaTestCases({ signature: question.signature, body, tests: question.tests, ...options });
}

/** What the student is shown above the box: the method line, opened. */
export function javaProblemHeader(question) {
    return `${headerOf(question?.signature)} {`;
}
