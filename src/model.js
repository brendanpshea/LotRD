// src/model.js
/* Data models and game logic for "Loop of the Recursive Dragon".

Classes:
- Player       – character stats, equipment, streak tracking
- Monster      – encounter stats
- GameModel    – game state, question/monster logic, answer history, save/load
Utilities:
- loadJSON     – fetch JSON from a URL
- rollDice     – dice-roll helper
*/

export async function loadJSON(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Error fetching ${url}`);
    return response.json();
}

export function rollDice(times, sides) {
    let total = 0;
    for (let i = 0; i < times; i++) {
        total += Math.floor(Math.random() * sides) + 1;
    }
    return total;
}

export class Player {
    static maxHpForLevel(level)       { return 20 + (level - 1) * 2; }
    static baseDefenseForLevel(level) { return 1 + Math.floor((level - 1) / 5); }
    static xpToNext(level)            { return Math.round(100 * Math.pow(1.25, level - 1)); }

    constructor(levelData = null) {
        const lvl             = levelData?.level ?? 1;
        this.level            = lvl;
        this.xp               = levelData?.xp ?? 0;
        this.xp_to_next_level = Player.xpToNext(lvl);
        this.max_hit_points   = Player.maxHpForLevel(lvl);
        this.hit_points       = this.max_hit_points;
        this.attack_die       = 6;      // fixed — never changes
        this.base_defense     = Player.baseDefenseForLevel(lvl);
        this.revive_charges   = levelData?.revive_charges ?? 0;
        this.total_correct    = 0;
        this.total_incorrect  = 0;
        this.streak           = 0;
        this.best_streak      = 0;
    }
}

export class Monster {
    constructor(data) {
        this.monster_name        = data.monster_name;
        this.initial_description = data.initial_description || "";
        this.hit_dice            = data.hit_dice;
        this.attack_die          = data.attack_die;
        this.defense             = data.defense;
        this.image               = data.image || null;
        this.hit_points          = 0;
        for (let i = 0; i < this.hit_dice; i++) {
            this.hit_points += rollDice(1, 10);
        }
        this.max_hit_points = this.hit_points;
        this.xp_value = this.hit_dice * 10;
    }
}

export class GameModel {
    /**
     * @param {object[]} questions  – full question array (already loaded from JSON)
     * @param {object[]} monsters   – monster definitions
     * @param {object|null} saveData – optional: resume from a localStorage snapshot
     */
    constructor(questions, monsters, saveData = null, levelData = null) {
        this.monsters         = monsters;
        this.current_monster  = null;
        this.current_question = null;

        if (saveData) {
            // ── Resume path ──────────────────────────────────────────────
            this.questions        = saveData.questions;
            this.questions_to_ask = saveData.questions_to_ask;
            this.questions_asked  = saveData.questions_asked || 0;
            this.answer_history   = saveData.answer_history  || [];
            this.stats_offset     = saveData.stats_offset    || 0;
            this.active_item      = saveData.active_item     || null;

            const p  = new Player();
            const sp = saveData.player;
            p.level            = sp.level;
            p.xp               = sp.xp;
            p.xp_to_next_level = sp.xp_to_next_level ?? Player.xpToNext(sp.level);
            p.max_hit_points   = sp.max_hit_points   ?? Player.maxHpForLevel(sp.level);
            p.hit_points       = sp.hit_points;
            p.attack_die       = sp.attack_die   ?? 6;
            p.base_defense     = sp.base_defense ?? Player.baseDefenseForLevel(sp.level);
            p.revive_charges   = sp.revive_charges ?? 0;
            p.total_correct    = sp.total_correct;
            p.total_incorrect  = sp.total_incorrect;
            p.streak           = sp.streak      || 0;
            p.best_streak      = sp.best_streak || 0;
            this.player = p;
        } else {
            // ── Fresh game path ──────────────────────────────────────────
            this.questions       = [...questions];
            this.questions_asked = 0;
            this.answer_history  = [];
            this.stats_offset    = 0;
            this.active_item     = null;
            this.player          = new Player(levelData);

            // Fisher-Yates shuffle
            for (let i = this.questions.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [this.questions[i], this.questions[j]] = [this.questions[j], this.questions[i]];
            }
            this.questions_to_ask = [...this.questions];
        }
    }

    /** Produce a plain-object snapshot suitable for JSON serialisation. */
    toSaveData() {
        const p = this.player;
        return {
            questions:        this.questions,
            questions_to_ask: this.questions_to_ask,
            questions_asked:  this.questions_asked,
            answer_history:   this.answer_history,
            stats_offset:     this.stats_offset,
            active_item:      this.active_item,
            player: {
                level:            p.level,
                xp:               p.xp,
                xp_to_next_level: p.xp_to_next_level,
                max_hit_points:   p.max_hit_points,
                hit_points:       p.hit_points,
                total_correct:    p.total_correct,
                total_incorrect:  p.total_incorrect,
                streak:           p.streak,
                best_streak:      p.best_streak,
                attack_die:       p.attack_die,
                base_defense:     p.base_defense,
                revive_charges:   p.revive_charges,
            },
        };
    }

    /**
     * Pick a monster weighted toward player level: weight = 1 / (1 + |hit_dice - level|).
     * Monsters near the player's level are favoured but no monster is excluded.
     */
    generateMonster() {
        const lvl     = this.player?.level ?? 1;
        const weights = this.monsters.map(m => 1 / (1 + Math.abs(m.hit_dice - lvl)));
        const total   = weights.reduce((a, b) => a + b, 0);
        let r = Math.random() * total;
        for (let i = 0; i < this.monsters.length; i++) {
            r -= weights[i];
            if (r <= 0) return new Monster(this.monsters[i]);
        }
        return new Monster(this.monsters[this.monsters.length - 1]);
    }

    nextEncounter() {
        if (!this.current_monster || this.current_monster.hit_points <= 0) {
            if (this.questions_to_ask.length === 0) {
                this.current_monster  = null;
                this.current_question = null;
                return "victory";
            }
            this.current_monster = this.generateMonster();
        }

        if (this.questions_to_ask.length > 0) {
            this.current_question = this.questions_to_ask.shift();
        } else {
            this.current_question = null;
            return "no_questions";
        }

        return "continue";
    }

    // ─── Shared combat helpers (used by all three evaluators) ──────────────────

    _streakMultiplier() {
        const s = this.player.streak;
        if (s >= 10) return 2.0;
        if (s >= 5)  return 1.5;
        if (s >= 3)  return 1.25;
        return 1.0;
    }

    /**
     * Streak rules:
     *   - perfect           → increment (and bump best_streak)
     *   - partial ≥ 0.8     → preserve (no change either way) — "streak forgiveness"
     *   - partial < 0.8     → reset to 0
     * Returns 'incremented' | 'preserved' | 'reset' so callers can surface it.
     */
    _updateStreak(isPerfect, partialFraction) {
        if (isPerfect) {
            this.player.streak++;
            if (this.player.streak > this.player.best_streak)
                this.player.best_streak = this.player.streak;
            return 'incremented';
        }
        if (this.player.streak > 0 && partialFraction >= 0.8) {
            return 'preserved';
        }
        this.player.streak = 0;
        return 'reset';
    }

    /**
     * Apply streak/item modifiers to raw damage rolls, subtract defenses,
     * deduct HP from monster and player. Returns the post-defense values.
     * @param {number} rawPlayerDamage   – sum of player's attack rolls before mods
     * @param {number} rawMonsterDamage  – sum of monster's attack rolls before mods
     * @param {number} streakMultiplier  – player's current streak mult
     */
    _applyDamage(rawPlayerDamage, rawMonsterDamage, streakMultiplier) {
        const itemAttackMult = (this.active_item?.type === 'attack') ? this.active_item.attack_mult : 1.0;
        const player_damage  = Math.round(rawPlayerDamage * streakMultiplier * itemAttackMult);

        const effective_player_damage  = Math.max(player_damage  - this.current_monster.defense, 0);
        let   effective_monster_damage = Math.max(rawMonsterDamage - this.player.base_defense,   0);
        if (this.active_item?.type === 'defense')
            effective_monster_damage = Math.round(effective_monster_damage * (1 - this.active_item.defense_reduce));

        this.current_monster.hit_points -= effective_player_damage;
        this.player.hit_points          -= effective_monster_damage;

        return { effective_player_damage, effective_monster_damage };
    }

    /**
     * After damage is applied: award XP, level up, requeue if needed,
     * push history, return the values shared across all evaluator returns.
     */
    _finalizeTurn({ xpGained, requeue, historyEntry }) {
        const startMaxHp       = this.player.max_hit_points;
        const startBaseDefense = this.player.base_defense;
        const startRevives     = this.player.revive_charges;

        this.player.xp += xpGained;
        const levelsGained = this.checkLevelUp();

        const levelUpRewards = levelsGained > 0 ? {
            hp_gained:      this.player.max_hit_points - startMaxHp,
            defense_gained: this.player.base_defense   - startBaseDefense,
            revive_gained:  this.player.revive_charges - startRevives,
        } : null;

        if (requeue) {
            // Re-queue 3 positions ahead (or at end if fewer questions remain).
            // Spaced-repetition flavour: missed questions resurface soon enough to
            // reinforce, but not so soon that students just retype the same answer.
            const idx = Math.min(3, this.questions_to_ask.length);
            this.questions_to_ask.splice(idx, 0, this.current_question);
        }
        this.questions_asked++;
        this.answer_history.push(historyEntry);
        return {
            defeated_monster:  this.current_monster.hit_points <= 0,
            defeated_player:   this.player.hit_points <= 0,
            xp_gained:         xpGained,
            question_repeated: !!requeue,
            levelsGained,
            levelUpRewards,
        };
    }

    // ─── Evaluators ────────────────────────────────────────────────────────────

    evaluateAnswer(selectedOptions) {
        const q            = this.current_question;
        const correctSet   = new Set(q.correct   || []);
        const incorrectSet = new Set(q.incorrect  || []);
        const selectedSet  = new Set(selectedOptions);

        const correctSelections   = [...selectedSet].filter(s => correctSet.has(s));
        const incorrectSelections = [...selectedSet].filter(s => incorrectSet.has(s));
        const missedCorrect       = [...correctSet].filter(c => !selectedSet.has(c));

        this.player.total_correct   += correctSelections.length;
        this.player.total_incorrect += incorrectSelections.length;

        const isPerfect = incorrectSelections.length === 0 && missedCorrect.length === 0;
        const accuracyDenom = correctSelections.length + incorrectSelections.length + missedCorrect.length;
        const accuracy = accuracyDenom > 0 ? correctSelections.length / accuracyDenom : 0;
        const streakState = this._updateStreak(isPerfect, accuracy);
        const streakMultiplier = this._streakMultiplier();

        const player_hits = correctSelections.length
            + [...incorrectSet].filter(i => !selectedSet.has(i)).length;
        const monster_hits = incorrectSelections.length + missedCorrect.length;

        let rawPlayerDamage = 0;
        for (let i = 0; i < player_hits; i++)  rawPlayerDamage  += rollDice(1, this.player.attack_die);
        let rawMonsterDamage = 0;
        for (let i = 0; i < monster_hits; i++) rawMonsterDamage += rollDice(1, this.current_monster.attack_die);

        const { effective_player_damage, effective_monster_damage } =
            this._applyDamage(rawPlayerDamage, rawMonsterDamage, streakMultiplier);

        const requeue = !isPerfect;
        const historyEntry = {
            question:             q.question,
            correct_answers:      [...correctSet],
            selected:             selectedOptions,
            correct_selections:   correctSelections,
            incorrect_selections: incorrectSelections,
            missed_correct:       missedCorrect,
            was_perfect:          isPerfect,
        };
        const turn = this._finalizeTurn({
            xpGained: this.current_monster.hit_dice * 2,
            requeue,
            historyEntry,
        });

        return {
            ...turn,
            effective_player_damage,
            effective_monster_damage,
            correctSelections,
            incorrectSelections,
            missedCorrect,
            feedback:         q.feedback || null,
            streakMultiplier,
            streakCount:      this.player.streak,
            streakState,
        };
    }

    /**
     * Evaluate a fill-in-the-blank answer.
     * Partial credit: characters at correct positions score as hits; the rest as misses.
     * Damage scales proportionally (one roll each side, multiplied by correct/wrong fraction).
     * isPerfect only when the normalised input exactly matches an acceptable answer.
     */
    evaluateFillBlank(inputText) {
        const q          = this.current_question;
        const acceptable = q.correct || [];
        const caseSens   = q.case_sensitive === true;
        const normalise  = s => caseSens ? s.trim() : s.trim().toLowerCase();
        const input      = normalise(inputText);

        // Find the best-matching acceptable answer (most chars in correct position).
        let bestAnswer  = normalise(acceptable[0] || '');
        let bestMatches = 0;
        for (const ans of acceptable) {
            const norm = normalise(ans);
            if (norm === input) { bestAnswer = norm; bestMatches = norm.length; break; }
            let m = 0;
            for (let i = 0; i < norm.length; i++) { if (input[i] === norm[i]) m++; }
            if (m > bestMatches) { bestMatches = m; bestAnswer = norm; }
        }

        const totalChars   = bestAnswer.length;
        let   correctChars = 0;
        for (let i = 0; i < totalChars; i++) {
            if (input[i] === bestAnswer[i]) correctChars++;
        }
        const wrongChars = totalChars - correctChars;
        const isPerfect  = input === bestAnswer;
        const accuracy   = totalChars > 0 ? correctChars / totalChars : 0;

        const streakState = this._updateStreak(isPerfect, accuracy);
        const streakMultiplier = this._streakMultiplier();

        this.player.total_correct   += correctChars;
        this.player.total_incorrect += wrongChars;

        // Proportional damage: one roll per side, scaled by fraction correct/wrong
        const correctFrac = totalChars > 0 ? correctChars / totalChars : 0;
        const wrongFrac   = 1 - correctFrac;
        const rawPlayerDamage  = rollDice(1, this.player.attack_die)          * correctFrac;
        const rawMonsterDamage = rollDice(1, this.current_monster.attack_die) * wrongFrac;

        const { effective_player_damage, effective_monster_damage } =
            this._applyDamage(rawPlayerDamage, rawMonsterDamage, streakMultiplier);

        const scoreLabel = isPerfect
            ? inputText
            : `"${inputText}" — ${correctChars}/${totalChars} chars correct`;

        const historyEntry = {
            question:             q.question,
            correct_answers:      acceptable,
            selected:             [inputText],
            correct_selections:   correctChars > 0 ? [scoreLabel] : [],
            incorrect_selections: wrongChars   > 0 ? [scoreLabel] : [],
            missed_correct:       isPerfect    ? [] : acceptable,
            was_perfect:          isPerfect,
        };
        const turn = this._finalizeTurn({
            xpGained: this.current_monster.hit_dice * 2,
            requeue:  !isPerfect,
            historyEntry,
        });

        return {
            ...turn,
            effective_player_damage,
            effective_monster_damage,
            correctSelections:   correctChars > 0 ? [scoreLabel] : [],
            incorrectSelections: wrongChars   > 0 ? [scoreLabel] : [],
            missedCorrect:       isPerfect    ? [] : acceptable,
            feedback:         q.feedback || null,
            streakMultiplier,
            streakCount:      this.player.streak,
            streakState,
        };
    }

    /**
     * Evaluate a matching answer.
     * selectedPairs: array of { term, definition } representing the student's choices.
     * Proportional scoring: correct fraction drives player attack; wrong fraction drives monster.
     * Re-queued if any pair is wrong.
     */
    evaluateMatching(selectedPairs) {
        const q     = this.current_question;
        const pairs = q.pairs || [];

        const correctMap = new Map(pairs.map(p => [p.term, p.definition]));
        let correctCount = 0;
        let wrongCount   = 0;
        const wrongTerms   = [];
        const correctTerms = [];

        selectedPairs.forEach(({ term, definition }) => {
            if (correctMap.get(term) === definition) {
                correctCount++;
                correctTerms.push(term);
            } else {
                wrongCount++;
                wrongTerms.push(term);
            }
        });

        const total     = pairs.length;
        const isPerfect = wrongCount === 0 && correctCount === total;

        this.player.total_correct   += correctCount;
        this.player.total_incorrect += wrongCount;

        const accuracy = total > 0 ? correctCount / total : 0;
        const streakState = this._updateStreak(isPerfect, accuracy);
        const streakMultiplier = this._streakMultiplier();

        // Proportional damage — roll one die per correct/wrong pair
        let rawPlayerDamage = 0;
        for (let i = 0; i < correctCount; i++) rawPlayerDamage += rollDice(1, this.player.attack_die);
        let rawMonsterDamage = 0;
        for (let i = 0; i < wrongCount; i++)   rawMonsterDamage += rollDice(1, this.current_monster.attack_die);

        const { effective_player_damage, effective_monster_damage } =
            this._applyDamage(rawPlayerDamage, rawMonsterDamage, streakMultiplier);

        const correctSelections   = correctTerms.map(t => `${t} → ${correctMap.get(t)}`);
        const incorrectSelections = wrongTerms.map(t => {
            const student = selectedPairs.find(p => p.term === t)?.definition ?? '(none)';
            return `${t}: chose "${student}" — correct: "${correctMap.get(t)}"`;
        });

        const historyEntry = {
            question:             q.question,
            correct_answers:      pairs.map(p => `${p.term} → ${p.definition}`),
            selected:             selectedPairs.map(p => `${p.term} → ${p.definition}`),
            correct_selections:   correctSelections,
            incorrect_selections: incorrectSelections,
            missed_correct:       [],
            was_perfect:          isPerfect,
        };
        const turn = this._finalizeTurn({
            xpGained: 10,
            requeue:  !isPerfect,
            historyEntry,
        });

        return {
            ...turn,
            effective_player_damage,
            effective_monster_damage,
            correctSelections,
            incorrectSelections,
            missedCorrect: [],
            feedback:         q.feedback || null,
            streakMultiplier,
            streakCount:      this.player.streak,
            streakState,
        };
    }

    /**
     * Apply XP gains and roll up any level-ups. Each level-up grants:
     *   - +1 revive charge
     *   - +2 max HP (and current HP grows by the same amount)
     *   - +1 base defense at every 5th level (5, 10, 15…)
     */
    checkLevelUp() {
        let levelsGained = 0;
        while (this.player.xp >= this.player.xp_to_next_level) {
            this.player.xp              -= this.player.xp_to_next_level;
            this.player.level           += 1;
            this.player.xp_to_next_level = Player.xpToNext(this.player.level);

            const newMaxHp = Player.maxHpForLevel(this.player.level);
            this.player.hit_points     += (newMaxHp - this.player.max_hit_points);
            this.player.max_hit_points  = newMaxHp;

            this.player.base_defense    = Player.baseDefenseForLevel(this.player.level);
            this.player.revive_charges += 1;
            levelsGained++;
        }
        return levelsGained;
    }
}
