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

import { shuffle } from "./util.js";

export function rollDice(times, sides) {
    let total = 0;
    for (let i = 0; i < times; i++) {
        total += Math.floor(Math.random() * sides) + 1;
    }
    return total;
}

/** Edit distance between two strings (insert/delete/substitute = 1). */
export function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = new Array(b.length + 1);
    let cur  = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
        cur[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        }
        [prev, cur] = [cur, prev];
    }
    return prev[b.length];
}

/** 0..1 similarity: 1 = identical, 0 = nothing in common. */
export function levenshteinSimilarity(a, b) {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    return 1 - (levenshtein(a, b) / maxLen);
}

/**
 * Wordle-style letter feedback. Returns an array (one entry per guess char):
 *   { char, status: 'correct' | 'present' | 'absent' | 'space' }
 * Two-pass algorithm correctly handles duplicate letters.
 */
export function wordleFeedback(guess, answer) {
    const g = [...guess];
    const a = [...answer];
    const status = new Array(g.length).fill('absent');
    const used   = new Array(a.length).fill(false);

    // Pass 1 — exact-position matches
    for (let i = 0; i < g.length; i++) {
        if (g[i] === ' ') { status[i] = 'space'; continue; }
        if (i < a.length && g[i] === a[i]) {
            status[i] = 'correct';
            used[i] = true;
        }
    }
    // Pass 2 — letters present but in wrong position (only consume unused answer letters)
    for (let i = 0; i < g.length; i++) {
        if (status[i] !== 'absent') continue;
        for (let j = 0; j < a.length; j++) {
            if (!used[j] && g[i] === a[j]) {
                status[i] = 'present';
                used[j] = true;
                break;
            }
        }
    }
    return g.map((char, i) => ({ char, status: status[i] }));
}

export const FB_MAX_ATTEMPTS = 3;

export class Player {
    static maxHpForLevel(level)       { return 20 + (level - 1) * 2; }
    static baseDefenseForLevel(level) { return 1 + Math.floor((level - 1) / 5); }
    static xpToNext(level)            { return Math.round(100 * Math.pow(1.25, level - 1)); }

    static _defaultFields() {
        const level = 1;
        const maxHitPoints = Player.maxHpForLevel(level);
        return {
            level,
            xp: 0,
            xp_to_next_level: Player.xpToNext(level),
            max_hit_points: maxHitPoints,
            hit_points: maxHitPoints,
            attack_die: 6,
            base_defense: Player.baseDefenseForLevel(level),
            revive_charges: 0,
            total_correct: 0,
            total_incorrect: 0,
            streak: 0,
            best_streak: 0,
        };
    }

    static _freshFields(levelData = null) {
        const level = levelData?.level ?? 1;
        const maxHitPoints = Player.maxHpForLevel(level);
        return {
            ...Player._defaultFields(),
            level,
            xp: levelData?.xp ?? 0,
            xp_to_next_level: Player.xpToNext(level),
            max_hit_points: maxHitPoints,
            hit_points: maxHitPoints,
            base_defense: Player.baseDefenseForLevel(level),
            revive_charges: levelData?.revive_charges ?? 0,
        };
    }

    static fresh(levelData = null) {
        return new Player(Player._freshFields(levelData));
    }

    static fromSave(snapshot = {}) {
        const level = snapshot.level ?? 1;
        return new Player({
            level,
            xp: snapshot.xp ?? 0,
            xp_to_next_level: snapshot.xp_to_next_level ?? Player.xpToNext(level),
            max_hit_points: snapshot.max_hit_points ?? Player.maxHpForLevel(level),
            hit_points: snapshot.hit_points ?? Player.maxHpForLevel(level),
            attack_die: snapshot.attack_die ?? 6,
            base_defense: snapshot.base_defense ?? Player.baseDefenseForLevel(level),
            revive_charges: snapshot.revive_charges ?? 0,
            total_correct: snapshot.total_correct ?? 0,
            total_incorrect: snapshot.total_incorrect ?? 0,
            streak: snapshot.streak ?? 0,
            best_streak: snapshot.best_streak ?? 0,
        });
    }

