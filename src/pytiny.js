/**
 * pytiny.js — a very small Python, written for people learning their first one.
 *
 * This is not a Python implementation; it is a teaching machine that runs the
 * slice of Python a beginner writes in their first month, and explains what
 * went wrong in the words that month has taught them. Where real Python says
 * `TypeError: unsupported operand type(s) for +: 'int' and 'str'`, this says
 * "you tried to add text to a number".
 *
 * What it runs: def / return / if / elif / else / while / for-in / break /
 * continue / pass, ints, floats, strings, bools, None, lists, tuples, dicts,
 * indexing and slicing, the usual operators, f-strings, keyword arguments and
 * defaults, and the built-ins and methods listed in BUILTINS / METHODS below.
 * Anything outside that is refused by name rather than misinterpreted.
 *
 * Classes too, with one parent each: see "Classes and objects" below.
 *
 * What it deliberately refuses: imports, exceptions, comprehensions,
 * generators, sets, lambdas, global/nonlocal, `with`, `del`. Each gets its own
 * "not in this practice interpreter yet" message so a student who tries one
 * learns that, instead of reading a parser error.
 *
 * Nothing here can reach the host page: student text is tokenized and walked as
 * data, never passed to eval or Function, and every run is bounded by a step
 * budget, a wall-clock budget, a recursion-depth cap and an output cap.
 */

// ─── Errors ──────────────────────────────────────────────────────────────────

/**
 * Anything that stops a student's program. `line` is 1-based within whatever
 * source was handed to run(); callers that assemble a program from a signature
 * plus a typed body pass `lineOffset` so the number the student sees counts
 * lines of the box they typed in.
 */
export class PyError extends Error {
    constructor(message, { line = null, hint = null, kind = 'runtime' } = {}) {
        super(message);
        this.name = 'PyError';
        this.line = line;
        this.hint = hint;
        this.kind = kind;   // 'syntax' | 'runtime' | 'limit'
    }
}

const syntaxError  = (msg, line, hint) => new PyError(msg, { line, hint, kind: 'syntax' });
const runtimeError = (msg, line, hint) => new PyError(msg, { line, hint, kind: 'runtime' });
const limitError   = (msg, hint, line = null) => new PyError(msg, { line, hint, kind: 'limit' });

/**
 * An error that is one of Python's own exceptions, so that try / except can
 * catch it. The sentence the student reads is still ours. `args` is what
 * Python's exception would hold (its str() is what `print(e)` shows) — or null
 * where Python's wording differs between versions, in which case the error can
 * be caught but asking for its text is refused rather than guessed.
 *
 * An error made with plain runtimeError is NOT catchable: some of those are
 * this interpreter declining to do something, which no except should swallow.
 */
const tagged = (pyType, pyArgs = null) => (msg, line, hint) =>
    Object.assign(runtimeError(msg, line, hint), { pyType, pyArgs });
const typeError  = tagged('TypeError');
const valueError = tagged('ValueError');
const zeroError  = tagged('ZeroDivisionError');

// Python's exceptions, each with its parent. `except LookupError:` catches a
// KeyError because of this table, and for no other reason.
const EXCEPTION_PARENTS = {
    Exception: null,
    ArithmeticError: 'Exception', ZeroDivisionError: 'ArithmeticError',
    LookupError: 'Exception', IndexError: 'LookupError', KeyError: 'LookupError',
    ValueError: 'Exception', TypeError: 'Exception', AttributeError: 'Exception',
    NameError: 'Exception', UnboundLocalError: 'NameError',
    AssertionError: 'Exception',
    RuntimeError: 'Exception', NotImplementedError: 'RuntimeError',
    OSError: 'Exception', FileNotFoundError: 'OSError',
};

// ─── Tokenizer ───────────────────────────────────────────────────────────────

const KEYWORDS = new Set([
    'def', 'return', 'if', 'elif', 'else', 'while', 'for', 'in', 'not', 'and',
    'or', 'True', 'False', 'None', 'break', 'continue', 'pass', 'is', 'class',
    'assert', 'try', 'except', 'finally', 'raise', 'with', 'as',
]);

// Refused by name, so the student is told what is missing rather than shown a
// parse failure three tokens later.
const NOT_YET = new Map([
    ['import',   'You do not need to import anything here. Everything these problems need is already built in.'],
    ['from',     'You do not need to import anything here. Everything these problems need is already built in.'],
    ['lambda',   'lambda is not supported here yet. Write a def instead.'],
    ['global',   'global is not supported here yet — these problems only need local variables.'],
    ['nonlocal', 'nonlocal is not supported here yet.'],
    ['yield',    'Generators are not supported here yet. Build a list and return it.'],
    ['del',      'del is not supported here yet.'],
    ['async',    'async / await is not supported here.'],
    ['await',    'async / await is not supported here.'],
]);

const OPERATORS = [
    // Longest first: the scanner takes the first that matches.
    '**=', '//=',
    '**', '//', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '->',
    '+', '-', '*', '/', '%', '=', '<', '>', '(', ')', '[', ']', '{', '}',
    ',', ':', '.',
];

const TAB_WIDTH = 4;

/** One token. `value` is the literal text for names/ops, the parsed value for literals. */
function tok(type, value, line, col) {
    return { type, value, line, col };
}

/**
 * Turn source into a token list, including the INDENT / DEDENT tokens that
 * carry Python's block structure. Blank lines and comment-only lines never
 * affect indentation; lines inside brackets are joined implicitly.
 */
export function tokenize(source) {
    const src = String(source).replace(/\r\n?/g, '\n');
    const tokens = [];
    const indents = [0];
    let i = 0;
    let line = 1;
    let depth = 0;              // () [] {} nesting — newlines inside are invisible
    let atLineStart = true;

    const lineStartIndex = () => {
        let s = i;
        while (s > 0 && src[s - 1] !== '\n') s--;
        return s;
    };
    const col = () => i - lineStartIndex() + 1;
    const last = () => tokens[tokens.length - 1];

    while (i < src.length) {
        // ── Start of a logical line: measure indentation ──
        if (atLineStart && depth === 0) {
            let width = 0;
            let sawTab = false;
            let sawSpace = false;
            while (i < src.length && (src[i] === ' ' || src[i] === '\t')) {
                if (src[i] === '\t') { sawTab = true; width += TAB_WIDTH - (width % TAB_WIDTH); }
                else { sawSpace = true; width += 1; }
                i++;
            }
            // Blank or comment-only line: no indentation meaning at all.
            if (i >= src.length) break;
            if (src[i] === '\n') { i++; line++; continue; }
            if (src[i] === '#') {
                while (i < src.length && src[i] !== '\n') i++;
                continue;
            }
            if (sawTab && sawSpace) {
                throw syntaxError(
                    'This line is indented with a mix of tabs and spaces, and I cannot tell how deep it is meant to be.',
                    line, 'Indent with 4 spaces per level.');
            }
            const top = indents[indents.length - 1];
            if (width > top) {
                indents.push(width);
                tokens.push(tok('indent', width, line, 1));
            } else if (width < top) {
                while (indents.length > 1 && width < indents[indents.length - 1]) {
                    indents.pop();
                    tokens.push(tok('dedent', width, line, 1));
                }
                if (indents[indents.length - 1] !== width) {
                    throw syntaxError(
                        'This line is indented to a level that does not line up with any block above it.',
                        line, 'Every line in the same block needs the same indentation.');
                }
            }
            atLineStart = false;
            continue;
        }

        const ch = src[i];

        // ── Whitespace, comments, continuations, newlines ──
        if (ch === ' ' || ch === '\t') { i++; continue; }
        if (ch === '#') { while (i < src.length && src[i] !== '\n') i++; continue; }
        if (ch === '\\' && src[i + 1] === '\n') { i += 2; line++; continue; }
        if (ch === '\n') {
            i++;
            if (depth === 0) {
                if (last() && last().type !== 'newline') tokens.push(tok('newline', '\n', line, col()));
                atLineStart = true;
            }
            line++;
            continue;
        }

        // ── Strings (including f-strings and triple quotes) ──
        if (ch === '"' || ch === "'" || /^[fFrR]{1,2}["']/.test(src.slice(i, i + 3))) {
            const startLine = line;
            let prefix = '';
            while (/[fFrR]/.test(src[i])) { prefix += src[i].toLowerCase(); i++; }
            const quote = src[i];
            if (quote !== '"' && quote !== "'") {
                throw syntaxError(`I did not expect "${prefix}" here.`, startLine);
            }
            const triple = src.slice(i, i + 3) === quote.repeat(3);
            const term = triple ? quote.repeat(3) : quote;
            i += term.length;
            let text = '';
            for (;;) {
                if (i >= src.length) {
                    throw syntaxError('This text is missing its closing quote.', startLine,
                        `Every ${quote} needs a matching ${quote} on the same line.`);
                }
                if (src.startsWith(term, i)) { i += term.length; break; }
                if (src[i] === '\n') {
                    if (!triple) {
                        throw syntaxError('This text is missing its closing quote.', startLine,
                            `Every ${quote} needs a matching ${quote} on the same line.`);
                    }
                    text += '\n'; i++; line++; continue;
                }
                if (src[i] === '\\' && !prefix.includes('r')) {
                    const esc = src[i + 1];
                    const map = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"', '0': '\0' };
                    if (esc === '\n') { i += 2; line++; continue; }
                    if (esc in map) { text += map[esc]; i += 2; continue; }
                    text += '\\'; i++; continue;
                }
                text += src[i]; i++;
            }
            tokens.push(tok(prefix.includes('f') ? 'fstring' : 'string', text, startLine, col()));
            continue;
        }

        // ── Numbers ──
        if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] || ''))) {
            const startCol = col();
            let text = '';
            while (i < src.length && /[0-9_]/.test(src[i])) { text += src[i]; i++; }
            let isFloat = false;
            if (src[i] === '.' && /[0-9]/.test(src[i + 1] || '')) {
                isFloat = true; text += '.'; i++;
                while (i < src.length && /[0-9_]/.test(src[i])) { text += src[i]; i++; }
            } else if (src[i] === '.' && !/[a-zA-Z_]/.test(src[i + 1] || '')) {
                isFloat = true; text += '.'; i++;
            }
            if (src[i] === 'e' || src[i] === 'E') {
                const save = i;
                let exp = src[i]; i++;
                if (src[i] === '+' || src[i] === '-') { exp += src[i]; i++; }
                if (/[0-9]/.test(src[i] || '')) {
                    while (i < src.length && /[0-9]/.test(src[i])) { exp += src[i]; i++; }
                    text += exp; isFloat = true;
                } else { i = save; }
            }
            const clean = text.replace(/_/g, '');
            tokens.push(tok('number', {
                isFloat,
                value: isFloat ? Number(clean) : BigInt(clean),
            }, line, startCol));
            continue;
        }

        // ── Names and keywords ──
        if (/[A-Za-z_]/.test(ch)) {
            const startCol = col();
            let name = '';
            while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) { name += src[i]; i++; }
            if (NOT_YET.has(name)) {
                throw syntaxError(NOT_YET.get(name), line);
            }
            tokens.push(tok(KEYWORDS.has(name) ? 'keyword' : 'name', name, line, startCol));
            continue;
        }

        // ── Operators ──
        const op = OPERATORS.find(o => src.startsWith(o, i));
        if (op) {
            const startCol = col();
            if (op === '(' || op === '[' || op === '{') depth++;
            if (op === ')' || op === ']' || op === '}') depth = Math.max(0, depth - 1);
            i += op.length;
            tokens.push(tok('op', op, line, startCol));
            continue;
        }

        if (ch === '!') {
            throw syntaxError('"!" on its own is not a Python operator.', line,
                'To test "not equal", write !=. To say "not", write the word not.');
        }
        if (ch === '&' || ch === '|') {
            throw syntaxError(`"${ch}" is not how Python spells and/or.`, line,
                'Write the words and / or instead.');
        }
        if (ch === ';') {
            throw syntaxError('Python does not use semicolons at the end of a line.', line,
                'Delete the ; and put each statement on its own line.');
        }
        throw syntaxError(`I do not know what to do with the character "${ch}".`, line);
    }

    if (last() && last().type !== 'newline') tokens.push(tok('newline', '\n', line, 1));
    while (indents.length > 1) { indents.pop(); tokens.push(tok('dedent', 0, line, 1)); }
    tokens.push(tok('eof', null, line, 1));
    return tokens;
}

// ─── Parser ──────────────────────────────────────────────────────────────────
//
// Plain recursive descent over the token list. The AST is made of ordinary
// objects — every node carries the line it started on, because a line number is
// most of what makes an error message useful to a beginner.

const AUG_OPS = { '+=': '+', '-=': '-', '*=': '*', '/=': '/', '//=': '//', '%=': '%', '**=': '**' };
const COMPARE_OPS = new Set(['==', '!=', '<', '<=', '>', '>=']);

class Parser {
    constructor(tokens) {
        this.tokens = tokens;
        this.pos = 0;
    }

    peek(offset = 0) { return this.tokens[this.pos + offset]; }
    next() { return this.tokens[this.pos++]; }
    get line() { return this.peek().line; }

    at(type, value = undefined) {
        const t = this.peek();
        return t.type === type && (value === undefined || t.value === value);
    }
    atOp(...values) {
        const t = this.peek();
        return t.type === 'op' && values.includes(t.value);
    }
    atKeyword(...values) {
        const t = this.peek();
        return t.type === 'keyword' && values.includes(t.value);
    }
    accept(type, value = undefined) {
        if (this.at(type, value)) return this.next();
        return null;
    }
    expect(type, value, what) {
        if (this.at(type, value)) return this.next();
        const t = this.peek();
        throw syntaxError(
            `I expected ${what} here, but found ${describeToken(t)}.`, t.line);
    }

    // ── Statements ──

    parseProgram() {
        const body = [];
        while (!this.at('eof')) {
            if (this.accept('newline')) continue;
            body.push(this.parseStatement());
        }
        return { type: 'Program', body };
    }

    parseStatement() {
        if (this.atKeyword('def'))    return this.parseFuncDef();
        if (this.atKeyword('class'))  return this.parseClassDef();
        if (this.atKeyword('if'))     return this.parseIf();
        if (this.atKeyword('while'))  return this.parseWhile();
        if (this.atKeyword('for'))    return this.parseFor();
        if (this.atKeyword('try'))    return this.parseTry();
        if (this.atKeyword('with'))   return this.parseWith();
        if (this.atKeyword('except', 'finally')) {
            const t = this.peek();
            throw syntaxError(`This "${t.value}" does not line up with any "try" above it.`, t.line,
                `${t.value} must be indented to exactly the same column as its try.`);
        }
        if (this.atKeyword('elif', 'else')) {
            const t = this.peek();
            throw syntaxError(
                `This "${t.value}" does not line up with any "if" above it.`, t.line,
                'An elif or else must be indented to exactly the same column as its if.');
        }
        return this.parseSimpleStatement();
    }

    /** `:` NEWLINE INDENT stmts DEDENT — or a one-liner body after the colon. */
    parseBlock(introducer) {
        const colonLine = this.peek().line;
        if (!this.atOp(':')) {
            throw syntaxError(
                `I expected a colon (:) at the end of this ${introducer} line.`, colonLine,
                `Every ${introducer} line ends with a colon, and the lines it controls are indented under it.`);
        }
        this.next();
        if (!this.at('newline')) {
            // Allowed in Python and occasionally typed by students: `if x: return 1`
            const stmt = this.parseSimpleStatement();
            return [stmt];
        }
        this.next();
        if (!this.at('indent')) {
            throw syntaxError(
                `The lines belonging to this ${introducer} need to be indented.`, this.peek().line,
                'Indent them 4 spaces further than the line above.');
        }
        this.next();
        const body = [];
        while (!this.at('dedent') && !this.at('eof')) {
            if (this.accept('newline')) continue;
            body.push(this.parseStatement());
        }
        this.accept('dedent');
        if (body.length === 0) {
            throw syntaxError(`This ${introducer} block is empty.`, colonLine);
        }
        return body;
    }

    parseFuncDef() {
        const line = this.line;
        this.next();
        const nameTok = this.expect('name', undefined, 'a function name');
        this.expect('op', '(', 'an opening parenthesis after the function name');
        const params = [];
        while (!this.atOp(')')) {
            const p = this.expect('name', undefined, 'a parameter name');
            let dflt = null;
            if (this.atOp('=')) { this.next(); dflt = this.parseExpression(); }
            params.push({ name: p.value, default: dflt });
            if (!this.accept('op', ',')) break;
        }
        this.expect('op', ')', 'a closing parenthesis');
        if (this.atOp('->')) {           // type hints are ignored, not refused
            this.next();
            this.parseExpression();
        }
        this.funcDepth = (this.funcDepth || 0) + 1;
        let body;
        try { body = this.parseBlock('def'); } finally { this.funcDepth--; }
        return { type: 'FuncDef', name: nameTok.value, params, body, line };
    }

    /**
     * `class Name:` or `class Name(Parent):`, with a body of methods and
     * class-level assignments. ONE parent, given by name: two parents bring in
     * Python's rules for ordering them, which are refused by name rather than
     * half-supported.
     */
    parseClassDef() {
        const line = this.line;
        this.next();
        const nameTok = this.expect('name', undefined, 'a class name');
        let base = null;
        if (this.atOp('(')) {
            this.next();
            if (!this.atOp(')')) {
                base = this.expect('name', undefined, 'the name of the parent class').value;
                if (this.atOp(',')) {
                    throw syntaxError('A class here can have only one parent.', line,
                        `Write "class ${nameTok.value}(${base}):" with a single name in the parentheses.`);
                }
                if (!this.atOp(')')) {
                    throw syntaxError('The parentheses after a class name hold just the name of its parent class.', line,
                        `Write "class ${nameTok.value}(${base}):"`);
                }
            }
            this.next();
        }
        // A class body is not inside any function, even when the class is.
        const outer = this.funcDepth || 0;
        this.funcDepth = 0;
        let body;
        try { body = this.parseBlock('class'); } finally { this.funcDepth = outer; }
        return { type: 'ClassDef', name: nameTok.value, base, body, line };
    }

    parseIf() {
        const line = this.line;
        this.next();
        const test = this.parseTestExpression('if');
        const body = this.parseBlock('if');
        let orelse = [];
        if (this.atKeyword('elif')) {
            orelse = [this.parseIf__elif()];
        } else if (this.atKeyword('else')) {
            this.next();
            orelse = this.parseBlock('else');
        }
        return { type: 'If', test, body, orelse, line };
    }

