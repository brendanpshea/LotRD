// All items are question-type-agnostic: they only touch combat / encounter / run state.
//
// kind:
//   "instant" — activating fires the effect immediately and consumes the item.
//   "pending" — activating arms a flag (model.pending_effects) consumed by the
//               next round of combat resolution.
//
// effect: the controller dispatches on this string to apply the item.
// min_tier: gates an item out of the drop pool until a monster of at least that
//           hit_dice has been encountered.

export const ITEMS = [
    // ─── Heals (instant) ───────────────────────────────────────────────
    {
        id: "debug_elixir", emoji: "🧪", name: "Debug Elixir",
        kind: "instant", effect: "heal", amount: 6, min_tier: 1,
        flavor: "Traces the error. Restores the damage.",
    },
    {
        id: "restore_point", emoji: "💾", name: "Restore Point",
        kind: "instant", effect: "heal", amount: 12, min_tier: 4,
        flavor: "Roll back to a healthier state.",
    },

    // ─── Run-level (instant, persistent effects) ───────────────────────
    {
        id: "heart_container", emoji: "❤", name: "Heart Container",
        kind: "instant", effect: "max_hp", amount: 2, min_tier: 3,
        flavor: "+2 permanent max HP.",
    },
    {
        id: "phoenix_feather", emoji: "🪶", name: "Phoenix Feather",
        kind: "instant", effect: "add_revive", min_tier: 3,
        flavor: "+1 revive charge for the run.",
    },

    // ─── Encounter manipulation (instant) ──────────────────────────────
    {
        id: "flee_scroll", emoji: "💨", name: "Flee Scroll",
        kind: "instant", effect: "flee", min_tier: 1,
        flavor: "Escape this encounter — no damage, no XP.",
    },
    {
        id: "logic_bomb", emoji: "💣", name: "Logic Bomb",
        kind: "instant", effect: "bomb", min_tier: 5,
        flavor: "Defeat the monster instantly. The question returns later.",
    },

    // ─── Pending combat modifiers ──────────────────────────────────────
    {
        id: "firewall_shard", emoji: "🛡", name: "Firewall Shard",
        kind: "pending", effect: "shield", min_tier: 1,
        flavor: "Blocks the next hit you would take.",
    },
    {
        id: "stack_mirror", emoji: "🪞", name: "Stack Mirror",
        kind: "pending", effect: "mirror", min_tier: 3,
        flavor: "Next round, the monster takes the damage meant for you.",
    },
    {
        id: "xp_magnet", emoji: "✨", name: "XP Magnet",
        kind: "pending", effect: "xp_double", min_tier: 2,
        flavor: "2× XP on your next correct answer.",
    },
    {
        id: "mulligan", emoji: "🔁", name: "Mulligan",
        kind: "pending", effect: "mulligan", min_tier: 2,
        flavor: "Recompile and retry — undo a wrong answer once.",
    },
];

// Backwards-compat export for any code still importing the old name.
export const ITEM_DROPS = ITEMS;

export function findItemById(id) {
    return ITEMS.find(i => i.id === id) || null;
}
