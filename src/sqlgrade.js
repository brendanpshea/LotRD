/**
 * sqlgrade.js — grading a query a student wrote.
 *
 * A write-the-query problem (`sql_write`) gives a task and a reference query.
 * The student's query is right when it returns the same rows as the reference.
 * Not on the tables they can see alone: a database file holds several datasets,
 * the first is shown and the rest are not, and a query has to agree with the
 * reference on all of them. That is what stops `WHERE name IN ('Gumdrop', ...)`
 * — the visible answer, typed back — from passing, and it is why the hidden
 * datasets carry the edge cases (a value exactly on the boundary, a candy with
 * no batches) that the visible one does not.
 *
 * The engine is real SQLite. This file never runs SQL itself: it is handed
 * `run(setupSql, query)`, which builds a fresh database and answers with
 * { columns, values } or throws. In the browser that is a background worker,
 * so a query that never ends can be stopped (src/sqlengine.js); in the tests it
 * is the same engine in-process (tests/helpers/sqlite.js). Everything here is
 * therefore plain logic, and tested as such.
 */

// ─── Building the tables ─────────────────────────────────────────────────────

const quoteName = name => `"${String(name).replace(/"/g, '""')}"`;

function literal(value) {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
    if (typeof value === 'boolean') return value ? '1' : '0';
    return `'${String(value).replace(/'/g, "''")}'`;
}

/** The SQL that creates a database file's tables and fills them with one dataset's rows. */
export function setupSql(database, dataset) {
    const out = [];
    for (const table of database.tables) {
        const columns = table.columns.map(([name, type]) => `${quoteName(name)} ${type}`).join(', ');
        out.push(`CREATE TABLE ${quoteName(table.name)} (${columns});`);
        for (const row of (dataset.rows?.[table.name] ?? [])) {
            out.push(`INSERT INTO ${quoteName(table.name)} VALUES (${row.map(literal).join(', ')});`);
        }
    }
    return out.join('\n');
}

/**
 * The tables a problem shows, with the rows of the first dataset — the only rows
 * a student ever sees. `names` picks and orders them; without it, every table.
 */
export function describeTables(database, names = null) {
    const wanted = names && names.length ? names : database.tables.map(t => t.name);
    const shown = database.datasets[0];
    return wanted.map(name => {
        const table = database.tables.find(t => t.name === name);
        if (!table) throw new Error(`The database "${database.name}" has no table called "${name}".`);
        return { name, columns: table.columns.map(c => c[0]), rows: shown.rows?.[name] ?? [] };
    });
}

// ─── What the box will run ───────────────────────────────────────────────────

/** The query with comments and the insides of quoted text blanked out, so keywords can be looked for. */
function skeleton(text) {
    return String(text ?? '')
        .replace(/--[^\n]*/g, ' ')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/'(?:[^']|'')*'/g, "''")
        .replace(/"(?:[^"]|"")*"/g, '""');
}

/**
 * Only a single SELECT is run. Returns null when the text is one, or
 * { message, hint } saying why it is not. The tables are rebuilt for every run,
 * so a DELETE could do no harm — but a problem that asks a question should not
 * be answered by a statement that changes the data, and saying so plainly is
 * kinder than a result that makes no sense.
 */
export function checkStatement(text) {
    const bare = skeleton(text).trim();
    if (!bare) {
        return { message: 'Write a query first.', hint: 'A query starts with SELECT and names a table after FROM.' };
    }
    const [first, ...rest] = bare.split(';');
    if (rest.some(part => part.trim().length > 0)) {
        return { message: 'Run one query at a time.', hint: 'There is more SQL after the first semicolon. Keep the one query that answers the question.' };
    }
    const keyword = (/^[A-Za-z]+/.exec(first.trim()) || [''])[0].toUpperCase();
    if (keyword !== 'SELECT' && keyword !== 'WITH') {
        // SELCT, SELECTT, SLECT: a slip of the fingers, not a different statement.
        if (keyword.length >= 4 && editDistance(keyword, 'SELECT') <= 2 && keyword !== 'DELETE') {
            return { message: `The query has to start with SELECT, and yours starts with ${keyword}.`, hint: `${keyword} looks like a misspelling of SELECT.` };
        }
        return {
            message: keyword
                ? `This box runs SELECT queries only, and yours starts with ${keyword}.`
                : 'This box runs SELECT queries only.',
            hint: 'These problems ask questions of the tables; they never change them. Start with SELECT.',
        };
    }
    return null;
}