    parseIf__elif() {
        const line = this.line;
        this.next();
        const test = this.parseTestExpression('elif');
        const body = this.parseBlock('elif');
        let orelse = [];
        if (this.atKeyword('elif')) orelse = [this.parseIf__elif()];
        else if (this.atKeyword('else')) { this.next(); orelse = this.parseBlock('else'); }
        return { type: 'If', test, body, orelse, line };
    }

    parseWhile() {
        const line = this.line;
        this.next();
        const test = this.parseTestExpression('while');
        const body = this.parseBlock('while');
        return { type: 'While', test, body, line };
    }

    parseFor() {
        const line = this.line;
        this.next();
        const targets = [this.expect('name', undefined, 'a loop variable name').value];
        while (this.accept('op', ',')) {
            targets.push(this.expect('name', undefined, 'a loop variable name').value);
        }
        if (!this.atKeyword('in')) {
            throw syntaxError('I expected the word "in" after the loop variable.', this.line,
                'A for loop reads: for item in things:');
        }
        this.next();
        const iter = this.parseExpression();
        const body = this.parseBlock('for');
        return { type: 'For', targets, iter, body, line };
    }

    /**
     * try: … except [Kind [as name]]: … [else: …] [finally: …]
     * Any number of except clauses, tried in the order written.
     */
    parseTry() {
        const line = this.line;
        this.next();
        const body = this.parseBlock('try');
        const handlers = [];
        while (this.atKeyword('except')) {
            const at = this.line;
            this.next();
            let kind = null, name = null;
            if (handlers.some(h => h.kind === null)) {
                throw syntaxError('A bare except catches everything, so it has to be the last except.', at,
                    'Move the except clauses that name a kind of error above it.');
            }
            if (!this.atOp(':')) {
                kind = this.parseExpression();
                if (this.atOp(',')) {
                    throw syntaxError('To catch more than one kind of error, put them in parentheses.', at,
                        'Write except (ValueError, TypeError):');
                }
                if (this.atKeyword('as')) {
                    this.next();
                    name = this.expect('name', undefined, 'a name for the error after "as"').value;
                }
            }
            handlers.push({ kind, name, body: this.parseBlock('except'), line: at });
        }
        let orelse = [], finalbody = null;
        if (this.atKeyword('else')) {
            if (handlers.length === 0) {
                throw syntaxError('A try needs at least one except before its else.', this.line);
            }
            this.next();
            orelse = this.parseBlock('else');
        }
        if (this.atKeyword('finally')) { this.next(); finalbody = this.parseBlock('finally'); }
        if (handlers.length === 0 && finalbody === null) {
            throw syntaxError('A try needs an except (or a finally) after it.', line,
                'try: holds the code that might fail; except: holds what to do when it does. ' +
                'They are indented to the same column.');
        }
        return { type: 'Try', body, handlers, orelse, finalbody, line };
    }

    /** with open(...) as f: — one thing, and its name. */
    parseWith() {
        const line = this.line;
        this.next();
        const item = this.parseExpression();
        if (!this.atKeyword('as')) {
            throw syntaxError('I expected "as" and a name after what the with opens.', this.line,
                'Write: with open("notes.txt") as f:');
        }
        this.next();
        const name = this.expect('name', undefined, 'a name after "as"').value;
        if (this.atOp(',')) {
            throw syntaxError('A with here opens one file at a time.', line,
                'Put the second with on its own line, indented inside the first.');
        }
        const body = this.parseBlock('with');
        return { type: 'With', item, name, body, line };
    }

    /**
     * The condition of an if / elif / while. Parsed separately only so that the
     * single most common beginner slip — `if x = 1:` — can be named exactly.
     */
    parseTestExpression(kind) {
        const test = this.parseExpression();
        if (this.atOp('=')) {
            throw syntaxError(
                `A single = assigns a value; "${kind}" needs == to compare two values.`,
                this.line, `Write ${kind} a == b: rather than ${kind} a = b:`);
        }
        return test;
    }

    parseSimpleStatement() {
        const line = this.line;

        if (this.atKeyword('return')) {
            if (!(this.funcDepth > 0)) {
                // Python rejects this before running anything, and so must we: left
                // to run, it would escape as an internal signal rather than an error.
                throw syntaxError('"return" only works inside a function.', line,
                    'A return hands a value back from a def. Indent it under the def line it belongs to.');
            }
            this.next();
            let value = null;
            if (!this.at('newline') && !this.at('eof')) value = this.parseExpression();
            this.endStatement();
            return { type: 'Return', value, line };
        }
        if (this.atKeyword('assert')) {
            this.next();
            const test = this.parseExpression();
            let message = null;
            if (this.atOp(',')) { this.next(); message = this.parseExpression(); }
            this.endStatement();
            return { type: 'Assert', test, message, line };
        }
        if (this.atKeyword('raise')) {
            this.next();
            let exc = null;
            if (!this.at('newline') && !this.at('eof')) exc = this.parseExpression();
            this.endStatement();
            return { type: 'Raise', exc, line };
        }
        if (this.atKeyword('pass'))     { this.next(); this.endStatement(); return { type: 'Pass', line }; }
        if (this.atKeyword('break'))    { this.next(); this.endStatement(); return { type: 'Break', line }; }
        if (this.atKeyword('continue')) { this.next(); this.endStatement(); return { type: 'Continue', line }; }

        // Python 2 leftovers, and a very common first-week typo.
        if (this.at('name', 'print') && (this.at('string', undefined, 1) || this.peek(1).type === 'string')) {
            throw syntaxError('print needs parentheses around what it prints.', line,
                'Write print("hello") rather than print "hello".');
        }

        const first = this.parseExpression();

        // Assignment: one or more targets, or an augmented assignment.
        if (this.atOp('=')) {
            const targets = [first];
            let value = null;
            while (this.atOp('=')) {
                this.next();
                value = this.parseExpressionOrTuple();
                if (this.atOp('=')) { targets.push(value); }
            }
            for (const t of targets) this.checkAssignable(t, line);
            this.endStatement();
            return { type: 'Assign', targets, value, line };
        }
        if (this.peek().type === 'op' && this.peek().value in AUG_OPS) {
            const op = AUG_OPS[this.next().value];
            const value = this.parseExpression();
            this.checkAssignable(first, line);
            this.endStatement();
            return { type: 'AugAssign', target: first, op, value, line };
        }
        if (this.atOp(',')) {
            // `a, b = b, a` — the left side parsed as one expression, then a comma.
            const elts = [first];
            while (this.accept('op', ',')) {
                if (this.atOp('=')) break;
                elts.push(this.parseExpression());
            }
            if (this.atOp('=')) {
                this.next();
                const value = this.parseExpressionOrTuple();
                const target = { type: 'TupleLit', elts, line };
                for (const t of elts) this.checkAssignable(t, line);
                this.endStatement();
                return { type: 'Assign', targets: [target], value, line };
            }
            this.endStatement();
            return { type: 'ExprStmt', expr: { type: 'TupleLit', elts, line }, line };
        }

        this.endStatement();
        return { type: 'ExprStmt', expr: first, line };
    }

    checkAssignable(node, line) {
        if (node.type === 'Name' || node.type === 'Index' || node.type === 'Attribute') return;
        if (node.type === 'TupleLit' || node.type === 'ListLit') {
            node.elts.forEach(e => this.checkAssignable(e, line));
            return;
        }
        if (node.type === 'Call') {
            throw syntaxError('You cannot assign a value to the result of a function call.', line,
                'The left side of = has to be a variable name.');
        }
        throw syntaxError('The left side of = has to be a variable name.', line);
    }

    endStatement() {
        if (this.at('newline') || this.at('eof') || this.at('dedent')) { this.accept('newline'); return; }
        const t = this.peek();
        if (t.type === 'op' && t.value === ':') {
            throw syntaxError('I did not expect a colon here.', t.line);
        }
        throw syntaxError(`I did not expect ${describeToken(t)} here.`, t.line,
            'Check for a missing operator, comma, or closing bracket earlier on this line.');
    }

    // ── Expressions, loosest binding first ──

    /** Bare tuples on the right of `=` or after `return`: `return a, b`. */
    parseExpressionOrTuple() {
        const first = this.parseExpression();
        if (!this.atOp(',')) return first;
        const elts = [first];
        while (this.accept('op', ',')) {
            if (this.at('newline') || this.at('eof')) break;
            elts.push(this.parseExpression());
        }
        return { type: 'TupleLit', elts, line: first.line };
    }

    /**
     * A conditional expression — `big if a > b else small`. Worth supporting even
     * though it is past a first month of Python: students copy the form from
     * examples, and an interpreter that refused it would fail a correct answer.
     */
    parseExpression() {
        const value = this.parseOr();
        if (!this.atKeyword('if')) return value;
        const line = this.next().line;
        const test = this.parseOr();
        if (!this.atKeyword('else')) {
            throw syntaxError('This "if" inside an expression needs an "else" after it.', line,
                'The form is: value_when_true if condition else value_when_false');
        }
        this.next();
        return { type: 'IfExp', test, body: value, orelse: this.parseExpression(), line };
    }

    parseOr() {
        let left = this.parseAnd();
        while (this.atKeyword('or')) {
            const line = this.next().line;
            left = { type: 'BoolOp', op: 'or', left, right: this.parseAnd(), line };
        }
        return left;
    }

    parseAnd() {
        let left = this.parseNot();
        while (this.atKeyword('and')) {
            const line = this.next().line;
            left = { type: 'BoolOp', op: 'and', left, right: this.parseNot(), line };
        }
        return left;
    }

    parseNot() {
        if (this.atKeyword('not')) {
            const line = this.next().line;
            return { type: 'Not', value: this.parseNot(), line };
        }
        return this.parseComparison();
    }

    /** Chained comparisons (`0 <= x < 10`) are evaluated the way Python does. */
    parseComparison() {
        let left = this.parseArith();
        const ops = [];
        const comparators = [];
        for (;;) {
            let op = null;
            if (this.peek().type === 'op' && COMPARE_OPS.has(this.peek().value)) {
                op = this.next().value;
            } else if (this.atKeyword('in')) {
                this.next(); op = 'in';
            } else if (this.atKeyword('not') && this.peek(1).type === 'keyword' && this.peek(1).value === 'in') {
                this.next(); this.next(); op = 'not in';
            } else if (this.atKeyword('is')) {
                this.next();
                op = 'is';
                if (this.atKeyword('not')) { this.next(); op = 'is not'; }
            } else break;
            ops.push(op);
            comparators.push(this.parseArith());
        }
        if (ops.length === 0) return left;
        return { type: 'Compare', left, ops, comparators, line: left.line };
    }

    parseArith() {
        let left = this.parseTerm();
        while (this.atOp('+', '-')) {
            const op = this.next();
            left = { type: 'BinOp', op: op.value, left, right: this.parseTerm(), line: op.line };
        }
        return left;
    }

    parseTerm() {
        let left = this.parseUnary();
        while (this.atOp('*', '/', '//', '%')) {
            const op = this.next();
            left = { type: 'BinOp', op: op.value, left, right: this.parseUnary(), line: op.line };
        }
        return left;
    }

    parseUnary() {
        if (this.atOp('-', '+')) {
            const op = this.next();
            return { type: 'UnaryOp', op: op.value, value: this.parseUnary(), line: op.line };
        }
        return this.parsePower();
    }

    parsePower() {
        const base = this.parseTrailer();
        if (this.atOp('**')) {
            const op = this.next();
            return { type: 'BinOp', op: '**', left: base, right: this.parseUnary(), line: op.line };
        }
        return base;
    }

    /** An atom followed by any number of calls, subscripts and attribute lookups. */
    parseTrailer() {
        let node = this.parseAtom();
        for (;;) {
            if (this.atOp('(')) {
                const line = this.next().line;
                const args = [];
                const keywords = [];
                while (!this.atOp(')')) {
                    if (this.at('name') && this.peek(1).type === 'op' && this.peek(1).value === '='
                        && !(this.peek(2).type === 'op' && this.peek(2).value === '=')) {
                        const key = this.next().value;
                        this.next();
                        keywords.push({ name: key, value: this.parseExpression() });
                    } else {
                        args.push(this.parseExpression());
                    }
                    if (!this.accept('op', ',')) break;
                }
                this.expect('op', ')', 'a closing parenthesis');
                node = { type: 'Call', func: node, args, keywords, line };
            } else if (this.atOp('[')) {
                const line = this.next().line;
                node = this.parseSubscript(node, line);
            } else if (this.atOp('.')) {
                const line = this.next().line;
                const attr = this.expect('name', undefined, 'a method or attribute name');
                node = { type: 'Attribute', value: node, attr: attr.value, line };
            } else break;
        }
        return node;
    }

    parseSubscript(target, line) {
        const readSlot = () => (this.atOp(':') || this.atOp(']')) ? null : this.parseExpression();
        const first = readSlot();
        if (this.atOp(':')) {
            this.next();
            const second = readSlot();
            let third = null;
            if (this.atOp(':')) { this.next(); third = readSlot(); }
            this.expect('op', ']', 'a closing square bracket');
            return { type: 'Slice', value: target, lower: first, upper: second, step: third, line };
        }
        this.expect('op', ']', 'a closing square bracket');
        if (first === null) throw syntaxError('There is nothing between these square brackets.', line);
        return { type: 'Index', value: target, index: first, line };
    }

    parseAtom() {
        const t = this.peek();
        if (t.type === 'number') {
            this.next();
            return { type: 'Num', value: t.value.value, isFloat: t.value.isFloat, line: t.line };
        }
        if (t.type === 'string') { this.next(); return { type: 'Str', value: t.value, line: t.line }; }
        if (t.type === 'fstring') {
            this.next();
            return { type: 'FString', parts: parseFStringParts(t.value, t.line), line: t.line };
        }
        if (t.type === 'name') { this.next(); return { type: 'Name', id: t.value, line: t.line }; }
        if (t.type === 'keyword') {
            if (t.value === 'True')  { this.next(); return { type: 'Const', value: true,  line: t.line }; }
            if (t.value === 'False') { this.next(); return { type: 'Const', value: false, line: t.line }; }
            if (t.value === 'None')  { this.next(); return { type: 'Const', value: null,  line: t.line }; }
            if (t.value === 'not')   return this.parseNot();
            throw syntaxError(`"${t.value}" cannot be used as a value here.`, t.line);
        }
        if (t.type === 'op' && t.value === '(') {
            this.next();
            if (this.atOp(')')) { this.next(); return { type: 'TupleLit', elts: [], line: t.line }; }
            const first = this.parseExpression();
            if (this.atOp(',')) {
                const elts = [first];
                while (this.accept('op', ',')) {
                    if (this.atOp(')')) break;
                    elts.push(this.parseExpression());
                }
                this.expect('op', ')', 'a closing parenthesis');
                return { type: 'TupleLit', elts, line: t.line };
            }
            this.expect('op', ')', 'a closing parenthesis');
            return first;
        }
        if (t.type === 'op' && t.value === '[') {
            this.next();
            const elts = [];
            while (!this.atOp(']')) {
                elts.push(this.parseExpression());
                if (this.atKeyword('for')) {
                    throw syntaxError('List comprehensions are not supported in this practice interpreter yet.',
                        t.line, 'Build the list with a for loop and .append() instead.');
                }
                if (!this.accept('op', ',')) break;
            }
            this.expect('op', ']', 'a closing square bracket');
            return { type: 'ListLit', elts, line: t.line };
        }
        if (t.type === 'op' && t.value === '{') {
            this.next();
            const keys = [];
            const values = [];
            while (!this.atOp('}')) {
                const k = this.parseExpression();
                if (!this.atOp(':')) {
                    throw syntaxError('Sets are not supported in this practice interpreter yet.', t.line,
                        'Use a list [ ] or a dictionary { key: value } instead.');
                }
                this.next();
                keys.push(k);
                values.push(this.parseExpression());
                if (!this.accept('op', ',')) break;
            }
            this.expect('op', '}', 'a closing curly brace');
            return { type: 'DictLit', keys, values, line: t.line };
        }
        if (t.type === 'newline' || t.type === 'eof') {
            throw syntaxError('This line ends before the expression is finished.', t.line,
                'Something after the last operator is missing.');
        }
        throw syntaxError(`I did not expect ${describeToken(t)} here.`, t.line);
    }
}

function describeToken(t) {
    switch (t.type) {
        case 'newline': return 'the end of the line';
        case 'eof':     return 'the end of your code';
        case 'indent':  return 'an indented line';
        case 'dedent':  return 'the end of an indented block';
        case 'number':  return `the number ${t.value.value}`;
        case 'string':  return 'a piece of text';
        case 'fstring': return 'an f-string';
        default:        return `"${t.value}"`;
    }
}

/**
 * Split the inside of an f-string into literal text and {expression} holes.
 * Only `.Nf` and `,` format specs are understood; anything else is refused by
 * name so it cannot be silently ignored.
 */
function parseFStringParts(text, line) {
    const parts = [];
    let literal = '';
    let i = 0;
    while (i < text.length) {
        const ch = text[i];
        if (ch === '{' && text[i + 1] === '{') { literal += '{'; i += 2; continue; }
        if (ch === '}' && text[i + 1] === '}') { literal += '}'; i += 2; continue; }
        if (ch === '}') {
            throw syntaxError('This f-string has a } with no matching {.', line);
        }
        if (ch !== '{') { literal += ch; i++; continue; }

        if (literal) { parts.push({ kind: 'text', value: literal }); literal = ''; }
        i++;
        let depth = 0;
        let quote = null;
        let expr = '';
        let spec = null;
        for (;;) {
            if (i >= text.length) throw syntaxError('This f-string has a { with no matching }.', line);
            const c = text[i];
            if (quote) {
                expr += c;
                if (c === quote) quote = null;
                i++;
                continue;
            }
            if (c === '"' || c === "'") { quote = c; expr += c; i++; continue; }
            if ('([{'.includes(c)) depth++;
            if (')]}'.includes(c) && depth > 0) depth--;
            else if (c === '}' && depth === 0) { i++; break; }
            if (c === ':' && depth === 0) {
                i++;
                spec = '';
                while (i < text.length && text[i] !== '}') { spec += text[i]; i++; }
                if (text[i] !== '}') throw syntaxError('This f-string has a { with no matching }.', line);
                i++;
                break;
            }
            expr += c;
            i++;
        }
        if (!expr.trim()) throw syntaxError('This f-string has empty { } with nothing inside.', line);
        if (spec !== null) {
            spec = spec.trim();
            if (!/^(,)?(\.\d+f)?$/.test(spec) || spec === '') {
                throw syntaxError(
                    `I do not understand the format ":${spec}" inside this f-string.`, line,
                    'This interpreter understands :.2f (round to 2 places) and :, (thousands separators).');
            }
        }
        const sub = new Parser(tokenize(expr));
        const node = sub.parseExpression();
        parts.push({ kind: 'expr', node, spec });
    }
    if (literal) parts.push({ kind: 'text', value: literal });
    return parts;
}

