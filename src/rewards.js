// rewards.js — power-ups are earned, not found.
//
// A monster used to drop a random item when it fell, whatever the student had
// done. Now each item answers something the student did: a streak, getting
// right what they once missed, a fight without a scratch. The rules live here,
// apart from the game's state, so they can be read and tested in one place.

/** A perfect answer on one of these is worth more: they are produced, not picked. */
export const HARD_TYPES = new Set(["code_write", "sql_write", "code_line", "ordering", "rule_table", "dynamic_numeric"]);

/** Streak milestones, lowest first. A streak of 20, 30… earns the top prize again. */
export const STREAK_REWARDS = [
  { at: 3, item: "adrenaline_rush" },
  { at: 5, item: "xp_magnet" },
  { at: 10, item: ["logic_bomb", "stack_mirror"] },
];

const pick = (item, random) => Array.isArray(item) ? item[Math.floor(random() * item.length)] : item;

/** The key a question is known by across its askings: a dynamic question's text changes, its template does not. */
export const historyKey = entry => entry?.template || entry?.question || "";

/** How many times this question was missed earlier in the run, before its latest answer. */
export function earlierMisses(history, latest) {
  const key = historyKey(latest);
  let n = 0;
  for (const e of history) {
    if (e === latest) break;
    if (historyKey(e) === key && e.was_perfect === false) n++;
  }
  return n;
}

/**
 * What one answered turn earns, if anything: { item, reason }, or null.
 * At most one reward a turn, the rarest that applies. The milestones (a streak
 * of 5 or 10, the first hard question right) always pay. The everyday rewards
 * pay once a fight, so items arrive about as often as when every monster
 * dropped one; a reward of that kind carries `perFight: true`.
 *
 *   turn   { perfect, streak, questionType, misses, killed, fightDamage,
 *            hpBeforeHeal, maxHp, boss }
 *   state  { heart: bool, fight_paid: bool }  what has been granted already
 */
export function rewardForTurn(turn, state = {}, random = Math.random) {
  if (!turn || turn.boss) return null;   // the dragon's fall ends the run; nothing to spend an item on

  if (turn.perfect) {
    const top = STREAK_REWARDS[STREAK_REWARDS.length - 1];
    if (turn.streak >= top.at && turn.streak % top.at === 0) {
      return { item: pick(top.item, random), reason: `${turn.streak} in a row` };
    }
    if (HARD_TYPES.has(turn.questionType) && turn.misses === 0 && !state.heart) {
      return { item: "heart_container", reason: "A hard one, right first time", once: "heart" };
    }
    if (turn.streak === 5) return { item: "xp_magnet", reason: "5 in a row" };
  }
  if (state.fight_paid) return null;
  const everyday = (item, reason) => ({ item, reason, perFight: true });

  // Help arrives when it is needed: a fight won from the brink.
  if (turn.killed && turn.maxHp > 0 && turn.hpBeforeHeal > 0 && turn.hpBeforeHeal <= turn.maxHp / 4) {
    return everyday("restore_point", "Won from the brink");
  }
  if (turn.perfect && turn.misses >= 2) return everyday("mulligan", "Right at last, after missing it twice");
  if (turn.perfect && turn.misses === 1) return everyday("debug_elixir", "Right this time, after missing it");
  if (turn.perfect && turn.streak === 3) return everyday("adrenaline_rush", "3 in a row");
  if (turn.killed && turn.fightDamage === 0) return everyday("firewall_shard", "A fight without a scratch");
  return null;
}

/** What a teaching scene earns: every check right, once a set. */
export function rewardForScene({ checks = 0, right = 0, skipped = false } = {}, state = {}) {
  if (skipped || checks === 0 || right < checks || state.feather) return null;
  return { item: "phoenix_feather", reason: "Every check right", once: "feather" };
}

/** The next streak milestone ahead of `streak`: { more, item }, or null past the last. */
export function nextStreakReward(streak) {
  const s = Math.max(0, streak | 0);
  for (const r of STREAK_REWARDS) {
    if (s < r.at) return { more: r.at - s, item: Array.isArray(r.item) ? r.item[0] : r.item };
  }
  const top = STREAK_REWARDS[STREAK_REWARDS.length - 1];
  return { more: top.at - (s % top.at), item: Array.isArray(top.item) ? top.item[0] : top.item };
}
