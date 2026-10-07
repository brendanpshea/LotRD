/**
 * sqlengine.js — SQLite, in a background worker, with a way to stop it.
 *
 * A student's query is the one piece of code in this game that cannot be given
 * a step budget: it runs inside SQLite, and a join of a table with itself six
 * times, or a recursive query with no end, would hold the page frozen for as
 * long as it liked. So the engine lives in a Web Worker — the worker script that
 * ships with sql.js, vendor/sqljs — and every run is on a clock. A run that
 * overruns has its worker terminated, which is the one thing guaranteed to stop
 * it, and the next run starts a fresh one.
 *
 * This was checked inside D2L before any of it was built: the .wasm file loads
 * from a SCORM package, the worker starts, and a never-ending query is stopped
 * with the page still responsive.
 *
 * What comes out is `run(setupSql, query)`, the function src/sqlgrade.js asks
 * for. Each run gets a brand-new, empty database, so nothing a query does can
 * reach the next one.
 */

export const SQL_WORKER_URL = 'vendor/sqljs/worker.sql-wasm.js';

/** An error that is about the engine or the clock, not about the student's SQL. */
function limit(message, hint) {
    return Object.assign(new Error(message), { limit: true, hint });
}

/**
 * @param {object} [options]
 * @param {string} [options.workerUrl]
 * @param {number} [options.timeoutMs]   how long one query may run
 * @param {number} [options.startupMs]   how long the engine may take to load, the first time
 * @param {(url: string) => Worker} [options.makeWorker]   injectable for tests
 * @returns {{ run: (setupSql: string, query: string) => Promise<{columns: string[], values: any[][]}>, dispose: () => void }}
 */
export function createSqlRunner({
    workerUrl = SQL_WORKER_URL,
    timeoutMs = 4000,
    startupMs = 20000,
    makeWorker = url => new Worker(url),
} = {}) {
    let worker = null;
    let ready = false;
    let nextId = 1;
    let queue = Promise.resolve();

    function discard() {
        if (worker) { try { worker.terminate(); } catch (_) { /* already gone */ } }
        worker = null;
        ready = false;
    }

    /** One message to the worker, and its answer — or a rejection if the clock runs out. */
    function ask(message, ms, onTimeout) {
        return new Promise((resolve, reject) => {
            const id = nextId++;
            const timer = setTimeout(() => { discard(); reject(onTimeout()); }, ms);
            worker.onmessage = event => {
                const data = event.data || {};
                if (data.id !== undefined && data.id !== id) return;   // an answer to a run already given up on
                clearTimeout(timer);
                if (data.error) reject(new Error(String(data.error)));
                else resolve(data);
            };
            worker.onerror = event => {
                clearTimeout(timer);
                discard();
                reject(limit('The SQL engine could not be started.',
                    `Reload the page and try again. (${event && event.message ? event.message : 'the worker failed to load'})`));
            };
            worker.postMessage({ id, ...message });
        });
    }

    async function runOne(setupSql, query) {
        if (!worker) {
            try { worker = makeWorker(workerUrl); }
            catch (err) {
                throw limit('The SQL engine could not be started.', `This browser would not start it: ${err && err.message}`);
            }
        }
        const tooSlowToStart = () => limit('The SQL engine took too long to load.',
            'Check your connection and press Run again.');
        const tooLong = () => limit('Your query ran for too long and was stopped.',
            'That usually means tables joined without a condition, so every row is paired with every other. ' +
            'Give each JOIN an ON that says which columns match.');

        // "open" with no file gives a new, empty database, closing any before it.
        await ask({ action: 'open' }, ready ? timeoutMs : startupMs, ready ? tooLong : tooSlowToStart);
        ready = true;
        await ask({ action: 'exec', sql: setupSql }, timeoutMs, tooLong);
        const answer = await ask({ action: 'exec', sql: query }, timeoutMs, tooLong);
        const results = answer.results || [];
        // A query that matches no rows comes back as no result at all.
        return results.length ? results[results.length - 1] : { columns: [], values: [] };
    }

    return {
        /** Runs are taken one at a time: there is one database, and one question on screen. */
        run(setupSql, query) {
            const result = queue.then(() => runOne(setupSql, query));
            queue = result.catch(() => {});
            return result;
        },
        dispose: discard,
    };
}