/** Source text → AST. Throws PyError (kind 'syntax') on anything malformed. */
export function parse(source) {
    return new Parser(tokenize(source)).parseProgram();
}

// ─── Values ──────────────────────────────────────────────────────────────────
//
// Python values are held in the nearest honest JavaScript shape:
//
//   int    BigInt      (exact and unbounded, the way Python's is)
//   float  number      (kept distinct from int so 10 / 2 can print as 5.0)
//   str    string
//   bool   boolean
//   None   null
//   list   Array
//   tuple  PyTuple
//   dict   Map
//   range  PyRange     (lazy, so range(10000000) costs nothing to make)
//
// Keeping int and float apart is the whole reason for the BigInt: a beginner's
// first surprise in Python is that 10 / 2 is 5.0 and not 5, and an interpreter
// that cannot show them that difference cannot teach it.

export class PyTuple {
    constructor(items) { this.items = items; }
}

export class PyRange {
    constructor(start, stop, step) { this.start = start; this.stop = stop; this.step = step; }
    get length() {
        const { start, stop, step } = this;
        if (step > 0n) return stop > start ? (stop - start + step - 1n) / step : 0n;
        return start > stop ? (start - stop - step - 1n) / (-step) : 0n;
    }
    at(index) { return this.start + this.step * index; }
    *[Symbol.iterator]() {
        const n = this.length;
        for (let k = 0n; k < n; k++) yield this.start + this.step * k;
    }
}

export class PyFunction {
    constructor(name, params, body, scope) {
        this.name = name; this.params = params; this.body = body; this.scope = scope;
    }
}

class Builtin {
    constructor(name, fn) { this.name = name; this.fn = fn; }
}

// ── Classes and objects ──
//
// A class is a name plus a table of attributes (its methods, and anything
// assigned in the class body). An object is a reference to its class plus a
// table of its OWN attributes. Looking up `obj.x` tries the object first and
// then the class — which is the whole explanation of the chapter's classic bug:
// a list assigned in the class body lives in the class's table, so every
// object that reaches it through self finds the same list.

//
// A class may also name ONE parent. A name the class does not have is then
// looked for in the parent, and the parent's parent: that walk is the whole of
// inheritance, and overriding is nothing more than being found first.

export class PyClass {
    constructor(name, attrs, base = null) {
        this.name = name; this.attrs = attrs; this.base = base;
        // A class is a kind of exception when something above it is Python's Exception.
        this.exception = base ? base.exception : false;
        this.native = false;
    }

    /** The value of `name` in this class or the nearest ancestor that has it; undefined if none does. */
    find(name) {
        for (let c = this; c; c = c.base) if (c.attrs.has(name)) return c.attrs.get(name);
        return undefined;
    }

    /** Every name this class can reach, its own first. */
    names() {
        const out = [];
        for (let c = this; c; c = c.base) out.push(...c.attrs.keys());
        return out;
    }

    /** True for the class itself and for every class it inherits from. */
    isKindOf(other) {
        for (let c = this; c; c = c.base) if (c === other) return true;
        return false;
    }
}

/** What super() gives back inside a method of `owner`: self, to be looked up starting from owner's parent. */
export class PySuper {
    constructor(self, owner) { this.self = self; this.owner = owner; }
}

export class PyInstance {
    constructor(cls) { this.cls = cls; this.attrs = new Map(); }
}

// ── Exceptions ──
//
// An exception is an ordinary object whose class has Python's Exception
// somewhere above it. What it was made with is kept in `excArgs`, as Python
// keeps `args`; that is all str(e) and repr(e) are made from.

/** Python's own exception classes, made fresh for each run so one program cannot alter another's. */
function makeExceptionClasses() {
    const made = {};
    for (const [name, parent] of Object.entries(EXCEPTION_PARENTS)) {
        const cls = new PyClass(name, new Map(), parent ? made[parent] : null);
        cls.exception = true;
        cls.native = true;
        made[name] = cls;
    }
    return made;
}

const isExc = v => v instanceof PyInstance && v.excArgs !== undefined;

function excArgsOf(v, line = null) {
    if (v.excArgs === null) {
        throw runtimeError(`Python's own wording for this ${v.cls.name} is not reproduced here.`, line ?? ACTIVE?.line ?? null,
            'Print a message of your own in the except block, rather than the error itself.');
    }
    return v.excArgs;
}

/** str(e): nothing, the one value it was made with, or all of them as a tuple. A KeyError shows its key in quotes. */
function excStr(v, line = null) {
    const args = excArgsOf(v, line);
    if (args.length === 0) return '';
    if (args.length > 1) return pyRepr(new PyTuple(args));
    for (let c = v.cls; c; c = c.base) if (c.native && c.name === 'KeyError') return pyRepr(args[0]);
    return ACTIVE ? ACTIVE.toText(args[0], line) : pyStr(args[0]);
}

function excRepr(v) {
    return `${v.cls.name}(${excArgsOf(v).map(a => pyRepr(a)).join(', ')})`;
}

/** An open file. What is written stays in `pending` until the file is closed, as on a real disk. */
export class PyFile {
    constructor(name, mode, text) {
        this.name = name; this.mode = mode; this.closed = false;
        this.text = text;      // reading: the whole file
        this.pos = 0;          // reading: how far in
        this.pending = '';     // writing: not yet saved
    }
}

/** `obj.method`, not yet called: the function together with the object it will receive as self. */
export class PyBoundMethod {
    constructor(self, func) { this.self = self; this.func = func; this.name = func.name; }
}

// ── Special methods ──
//
// A class may say what ==, truthiness, len() and repr() mean for its objects.
// Those questions are answered all over this file by plain functions (pyEquals,
// truthy, pyRepr), so the interpreter that is running registers itself here for
// them to call back into. Any OTHER special method is refused when the class is
// defined: a __ne__ or __add__ that was accepted and then never called would
// print something Python does not — which is exactly what used to happen with
// __eq__, __bool__ and __len__.
export const SPECIAL_METHODS = new Set(['__init__', '__str__', '__repr__', '__eq__', '__bool__', '__len__']);
let ACTIVE = null;

function specialMethod(value, name) {
    if (!(value instanceof PyInstance) || !ACTIVE) return null;
    const found = value.cls.find(name);
    return found instanceof PyFunction ? found : null;
}

function callSpecial(value, method, args) {
    return ACTIVE.callValue(new PyBoundMethod(value, method), args, ACTIVE.line);
}

/** a == b between objects: the left one's __eq__, else the right one's, else "the same object". */
function instanceEquals(a, b) {
    for (const [self, other] of [[a, b], [b, a]]) {
        const eq = specialMethod(self, '__eq__');
        if (eq) return callSpecial(self, eq, [other]);
    }
    return a === b;
}

function instanceLength(value, method) {
    const n = callSpecial(value, method, []);
    if (typeof n !== 'bigint' || n < 0n) {
        throw runtimeError(`__len__ has to return a whole number of 0 or more, but this one returned ${pyRepr(n)}.`,
            ACTIVE.line, 'Return how many items the object holds, for example len(self.items).');
    }
    return n;
}

function instanceTruth(value) {
    const b = specialMethod(value, '__bool__');
    if (b) {
        const result = callSpecial(value, b, []);
        if (typeof result !== 'boolean') {
            throw runtimeError(`__bool__ has to return True or False, but this one returned ${pyRepr(result)}.`, ACTIVE.line);
        }
        return result;
    }
    const len = specialMethod(value, '__len__');
    return len ? instanceLength(value, len) !== 0n : true;
}

// Any int wider than this is a runaway loop, not a student's intent.
const BIG_LIMIT = 10n ** 400n;

// ── Work done inside built-ins ──
//
// The step budget counts statements and expressions, so a loop that never ends is
// caught. But sum(range(10**12)), "x".join(...) or a string that doubles on every
// pass does its work inside ONE step — and used to freeze the page, or crash the
// tab outright when the browser ran out of memory. So built-ins pay for the items
// they touch (one step per 16), and no list or text may grow past a size no
// beginner's program needs.
const ITEM_LIMIT = 1_000_000;
const TEXT_LIMIT = 10_000_000;

function charge(items, line) {
    if (ACTIVE && items >= 16) {
        ACTIVE.steps += Math.floor(items / 16);
        ACTIVE.tick(line);
    }
}

/**
 * A JavaScript engine limit that got past the checks above (a structure nested
 * too deeply to walk, say) must still reach the student as a sentence, not as
 * "RangeError: Maximum call stack size exceeded".
 */
function asLimit(e) {
    if (!(e instanceof RangeError)) return e;
    return limitError('Your program built something too large or too deeply nested to handle here.',
        'Check for a list that contains itself, or something that grows on every pass through a loop.',
        ACTIVE?.line ?? null);
}

function tooBig(line) {
    return limitError('That would build a list or text of millions of items, far more than this problem needs.',
        'Check for something that grows on every pass through a loop, or a range() that is much larger than intended.',
        line);
}

/** Refuse, BEFORE building it, a list of `items` items or text of `chars` characters that is too large. */
function allowSize(items, chars, line) {
    if (items > ITEM_LIMIT || chars > TEXT_LIMIT) throw tooBig(line);
}

/** Append without spreading: push(...big) overflows the call stack at around 100,000 items. */
function pushAll(target, items, line) {
    const n = items.length;          // fixed first: a.extend(a) adds a's items once
    allowSize(target.length + n, 0, line);
    charge(n, line);
    for (let i = 0; i < n; i++) target.push(items[i]);
}

const isInt   = v => typeof v === 'bigint';
const isFloat = v => typeof v === 'number';
const isBool  = v => typeof v === 'boolean';
const isStr   = v => typeof v === 'string';
const isList  = v => Array.isArray(v);
const isTuple = v => v instanceof PyTuple;
const isDict  = v => v instanceof Map;
const isRange = v => v instanceof PyRange;
const isNumeric = v => isInt(v) || isFloat(v) || isBool(v);
const isInstance = v => v instanceof PyInstance;
const isClass = v => v instanceof PyClass;
const isCallable = v => v instanceof PyFunction || v instanceof Builtin
    || v instanceof PyClass || v instanceof PyBoundMethod;

/** The word a student would use for this value's type, for error messages. */
export function typeName(v) {
    if (v === null) return 'None';
    if (isBool(v)) return 'a boolean';
    if (isInt(v)) return 'a whole number';
    if (isFloat(v)) return 'a decimal number';
    if (isStr(v)) return 'text';
    if (isList(v)) return 'a list';
    if (isTuple(v)) return 'a tuple';
    if (isDict(v)) return 'a dictionary';
    if (isRange(v)) return 'a range';
    if (isInstance(v)) return `${/^[aeiou]/i.test(v.cls.name) ? 'an' : 'a'} ${v.cls.name} object`;
    if (isClass(v)) return 'a class';
    if (v instanceof PySuper) return 'what super() gives back';
    if (v instanceof PyFile) return 'a file';
    if (v instanceof PyBoundMethod) return 'a method';
    if (isCallable(v)) return 'a function';
    return 'a value';
}

const checkBig = (v, line) => {
    if (isInt(v) && (v > BIG_LIMIT || v < -BIG_LIMIT)) {
        throw limitError('This calculation produced a number with hundreds of digits.',
            'That usually means a loop is multiplying without ever stopping.');
    }
    return v;
};

/** Python's float repr: whole values keep their .0, so 5.0 never prints as 5. */
function floatRepr(n) {
    if (Number.isNaN(n)) return 'nan';
    if (n === Infinity) return 'inf';
    if (n === -Infinity) return '-inf';
    if (Number.isInteger(n) && Math.abs(n) < 1e16) return `${n}.0`;
    const s = String(n);
    return s.includes('e') ? s.replace('e', 'e+').replace('e+-', 'e-').replace('e++', 'e+') : s;
}

/**
 * repr(): what you would type to get this value back. Strings keep their quotes.
 * `inside` holds the containers being printed, so a list that holds itself prints
 * as [[...]] the way Python's does, rather than recursing until the stack breaks.
 */
export function pyRepr(v) {
    return reprIn(v, new Set());
}

function reprIn(v, inside) {
    if (isList(v) || isDict(v)) {
        if (inside.has(v)) return isList(v) ? '[...]' : '{...}';
        inside.add(v);
        try { return reprContainer(v, inside); } finally { inside.delete(v); }
    }
    return reprValue(v, inside);
}

function reprContainer(v, inside) {
    if (isList(v)) return '[' + v.map(x => reprIn(x, inside)).join(', ') + ']';
    return '{' + [...v.entries()].map(([k, val]) => `${reprIn(k, inside)}: ${reprIn(val, inside)}`).join(', ') + '}';
}

function reprValue(v, inside) {
    if (v === null) return 'None';
    if (isBool(v)) return v ? 'True' : 'False';
    if (isInt(v)) return String(v);
    if (isFloat(v)) return floatRepr(v);
    if (isStr(v)) {
        const quote = v.includes("'") && !v.includes('"') ? '"' : "'";
        const body = v
            .replace(/\\/g, '\\\\')
            .replace(/\n/g, '\\n')
            .replace(/\t/g, '\\t')
            .replace(new RegExp(quote, 'g'), '\\' + quote);
        return quote + body + quote;
    }
    if (isTuple(v)) {
        if (v.items.length === 1) return '(' + reprIn(v.items[0], inside) + ',)';
        return '(' + v.items.map(x => reprIn(x, inside)).join(', ') + ')';
    }
    if (isRange(v)) {
        return v.step === 1n ? `range(${v.start}, ${v.stop})` : `range(${v.start}, ${v.stop}, ${v.step})`;
    }
    if (isInstance(v)) {
        const own = specialMethod(v, '__repr__');
        if (own) {
            const text = callSpecial(v, own, []);
            if (!isStr(text)) {
                throw runtimeError(`__repr__ has to return text, but this one returned ${typeName(text)}.`, ACTIVE.line,
                    'Build the text with an f-string and return it.');
            }
            return text;
        }
        if (isExc(v)) return excRepr(v);
        // Python shows a memory address here. The class name is the useful part, and
        // leaving the address out keeps output the same from one run to the next.
        return `<${v.cls.name} object>`;
    }
    if (isClass(v)) return `<class '${v.name}'>`;
    if (v instanceof PySuper) return '<super object>';
    if (v instanceof PyFile) return `<file ${pyRepr(v.name)}>`;
    if (v instanceof PyBoundMethod) return `<method ${v.name} of ${pyRepr(v.self)}>`;
    if (isCallable(v)) return `<function ${v.name}>`;
    return String(v);
}

/** str(): like repr, except text is shown as itself. */
export function pyStr(v) {
    if (isExc(v) && !specialMethod(v, '__str__')) return excStr(v);
    return isStr(v) ? v : pyRepr(v);
}

/** Python truthiness: empty things and zeroes are false, everything else is true. */
export function truthy(v) {
    if (v === null || v === false) return false;
    if (v === true) return true;
    if (isInt(v)) return v !== 0n;
    if (isFloat(v)) return v !== 0;
    if (isStr(v)) return v.length > 0;
    if (isList(v)) return v.length > 0;
    if (isTuple(v)) return v.items.length > 0;
    if (isDict(v)) return v.size > 0;
    if (isRange(v)) return v.length > 0n;
    if (isInstance(v)) return instanceTruth(v);
    return true;
}

const numValue = v => (isBool(v) ? (v ? 1n : 0n) : v);
const toJsNumber = v => (isBool(v) ? (v ? 1 : 0) : Number(v));

/** Python ==, which is happy to compare an int with a float but not with text. */
export function pyEquals(a, b) {
    if (isInstance(a) || isInstance(b)) return truthy(instanceEquals(a, b));
    if (isNumeric(a) && isNumeric(b)) {
        const x = numValue(a);
        const y = numValue(b);
        if (isInt(x) && isInt(y)) return x === y;
        return toJsNumber(x) === toJsNumber(y);
    }
    if (isStr(a) || isStr(b)) return isStr(a) && isStr(b) && a === b;
    if (a === null || b === null) return a === null && b === null;
    if (isList(a) && isList(b)) return a.length === b.length && a.every((x, i) => pyEquals(x, b[i]));
    if (isTuple(a) && isTuple(b)) {
        return a.items.length === b.items.length && a.items.every((x, i) => pyEquals(x, b.items[i]));
    }
    if (isDict(a) && isDict(b)) {
        if (a.size !== b.size) return false;
        for (const [k, v] of a) {
            if (!b.has(k)) return false;
            if (!pyEquals(v, b.get(k))) return false;
        }
        return true;
    }
    if (isRange(a) || isRange(b)) {
        const la = isRange(a) ? [...a] : a;
        const lb = isRange(b) ? [...b] : b;
        return isList(la) && isList(lb) && pyEquals(la, lb);
    }
    return a === b;
}

/**
 * Python's `is`. Two lists with equal contents are NOT the same list, and that
 * difference is the whole lesson of aliasing, so lists, dictionaries and objects
 * are compared by identity. Numbers, text and None are compared by value and
 * type: whether CPython happens to reuse one object for two equal small ints is
 * an implementation detail no beginner should have to predict.
 */
function sameObject(a, b) {
    const byIdentity = v => isList(v) || isDict(v) || v instanceof PyInstance || v instanceof PyClass
        || v instanceof PyFunction || v instanceof PyBoundMethod;
    if (byIdentity(a) || byIdentity(b)) return a === b;
    return pyEquals(a, b) && typeName(a) === typeName(b);
}

/** Ordering for < <= > >=. Mixing text and numbers is an error, as in Python. */
function pyLess(a, b, line) {
    if (isNumeric(a) && isNumeric(b)) {
        const x = numValue(a), y = numValue(b);
        if (isInt(x) && isInt(y)) return x < y;
        return toJsNumber(x) < toJsNumber(y);
    }
    if (isStr(a) && isStr(b)) return a < b;
    const seqA = isList(a) ? a : isTuple(a) ? a.items : null;
    const seqB = isList(b) ? b : isTuple(b) ? b.items : null;
    if (seqA && seqB) {
        for (let i = 0; i < Math.min(seqA.length, seqB.length); i++) {
            if (!pyEquals(seqA[i], seqB[i])) return pyLess(seqA[i], seqB[i], line);
        }
        return seqA.length < seqB.length;
    }
    throw typeError(
        `You cannot use < or > to compare ${typeName(a)} with ${typeName(b)}.`, line,
        isStr(a) || isStr(b)
            ? 'Text and numbers cannot be ordered against each other. int("5") turns text into a number.'
            : null);
}