// ─── Saying what went wrong ──────────────────────────────────────────────────

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

function closest(name, candidates) {
    let best = null, bestScore = Infinity;
    for (const c of candidates) {
        const d = editDistance(name.toLowerCase(), c.toLowerCase());
        const within = c.toLowerCase().includes(name.toLowerCase()) ? 0 : d;
        if (within < bestScore) { bestScore = within; best = c; }
    }
    return bestScore <= Math.max(2, Math.floor(name.length / 2)) ? best : null;
}

const CLAUSE_ORDER = 'The clauses go in this order: SELECT … FROM … WHERE … GROUP BY … ORDER BY.';

const KEYWORDS = ['SELECT', 'FROM', 'WHERE', 'GROUP', 'ORDER', 'JOIN', 'HAVING', 'DISTINCT', 'LIMIT',
    'INNER', 'LEFT', 'DESC', 'COUNT', 'BETWEEN', 'LIKE', 'NULL', 'AND', 'NOT', 'SUM', 'AVG', 'MIN', 'MAX'];

/**
 * A word in the query that is nearly a keyword but is not one: FORM, SELCT, WERE.
 * SQLite never names these. It reads `SELECT name FORM candies` as "the column
 * name, nicknamed FORM" and then complains about the NEXT word — so its message
 * points one word past the mistake, at something that is spelled correctly.
 */
function misspelledKeyword(query, database) {
    const known = new Set([
        ...KEYWORDS, 'BY', 'ON', 'AS', 'OR', 'IN', 'IS', 'ASC',
        ...(database?.tables ?? []).flatMap(t => [t.name, ...t.columns.map(c => c[0])]).map(n => n.toUpperCase()),
    ]);
    const letters = w => [...w].sort().join('');
    for (const word of skeleton(query).toUpperCase().match(/[A-Z_][A-Z0-9_]*/g) || []) {
        if (known.has(word) || word.length < 3) continue;
        for (const keyword of KEYWORDS) {
            if (keyword.length < 4) continue;
            const swapped = word.length === keyword.length && letters(word) === letters(keyword);
            if (swapped || editDistance(word, keyword) === 1) return { word, keyword };
        }
    }
    return null;
}

/**
 * SQLite's own messages are exact and terse ("near "FORM": syntax error").
 * This puts the common ones into a sentence and adds what a beginner needs next:
 * the names that DO exist, or the order the clauses go in.
 */
export function explainError(message, database, query = '') {
    const text = String(message ?? '');
    const tables = (database?.tables ?? []).map(t => t.name);
    const columns = [...new Set((database?.tables ?? []).flatMap(t => t.columns.map(c => c[0])))];
    let m;

    if ((m = /no such column: (.+)/.exec(text))) {
        const name = m[1].replace(/^.*\./, '');
        const guess = closest(name, columns);
        return {
            message: `There is no column called "${m[1]}".`,
            hint: (guess ? `Did you mean ${guess}? ` : '') + `The columns are: ${columns.join(', ')}. ` +
                "If you meant a piece of text, put it in single quotes: 'Fizzworks'.",
        };
    }
    if ((m = /no such table: (.+)/.exec(text))) {
        const guess = closest(m[1], tables);
        return {
            message: `There is no table called "${m[1]}".`,
            hint: (guess ? `Did you mean ${guess}? ` : '') + `The tables are: ${tables.join(', ')}.`,
        };
    }
    if ((m = /ambiguous column name: (.+)/.exec(text))) {
        const owners = (database?.tables ?? []).filter(t => t.columns.some(c => c[0] === m[1])).map(t => `${t.name}.${m[1]}`);
        return {
            message: `More than one table here has a column called "${m[1]}", so SQLite cannot tell which you mean.`,
            hint: `Say which table: ${owners.join(' or ') || `table.${m[1]}`}.`,
        };
    }
    if (/incomplete input/.test(text)) {
        const typo = misspelledKeyword(query, database);
        if (typo) return { message: 'The query ends too soon.', hint: `${typo.word} looks like a misspelling of ${typo.keyword}.` };
        return { message: 'The query ends too soon.', hint: 'Something is still open or unfinished — a missing table name after FROM, a condition after WHERE, or a closing bracket.' };
    }
    if ((m = /near "(.*)": syntax error/.exec(text))) {
        const typo = misspelledKeyword(query, database);
        return {
            message: `SQLite could not make sense of the query at "${m[1]}".`,
            hint: typo
                ? `${typo.word} looks like a misspelling of ${typo.keyword}. ${CLAUSE_ORDER}`
                : `Check the spelling of the word just before or at that point. ${CLAUSE_ORDER}`,
        };
    }
    if (/misuse of aggregate/.test(text)) {
        return { message: 'An aggregate function such as COUNT or SUM is used where a single row is being tested.', hint: 'WHERE tests one row at a time, before any counting. To compare a count, the grouping has to happen first.' };
    }
    if ((m = /no such function: (.+)/.exec(text))) {
        return { message: `SQLite has no function called ${m[1]}.`, hint: 'The aggregate functions are COUNT, SUM, AVG, MIN and MAX.' };
    }
    return { message: text || 'The query could not be run.', hint: CLAUSE_ORDER };
}

