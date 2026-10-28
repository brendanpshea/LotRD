// The battle stage's choreography: what a turn, or an item, looks like as a
// sequence of beats. Kept apart from the DOM so the order can be tested; ui.js
// plays the beats.
//
// A beat is { at, who, act, text?, tone?, charged? }: `at` ms after the start,
// the hero or the monster does `act`, and `text` floats up from it, coloured
// by `tone`. The acts:
//   attack   lunge forward in the attack pose
//   hit      recoil from a blow
//   vanish   a monster's defeat: a flash, and it is gone
//   down     the hero is knocked out, and stays down
//   revive   the hero gets back up
//   block    a Firewall Shard takes the blow instead
//   reflect  a Stack Mirror sends the blow back
//   glow     an item takes effect
//   throw    an item flies from the hero to the monster
//   drop     what the monster dropped pops out of it

/** How long each act takes, in ms. */
export const BEAT = {
  strike: 180,   // from the start of an attack to the moment it lands
  attack: 420,   // a whole lunge, out and back
  hit: 380,
  vanish: 650,
  down: 550,
  revive: 700,
  glow: 700,
  throw: 350,
  gap: 80,       // between one side's move and the other's
  settle: 150,   // a breath before the next screen
};

/**
 * One round of combat.
 * @param {object} d – what the evaluator returned (after any revive)
 * @param {{boss?: boolean, drop?: object|null, strike?: boolean}} opts
 *   boss: the retrieval dragon, which no dice can hurt — a mastered concept is the blow.
 *   drop: the item the monster dropped, if it did.
 *   strike: false for a wrong guess with tries left, where only the monster moves.
 * @returns {{beats: object[], end: number}} end: when it is all over; 0 when there is nothing to show
 */
export function planTurn(d, { boss = false, drop = null, strike = true } = {}) {
  const beats = [];
  let t = 0;
  const heroStrikes = strike && (boss ? d.question_repeated === false : d.effective_player_damage > 0);
  const monsterSwings = d.effective_monster_damage > 0 || !!d.shield_used || !!d.mirror_used;
  let fellAt = null;

  const blow = () => {
    beats.push({ at: t, who: "hero", act: "attack", charged: d.streakMultiplier > 1 || !!d.adrenaline_used });
    const at = t + BEAT.strike;
    const text = boss ? null : `-${d.effective_player_damage}`;
    if (d.defeated_monster) {
      beats.push({ at, who: "monster", act: "vanish", text, tone: "hit" });
      fellAt = at;
      t = at + BEAT.vanish;
    } else {
      beats.push({ at, who: "monster", act: "hit", text, tone: "hit" });
      t = Math.max(at + BEAT.hit, t + BEAT.attack);
    }
  };

  const swing = () => {
    beats.push({ at: t, who: "monster", act: "attack" });
    const at = t + BEAT.strike;
    if (d.mirror_used) {
      // The monster may fall to its own blow, when nothing else is coming for it.
      const falls = d.defeated_monster && !heroStrikes;
      beats.push({ at, who: "hero", act: "reflect", text: "🪞", tone: "item" });
      beats.push({ at: at + BEAT.gap, who: "monster", act: falls ? "vanish" : "hit", text: `-${d.mirror_damage}`, tone: "hit" });
      if (falls) fellAt = at + BEAT.gap;
      t = at + BEAT.gap + (falls ? BEAT.vanish : BEAT.hit);
    } else if (d.shield_used) {
      beats.push({ at, who: "hero", act: "block", text: "Blocked", tone: "block" });
      t = Math.max(at + BEAT.hit, t + BEAT.attack);
    } else {
      beats.push({ at, who: "hero", act: "hit", text: `-${d.effective_monster_damage}`, tone: "recv" });
      t = Math.max(at + BEAT.hit, t + BEAT.attack);
    }
  };

  // Blows land at once in the model; on the stage one side goes first. When
  // the monster dies this round, its counter comes first, so it isn't swinging
  // after it has fallen.
  if (heroStrikes && monsterSwings && d.defeated_monster) {
    swing();
    t += BEAT.gap;
    blow();
  } else {
    if (heroStrikes) blow();
    if (heroStrikes && monsterSwings) t += BEAT.gap;
    if (monsterSwings) swing();
  }

  // Going down is always last: the hero can land a final blow first.
  if (d.defeated_player || d.revived) {
    beats.push({ at: t, who: "hero", act: "down" });
    t += BEAT.down;
  }
  if (d.revived) {
    t += 2 * BEAT.gap;
    beats.push({ at: t, who: "hero", act: "revive", text: "⚗️", tone: "gold" });
    t += BEAT.revive;
  }

  if (drop && fellAt !== null) {
    beats.push({ at: fellAt + BEAT.vanish / 2, who: "monster", act: "drop", text: drop.emoji, tone: "item" });
  }
  return { beats, end: beats.length ? t + BEAT.settle : 0 };
}

/**
 * An item used from the inventory.
 * @param {object} item – from ITEMS
 * @param {{amount?: number}} detail – amount: the HP a heal actually restored
 */
export function planItem(item, { amount = item.amount } = {}) {
  const glow = (tone, text) => ({
    beats: [{ at: 0, who: "hero", act: "glow", tone, text }],
    end: BEAT.glow,
  });
  switch (item.effect) {
    case "heal":       return glow("heal", `+${amount}`);
    case "max_hp":     return glow("heal", `❤ +${amount}`);
    case "add_revive": return glow("gold", item.emoji);
    case "bomb":
      return {
        beats: [
          { at: 0, who: "hero", act: "throw", text: item.emoji },
          { at: BEAT.throw, who: "monster", act: "vanish", text: "💥", tone: "item" },
        ],
        end: BEAT.throw + BEAT.vanish + BEAT.settle,
      };
    default:           // armed for the next round
      return glow("buff", item.emoji);
  }
}