const floorDivBig = (a, b) => {
    const q = a / b;
    return (a % b !== 0n && ((a < 0n) !== (b < 0n))) ? q - 1n : q;
};
const modBig = (a, b) => {
    const r = a % b;
    return (r !== 0n && ((r < 0n) !== (b < 0n))) ? r + b : r;
};
const modFloat = (a, b) => {
    const r = a % b;
    return (r !== 0 && ((r < 0) !== (b < 0))) ? r + b : r;
};

/** All of Python's binary arithmetic, plus the error messages beginners need. */
export function binaryOp(op, a, b, line) {
    if (op === '+') {
        if (isNumeric(a) && isNumeric(b)) return arith('+', a, b, line);
        if (isStr(a) && isStr(b)) { allowSize(0, a.length + b.length, line); return a + b; }
        if (isList(a) && isList(b)) { allowSize(a.length + b.length, 0, line); return a.concat(b); }
        if (isTuple(a) && isTuple(b)) {
            allowSize(a.items.length + b.items.length, 0, line);
            return new PyTuple(a.items.concat(b.items));
        }
        if ((isStr(a) && isNumeric(b)) || (isNumeric(a) && isStr(b))) {
            throw typeError('You tried to add text and a number together.', line,
                'Python will not guess which you meant. Use str(n) to make the number into text, ' +
                'or int(s) to make the text into a number.');
        }
        if (isList(a) && !isList(b)) {
            throw typeError(`You can only add a list to another list, not to ${typeName(b)}.`, line,
                'To add one item to a list, use items.append(x).');
        }
        throw typeError(`You cannot add ${typeName(a)} to ${typeName(b)}.`, line);
    }

    if (op === '*') {
        if (isNumeric(a) && isNumeric(b)) return arith('*', a, b, line);
        const repeat = (seq, count) => {
            const n = Number(numValue(count));
            if (n <= 0) return isStr(seq) ? '' : [];
            if (!Number.isSafeInteger(n) || n > 100000) {
                throw limitError('That would repeat something millions of times.',
                    'Check the number you are multiplying by.');
            }
            if (isStr(seq)) { allowSize(0, seq.length * n, line); return seq.repeat(n); }
            allowSize(seq.length * n, 0, line);
            const out = [];
            for (let k = 0; k < n; k++) for (let i = 0; i < seq.length; i++) out.push(seq[i]);
            return out;
        };
        if (isStr(a) && isInt(b)) return repeat(a, b);
        if (isInt(a) && isStr(b)) return repeat(b, a);
        if (isList(a) && isInt(b)) return repeat(a, b);
        if (isInt(a) && isList(b)) return repeat(b, a);
        throw typeError(`You cannot multiply ${typeName(a)} by ${typeName(b)}.`, line);
    }

    if (op === '%' && isStr(a)) {
        throw runtimeError('The old % way of formatting text is not supported here.', line,
            'Use an f-string instead: f"Hello {name}".');
    }

    if (!isNumeric(a) || !isNumeric(b)) {
        const verb = { '-': 'subtract', '/': 'divide', '//': 'divide', '%': 'take the remainder of', '**': 'raise to a power' }[op];
        throw typeError(`You can only ${verb} numbers, not ${typeName(a)} and ${typeName(b)}.`, line);
    }
    return arith(op, a, b, line);
}

function arith(op, aRaw, bRaw, line) {
    const a = numValue(aRaw);
    const b = numValue(bRaw);
    const bothInt = isInt(a) && isInt(b);

    if (op === '/') {
        const y = toJsNumber(b);
        if (y === 0) {
            throw zeroError('You tried to divide by zero.', line,
                'Check the divisor with an if before dividing.');
        }
        return toJsNumber(a) / y;
    }
    if (op === '//' || op === '%') {
        if (bothInt) {
            if (b === 0n) {
                throw zeroError(op === '%' ? 'You tried to take the remainder after dividing by zero.'
                    : 'You tried to divide by zero.', line);
            }
            return checkBig(op === '//' ? floorDivBig(a, b) : modBig(a, b), line);
        }
        const y = toJsNumber(b);
        if (y === 0) throw zeroError('You tried to divide by zero.', line);
        const x = toJsNumber(a);
        return op === '//' ? Math.floor(x / y) : modFloat(x, y);
    }
    if (op === '**') {
        if (bothInt && b >= 0n) {
            if (b > 4096n) {
                throw limitError('That power is far too large to work out.',
                    'Check the exponent — it may be growing inside a loop.');
            }
            return checkBig(a ** b, line);
        }
        return toJsNumber(a) ** toJsNumber(b);
    }
    if (bothInt) {
        const r = op === '+' ? a + b : op === '-' ? a - b : a * b;
        return checkBig(r, line);
    }
    const x = toJsNumber(a), y = toJsNumber(b);
    return op === '+' ? x + y : op === '-' ? x - y : x * y;
}

export function compareOp(op, a, b, line) {
    switch (op) {
        // Between objects, == gives back whatever __eq__ returned, as in Python.
        case '==': return isInstance(a) || isInstance(b) ? instanceEquals(a, b) : pyEquals(a, b);
        case '!=': return !pyEquals(a, b);
        case '<':  return pyLess(a, b, line);
        case '>':  return pyLess(b, a, line);
        case '<=': return pyEquals(a, b) || pyLess(a, b, line);
        case '>=': return pyEquals(a, b) || pyLess(b, a, line);
        case 'is': return sameObject(a, b);
        case 'is not': return !sameObject(a, b);
        case 'in': return containsValue(b, a, line);
        case 'not in': return !containsValue(b, a, line);
        default: throw runtimeError(`I do not understand the operator "${op}".`, line);
    }
}

function containsValue(container, item, line) {
    if (isStr(container)) {
        if (!isStr(item)) {
            throw runtimeError(`"in" can only look for text inside text, not ${typeName(item)}.`, line);
        }
        return container.includes(item);
    }
    if (isList(container)) { charge(container.length, line); return container.some(x => pyEquals(x, item)); }
    if (isTuple(container)) { charge(container.items.length, line); return container.items.some(x => pyEquals(x, item)); }
    if (isDict(container)) {
        charge(container.size, line);
        for (const k of container.keys()) if (pyEquals(k, item)) return true;
        return false;
    }
    if (isRange(container)) {
        // Worked out, not searched, as Python does: 10**10 in range(10**12) used
        // to walk ten billion numbers and freeze the page.
        if (!isNumeric(item)) return false;
        let n = numValue(item);
        if (isFloat(n)) {
            if (!Number.isInteger(n)) return false;
            n = BigInt(n);
        }
        const { start, stop, step } = container;
        const inside = step > 0n ? n >= start && n < stop : n <= start && n > stop;
        return inside && (n - start) % step === 0n;
    }
    throw runtimeError(`You cannot look inside ${typeName(container)} with "in".`, line);
}

/**
 * What a for-loop walks over, as a JavaScript iterable. A list is walked the way
 * Python walks it — by position, reading the list as it is NOW — so removing from
 * a list inside a loop over it skips the next item, just as it does in Python.
 * (Walking a copy used to hide that classic bug: the loop printed the answer the
 * student expected, and Python does not.) A dictionary may not change size while
 * it is being looped over.
 */
export function iterate(value, line) {
    if (isStr(value)) return [...value];
    if (isList(value)) return (function* () { for (let i = 0; i < value.length; i++) yield value[i]; })();
    if (isTuple(value)) return [...value.items];
    if (isRange(value)) return value;
    if (isDict(value)) {
        return (function* () {
            const size = value.size;
            const changed = () => runtimeError('The dictionary changed size while the loop was going through it.', line,
                'Loop over a copy of its keys instead: for k in list(d.keys()):');
            for (const k of [...value.keys()]) {
                if (value.size !== size) throw changed();
                if (value.has(k)) yield k;
            }
            if (value.size !== size) throw changed();
        })();
    }
    if (value instanceof PyFile) {
        // One line per pass, each still ending in its "\n", until the file runs out.
        return (function* () {
            for (;;) {
                const next = FILE_METHODS.readline(value, [], line);
                if (next === '') return;
                yield next;
            }
        })();
    }
    throw typeError(`You cannot loop over ${typeName(value)}.`, line,
        'A for loop needs a list, a string, a range, or a dictionary.');
}

/** Dictionary keys must be values that compare by content, not by identity. */
function dictKey(k, line) {
    if (isStr(k) || isInt(k) || isBool(k) || k === null) return k;
    if (isFloat(k)) return Number.isInteger(k) ? BigInt(k) : k;
    if (isTuple(k)) return 'tuple:' + pyRepr(k);
    throw runtimeError(`${typeName(k)} cannot be used as a dictionary key.`, line,
        'Keys are usually text or whole numbers.');
}

function dictGet(map, key, line) {
    const k = dictKey(key, line);
    if (map.has(k)) return map.get(k);
    return undefined;
}

// ─── Built-in functions ──────────────────────────────────────────────────────
//
// Each builtin takes (args, kwargs, line, interp). Anything a beginner is
// likely to reach for is here; anything that is not gets a message saying so,
// rather than "name 'foo' is not defined".

const OUTPUT_LINE_LIMIT = 60;
const OUTPUT_CHAR_LIMIT = 4000;

function arity(name, args, min, max, line) {
    if (args.length < min || args.length > max) {
        const expect = min === max ? `${min}` : `${min} to ${max}`;
        throw typeError(
            `${name}() takes ${expect} value${max === 1 ? '' : 's'}, but you gave it ${args.length}.`, line);
    }
}

function asIndex(v, line, what = 'An index') {
    if (isBool(v)) return v ? 1 : 0;
    if (isInt(v)) return Number(v);
    if (isFloat(v)) {
        throw runtimeError(`${what} has to be a whole number, and ${floatRepr(v)} is a decimal.`, line,
            'Use // instead of / when you divide to make an index, or wrap it in int().');
    }
    throw runtimeError(`${what} has to be a whole number, not ${typeName(v)}.`, line);
}

function toBigInt(v, line, what) {
    if (isBool(v)) return v ? 1n : 0n;
    if (isInt(v)) return v;
    if (isFloat(v)) return BigInt(Math.trunc(v));
    throw runtimeError(`${what} has to be a whole number, not ${typeName(v)}.`, line);
}

/**
 * Python's round(). Two things make this fussier than it looks: halfway cases go
 * to the even neighbour (round(2.5) is 2, not 3), and the halfway test has to be
 * made against the number's true value rather than a scaled copy of it. 2.675 is
 * really 2.674999…, so round(2.675, 2) is 2.67 — but 2.675 * 100 lands on exactly
 * 267.5 and would round the other way. Working on the decimal expansion avoids it.
 */
function pyRound(x, digits) {
    if (!Number.isFinite(x) || Math.abs(x) >= 1e21) return x;
    const negative = x < 0;
    const text = Math.abs(x).toFixed(Math.min(100, digits + 25));
    const dot = text.indexOf('.');
    const keep = digits === 0 ? text.slice(0, dot) : text.slice(0, dot + 1 + digits);
    const rest = (digits === 0 ? text.slice(dot + 1) : text.slice(dot + 1 + digits)).replace(/0+$/, '');

    let roundUp;
    if (rest === '') roundUp = false;
    else if (rest[0] > '5') roundUp = true;
    else if (rest[0] < '5') roundUp = false;
    else if (rest.length > 1) roundUp = true;               // 5 followed by something
    else roundUp = Number(keep[keep.length - 1]) % 2 === 1; // an exact tie: go to even

    const scaled = BigInt(keep.replace('.', '')) + (roundUp ? 1n : 0n);
    const value = digits === 0 ? Number(scaled) : Number(scaled) / 10 ** digits;
    return negative ? -value : value;
}

function sequenceOf(v, line, what) {
    if (isStr(v)) { charge(v.length, line); return [...v]; }
    if (isList(v)) { charge(v.length, line); return v; }
    if (isTuple(v)) { charge(v.items.length, line); return v.items; }
    if (isRange(v)) {
        if (v.length > BigInt(ITEM_LIMIT)) throw tooBig(line);
        charge(Number(v.length), line);
        return [...v];
    }
    if (isDict(v)) { charge(v.size, line); return [...v.keys()]; }
    throw runtimeError(`${what} needs a list, text, a range, or a dictionary, not ${typeName(v)}.`, line);
}

// isinstance(x, int) and friends. In Python a bool IS an int, so True counts as one.
const BUILTIN_KINDS = {
    int:   v => isInt(v) || isBool(v),
    float: v => isFloat(v),
    bool:  v => isBool(v),
    str:   v => isStr(v),
    list:  v => isList(v),
    tuple: v => isTuple(v),
    dict:  v => isDict(v),
};

const BUILTINS = {
    print: (args, kw, line, interp) => {
        if (kw.file !== undefined) {
            throw runtimeError('print(..., file=...) is not supported here.', line,
                'Write to the file with its own method: f.write(text + "\\n")');
        }
        const sep = kw.sep !== undefined ? pyStr(kw.sep) : ' ';
        const end = kw.end !== undefined ? pyStr(kw.end) : '\n';
        interp.write(args.map(v => interp.toText(v, line)).join(sep) + end, line);
        return null;
    },

    repr: (args, kw, line) => { arity('repr', args, 1, 1, line); return pyRepr(args[0]); },

    open: (args, kw, line, interp) => {
        arity('open', args, 1, 2, line);
        for (const key of Object.keys(kw)) {
            if (key !== 'mode' && key !== 'encoding') {
                throw runtimeError(`open() has no "${key}" setting here.`, line, 'Give it the file name and, if you are writing, the mode: open(name, "w")');
            }
        }
        return interp.openFile(args[0], args.length > 1 ? args[1] : kw.mode ?? 'r', line);
    },

    isinstance: (args, kw, line) => {
        arity('isinstance', args, 2, 2, line);
        const [value, kind] = args;
        const kinds = isTuple(kind) ? kind.items : [kind];
        return kinds.some(k => {
            if (k instanceof PyClass) return isInstance(value) && value.cls.isKindOf(k);
            const test = k instanceof Builtin ? BUILTIN_KINDS[k.name] : null;
            if (!test) {
                throw runtimeError(`The second value given to isinstance() has to be a class, but this is ${typeName(k)}.`, line,
                    'Write the class name itself, with no quotes and no parentheses: isinstance(pet, Dog)');
            }
            return test(value);
        });
    },

    len: (args, kw, line) => {
        arity('len', args, 1, 1, line);
        const v = args[0];
        if (isStr(v)) return BigInt(v.length);
        if (isList(v)) return BigInt(v.length);
        if (isTuple(v)) return BigInt(v.items.length);
        if (isDict(v)) return BigInt(v.size);
        if (isRange(v)) return v.length;
        const own = specialMethod(v, '__len__');
        if (own) return instanceLength(v, own);
        throw runtimeError(`len() does not work on ${typeName(v)}.`, line,
            isNumeric(v) ? 'A number has no length. Did you mean to turn it into text with str() first?' : null);
    },

    range: (args, kw, line) => {
        arity('range', args, 1, 3, line);
        const nums = args.map(a => toBigInt(a, line, 'range()'));
        const [start, stop, step] = nums.length === 1
            ? [0n, nums[0], 1n]
            : [nums[0], nums[1], nums.length > 2 ? nums[2] : 1n];
        if (step === 0n) {
            throw runtimeError('range() cannot have a step of 0 — it would never move.', line);
        }
        return new PyRange(start, stop, step);
    },

    str:  (args, kw, line, interp) => { arity('str',  args, 0, 1, line); return args.length ? interp.toText(args[0], line) : ''; },
    bool: (args, kw, line) => { arity('bool', args, 0, 1, line); return args.length ? truthy(args[0]) : false; },

    int: (args, kw, line) => {
        arity('int', args, 0, 1, line);
        if (args.length === 0) return 0n;
        const v = args[0];
        if (isBool(v)) return v ? 1n : 0n;
        if (isInt(v)) return v;
        if (isFloat(v)) {
            if (!Number.isFinite(v)) throw runtimeError('int() cannot convert that number.', line);
            return BigInt(Math.trunc(v));
        }
        if (isStr(v)) {
            const text = v.trim();
            if (!/^[+-]?\d+$/.test(text)) {
                throw tagged("ValueError", ["invalid literal for int() with base 10: " + pyRepr(v)])(`int() cannot turn ${pyRepr(v)} into a whole number.`, line,
                    /^[+-]?\d*\.\d+$/.test(text)
                        ? 'That text holds a decimal. Use float() first, or int(float(s)).'
                        : 'Only text that is entirely digits can become a number.');
            }
            return BigInt(text);
        }
        throw runtimeError(`int() cannot convert ${typeName(v)}.`, line);
    },

    float: (args, kw, line) => {
        arity('float', args, 0, 1, line);
        if (args.length === 0) return 0;
        const v = args[0];
        if (isNumeric(v)) return toJsNumber(v);
        if (isStr(v)) {
            const text = v.trim();
            const n = Number(text);
            if (text === '' || Number.isNaN(n)) {
                throw tagged("ValueError", ["could not convert string to float: " + pyRepr(v)])(`float() cannot turn ${pyRepr(v)} into a number.`, line);
            }
            return n;
        }
        throw runtimeError(`float() cannot convert ${typeName(v)}.`, line);
    },

    abs: (args, kw, line) => {
        arity('abs', args, 1, 1, line);
        const v = args[0];
        if (isInt(v) || isBool(v)) { const n = numValue(v); return n < 0n ? -n : n; }
        if (isFloat(v)) return Math.abs(v);
        throw runtimeError(`abs() needs a number, not ${typeName(v)}.`, line);
    },

    round: (args, kw, line) => {
        arity('round', args, 1, 2, line);
        const v = args[0];
        if (!isNumeric(v)) throw runtimeError(`round() needs a number, not ${typeName(v)}.`, line);
        const digits = args.length > 1 ? asIndex(args[1], line, 'The number of decimal places') : null;
        if (digits === null) {
            if (isInt(v) || isBool(v)) return numValue(v);
            return BigInt(pyRound(v, 0));
        }
        if (isInt(v) || isBool(v)) return numValue(v);
        return pyRound(v, digits);
    },

    sum: (args, kw, line) => {
        arity('sum', args, 1, 2, line);
        const items = sequenceOf(args[0], line, 'sum()');
        let total = args.length > 1 ? args[1] : 0n;
        for (const item of items) {
            if (!isNumeric(item)) {
                throw runtimeError(`sum() can only add numbers, and this list holds ${typeName(item)}.`, line,
                    isStr(item) ? 'To join text, use "".join(items) instead.' : null);
            }
            total = binaryOp('+', total, item, line);
        }
        return total;
    },

    min: (args, kw, line, interp) => pickExtreme('min', args, kw, line, interp),
    max: (args, kw, line, interp) => pickExtreme('max', args, kw, line, interp),

    sorted: (args, kw, line, interp) => {
        arity('sorted', args, 1, 1, line);
        const items = [...sequenceOf(args[0], line, 'sorted()')];
        const keyFn = kw.key ?? null;
        const decorated = items.map(item => ({
            item,
            key: keyFn ? interp.callValue(keyFn, [item], line) : item,
        }));
        return sortDecorated(decorated, truthy(kw.reverse ?? false), line);
    },

    list: (args, kw, line) => {
        arity('list', args, 0, 1, line);
        return args.length ? [...sequenceOf(args[0], line, 'list()')] : [];
    },
    tuple: (args, kw, line) => {
        arity('tuple', args, 0, 1, line);
        return new PyTuple(args.length ? [...sequenceOf(args[0], line, 'tuple()')] : []);
    },
    dict: (args, kw, line) => {
        arity('dict', args, 0, 0, line);
        return new Map();
    },

    enumerate: (args, kw, line) => {
        arity('enumerate', args, 1, 2, line);
        const items = sequenceOf(args[0], line, 'enumerate()');
        let i = args.length > 1 ? toBigInt(args[1], line, 'The starting number') : 0n;
        return items.map(item => new PyTuple([i++, item]));
    },

    reversed: (args, kw, line) => {
        arity('reversed', args, 1, 1, line);
        return [...sequenceOf(args[0], line, 'reversed()')].reverse();
    },

    any: (args, kw, line) => {
        arity('any', args, 1, 1, line);
        return sequenceOf(args[0], line, 'any()').some(truthy);
    },
    all: (args, kw, line) => {
        arity('all', args, 1, 1, line);
        return sequenceOf(args[0], line, 'all()').every(truthy);
    },

    ord: (args, kw, line) => {
        arity('ord', args, 1, 1, line);
        if (!isStr(args[0]) || args[0].length !== 1) {
            throw runtimeError('ord() needs exactly one character, like ord("a").', line);
        }
        return BigInt(args[0].codePointAt(0));
    },
    chr: (args, kw, line) => {
        arity('chr', args, 1, 1, line);
        const n = asIndex(args[0], line, 'chr()');
        if (n < 0 || n > 0x10ffff) throw runtimeError('chr() needs a number between 0 and 1114111.', line);
        return String.fromCodePoint(n);
    },
};

