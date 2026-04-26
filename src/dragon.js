import { loadJSON } from "./model.js";

const SEEN_KEY = "lotrd_dragon_seen";
const SEEN_CAP = 12;
let _linesPromise = null;

function loadLines() {
  if (!_linesPromise) _linesPromise = loadJSON("assets/dragon_lines.json");
  return _linesPromise;
}

function loadSeen() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"); } catch (_) { return []; }
}

function recordSeen(id) {
  const seen = loadSeen();
  const next = [id, ...seen.filter(x => x !== id)].slice(0, SEEN_CAP);
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(next)); } catch (_) {}
}

function bucketsFor(ctx) {
  const buckets = [];
  if (ctx.is_first_ever) buckets.push("first_ever");

  const milestone = [25, 10, 5].find(n => ctx.sets_completed === n);
  if (milestone) buckets.push(`milestone:${milestone}`);

  if (ctx.was_perfect) buckets.push("perfect");
  else if (ctx.score_pct >= 90) buckets.push("near_perfect");
  else if (ctx.score_pct >= 70) buckets.push("good");
  else buckets.push("rough");

  if (ctx.best_streak >= 10) buckets.push("long_streak");
  if (ctx.topic) buckets.push(`topic:${ctx.topic}`);
  buckets.push("default");
  return buckets;
}

function pickFromBucket(lines, bucket, seen) {
  const candidates = lines.filter(l => l.when === bucket);
  if (candidates.length === 0) return null;
  const fresh = candidates.filter(l => !seen.includes(l.id));
  const pool = fresh.length > 0 ? fresh : candidates;
  return pool[Math.floor(Math.random() * pool.length)];
}

export async function pickDragonLine(ctx) {
  const lines = await loadLines();
  const seen = loadSeen();
  const buckets = bucketsFor(ctx);

  // Prefer specific buckets; ~60% chance to take the first specific match,
  // otherwise fall through so the dragon doesn't always say the same thing
  // when the player is, e.g., on a streak of perfect runs.
  for (const b of buckets) {
    const line = pickFromBucket(lines, b, seen);
    if (!line) continue;
    if (b === "default" || Math.random() < 0.6) {
      recordSeen(line.id);
      return line.text;
    }
  }
  return null;
}