    constructor(fields = null) {
        const data = { ...Player._freshFields(fields), ...(fields ?? {}) };
        this.level            = data.level;
        this.xp               = data.xp;
        this.xp_to_next_level = data.xp_to_next_level;
        this.max_hit_points   = data.max_hit_points;
        this.hit_points       = data.hit_points;
        this.attack_die       = data.attack_die;
        this.base_defense     = data.base_defense;
        this.revive_charges   = data.revive_charges;
        this.total_correct    = data.total_correct;
        this.total_incorrect  = data.total_incorrect;
        this.streak           = data.streak;
        this.best_streak      = data.best_streak;
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
        this.recent_monsters  = [];

        if (saveData) {
            // ── Resume path ──────────────────────────────────────────────
            this.questions        = saveData.questions;
            this.questions_to_ask = saveData.questions_to_ask;
            this.questions_asked  = saveData.questions_asked || 0;
            this.answer_history   = saveData.answer_history  || [];
            this.stats_offset     = saveData.stats_offset    || 0;
            this.active_item      = saveData.active_item     || null;
            this.recent_monsters  = saveData.recent_monsters || [];
            this.player = Player.fromSave(saveData.player);
        } else {
            // ── Fresh game path ──────────────────────────────────────────
            this.questions       = [...questions];
            this.questions_asked = 0;
            this.answer_history  = [];
            this.stats_offset    = 0;
            this.active_item     = null;
            this.player          = Player.fresh(levelData);
            this.questions       = shuffle(this.questions);
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
            recent_monsters:  this.recent_monsters,
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
        const lvl = this.player?.level ?? 1;
        const recent = this.recent_monsters;
        const weights = this.monsters.map(monster => {
            const levelWeight = 1 / (1 + Math.abs(monster.hit_dice - lvl));
            const recentIndex = recent.lastIndexOf(monster.monster_name);
            if (recentIndex === -1) return levelWeight;

            const distanceFromLatest = recent.length - recentIndex;
            const repeatPenalty = distanceFromLatest === 1 ? 0.15 : 0.45;
            return levelWeight * repeatPenalty;
        });
        const total   = weights.reduce((a, b) => a + b, 0);
        let r = Math.random() * total;
        for (let i = 0; i < this.monsters.length; i++) {
            r -= weights[i];
            if (r <= 0) {
                this._rememberMonster(this.monsters[i].monster_name);
                return new Monster(this.monsters[i]);
            }
        }
        const fallback = this.monsters[this.monsters.length - 1];
        this._rememberMonster(fallback.monster_name);
        return new Monster(fallback);
    }

    _rememberMonster(monsterName) {
        this.recent_monsters.push(monsterName);
        if (this.recent_monsters.length > 3) {
            this.recent_monsters.shift();
        }
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

    _buildHistoryEntry({ correctAnswers, selected, correctSelections, incorrectSelections, missedCorrect, isPerfect }) {
        return {
            question: this.current_question.question,
            correct_answers: correctAnswers,
            selected,
            correct_selections: correctSelections,
            incorrect_selections: incorrectSelections,
            missed_correct: missedCorrect,
            was_perfect: isPerfect,
        };
    }

    _rollDamage(hitCount, dieSize) {
        let total = 0;
        for (let i = 0; i < hitCount; i++) total += rollDice(1, dieSize);
        return total;
    }

    _resolveDamage({ playerHits, monsterHits, isPerfect, partialFraction, xpGained, requeue, historyEntry }) {
        const streakState = this._updateStreak(isPerfect, partialFraction);
        const streakMultiplier = this._streakMultiplier();
        const rawPlayerDamage = this._rollDamage(playerHits, this.player.attack_die);
        const rawMonsterDamage = this._rollDamage(monsterHits, this.current_monster.attack_die);
        const { effective_player_damage, effective_monster_damage } =
            this._applyDamage(rawPlayerDamage, rawMonsterDamage, streakMultiplier);
        const turn = this._finalizeTurn({ xpGained, requeue, historyEntry });

        return {
            ...turn,
            effective_player_damage,
            effective_monster_damage,
            streakMultiplier,
            streakCount: this.player.streak,
            streakState,
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

        const player_hits = correctSelections.length
            + [...incorrectSet].filter(i => !selectedSet.has(i)).length;
        const monster_hits = incorrectSelections.length + missedCorrect.length;

        const turn = this._resolveDamage({
            playerHits: player_hits,
            monsterHits: monster_hits,
            isPerfect,
            partialFraction: accuracy,
            xpGained: this.current_monster.hit_dice * 2,
            requeue: !isPerfect,
            historyEntry: this._buildHistoryEntry({
                correctAnswers: [...correctSet],
                selected: selectedOptions,
                correctSelections,
                incorrectSelections,
                missedCorrect,
                isPerfect,
            }),
        });

        return {
            ...turn,
            correctSelections,
            incorrectSelections,
            missedCorrect,
            feedback:         q.feedback || null,
        };
    }

    /**
     * Submit one guess for the current fill-in-the-blank question.
     * Players get FB_MAX_ATTEMPTS guesses; each wrong guess earns a monster
     * attack and Wordle-style letter feedback.
     *
     * Returns one of three shapes:
     *   { status: 'wrong',  feedback, attemptsLeft, effective_monster_damage,
     *     defeated_player } – player should be allowed to guess again
     *   { status: 'won',  ...battleData, wordleFeedback, attemptsUsed }
     *   { status: 'failed', ...battleData, wordleFeedback, attemptsUsed }
     * 'won' and 'failed' are full battleData snapshots ready for _resolveBattle.
     */
    submitFillBlankGuess(inputText) {
        const q = this.current_question;
        // Reset attempt state when entering a new fill-blank question
        if (this._fbCurrentQ !== q) {
            this._fbCurrentQ      = q;
            this._fbAttempts      = 0;
            this._fbBestGuess     = '';
            this._fbBestSimilarity = 0;
        }

        const acceptable = q.correct || [];
        const caseSens   = q.case_sensitive === true;
        const normalise  = s => caseSens ? s.trim() : s.trim().toLowerCase();
        const input      = normalise(inputText);

        // Pick the acceptable answer most similar to this guess (so feedback
        // helps the player home in on the closest variant).
        let bestAnswer = normalise(acceptable[0] || '');
        let bestSim    = -1;
        for (const ans of acceptable) {
            const norm = normalise(ans);
            if (norm === input) { bestAnswer = norm; bestSim = 1; break; }
            const sim = levenshteinSimilarity(input, norm);
            if (sim > bestSim) { bestSim = sim; bestAnswer = norm; }
        }

        const isCorrect = input === bestAnswer;
        const feedback  = wordleFeedback(input, bestAnswer);
        this._fbAttempts++;

        if (bestSim > this._fbBestSimilarity) {
            this._fbBestSimilarity = bestSim;
            this._fbBestGuess      = inputText;
        }

        if (isCorrect) {
            return this._finalizeFillBlank({ won: true, finalInput: inputText, bestAnswer, feedback });
        }
        if (this._fbAttempts >= FB_MAX_ATTEMPTS) {
            return this._finalizeFillBlank({ won: false, finalInput: this._fbBestGuess, bestAnswer, feedback });
        }

        // Wrong, but more attempts remain — apply monster attack only
        const monsterRoll = rollDice(1, this.current_monster.attack_die);
        let effective_monster_damage = Math.max(monsterRoll - this.player.base_defense, 0);
        if (this.active_item?.type === 'defense')
            effective_monster_damage = Math.round(effective_monster_damage * (1 - this.active_item.defense_reduce));
        this.player.hit_points -= effective_monster_damage;

        return {
            status:       'wrong',
            feedback,
            guessText:    inputText,
            attemptsUsed: this._fbAttempts,
            attemptsLeft: FB_MAX_ATTEMPTS - this._fbAttempts,
            effective_monster_damage,
            defeated_player: this.player.hit_points <= 0,
        };
    }

    /**
     * End the current fill-blank turn early as a failure (used when the player
     * dies on a wrong guess and has no revives, so the game-over screen needs
     * a complete battleData object).
     */
    forceFillBlankFail() {
        const q          = this.current_question;
        const acceptable = q.correct || [];
        const caseSens   = q.case_sensitive === true;
        const normalise  = s => caseSens ? s.trim() : s.trim().toLowerCase();
        const bestAnswer = normalise(acceptable[0] || '');
        this._fbAttempts = FB_MAX_ATTEMPTS;
        return this._finalizeFillBlank({
            won:        false,
            finalInput: this._fbBestGuess,
            bestAnswer,
            feedback:   wordleFeedback(normalise(this._fbBestGuess || ''), bestAnswer),
        });
    }

    /**
     * Finalise a fill-blank turn — apply player damage (won only), update stats,
     * record history, requeue, return a battleData-shaped object.
     */
    _finalizeFillBlank({ won, finalInput, bestAnswer, feedback }) {
        const q            = this.current_question;
        const attemptsUsed = this._fbAttempts;
        const isPerfect    = won && attemptsUsed === 1;
        const sim          = won ? 1 : this._fbBestSimilarity;

        // Proportional credit using Levenshtein similarity (fairer than position-only)
        const correctChars = Math.round(sim * bestAnswer.length);
        const wrongChars   = bestAnswer.length - correctChars;
        this.player.total_correct   += correctChars;
        this.player.total_incorrect += wrongChars;

        // Streak: first-try wins increment; later wins or close fails preserve;
        // bad fails reset. The 0.9 sentinel guarantees later wins always preserve.

        const scoreLabel = won
            ? `${finalInput} (won in ${attemptsUsed} ${attemptsUsed === 1 ? 'try' : 'tries'})`
            : `closest: "${this._fbBestGuess}" — ${Math.round(sim * 100)}% match`;

        const turn = this._resolveDamage({
            playerHits: won ? (FB_MAX_ATTEMPTS - attemptsUsed) + 1 : 0,
            monsterHits: 0,
            isPerfect,
            partialFraction: won ? 0.9 : sim,
            xpGained: this.current_monster.hit_dice * 2,
            requeue: !won,
            historyEntry: this._buildHistoryEntry({
                correctAnswers: q.correct || [],
                selected: [finalInput || ''],
                correctSelections: (won || sim > 0) ? [scoreLabel] : [],
                incorrectSelections: !won ? [scoreLabel] : [],
                missedCorrect: won ? [] : (q.correct || []),
                isPerfect,
            }),
        });

        // Reset so the next fill-blank question starts fresh
        this._fbCurrentQ = null;

        return {
            ...turn,
            status: won ? 'won' : 'failed',
            correctSelections:   (won || sim > 0) ? [scoreLabel] : [],
            incorrectSelections: !won ? [scoreLabel] : [],
            missedCorrect:       won  ? [] : (q.correct || []),
            feedback:         q.feedback || null,
            attemptsUsed,
            bestAnswer,
            wordleFeedback:   feedback,
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

        const correctSelections   = correctTerms.map(t => `${t} → ${correctMap.get(t)}`);
        const incorrectSelections = wrongTerms.map(t => {
            const student = selectedPairs.find(p => p.term === t)?.definition ?? '(none)';
            return `${t}: chose "${student}" — correct: "${correctMap.get(t)}"`;
        });

        const turn = this._resolveDamage({
            playerHits: correctCount,
            monsterHits: wrongCount,
            isPerfect,
            partialFraction: accuracy,
            xpGained: 10,
            requeue: !isPerfect,
            historyEntry: this._buildHistoryEntry({
                correctAnswers: pairs.map(p => `${p.term} → ${p.definition}`),
                selected: selectedPairs.map(p => `${p.term} → ${p.definition}`),
                correctSelections,
                incorrectSelections,
                missedCorrect: [],
                isPerfect,
            }),
        });

        return {
            ...turn,
            correctSelections,
            incorrectSelections,
            missedCorrect: [],
            feedback:         q.feedback || null,
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