/**
 * Sort {item, key} pairs and hand back the items. reverse=True is a sort with
 * every comparison turned round — NOT an ascending sort flipped afterwards, which
 * would also flip items that tie, and Python keeps those in their original order.
 */
function sortDecorated(decorated, reverse, line) {
    const sign = reverse ? -1 : 1;
    decorated.sort((a, b) => (pyEquals(a.key, b.key) ? 0 : sign * (pyLess(a.key, b.key, line) ? -1 : 1)));
    return decorated.map(d => d.item);
}

function pickExtreme(name, args, kw, line, interp) {
    let items;
    if (args.length === 0) throw runtimeError(`${name}() needs something to compare.`, line);
    if (args.length === 1) {
        items = sequenceOf(args[0], line, `${name}()`);
        if (items.length === 0) {
            throw valueError(`${name}() cannot work on an empty list.`, line,
                'Check the list is not empty before calling it.');
        }
    } else {
        items = args;
    }
    const keyFn = kw.key ?? null;
    let best = items[0];
    let bestKey = keyFn ? interp.callValue(keyFn, [best], line) : best;
    for (const item of items.slice(1)) {
        const key = keyFn ? interp.callValue(keyFn, [item], line) : item;
        const better = name === 'min' ? pyLess(key, bestKey, line) : pyLess(bestKey, key, line);
        if (better) { best = item; bestKey = key; }
    }
    return best;
}

// Names a student may reasonably type that this interpreter does not have.
const ABSENT = new Map([
    ['input',      'These problems never read input — the values arrive as the function\'s parameters.'],
    ['set',        'Sets are not supported in this practice interpreter yet. Use a list instead.'],
    ['type',       'type() is not supported here. Compare values directly instead.'],
    ['super',      'super is written with parentheses, inside a method: super().__init__(...)'],
    ['issubclass', 'issubclass() is not supported here. Ask about an object instead: isinstance(thing, SomeClass).'],
    ['map',        'map() is not supported here. Use a for loop.'],
    ['filter',     'filter() is not supported here. Use a for loop with an if.'],
    ['zip',        'zip() is not supported here. Loop over range(len(items)) and index both lists.'],
    ['eval',       'eval() is not supported here.'],
    ['exec',       'exec() is not supported here.'],
    ['math',       'Modules are not supported here. abs(), round(), min(), max() and ** are built in.'],
    ['random',     'Modules are not supported here, and these problems must give the same answer every time.'],
]);

// ─── Methods ─────────────────────────────────────────────────────────────────

const STRING_METHODS = {
    upper:      (s, a, line) => { arity('upper', a, 0, 0, line); return s.toUpperCase(); },
    lower:      (s, a, line) => { arity('lower', a, 0, 0, line); return s.toLowerCase(); },
    title:      (s, a, line) => { arity('title', a, 0, 0, line);
                                  return s.replace(/[A-Za-z]+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase()); },
    capitalize: (s, a, line) => { arity('capitalize', a, 0, 0, line);
                                  return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s; },
    strip:      (s, a, line) => trimWith(s, a, line, 'both'),
    lstrip:     (s, a, line) => trimWith(s, a, line, 'left'),
    rstrip:     (s, a, line) => trimWith(s, a, line, 'right'),
    split: (s, a, line) => {
        arity('split', a, 0, 1, line);
        if (a.length === 0) return s.split(/\s+/).filter(p => p.length > 0);
        if (!isStr(a[0])) throw runtimeError(`split() needs text to split on, not ${typeName(a[0])}.`, line);
        if (a[0] === '') throw runtimeError('split() cannot split on empty text.', line,
            'To get the characters of a word, use list(word).');
        return s.split(a[0]);
    },
    join: (s, a, line) => {
        arity('join', a, 1, 1, line);
        const items = sequenceOf(a[0], line, 'join()');
        for (const item of items) {
            if (!isStr(item)) {
                throw runtimeError(`join() can only join text, and this list holds ${typeName(item)}.`, line,
                    'Turn each item into text with str() first.');
            }
        }
        let chars = s.length * Math.max(items.length - 1, 0);
        for (const item of items) chars += item.length;
        allowSize(0, chars, line);
        return items.join(s);
    },
    replace: (s, a, line) => {
        arity('replace', a, 2, 2, line);
        if (!isStr(a[0]) || !isStr(a[1])) throw runtimeError('replace() needs two pieces of text.', line);
        if (a[0] === '') {
            // Python puts the new text between every character, and at both ends.
            allowSize(0, s.length + a[1].length * (s.length + 1), line);
            return a[1] + [...s].join(a[1]) + (s.length ? a[1] : '');
        }
        const parts = s.split(a[0]);
        allowSize(0, s.length + (parts.length - 1) * (a[1].length - a[0].length), line);
        charge(s.length / 16, line);
        return parts.join(a[1]);
    },
    find:  (s, a, line) => { arity('find',  a, 1, 1, line); requireText(a[0], 'find', line);  return BigInt(s.indexOf(a[0])); },
    rfind: (s, a, line) => { arity('rfind', a, 1, 1, line); requireText(a[0], 'rfind', line); return BigInt(s.lastIndexOf(a[0])); },
    index: (s, a, line) => {
        arity('index', a, 1, 1, line);
        requireText(a[0], 'index', line);
        const at = s.indexOf(a[0]);
        if (at < 0) throw runtimeError(`${pyRepr(a[0])} does not appear in ${pyRepr(s)}.`, line,
            'Use .find(), which returns -1 instead of stopping, when the text might be missing.');
        return BigInt(at);
    },
    count: (s, a, line) => {
        arity('count', a, 1, 1, line);
        requireText(a[0], 'count', line);
        if (a[0] === '') return BigInt(s.length + 1);
        return BigInt(s.split(a[0]).length - 1);
    },
    startswith: (s, a, line) => { arity('startswith', a, 1, 1, line); requireText(a[0], 'startswith', line); return s.startsWith(a[0]); },
    endswith:   (s, a, line) => { arity('endswith',   a, 1, 1, line); requireText(a[0], 'endswith', line);   return s.endsWith(a[0]); },
    isdigit: (s, a, line) => { arity('isdigit', a, 0, 0, line); return s.length > 0 && /^[0-9]+$/.test(s); },
    isalpha: (s, a, line) => { arity('isalpha', a, 0, 0, line); return s.length > 0 && /^[A-Za-z]+$/.test(s); },
    isalnum: (s, a, line) => { arity('isalnum', a, 0, 0, line); return s.length > 0 && /^[A-Za-z0-9]+$/.test(s); },
    isspace: (s, a, line) => { arity('isspace', a, 0, 0, line); return s.length > 0 && /^\s+$/.test(s); },
    isupper: (s, a, line) => { arity('isupper', a, 0, 0, line); return /[A-Za-z]/.test(s) && s === s.toUpperCase(); },
    islower: (s, a, line) => { arity('islower', a, 0, 0, line); return /[A-Za-z]/.test(s) && s === s.toLowerCase(); },
};

function requireText(v, name, line) {
    if (!isStr(v)) throw runtimeError(`${name}() needs text to look for, not ${typeName(v)}.`, line);
}

function trimWith(s, a, line, side) {
    arity('strip', a, 0, 1, line);
    if (a.length === 0) {
        return side === 'both' ? s.trim() : side === 'left' ? s.replace(/^\s+/, '') : s.replace(/\s+$/, '');
    }
    if (!isStr(a[0])) throw runtimeError(`strip() needs text, not ${typeName(a[0])}.`, line);
    const chars = new Set([...a[0]]);
    let start = 0;
    let end = s.length;
    if (side !== 'right') while (start < end && chars.has(s[start])) start++;
    if (side !== 'left')  while (end > start && chars.has(s[end - 1])) end--;
    return s.slice(start, end);
}

const LIST_METHODS = {
    append: (l, a, line) => { arity('append', a, 1, 1, line); l.push(a[0]); return null; },
    extend: (l, a, line) => { arity('extend', a, 1, 1, line); pushAll(l, sequenceOf(a[0], line, 'extend()'), line); return null; },
    insert: (l, a, line) => {
        arity('insert', a, 2, 2, line);
        let at = asIndex(a[0], line, 'The position for insert()');
        if (at < 0) at = Math.max(0, l.length + at);
        l.splice(Math.min(at, l.length), 0, a[1]);
        return null;
    },
    pop: (l, a, line) => {
        arity('pop', a, 0, 1, line);
        if (l.length === 0) throw tagged("IndexError", ["pop from empty list"])('You cannot pop from an empty list.', line);
        let at = a.length ? asIndex(a[0], line, 'The position for pop()') : l.length - 1;
        if (at < 0) at += l.length;
        if (at < 0 || at >= l.length) throw indexError(at, l.length, line);
        return l.splice(at, 1)[0];
    },
    remove: (l, a, line) => {
        arity('remove', a, 1, 1, line);
        const at = l.findIndex(x => pyEquals(x, a[0]));
        if (at < 0) throw tagged("ValueError", ["list.remove(x): x not in list"])(`${pyRepr(a[0])} is not in the list, so it cannot be removed.`, line,
            'Check with "if x in items:" first.');
        l.splice(at, 1);
        return null;
    },
    index: (l, a, line) => {
        arity('index', a, 1, 1, line);
        const at = l.findIndex(x => pyEquals(x, a[0]));
        if (at < 0) throw valueError(`${pyRepr(a[0])} is not in the list.`, line,
            'Check with "if x in items:" before asking for its position.');
        return BigInt(at);
    },
    count:   (l, a, line) => { arity('count', a, 1, 1, line); return BigInt(l.filter(x => pyEquals(x, a[0])).length); },
    reverse: (l, a, line) => { arity('reverse', a, 0, 0, line); l.reverse(); return null; },
    clear:   (l, a, line) => { arity('clear', a, 0, 0, line); l.length = 0; return null; },
    copy:    (l, a, line) => { arity('copy', a, 0, 0, line); return [...l]; },
    sort: (l, a, line, interp, kw) => {
        // sort() is the one method that takes keyword arguments (key=, reverse=),
        // so every method is called with the same five arguments.
        const options = kw || {};
        const keyFn = options.key ?? null;
        const decorated = l.map(item => ({ item, key: keyFn ? interp.callValue(keyFn, [item], line) : item }));
        const out = sortDecorated(decorated, truthy(options.reverse ?? false), line);
        l.length = 0;
        pushAll(l, out, line);
        return null;
    },
};

const DICT_METHODS = {
    get: (d, a, line) => {
        arity('get', a, 1, 2, line);
        const hit = dictGet(d, a[0], line);
        return hit === undefined ? (a.length > 1 ? a[1] : null) : hit;
    },
    keys:   (d, a, line) => { arity('keys',   a, 0, 0, line); return [...d.keys()]; },
    values: (d, a, line) => { arity('values', a, 0, 0, line); return [...d.values()]; },
    items:  (d, a, line) => { arity('items',  a, 0, 0, line); return [...d.entries()].map(([k, v]) => new PyTuple([k, v])); },
    pop: (d, a, line) => {
        arity('pop', a, 1, 2, line);
        const k = dictKey(a[0], line);
        if (!d.has(k)) {
            if (a.length > 1) return a[1];
            throw tagged("KeyError", [a[0]])(`The dictionary has no key ${pyRepr(a[0])}.`, line);
        }
        const v = d.get(k);
        d.delete(k);
        return v;
    },
    update: (d, a, line) => {
        arity('update', a, 1, 1, line);
        if (!isDict(a[0])) throw runtimeError(`update() needs another dictionary, not ${typeName(a[0])}.`, line);
        for (const [k, v] of a[0]) d.set(k, v);
        return null;
    },
    clear: (d, a, line) => { arity('clear', a, 0, 0, line); d.clear(); return null; },
    copy:  (d, a, line) => { arity('copy', a, 0, 0, line); return new Map(d); },
};

/** A file that can still be used, and in the right direction, or the error saying why not. */
function usable(f, wants, method, line) {
    if (f.closed) {
        throw tagged('ValueError', ['I/O operation on closed file.'])(
            `This file has been closed, so .${method}() cannot use it.`, line,
            'A with block closes its file when the indented lines end. Do the reading or writing inside it.');
    }
    if (wants === 'read' && f.mode !== 'r') {
        throw runtimeError(`This file was opened for writing, so .${method}() cannot read from it.`, line,
            'Close it, then open it again without a mode to read: open(name)');
    }
    if (wants === 'write' && f.mode === 'r') {
        throw runtimeError(`This file was opened for reading, so .${method}() cannot write to it.`, line,
            'Open it with "w" to write a new file, or "a" to add to the end: open(name, "w")');
    }
}

const FILE_METHODS = {
    read: (f, a, line) => {
        arity('read', a, 0, 0, line);
        usable(f, 'read', 'read', line);
        const rest = f.text.slice(f.pos);
        f.pos = f.text.length;
        return rest;
    },
    readline: (f, a, line) => {
        arity('readline', a, 0, 0, line);
        usable(f, 'read', 'readline', line);
        const end = f.text.indexOf('\n', f.pos);
        const stop = end === -1 ? f.text.length : end + 1;
        const got = f.text.slice(f.pos, stop);
        f.pos = stop;
        return got;
    },
    readlines: (f, a, line) => {
        arity('readlines', a, 0, 0, line);
        usable(f, 'read', 'readlines', line);
        const out = [];
        for (;;) {
            const next = FILE_METHODS.readline(f, [], line);
            if (next === '') return out;
            out.push(next);
        }
    },
    write: (f, a, line) => {
        arity('write', a, 1, 1, line);
        usable(f, 'write', 'write', line);
        if (!isStr(a[0])) {
            throw typeError(`.write() takes text, and this is ${typeName(a[0])}.`, line,
                'Turn it into text first: f.write(str(value))');
        }
        allowSize(0, f.pending.length + a[0].length, line);
        f.pending += a[0];
        return BigInt([...a[0]].length);
    },
    close: (f, a, line, interp) => {
        arity('close', a, 0, 0, line);
        interp.closeFile(f);
        return null;
    },
};

function indexError(at, length, line, what = null) {
    return tagged("IndexError", what ? [what + " index out of range"] : null)(
        length === 0
            ? `You asked for position ${at}, but this is empty.`
            : `You asked for position ${at}, but the last position is ${length - 1}.`,
        line,
        length === 0
            ? 'Check with "if len(items) > 0:" before reaching into it.'
            : `Counting starts at 0, so ${length} items run from 0 to ${length - 1}.`);
}

/** Small edit distance, used only to say "did you mean .append?". */
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
        const d = editDistance(name.toLowerCase(), c.toLowerCase());
        if (d < bestScore) { bestScore = d; best = c; }
    }
    return bestScore <= Math.max(1, Math.floor(name.length / 3)) ? best : null;
}

// ─── Interpreter ─────────────────────────────────────────────────────────────

const BREAK    = { signal: 'break' };
const CONTINUE = { signal: 'continue' };
class ReturnSignal { constructor(value) { this.value = value; } }

/** Every name a function body assigns — at any depth, but not inside a nested def or class. */
function assignedNames(body, out = new Set()) {
    const target = t => {
        if (t.type === 'Name') out.add(t.id);
        else if (t.type === 'TupleLit' || t.type === 'ListLit') t.elts.forEach(target);
    };
    for (const s of body) {
        if (s.type === 'Assign') s.targets.forEach(target);
        else if (s.type === 'AugAssign') target(s.target);
        else if (s.type === 'For') { s.targets.forEach(n => out.add(n)); assignedNames(s.body, out); }
        else if (s.type === 'While') assignedNames(s.body, out);
        else if (s.type === 'If') { assignedNames(s.body, out); assignedNames(s.orelse, out); }
        else if (s.type === 'Try') {
            assignedNames(s.body, out);
            for (const h of s.handlers) { if (h.name) out.add(h.name); assignedNames(h.body, out); }
            assignedNames(s.orelse, out);
            if (s.finalbody) assignedNames(s.finalbody, out);
        }
        else if (s.type === 'With') { out.add(s.name); assignedNames(s.body, out); }
        else if (s.type === 'FuncDef' || s.type === 'ClassDef') out.add(s.name);
    }
    return out;
}

// A name a function assigns somewhere, looked up before it has been.
const UNBOUND = Symbol('unbound');

/**
 * One set of variables. Functions look outward through `parent` to find names.
 * A function's scope also knows every name the function assigns ANYWHERE in its
 * body (`locals`): in Python those names belong to the function from its first
 * line, so reading one before it is set is an error rather than a quiet fall
 * back to the variable outside. Falling back is what this used to do, which hid
 * the classic `total += n` bug: the function ran, and the outer total never moved.
 */