// ─── Comparing two results ───────────────────────────────────────────────────

/** One cell, as a string that is equal exactly when two cells should count as equal. */
function cellKey(value) {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'number') return `n:${Number(value.toFixed(9))}`;   // 2 is 2.0; 0.1 + 0.2 is 0.3
    if (typeof value === 'string') return `s:${value}`;
    return `b:${Array.from(value).join(',')}`;                              // a blob
}
const rowKey = row => row.map(cellKey).join('\u001f');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Does `actual` hold the rows `expected` holds? Column NAMES are not compared —
 * COUNT(*) and COUNT(*) AS how_many are the same answer — but their number is.
 * Row order counts only when `ordered` says the task asked for one. Rows are
 * compared as a multiset: two of a row is not one of it.
 */
export function compareResults(expected, actual, ordered) {
    const want = expected.values, got = actual.values;
    const wantCols = want.length ? want[0].length : expected.columns.length;
    const gotCols = got.length ? got[0].length : actual.columns.length;
    if (want.length && got.length && wantCols !== gotCols) {
        return { passed: false, detail: `Your result has ${plural(gotCols, 'column')}; the task asks for ${wantCols}.` };
    }
    if (want.length !== got.length) {
        return { passed: false, detail: `Your query returned ${plural(got.length, 'row')}; ${want.length} ${want.length === 1 ? 'was' : 'were'} expected.` };
    }
    const wantKeys = want.map(rowKey), gotKeys = got.map(rowKey);
    const sameInOrder = wantKeys.every((k, i) => k === gotKeys[i]);
    if (sameInOrder) return { passed: true, detail: `${plural(got.length, 'row')}, as expected` };
    const sameRows = [...wantKeys].sort().every((k, i) => k === [...gotKeys].sort()[i]);
    if (sameRows) {
        return ordered
            ? { passed: false, detail: 'The right rows, but not in the order the task asks for.' }
            : { passed: true, detail: `${plural(got.length, 'row')}, as expected` };
    }
    return { passed: false, detail: `${plural(got.length, 'row')} came back, but not the rows expected.` };
}

// ─── Grading ─────────────────────────────────────────────────────────────────

/**
 * Run a student's query against every dataset of the problem's database and
 * compare it with the reference query on each.
 *
 * Returns the shape a code_write run returns, so the same results table and the
 * same scoring serve both:
 *   { ok, error, results, passed, total }
 * `results` has one row per dataset: { call, passed, detail }, and for the
 * dataset on screen also { expected, actual } — the two grids to show side by
 * side. Hidden datasets report only whether they passed and why not.
 *
 * `ok: false` means nothing could be graded — the text is not one SELECT, or
 * SQLite could not run it against the very first dataset.
 */
export async function gradeSql(run, question, database, text) {
    const total = database.datasets.length;
    const stopped = error => ({ ok: false, error: { line: null, ...error }, results: [], passed: 0, total });

    const refused = checkStatement(text);
    if (refused) return stopped(refused);

    const results = [];
    for (const [index, dataset] of database.datasets.entries()) {
        const setup = setupSql(database, dataset);
        const expected = await run(setup, question.solution);
        let actual;
        try {
            actual = await run(setup, String(text));
        } catch (err) {
            const explained = err && err.limit ? { message: err.message, hint: err.hint } : explainError(err?.message, database, text);
            if (index === 0) return stopped(explained);
            results.push({ call: dataset.label, passed: false, detail: explained.message, error: { line: null, ...explained } });
            continue;
        }
        const verdict = compareResults(expected, actual, question.ordered === true);
        const row = { call: dataset.label, passed: verdict.passed, detail: verdict.detail };
        if (index === 0) { row.expected = expected; row.actual = actual; }
        results.push(row);
    }
    return { ok: true, error: null, results, passed: results.filter(r => r.passed).length, total };
}