class Scope {
    constructor(parent = null, locals = null) { this.vars = new Map(); this.parent = parent; this.locals = locals; }
    lookup(name) {
        for (let s = this; s; s = s.parent) {
            if (s.vars.has(name)) return s.vars.get(name);
            if (s.locals && s.locals.has(name)) return UNBOUND;
        }
        return undefined;
    }
    has(name) {
        for (let s = this; s; s = s.parent) if (s.vars.has(name)) return true;
        return false;
    }
    names() {
        const out = new Set();
        for (let s = this; s; s = s.parent) for (const k of s.vars.keys()) out.add(k);
        return out;
    }
    set(name, value) { this.vars.set(name, value); }
}

export const DEFAULT_LIMITS = {
    steps: 400000,      // enough for any beginner exercise, far short of a freeze
    milliseconds: 2000,
    depth: 120,
};

export class Interpreter {
    constructor({ steps, milliseconds, depth, lineOffset = 0, now = () => Date.now() } = {}) {
        this.stepLimit = steps ?? DEFAULT_LIMITS.steps;
        this.timeLimit = milliseconds ?? DEFAULT_LIMITS.milliseconds;
        this.depthLimit = depth ?? DEFAULT_LIMITS.depth;
        this.lineOffset = lineOffset;
        this.now = now;
        this.steps = 0;
        this.depth = 0;
        this.frames = [];
        this.exc = makeExceptionClasses();
        this.handling = [];             // the errors whose except blocks are running, innermost last
        this.files = new Map();         // name → text: the only "disk" a program can reach
        this.writers = new Set();       // names open for writing and not yet closed
        this.startedAt = null;
        this.output = [];
        this.outputChars = 0;
        this.truncated = false;
        this.globals = new Scope(null);
        this.printed = false;
    }

    // ── Budgets ──

    tick(line) {
        this.line = line;
        if (++this.steps > this.stepLimit) {
            throw limitError('Your code is still running after hundreds of thousands of steps.',
                'That almost always means a loop that never ends — check that the value in the ' +
                'while condition really changes inside the loop.', line);
        }
        if ((this.steps & 2047) === 0 && this.startedAt !== null
            && this.now() - this.startedAt > this.timeLimit) {
            throw limitError('Your code has been running for too long.',
                'Check for a loop that never reaches its stopping point.', line);
        }
    }

    write(text, line) {
        this.printed = true;
        if (this.truncated) return;
        if (this.output.length >= OUTPUT_LINE_LIMIT || this.outputChars + text.length > OUTPUT_CHAR_LIMIT) {
            this.truncated = true;
            this.output.push('… (further output not shown)');
            return;
        }
        this.outputChars += text.length;
        this.output.push(text);
    }

    /** Everything print() produced, as lines. */
    outputLines() {
        return this.output.join('').split('\n').filter((l, i, arr) => !(i === arr.length - 1 && l === ''));
    }

    // ── Running ──

    run(ast) {
        this.startedAt = this.now();
        const previous = ACTIVE;
        ACTIVE = this;
        try { this.execBlock(ast.body, this.globals); }
        catch (e) { throw asLimit(e); }
        finally { ACTIVE = previous; }
    }

    execBlock(stmts, scope) {
        for (const stmt of stmts) this.execStatement(stmt, scope);
    }

    execStatement(node, scope) {
        this.tick(node.line);
        switch (node.type) {
            case 'ExprStmt': {
                const value = this.evaluate(node.expr, scope);
                // Legal Python, and always a bug: `c.bump` names the method and
                // walks away without running it. Nothing fails; nothing happens.
                if (value instanceof PyBoundMethod && node.expr.type === 'Attribute') {
                    throw runtimeError(`You wrote ".${node.expr.attr}" without parentheses, so the method never ran.`,
                        node.line, `A method only runs when you call it: .${node.expr.attr}()`);
                }
                return;
            }

            case 'Assign': {
                const value = this.evaluate(node.value, scope);
                for (const target of node.targets) this.assign(target, value, scope, node.line);
                return;
            }

            case 'AugAssign': {
                const current = this.evaluate(node.target, scope);
                const value = this.evaluate(node.value, scope);
                // On a list, += and *= work IN PLACE: the list itself grows, so any
                // other name for it sees the change. (a = a + [x] builds a new list
                // instead — the pair is a classic aliasing question.)
                if (isList(current) && node.op === '+') {
                    pushAll(current, [...iterate(value, node.line)], node.line);
                    this.assign(node.target, current, scope, node.line);
                    return;
                }
                if (isList(current) && node.op === '*' && isInt(value) && !isBool(value)) {
                    const once = current.slice();
                    if (value > 0n) allowSize(once.length * Number(value), 0, node.line);
                    current.length = 0;
                    for (let k = 0n; k < value; k++) { this.tick(node.line); pushAll(current, once, node.line); }
                    this.assign(node.target, current, scope, node.line);
                    return;
                }
                this.assign(node.target, binaryOp(node.op, current, value, node.line), scope, node.line);
                return;
            }

            case 'If':
                if (truthy(this.evaluate(node.test, scope))) this.execBlock(node.body, scope);
                else if (node.orelse.length) this.execBlock(node.orelse, scope);
                return;

            case 'While':
                while (truthy(this.evaluate(node.test, scope))) {
                    this.tick(node.line);
                    try {
                        this.execBlock(node.body, scope);
                    } catch (e) {
                        if (e === BREAK) return;
                        if (e !== CONTINUE) throw e;
                    }
                }
                return;

            case 'For': {
                const iterable = iterate(this.evaluate(node.iter, scope), node.line);
                for (const item of iterable) {
                    this.tick(node.line);
                    if (node.targets.length === 1) {
                        scope.set(node.targets[0], item);
                    } else {
                        const parts = isTuple(item) ? item.items : isList(item) ? item : null;
                        if (!parts || parts.length !== node.targets.length) {
                            throw runtimeError(
                                `This loop asks for ${node.targets.length} values per item, but got ${
                                    parts ? parts.length : 'one that cannot be split'}.`, node.line,
                                'Looping over two names at once needs pairs, as from .items() or enumerate().');
                        }
                        node.targets.forEach((name, i) => scope.set(name, parts[i]));
                    }
                    try {
                        this.execBlock(node.body, scope);
                    } catch (e) {
                        if (e === BREAK) return;
                        if (e !== CONTINUE) throw e;
                    }
                }
                return;
            }

            case 'FuncDef': {
                // A default is worked out once, when the def line runs, and the same
                // value is reused by every call that leaves the argument out — which
                // is why a default of [] keeps growing in real Python, and here.
                const params = node.params.map(p => (p.default === null ? p
                    : { name: p.name, default: p.default, value: this.evaluate(p.default, scope), ready: true }));
                const fn = new PyFunction(node.name, params, node.body, scope);
                fn.locals = node.locals ??= assignedNames(node.body);
                scope.set(node.name, fn);
                return;
            }

            case 'ClassDef': {
                // The parent is whatever its name means on this line, so it has
                // to be defined above. (`object` is the parent every class has.)
                let base = null;
                if (node.base !== null && node.base !== 'object') {
                    const known = Object.hasOwn(this.exc, node.base);
                    if (/^(BaseException|\w+Error|\w+Exception|ABC)$/.test(node.base) && !known && !scope.has(node.base)) {
                        throw runtimeError(`A class here cannot inherit from Python's own ${node.base}.`, node.line,
                            'For an error of your own, inherit from Exception: class MyError(Exception):');
                    }
                    if (scope.lookup(node.base) === undefined && !(node.base in BUILTINS) && !known) {
                        throw runtimeError(`The parent class "${node.base}" has not been defined yet.`, node.line,
                            `Write class ${node.base}: above class ${node.name}, and check the spelling.`);
                    }
                    base = this.evaluate({ type: 'Name', id: node.base, line: node.line }, scope);
                    if (base instanceof Builtin) {
                        throw runtimeError(`A class here cannot inherit from Python's own ${node.base}.`, node.line,
                            'Inherit from a class you have written yourself.');
                    }
                    if (!(base instanceof PyClass)) {
                        throw runtimeError(`"${node.base}" is ${typeName(base)}, not a class, so nothing can inherit from it.`, node.line);
                    }
                }
                // The body runs once, in a scope of its own; whatever it defined
                // becomes the class's attributes.
                const bodyScope = new Scope(scope);
                this.execBlock(node.body, bodyScope);
                for (const [name, value] of bodyScope.vars) {
                    if (/^__\w+__$/.test(name) && value instanceof PyFunction && !SPECIAL_METHODS.has(name)) {
                        throw runtimeError(`${name} is not supported in this practice interpreter yet.`, node.line,
                            `A class here may define ${[...SPECIAL_METHODS].join(', ')}. Any other special method ` +
                            'would be ignored rather than used as Python uses it, so it is refused instead.');
                    }
                }
                const cls = new PyClass(node.name, new Map(bodyScope.vars), base);
                for (const value of cls.attrs.values()) {
                    if (value instanceof PyFunction) {
                        // As in Python, a method does NOT see class-level names as
                        // bare names — it must say self.x or ClassName.x. So its
                        // outward scope is where the class was written, not the body.
                        value.scope = scope;
                        value.owner = cls;
                    }
                }
                scope.set(node.name, cls);
                return;
            }

            case 'Return':
                throw new ReturnSignal(node.value ? this.evaluate(node.value, scope) : null);

            case 'Assert': {
                // A claim that must be true. When it is not, the program stops here:
                // that is the whole of what a test written with assert does.
                if (truthy(this.evaluate(node.test, scope))) return;
                const said = node.message ? this.toText(this.evaluate(node.message, scope), node.line) : null;
                throw tagged('AssertionError', said === null ? [] : [said])(said ? `This assert failed: ${said}` : 'This assert failed.', node.line,
                    'An assert claims that something is True. Here it was not, so the program stopped on this line.');
            }

            case 'Raise': {
                if (node.exc === null) {
                    // A bare raise passes on the error this except block is handling.
                    if (this.handling.length === 0) {
                        throw tagged('RuntimeError', ['No active exception to reraise'])(
                            'A raise with nothing after it only works inside an except block.', node.line,
                            'There it passes the caught error on. Anywhere else, say what to raise: raise ValueError("...")');
                    }
                    throw this.handling[this.handling.length - 1];
                }
                let value = this.evaluate(node.exc, scope);
                // raise ValueError — the class on its own — makes one with no message.
                if (value instanceof PyClass && value.exception) value = this.callValue(value, [], node.line);
                if (!isExc(value)) {
                    throw typeError(`Only an error can be raised, and this is ${typeName(value)}.`, node.line,
                        isStr(value) ? 'Wrap the message in a kind of error: raise ValueError("...")'
                                     : 'Raise one of Python\'s errors, such as ValueError("..."), or a class of your own that inherits from Exception.');
                }
                throw this.errorFor(value, node.line);
            }

            case 'Try': {
                try {
                    let finished = false;
                    try {
                        this.execBlock(node.body, scope);
                        finished = true;
                    } catch (e) {
                        const handler = this.findHandler(node, e, scope);
                        if (!handler) throw e;
                        if (handler.name) scope.set(handler.name, this.excObject(e));
                        this.handling.push(e);
                        try {
                            this.execBlock(handler.body, scope);
                        } finally {
                            this.handling.pop();
                            // As in Python, the name given by `as` is gone once the block ends.
                            if (handler.name) scope.vars.delete(handler.name);
                        }
                    }
                    if (finished) this.execBlock(node.orelse, scope);
                } finally {
                    if (node.finalbody) this.execBlock(node.finalbody, scope);
                }
                return;
            }

            case 'With': {
                const file = this.evaluate(node.item, scope);
                if (!(file instanceof PyFile)) {
                    throw runtimeError(`A with block here works on a file, and this is ${typeName(file)}.`, node.line,
                        'Write: with open("notes.txt") as f:');
                }
                scope.set(node.name, file);
                // The whole point of with: the file is closed however the block ends.
                try { this.execBlock(node.body, scope); }
                finally { this.closeFile(file); }
                return;
            }

            case 'Break':    throw BREAK;
            case 'Continue': throw CONTINUE;
            case 'Pass':     return;

            default:
                throw runtimeError(`I do not know how to run a ${node.type}.`, node.line);
        }
    }

    // ── Errors as values ──

    /** The JavaScript error that carries a Python exception object out through the running program. */
    errorFor(exc, line) {
        if (exc.error) return exc.error;       // raised before, or made by the interpreter: the same error again
        let text = '';
        try { text = exc.cls.find('__str__') instanceof PyFunction ? '' : excStr(exc, line); } catch (_) { /* no wording to show */ }
        const error = runtimeError(
            text ? `The program stopped with a ${exc.cls.name}: ${text}` : `The program stopped with a ${exc.cls.name}.`, line,
            'This error was raised on purpose, on this line, and no try / except caught it.');
        error.exc = exc;
        exc.error = error;
        return error;
    }

    /** The Python exception object for an error on its way through a try. */
    excObject(error) {
        if (!error.exc) {
            const exc = new PyInstance(this.exc[error.pyType]);
            exc.excArgs = error.pyArgs;        // null when Python's wording is not reproduced
            exc.error = error;
            error.exc = exc;
        }
        return error.exc;
    }

    /**
     * The except clause that takes this error, or null. Only Python's
     * exceptions can be caught: never the step and time budgets, and never an
     * error that is this interpreter declining to do something.
     */
    findHandler(node, error, scope) {
        if (!(error instanceof PyError) || error.kind !== 'runtime') return null;
        const cls = error.exc ? error.exc.cls : this.exc[error.pyType];
        if (!cls) {
            if (node.handlers.length && !error.passedTry) {
                error.passedTry = true;
                error.hint = (error.hint ? error.hint + ' ' : '') +
                    '(This practice interpreter cannot hand this particular error to an except block.)';
            }
            return null;
        }
        for (const handler of node.handlers) {
            if (handler.kind === null) return handler;
            const kind = this.evaluate(handler.kind, scope);
            const kinds = isTuple(kind) ? kind.items : [kind];
            for (const k of kinds) {
                if (!(k instanceof PyClass && k.exception)) {
                    throw typeError(`except has to name a kind of error, and this is ${typeName(k)}.`, handler.line,
                        isStr(k) ? 'Write the name without quotes: except ValueError:' : 'For example: except ValueError:');
                }
                if (cls.isKindOf(k)) return handler;
            }
        }
        return null;
    }

    // ── Files ──

    /** open(name, mode): the "disk" is this.files, and nothing else. */
    openFile(name, mode, line) {
        if (!isStr(name)) {
            throw typeError(`open() needs the file's name as text, but this is ${typeName(name)}.`, line);
        }
        const kind = isStr(mode) ? mode.replace('t', '') : null;
        if (kind !== 'r' && kind !== 'w' && kind !== 'a') {
            throw runtimeError(`The file mode ${pyRepr(mode)} is not supported here.`, line,
                'Use "r" to read, "w" to write a new file, or "a" to add to the end of one.');
        }
        if (this.writers.has(name)) {
            throw runtimeError(`${name} is still open for writing, so it cannot be opened again yet.`, line,
                'Close it first, or write to it inside a with block, which closes it for you. Until then nothing has been saved.');
        }
        if (kind === 'r') {
            if (!this.files.has(name)) {
                throw tagged('FileNotFoundError', [`[Errno 2] No such file or directory: ${pyRepr(name)}`])(
                    `There is no file called ${pyRepr(name)}.`, line,
                    'Check the spelling of the name, or catch the error with except FileNotFoundError:');
            }
            return new PyFile(name, 'r', this.files.get(name));
        }
        // "w" empties the file the moment it is opened; "a" keeps what is there.
        if (kind === 'w' || !this.files.has(name)) this.files.set(name, '');
        this.writers.add(name);
        return new PyFile(name, kind, '');
    }

    closeFile(file) {
        if (file.closed) return;
        file.closed = true;
        if (file.mode !== 'r') {
            this.files.set(file.name, (this.files.get(file.name) ?? '') + file.pending);
            file.pending = '';
            this.writers.delete(file.name);
        }
    }

    assign(target, value, scope, line) {
        if (target.type === 'Name') { scope.set(target.id, value); return; }

        if (target.type === 'Index') {
            const container = this.evaluate(target.value, scope);
            const key = this.evaluate(target.index, scope);
            if (isList(container)) {
                let at = asIndex(key, line, 'A list position');
                if (at < 0) at += container.length;
                if (at < 0 || at >= container.length) throw indexError(at, container.length, line, "list assignment");
                container[at] = value;
                return;
            }
            if (isDict(container)) { container.set(dictKey(key, line), value); return; }
            if (isStr(container)) {
                throw runtimeError('Text cannot be changed one character at a time.', line,
                    'Build a new string instead, for example word = word[:i] + "x" + word[i+1:].');
            }
            throw runtimeError(`You cannot store into ${typeName(container)} with [ ].`, line);
        }

        if (target.type === 'Attribute') {
            const owner = this.evaluate(target.value, scope);
            if (isClass(owner) && owner.native) {
                throw runtimeError(`${owner.name} is Python's own class and cannot be changed.`, line,
                    `To add to it, write a class of your own that inherits from it: class MyError(${owner.name}):`);
            }
            if (isInstance(owner) || isClass(owner)) { owner.attrs.set(target.attr, value); return; }
            throw runtimeError(`Only an object can be given an attribute, and this is ${typeName(owner)}.`, line,
                `".${target.attr} = ..." stores a value ON an object, as in self.${target.attr} = ... inside a class.`);
        }

        if (target.type === 'TupleLit' || target.type === 'ListLit') {
            const parts = isTuple(value) ? value.items : isList(value) ? value : null;
            if (!parts) {
                throw runtimeError(`You are unpacking into ${target.elts.length} names, but the right ` +
                    `side is ${typeName(value)}.`, line);
            }
            if (parts.length !== target.elts.length) {
                throw runtimeError(
                    `You are unpacking into ${target.elts.length} names, but the right side has ${parts.length} values.`,
                    line);
            }
            target.elts.forEach((elt, i) => this.assign(elt, parts[i], scope, line));
            return;
        }

        throw runtimeError('The left side of = has to be a variable name.', line);
    }

    // ── Expressions ──

    evaluate(node, scope) {
        this.tick(node.line);
        switch (node.type) {
            case 'Num':   return node.value;
            case 'Str':   return node.value;
            case 'Const': return node.value;

            case 'Name': {
                const value = scope.lookup(node.id);
                if (value === UNBOUND) {
                    throw tagged("UnboundLocalError")(`"${node.id}" is used here before this function has given it a value.`, node.line,
                        `This function assigns to ${node.id} somewhere, and that makes ${node.id} the function's own ` +
                        `variable on every line of it — not the ${node.id} outside. To change an outside value, pass it ` +
                        `in and return the new one: ${node.id} = f(${node.id}, ...).`);
                }
                if (value !== undefined) return value;
                if (node.id in BUILTINS) return new Builtin(node.id, BUILTINS[node.id]);
                if (Object.hasOwn(this.exc, node.id)) return this.exc[node.id];
                throw this.nameError(node.id, scope, node.line);
            }

            case 'FString': {
                let out = '';
                for (const part of node.parts) {
                    if (part.kind === 'text') { out += part.value; continue; }
                    const value = this.evaluate(part.node, scope);
                    out += formatValue(isInstance(value) ? this.toText(value, node.line) : value, part.spec, node.line);
                }
                return out;
            }

            case 'ListLit':  return node.elts.map(e => this.evaluate(e, scope));
            case 'TupleLit': return new PyTuple(node.elts.map(e => this.evaluate(e, scope)));
            case 'DictLit': {
                const map = new Map();
                node.keys.forEach((k, i) => {
                    map.set(dictKey(this.evaluate(k, scope), node.line), this.evaluate(node.values[i], scope));
                });
                return map;
            }

            case 'BinOp':
                return binaryOp(node.op, this.evaluate(node.left, scope), this.evaluate(node.right, scope), node.line);

            case 'UnaryOp': {
                const v = this.evaluate(node.value, scope);
                if (!isNumeric(v)) throw runtimeError(`You cannot put a "${node.op}" in front of ${typeName(v)}.`, node.line);
                if (node.op === '+') return numValue(v);
                const n = numValue(v);
                return isInt(n) ? -n : -toJsNumber(n);
            }

            case 'IfExp':
                return truthy(this.evaluate(node.test, scope))
                    ? this.evaluate(node.body, scope)
                    : this.evaluate(node.orelse, scope);

            case 'Not': return !truthy(this.evaluate(node.value, scope));

            case 'BoolOp': {
                const left = this.evaluate(node.left, scope);
                if (node.op === 'and') return truthy(left) ? this.evaluate(node.right, scope) : left;
                return truthy(left) ? left : this.evaluate(node.right, scope);
            }

            case 'Compare': {
                // Chained comparisons: 0 <= x < 10 tests each link in turn. The value
                // is the last link's, or the first false one's (an __eq__ may return
                // something other than True or False, and == hands that back).
                let left = this.evaluate(node.left, scope);
                let result = true;
                for (let i = 0; i < node.ops.length; i++) {
                    const right = this.evaluate(node.comparators[i], scope);
                    result = compareOp(node.ops[i], left, right, node.line);
                    if (!truthy(result)) return result;
                    left = right;
                }
                return result;
            }

            case 'Index': {
                const container = this.evaluate(node.value, scope);
                const key = this.evaluate(node.index, scope);
                return this.subscript(container, key, node.line);
            }

            case 'Slice': {
                const container = this.evaluate(node.value, scope);
                const lower = node.lower ? this.evaluate(node.lower, scope) : null;
                const upper = node.upper ? this.evaluate(node.upper, scope) : null;
                const step  = node.step  ? this.evaluate(node.step,  scope) : null;
                return this.slice(container, lower, upper, step, node.line);
            }

            case 'Attribute': {
                const owner = this.evaluate(node.value, scope);
                if (isInstance(owner) || isClass(owner) || owner instanceof PySuper) return this.getAttribute(owner, node.attr, node.line);
                if (owner instanceof PyFile && ['name', 'mode', 'closed'].includes(node.attr)) return owner[node.attr];
                throw runtimeError(
                    `You wrote ".${node.attr}" without parentheses after it.`, node.line,
                    `A method only runs when you call it: .${node.attr}()`);
            }

            case 'Call':
                return this.evaluateCall(node, scope);

            default:
                throw runtimeError(`I do not know how to work out a ${node.type}.`, node.line);
        }
    }

    nameError(name, scope, line) {
        if (ABSENT.has(name)) return runtimeError(`"${name}" is not available here.`, line, ABSENT.get(name));
        // Inside a method, a bare name that the object DOES have is the forgotten self.
        const me = scope.lookup('self');
        if (isInstance(me) && (me.attrs.has(name) || me.cls.find(name) !== undefined)) {
            return tagged("NameError", [`name ${pyRepr(name)} is not defined`])(`The name "${name}" has not been given a value yet.`, line,
                `This object has a ${name}, but a method reaches it through self: write self.${name}.`);
        }
        const known = [...scope.names(), ...Object.keys(BUILTINS)];
        const guess = suggestName(name, known);
        return tagged("NameError", [`name ${pyRepr(name)} is not defined`])(`The name "${name}" has not been given a value yet.`, line,
            guess ? `Did you mean "${guess}"?`
                  : 'Check the spelling, and make sure it is created above the line that uses it.');
    }

    subscript(container, key, line) {
        if (isDict(container)) {
            const hit = dictGet(container, key, line);
            if (hit === undefined) {
                throw tagged("KeyError", [key])(`The dictionary has no key ${pyRepr(key)}.`, line,
                    'Use .get(key) when the key might be missing, or check "if key in d:" first.');
            }
            return hit;
        }
        const seq = isStr(container) ? container
            : isList(container) ? container
            : isTuple(container) ? container.items
            : null;
        if (seq === null) {
            if (isRange(container)) {
                let at = asIndex(key, line);
                const n = Number(container.length);
                if (at < 0) at += n;
                if (at < 0 || at >= n) throw indexError(at, n, line, "range object");
                return container.at(BigInt(at));
            }
            throw typeError(`You cannot use [ ] on ${typeName(container)}.`, line,
                isNumeric(container) ? 'Square brackets pick an item out of a list or a string.' : null);
        }
        let at = asIndex(key, line);
        if (at < 0) at += seq.length;
        if (at < 0 || at >= seq.length) throw indexError(asIndex(key, line), seq.length, line, isStr(container) ? "string" : isList(container) ? "list" : "tuple");
        return seq[at];
    }

    slice(container, lower, upper, step, line) {
        const isText = isStr(container);
        const seq = isText ? [...container]
            : isList(container) ? container
            : isTuple(container) ? container.items
            : isRange(container) ? [...container]
            : null;
        if (seq === null) throw runtimeError(`You cannot take a slice of ${typeName(container)}.`, line);

        const n = seq.length;
        const stepN = step === null ? 1 : asIndex(step, line, 'A slice step');
        if (stepN === 0) throw runtimeError('A slice step cannot be 0.', line);

        const clamp = (v, dflt) => {
            if (v === null) return dflt;
            let k = asIndex(v, line, 'A slice position');
            if (k < 0) k += n;
            return Math.max(0, Math.min(k, n));
        };
        const out = [];
        if (stepN > 0) {
            const start = clamp(lower, 0);
            const stop = clamp(upper, n);
            for (let k = start; k < stop; k += stepN) out.push(seq[k]);
        } else {
            const start = lower === null ? n - 1 : Math.min(clamp(lower, n - 1), n - 1);
            const stop = upper === null ? -1 : clamp(upper, -1);
            for (let k = start; k > stop; k += stepN) if (k >= 0 && k < n) out.push(seq[k]);
        }
        if (isText) return out.join('');
        if (isTuple(container)) return new PyTuple(out);
        return out;
    }

    evaluateCall(node, scope) {
        const args = node.args.map(a => this.evaluate(a, scope));
        const kw = {};
        for (const k of node.keywords) kw[k.name] = this.evaluate(k.value, scope);

        // super(): the running method's object, to be looked up from the parent
        // of the class that method was written in.
        if (node.func.type === 'Name' && node.func.id === 'super' && !scope.has('super')) {
            if (args.length || node.keywords.length) {
                throw runtimeError('Write super() with empty parentheses.', node.line,
                    'Python works out the class and the object for itself: super().__init__(...)');
            }
            const frame = this.frames[this.frames.length - 1];
            if (!frame || !frame.func.owner || frame.self === undefined) {
                throw runtimeError('super() only works inside a method of a class.', node.line,
                    'It means "the parent of the class this method is written in".');
            }
            return new PySuper(frame.self, frame.func.owner);
        }

        // Method call: the only place a `.name` is legal.
        if (node.func.type === 'Attribute') {
            const self = this.evaluate(node.func.value, scope);
            return this.callMethod(self, node.func.attr, args, kw, node.line);
        }

        const target = this.evaluate(node.func, scope);
        if (!isCallable(target)) {
            const label = node.func.type === 'Name' ? `"${node.func.id}"` : 'this';
            throw runtimeError(`${label} is ${typeName(target)}, not a function, so it cannot be called.`, node.line,
                isList(target) || isStr(target)
                    ? 'To pick out an item use square brackets, items[0], not round ones.'
                    : null);
        }
        return this.callValue(target, args, node.line, kw);
    }

    /** `obj.name`: the object's own attributes first, then its class's, then each parent's in turn. */
    getAttribute(owner, name, line) {
        if (owner instanceof PySuper) return this.superAttribute(owner, name, line);
        if (isInstance(owner)) {
            if (owner.attrs.has(name)) return owner.attrs.get(name);
            const found = owner.cls.find(name);
            if (found !== undefined) return found instanceof PyFunction ? new PyBoundMethod(owner, found) : found;
            if (name === 'args' && isExc(owner)) return new PyTuple(excArgsOf(owner, line).slice());
            const known = [...owner.attrs.keys(), ...owner.cls.names()];
            const guess = suggestName(name, known);
            // The __init__ that ran belongs to a class whose parent has one too:
            // the usual reason an inherited attribute is missing.
            const ran = owner.cls.find('__init__');
            const skipped = ran instanceof PyFunction && ran.owner?.base?.find('__init__') instanceof PyFunction;
            throw tagged("AttributeError", [`${pyRepr(owner.cls.name)} object has no attribute ${pyRepr(name)}`])(`This ${owner.cls.name} object has no attribute called "${name}".`, line,
                guess ? `Did you mean "${guess}"?`
                : skipped ? `If the parent class stores ${name} in its __init__, that __init__ has to be run: ` +
                            `call super().__init__(...) inside ${ran.owner.name}'s __init__.`
                : `An attribute exists only once something has been stored in it, usually in __init__: self.${name} = ...`);
        }
        const found = owner.find(name);
        if (found !== undefined) return found;
        const guess = suggestName(name, owner.names());
        throw tagged("AttributeError", [`type object ${pyRepr(owner.name)} has no attribute ${pyRepr(name)}`])(`The class ${owner.name} has no attribute called "${name}".`, line,
            guess ? `Did you mean "${guess}"?` : null);
    }

    /** `super().name`: the lookup starts at the PARENT of the class the running method was written in. */
    superAttribute(sup, name, line) {
        const parent = sup.owner.base;
        const found = parent ? parent.find(name) : undefined;
        if (found !== undefined) return found instanceof PyFunction ? new PyBoundMethod(sup.self, found) : found;
        if (name === '__init__' && isExc(sup.self)) {
            // Python's own Exception.__init__: keep the values as the error's args.
            return new Builtin('__init__', (args, kw, at) => {
                if (Object.keys(kw).length) throw typeError(`${sup.self.cls.name}'s parent __init__ takes no keyword arguments.`, at);
                sup.self.excArgs = args.slice();
                return null;
            });
        }
        if (name === '__init__') {
            // No class above has an __init__, so there is nothing to set up, as in Python.
            return new Builtin('__init__', (args, kw, at) => {
                if (args.length || Object.keys(kw).length) {
                    throw typeError(parent
                        ? `super().__init__() takes no values here, because ${parent.name} has no __init__ to receive them.`
                        : `super().__init__() takes no values here, because ${sup.owner.name} has no parent class.`, at);
                }
                return null;
            });
        }
        if (!parent) {
            throw runtimeError(`${sup.owner.name} has no parent class, so super() has nowhere to look for "${name}".`, line,
                `Name a parent on the class line: class ${sup.owner.name}(Parent):`);
        }
        const guess = suggestName(name, parent.names());
        throw runtimeError(`The parent class ${parent.name} has nothing called "${name}".`, line,
            guess ? `Did you mean "${guess}"?` : null);
    }

    /** What print(), str() and f-strings show: an object's own __str__ if its class has one. */
    toText(value, line) {
        if (!isInstance(value)) return pyStr(value);
        // An exception with no __str__ of its own shows what it was made with, never its repr.
        const describe = value.cls.find('__str__') ?? (isExc(value) ? undefined : value.cls.find('__repr__'));
        if (!(describe instanceof PyFunction)) return isExc(value) ? excStr(value, line) : pyRepr(value);
        const text = this.callValue(new PyBoundMethod(value, describe), [], line);
        if (!isStr(text)) {
            throw runtimeError(`${describe.name} has to return text, but this one returned ${typeName(text)}.`, line,
                'Build the text with an f-string and return it.');
        }
        return text;
    }

    callMethod(self, name, args, kw, line) {
        if (self instanceof PySuper) {
            return this.callValue(this.superAttribute(self, name, line), args, line, kw);
        }
        if (isInstance(self) || isClass(self)) {
            const cls = isInstance(self) ? self.cls : self;
            const has = (isInstance(self) && self.attrs.has(name)) || cls.find(name) !== undefined;
            if (!has) {
                const methods = cls.names().filter(k => cls.find(k) instanceof PyFunction);
                const guess = suggestName(name, methods);
                throw tagged("AttributeError")(`${isInstance(self) ? `This ${cls.name} object` : `The class ${cls.name}`} has no method called ".${name}()".`, line,
                    guess ? `Did you mean ".${guess}()"?` : null);
            }
            const target = this.getAttribute(self, name, line);
            if (!isCallable(target)) {
                throw runtimeError(`"${name}" is ${typeName(target)}, not a method, so it cannot be called.`, line,
                    `Read it without parentheses: .${name}`);
            }
            return this.callValue(target, args, line, kw);
        }

        const table = isStr(self) ? STRING_METHODS
            : isList(self) ? LIST_METHODS
            : isDict(self) ? DICT_METHODS
            : self instanceof PyFile ? FILE_METHODS
            : null;
        if (table && name in table) return table[name](self, args, line, this, kw);

        if (table) {
            const guess = suggestName(name, Object.keys(table));
            throw tagged("AttributeError")(`${capitalize(typeName(self))} has no method called ".${name}()".`, line,
                guess ? `Did you mean ".${guess}()"?` : null);
        }
        if (isTuple(self)) {
            // A tuple has the two list methods that only read.
            if (name === 'count' || name === 'index') return LIST_METHODS[name](self.items, args, line, this, kw);
            if (name in LIST_METHODS) {
                throw runtimeError(`Tuples cannot be changed, so they have no ".${name}()".`, line,
                    'Turn it into a list first with list(...) if you need to change it.');
            }
            throw tagged("AttributeError")(`A tuple has no method called ".${name}()".`, line);
        }
        const noun = typeName(self);
        throw tagged("AttributeError")(`${capitalize(noun)} has no methods, so ".${name}()" does not exist.`, line,
            isNumeric(self) && (name in STRING_METHODS)
                ? `.${name}() is a text method. Turn the number into text first with str(n).`
                : null);
    }

    /** Call a function value with already-evaluated arguments. */
    callValue(target, args, line, kw = {}, label = null) {
        if (target instanceof Builtin) return target.fn(args, kw, line, this);

        if (target instanceof PyClass) {
            const object = new PyInstance(target);
            // An exception remembers what it was made with, whatever its __init__ goes on to do.
            if (target.exception) object.excArgs = args.slice();
            const init = target.find('__init__');
            if (init instanceof PyFunction) {
                const result = this.callValue(new PyBoundMethod(object, init), args, line, kw, `${target.name}`);
                if (result !== null) {
                    throw runtimeError('__init__ should not return a value.', line,
                        'Its job is to store attributes on self. The new object is handed back for you.');
                }
            } else if (target.exception) {
                if (Object.keys(kw).length) throw typeError(`${target.name}() takes no keyword arguments.`, line);
            } else if (args.length || Object.keys(kw).length) {
                throw typeError(`${target.name}() takes no values, because the class has no __init__ to receive them.`, line,
                    'Add def __init__(self, ...): to the class and store the values on self.');
            }
            return object;
        }

        // A bound method supplies its object as the first argument. `hidden` keeps
        // that argument out of every count a student reads: they wrote one value
        // in the parentheses, so that is the number the message must use.
        let hidden = 0;
        if (target instanceof PyBoundMethod) {
            const func = target.func;
            if (func.params.length === 0) {
                throw runtimeError(`${func.name}() is a method, so its first parameter has to be self.`, line,
                    `Write def ${func.name}(self): — Python hands the object in there automatically.`);
            }
            args = [target.self, ...args];
            hidden = 1;
            target = func;
        }
        if (!(target instanceof PyFunction)) {
            throw runtimeError(`${capitalize(typeName(target))} cannot be called like a function.`, line);
        }
        label = label ?? target.name;

        if (++this.depth > this.depthLimit) {
            this.depth--;
            // An override that says self.describe() where super().describe() was
            // meant finds itself again: the commonest way a method never stops.
            const overrides = target.owner?.base?.find(target.name) instanceof PyFunction;
            throw limitError(`"${target.name}" called itself more than ${this.depthLimit} times without stopping.`,
                overrides
                    ? `Inside ${target.owner.name}, self.${target.name}() runs this same method again. To run the parent's version, write super().${target.name}().`
                    : 'A function that calls itself needs a base case that returns without calling again.');
        }
        // Test harnesses call functions directly, outside run().
        const previous = ACTIVE;
        ACTIVE = this;
        // super() asks which method is running, and on which object.
        this.frames.push({ func: target, self: args.length ? args[0] : undefined });
        try {
            const scope = new Scope(target.scope, target.locals);
            const params = target.params;
            if (args.length > params.length) {
                const takes = params.length - hidden;
                throw typeError(
                    `${label}() takes ${takes} value${takes === 1 ? '' : 's'}, ` +
                    `but you gave it ${args.length - hidden}.`, line);
            }
            params.forEach((p, i) => {
                if (i < args.length) { scope.set(p.name, args[i]); return; }
                if (p.name in kw) { scope.set(p.name, kw[p.name]); return; }
                if (p.default !== null) { scope.set(p.name, p.ready ? p.value : this.evaluate(p.default, target.scope)); return; }
                throw typeError(`${label}() is missing a value for "${p.name}".`, line,
                    p.name === 'self' && target.owner
                        ? `Call it on an object rather than on the class: thing = ${target.owner.name}(...) and then thing.${target.name}(...)`
                        : null);
            });
            for (const key of Object.keys(kw)) {
                if (!params.some(p => p.name === key)) {
                    throw typeError(`${label}() has no parameter called "${key}".`, line);
                }
            }
            try {
                this.execBlock(target.body, scope);
            } catch (e) {
                if (e instanceof ReturnSignal) return e.value;
                if (e === BREAK || e === CONTINUE) {
                    throw runtimeError('"break" and "continue" only work inside a loop.', line);
                }
                throw previous === this ? e : asLimit(e);
            }
            return null;      // fell off the end: Python returns None
        } finally {
            this.frames.pop();
            this.depth--;
            ACTIVE = previous;
        }
    }
}

const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);

function formatValue(value, spec, line) {
    if (!spec) return pyStr(value);
    const places = /\.(\d+)f/.exec(spec);
    if (places) {
        if (!isNumeric(value)) {
            throw runtimeError(`The format ":${spec}" only works on numbers, not ${typeName(value)}.`, line);
        }
        const fixed = fixedPoint(toJsNumber(numValue(value)), Number(places[1]));
        return spec.startsWith(',') ? groupThousands(fixed) : fixed;
    }
    if (spec === ',') {
        if (!isNumeric(value)) {
            throw runtimeError('The format ":," only works on numbers.', line);
        }
        return groupThousands(pyStr(numValue(value)));
    }
    return pyStr(value);
}

/**
 * Python's f"{x:.Nf}". JavaScript's toFixed agrees except on an exact tie, which
 * it rounds up where Python rounds to the even digit: f"{82.5:.0f}" is "82", and
 * an average of two whole marks lands on .5 all the time. So this works from the
 * float's exact binary value — a finite fraction m / 2^k — in whole numbers.
 * The sign is kept even when the digits round to zero, as Python keeps it.
 */
function fixedPoint(x, digits) {
    if (Number.isNaN(x)) return 'nan';
    if (!Number.isFinite(x)) return x > 0 ? 'inf' : '-inf';
    const negative = x < 0 || Object.is(x, -0);
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, Math.abs(x));
    const bits = view.getBigUint64(0);
    const exponent = Number((bits >> 52n) & 0x7ffn);
    const fraction = bits & ((1n << 52n) - 1n);
    // |x| = mantissa * 2^power exactly.
    const mantissa = exponent === 0 ? fraction : fraction | (1n << 52n);
    const power = (exponent === 0 ? -1074 : exponent - 1075);
    const scale = 10n ** BigInt(digits);
    let units;
    if (power >= 0) {
        units = (mantissa << BigInt(power)) * scale;
    } else {
        const numerator = mantissa * scale;
        const denominator = 1n << BigInt(-power);
        units = numerator / denominator;
        const twice = (numerator % denominator) * 2n;
        if (twice > denominator || (twice === denominator && units % 2n === 1n)) units += 1n;
    }
    let text = units.toString().padStart(digits + 1, '0');
    if (digits > 0) text = `${text.slice(0, -digits)}.${text.slice(-digits)}`;
    return (negative ? '-' : '') + text;
}

function groupThousands(text) {
    const [whole, frac] = text.split('.');
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return frac === undefined ? grouped : `${grouped}.${frac}`;
}

// ─── CodingBat-style harness ─────────────────────────────────────────────────
//
// A problem gives a signature and a table of calls; the student writes the body.
// Everything below assembles the two into one program, runs each call in its own
// fresh interpreter (so one test cannot leave state behind for the next), and
// reports a row per call.

/** JSON from a question file → a Python value. */
export function fromJson(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') {
        return Number.isInteger(value) ? BigInt(value) : value;
    }
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(fromJson);
    if (typeof value === 'object') {
        // Escape hatches, because JSON cannot tell 5 from 5.0 and has no tuples.
        if ('__float' in value) return Number(value.__float);
        if ('__tuple' in value) return new PyTuple(value.__tuple.map(fromJson));
        const map = new Map();
        for (const [k, v] of Object.entries(value)) map.set(k, fromJson(v));
        return map;
    }
    return null;
}

/** `def make_bricks(small, big, goal):` → { name, params }. */
export function parseSignature(signature) {
    const m = /^\s*def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*:\s*$/.exec(String(signature || ''));
    if (!m) {
        throw syntaxError(`"${signature}" is not a function definition line.`, 1,
            'A signature looks like: def add(a, b):');
    }
    const params = m[2].split(',').map(p => p.trim().split('=')[0].trim()).filter(Boolean);
    return { name: m[1], params };
}

const TAB_AS_SPACES = ' '.repeat(TAB_WIDTH);

/**
 * Put the student's body under the given signature.
 *
 * The box they type in holds a body, so both of the natural things to type work:
 * flush against the left margin, or already indented one level. Whatever the
 * shallowest line is becomes the new one-level indent and the rest keep their
 * shape relative to it. A student who pastes a whole `def` instead gets their
 * text run as written rather than an error about indentation.
 *
 * Returns { source, lineOffset } where lineOffset is how many lines were added
 * above the student's first line, so error messages can count in their lines.
 */
export function assembleFunction(signature, body) {
    const raw = String(body ?? '').replace(/\r\n?/g, '\n');
    const lines = raw.split('\n').map(l => l.replace(/\t/g, TAB_AS_SPACES));
    const codeLines = lines.filter(l => l.trim().length > 0);

    if (codeLines.length === 0) {
        throw syntaxError('You have not written any code yet.', 1,
            'Write the lines that work out the answer, and end with a return.');
    }

    const indents = codeLines.map(l => l.length - l.trimStart().length);
    const base = Math.min(...indents);

    // A whole function was pasted — run it as its own program. That is so when
    // the function the problem asks for is defined at the outer level of what was
    // typed, or when there is nothing at the outer level BUT defs (a paste under
    // the wrong name, which then gets told which name was wanted). A body that
    // merely opens with a def and goes on to other statements has a helper in it
    // (a key function for sorted, say), and is assembled like any other body.
    const name = /^\s*def\s+([A-Za-z_]\w*)/.exec(String(signature))?.[1];
    const definesIt = new RegExp(`^def\\s+${name}\\s*\\(`);
    const outer = codeLines.filter((l, i) => indents[i] === base && !l.trimStart().startsWith('#')).map(l => l.trimStart());
    if (outer.length > 0 && (outer.every(l => /^def\s/.test(l)) || (name && outer.some(l => definesIt.test(l))))) {
        return { source: lines.join('\n'), lineOffset: 0, pasted: true };
    }

    const shifted = lines.map(l => (l.trim().length === 0 ? '' : TAB_AS_SPACES + l.slice(base)));
    return { source: `${String(signature).trim()}\n${shifted.join('\n')}\n`, lineOffset: 1, pasted: false };
}

/** How a call is written out for the results table: `make_bricks(3, 1, 8)`. */
export function describeCall(name, args) {
    return `${name}(${args.map(pyRepr).join(', ')})`;
}

function reportError(err, lineOffset) {
    const line = err.line === null || err.line === undefined ? null : Math.max(1, err.line - lineOffset);
    return { message: err.message, hint: err.hint ?? null, line, kind: err.kind ?? 'runtime' };
}

const TOTAL_RUN_MS = 5000;

/**
 * Run one problem's test table against a student's body.
 *
 * Returns:
 *   { ok, error, results, passed, total, printedOnly }
 * where `error` is set only when nothing could run at all (a syntax error, or a
 * missing function). A test that blows up mid-run is reported on its own row,
 * so a student sees which case broke and how far the rest got.
 */
export function runTestCases({ signature, body, tests, files = null, limits = {}, now = () => Date.now() }) {
    const cases = Array.isArray(tests) ? tests : [];
    let assembled;
    try {
        assembled = assembleFunction(signature, body);
    } catch (err) {
        if (err instanceof PyError) return failed(reportError(err, 0), cases);
        throw err;
    }
    const { source, lineOffset } = assembled;
    const { name } = parseSignature(signature);

    let ast;
    try {
        ast = parse(source);
    } catch (err) {
        if (err instanceof PyError) return failed(reportError(err, lineOffset), cases);
        throw err;
    }

    const results = [];
    let anyReturned = false;
    let anyPrinted = false;
    const startedAt = now();

    for (const testCase of cases) {
        const args = (testCase.args || []).map(fromJson);
        const expected = fromJson(testCase.expect);
        const call = describeCall(name, args);
        const row = {
            call,
            expectedRepr: pyRepr(expected),
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

        const interp = new Interpreter({ ...limits, lineOffset, now });
        giveFiles(interp, files);
        try {
            interp.run(ast);
            const fn = interp.globals.lookup(name);
            if (fn === undefined) {
                return failed({
                    message: `I could not find a function called ${name}().`,
                    hint: assembled.pasted
                        ? `The problem needs a function named exactly ${name}.`
                        : 'Write the body only — the def line is provided above the box.',
                    line: null,
                    kind: 'syntax',
                }, cases);
            }
            const value = interp.callValue(fn, args, 1);
            row.actualRepr = pyRepr(value);
            row.passed = pyEquals(value, expected);
            if (value !== null) anyReturned = true;
        } catch (err) {
            if (!(err instanceof PyError)) throw err;
            row.error = reportError(err, lineOffset);
        }
        row.output = interp.outputLines();
        if (interp.printed) anyPrinted = true;
        results.push(row);
    }

    return {
        ok: true,
        error: null,
        results,
        passed: results.filter(r => r.passed).length,
        total: results.length,
        // The single most common first submission: printing the answer instead
        // of returning it. Worth naming, because every row looks wrong otherwise.
        printedOnly: anyPrinted && !anyReturned && results.length > 0,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Class problems
// ─────────────────────────────────────────────────────────────────────────────
//
// A function problem can be graded by calling the function: arguments in, value
// out. An object cannot. What a method DOES is only visible afterwards — in an
// attribute, in what a later call returns — so a class problem's test is a short
// script followed by an expression to look at:
//
//     { "run": "p = Purse()\np.add(5)\np.add(2)", "check": "p.coins", "expect": 7 }
//
// Two shapes of problem use this:
//   • write ONE METHOD: the question supplies `scaffold` (the class so far, read
//     only) and `signature` is the method's def line; the student writes its body;
//   • write A WHOLE CLASS: no scaffold, and `signature` is the `class Name:` line.

/** True for a problem graded by scripts rather than by calling one function. */
export function isScriptProblem(question) {
    return Array.isArray(question?.tests) && question.tests.some(t => t && (typeof t.check === 'string' || typeof t.raises === 'string'));
}

const indentBy = (lines, base, by) =>
    lines.map(l => (l.trim().length === 0 ? '' : ' '.repeat(by) + l.slice(base)));

/**
 * Put the student's text where it belongs. As with function problems, both
 * natural things to type are accepted: just the body, or the whole thing pasted
 * in with its header line.
 */
export function assembleProblem({ scaffold, signature, body }) {
    const raw = String(body ?? '').replace(/\r\n?/g, '\n');
    const lines = raw.split('\n').map(l => l.replace(/\t/g, TAB_AS_SPACES));
    const codeLines = lines.filter(l => l.trim().length > 0);
    if (codeLines.length === 0) {
        throw syntaxError('You have not written any code yet.', 1,
            scaffold ? 'Write the lines that make the method do its job.'
                     : 'Write the methods the class needs, starting with def __init__(self, ...):');
    }
    const base = Math.min(...codeLines.map(l => l.length - l.trimStart().length));
    const first = codeLines[0].trimStart();
    const header = String(signature ?? '').trim();

    const top = scaffold ? String(scaffold).replace(/\r\n?/g, '\n').replace(/\n+$/, '') : '';
    const above = top.split('\n').length;

    // A whole class to write, with finished classes given above it (the parent
    // of a subclass, say): those come first, then the student's class.
    if (scaffold && /^class\s/.test(header)) {
        if (/^class\s/.test(first)) return { source: `${top}\n\n${lines.join('\n')}\n`, lineOffset: above + 1, pasted: true };
        return { source: `${top}\n\n${header}\n${indentBy(lines, base, 4).join('\n')}\n`, lineOffset: above + 2, pasted: false };
    }

    // A whole class pasted in: run it as written.
    if (/^class\s/.test(first)) return { source: lines.join('\n') + '\n', lineOffset: 0, pasted: true };

    if (scaffold) {
        if (/^def\s/.test(first)) {
            // The method pasted with its def line: it goes inside the class as it is.
            return { source: `${top}\n${indentBy(lines, base, 4).join('\n')}\n`, lineOffset: above, pasted: true };
        }
        return { source: `${top}\n    ${header}\n${indentBy(lines, base, 8).join('\n')}\n`, lineOffset: above + 1, pasted: false };
    }
    return { source: `${header}\n${indentBy(lines, base, 4).join('\n')}\n`, lineOffset: 1, pasted: false };
}

/** What the student is shown above the box: the class so far, and the line they are completing. */
export function problemHeader(question) {
    const header = String(question?.signature ?? '').trim();
    if (!question?.scaffold) return header;
    const top = String(question.scaffold).replace(/\r\n?/g, '\n').replace(/\n+$/, '');
    // A class line stands on its own, below the finished classes it builds on.
    return /^class\s/.test(header) ? `${top}\n\n${header}` : `${top}\n    ${header}`;
}

// Lines of a test script are numbered from here, so an error can be told apart
// from one in the student's own code — whose line numbers they need to see.
const SCRIPT_LINE_BASE = 100000;

function shiftLines(node, by) {
    if (Array.isArray(node)) { node.forEach(n => shiftLines(n, by)); return; }
    if (!node || typeof node !== 'object') return;
    if (typeof node.line === 'number') node.line += by;
    for (const value of Object.values(node)) if (value && typeof value === 'object') shiftLines(value, by);
}

function parseScript(text) {
    const ast = parse(String(text ?? '').replace(/\r\n?/g, '\n') + '\n');
    shiftLines(ast, SCRIPT_LINE_BASE);
    return ast;
}

/** `p = Purse(); p.add(5)  →  p.coins` — how a script test is written out in the results table. */
export function describeScript(testCase) {
    const steps = String(testCase.run ?? '').split('\n').map(l => l.trim()).filter(Boolean);
    const all = typeof testCase.check === 'string' ? [...steps, testCase.check] : steps;
    // A line that opens a block (try:, except ValueError:) reads on into the line under it.
    return all.map((step, i) => (i === all.length - 1 ? step : step + (step.endsWith(':') ? ' ' : '; '))).join('');
}

/** `raises ValueError: too young` — what a test that expects an error is looking for. */
export function describeRaises(testCase) {
    return `raises ${testCase.raises}${typeof testCase.message === 'string' ? `: ${testCase.message}` : ''}`;
}

/**
 * A test that passes when its steps END IN the named error (or a kind of it):
 *     { "run": "check_age(5)", "raises": "ValueError", "message": "too young" }
 * `message`, when given, is what str() of the error must be.
 */
function runRaisesCase(interp, testCase, row) {
    row.expectedRepr = describeRaises(testCase);
    try {
        interp.execBlock(parseScript(testCase.run).body, interp.globals);
    } catch (err) {
        if (!(err instanceof PyError)) throw err;
        const wanted = interp.globals.lookup(testCase.raises) ?? interp.exc[testCase.raises];
        const cls = err.kind !== 'runtime' ? null : err.exc ? err.exc.cls : interp.exc[err.pyType] ?? null;
        if (!cls || !(wanted instanceof PyClass) || !cls.isKindOf(wanted)) throw err;
        let text = null;
        try { text = interp.toText(interp.excObject(err), null); } catch (_) { /* wording not reproduced */ }
        row.actualRepr = `raises ${cls.name}${text ? `: ${text}` : ''}`;
        row.passed = typeof testCase.message !== 'string' || text === testCase.message;
        return;
    }
    row.actualRepr = 'no error';
}

/**
 * Run a class problem's tests. Returns the same shape as runTestCases, so the
 * results table and the grading treat the two kinds of problem alike.
 */
export function runScriptCases({ scaffold = null, signature, body, tests, files = null, limits = {}, now = () => Date.now() }) {
    const cases = Array.isArray(tests) ? tests : [];
    let assembled;
    try {
        assembled = assembleProblem({ scaffold, signature, body });
    } catch (err) {
        if (err instanceof PyError) return failed(reportError(err, 0), cases);
        throw err;
    }
    const { source, lineOffset } = assembled;

    let ast;
    try {
        ast = parse(source);
    } catch (err) {
        if (err instanceof PyError) return failed(reportError(err, lineOffset), cases);
        throw err;
    }

    const results = [];
    const startedAt = now();
    for (const testCase of cases) {
        const expected = fromJson(testCase.expect ?? null);
        const row = { call: describeScript(testCase), expectedRepr: pyRepr(expected), actualRepr: null, passed: false, output: [], error: null };
        if (now() - startedAt > TOTAL_RUN_MS) {
            row.error = { message: 'This run was stopped — the earlier tests took too long.', hint: null, line: null, kind: 'limit' };
            results.push(row);
            continue;
        }
        const interp = new Interpreter({ ...limits, lineOffset, now });
        giveFiles(interp, files);
        try {
            interp.run(ast);
            if (typeof testCase.raises === 'string') {
                runRaisesCase(interp, testCase, row);
            } else {
                if (testCase.run) interp.execBlock(parseScript(testCase.run).body, interp.globals);
                const check = parseScript(testCase.check).body[0];
                const value = interp.evaluate(check.expr, interp.globals);
                row.actualRepr = pyRepr(value);
                row.passed = pyEquals(value, expected);
            }
        } catch (err) {
            if (!(err instanceof PyError)) throw err;
            if (typeof err.line === 'number' && err.line >= SCRIPT_LINE_BASE) {
                // It went wrong in the TEST's line, not in a line the student wrote:
                // usually a method that is missing or misnamed. Say what the test
                // was doing; a line number here would point at nothing they can see.
                row.error = { message: err.message, hint: err.hint ?? null, line: null, kind: err.kind ?? 'runtime' };
            } else {
                row.error = reportError(err, lineOffset);
            }
        }
        row.output = interp.outputLines();
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

/** Every test starts from the same files: the ones the problem supplies, untouched by the test before. */
function giveFiles(interp, files) {
    for (const [name, text] of Object.entries(files ?? {})) interp.files.set(name, String(text));
}

/** Run whichever kind of problem this is. Everything that grades a code_write goes through here. */
export function runProblem(question, body, options = {}) {
    if (isScriptProblem(question)) {
        return runScriptCases({ scaffold: question.scaffold ?? null, signature: question.signature, body, tests: question.tests, files: question.files ?? null, ...options });
    }
    return runTestCases({ signature: question.signature, body, tests: question.tests, files: question.files ?? null, ...options });
}

function failed(error, cases) {
    return {
        ok: false,
        error,
        results: cases.map(() => null),
        passed: 0,
        total: cases.length,
        printedOnly: false,
    };
}
