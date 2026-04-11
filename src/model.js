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
    constructor(levelData = null) {
        const lvl             = levelData?.level ?? 1;
        this.level            = lvl;
        this.xp               = levelData?.xp ?? 0;
        this.xp_to_next_level = Math.round(100 * Math.pow(1.25, lvl - 1));
        this.max_hit_points   = 20;
        this.hit_points       = 20;
        this.attack_die       = 6;      // fixed — never changes
        this.base_defense     = 1;      // fixed — never changes
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

            const p = new Player();
            const sp = saveData.player;
            p.level            = sp.level;
            p.xp               = sp.xp;
            p.xp_to_next_level = sp.xp_to_next_level ?? Math.round(100 * Math.pow(1.25, sp.level - 1));
            p.max_hit_points   = sp.max_hit_points;
            p.hit_points       = sp.hit_points;
            p.attack_die       = sp.attack_die   ?? 6;
            p.base_defense     = sp.base_defense ?? 1;
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

    generateMonster() {
        const chosen = this.monsters[Math.floor(Math.random() * this.monsters.length)];
        return new Monster(chosen);
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

        // ── Streak tracking ──────────────────────────────────────────────
        const isPerfect = incorrectSelections.length === 0 && missedCorrect.length === 0;
        if (isPerfect) {
            this.player.streak++;
            if (this.player.streak > this.player.best_streak) {
                this.player.best_streak = this.player.streak;
            }
        } else {
            this.player.streak = 0;
        }

        // Streak damage multiplier (applied to player's attack total)
        let streakMultiplier = 1.0;
        if      (this.player.streak >= 10) streakMultiplier = 2.0;
        else if (this.player.streak >= 5)  streakMultiplier = 1.5;
        else if (this.player.streak >= 3)  streakMultiplier = 1.25;

        // ── Damage calculation ───────────────────────────────────────────
        const player_hits  = correctSelections.length
            + [...incorrectSet].filter(i => !selectedSet.has(i)).length;
        const monster_hits = incorrectSelections.length + missedCorrect.length;

        let player_damage = 0;
        for (let i = 0; i < player_hits; i++) {
            player_damage += rollDice(1, this.player.attack_die);
        }
        const itemAttackMult = (this.active_item?.type === 'attack') ? this.active_item.attack_mult : 1.0;
        player_damage = Math.round(player_damage * streakMultiplier * itemAttackMult);

        let monster_damage = 0;
        for (let i = 0; i < monster_hits; i++) {
            monster_damage += rollDice(1, this.current_monster.attack_die);
        }

        const effective_player_damage  = Math.max(player_damage  - this.current_monster.defense, 0);
        let   effective_monster_damage = Math.max(monster_damage - this.player.base_defense,     0);
        if (this.active_item?.type === 'defense')
            effective_monster_damage = Math.round(effective_monster_damage * (1 - this.active_item.defense_reduce));

        this.current_monster.hit_points -= effective_player_damage;
        this.player.hit_points          -= effective_monster_damage;

        let defeated_monster  = false;
        let defeated_player   = false;
        const xp_gained       = this.current_monster.hit_dice * 2;
        let question_repeated = false;
        let levelsGained      = 0;

        this.player.xp += xp_gained;
        levelsGained    = this.checkLevelUp();

        if (this.current_monster.hit_points <= 0) {
            defeated_monster = true;
        }

        if (this.player.hit_points <= 0) {
            defeated_player = true;
        }

        if (missedCorrect.length > 0 || incorrectSelections.length > 0) {
            this.questions_to_ask.push(this.current_question);
            question_repeated = true;
        }

        this.questions_asked++;

        // ── Record for end-of-session review ────────────────────────────
        this.answer_history.push({
            question:             q.question,
            correct_answers:      [...correctSet],
            selected:             selectedOptions,
            correct_selections:   correctSelections,
            incorrect_selections: incorrectSelections,
            missed_correct:       missedCorrect,
            was_perfect:          isPerfect,
        });

        return {
            effective_player_damage,
            effective_monster_damage,
            defeated_monster,
            defeated_player,
            xp_gained,
            question_repeated,
            correctSelections,
            incorrectSelections,
            missedCorrect,
            levelsGained,
            feedback:         q.feedback || null,
            streakMultiplier,
            streakCount:      this.player.streak,
        };
    }

    /**
     * Evaluate a fill-in-the-blank answer.
     * Binary: exact match (honouring case_sensitive) = perfect; anything else = total miss.
     * Returns the same battleData shape as evaluateAnswer().
     */
    evaluateFillBlank(inputText) {
        const q          = this.current_question;
        const acceptable = q.correct || [];   // array of acceptable strings
        const caseSens   = q.case_sensitive === true;

        const normalise = s => caseSens ? s.trim() : s.trim().toLowerCase();
        const input      = normalise(inputText);
        const isPerfect  = acceptable.some(ans => normalise(ans) === input);

        // Streak
        if (isPerfect) {
            this.player.streak++;
            if (this.player.streak > this.player.best_streak)
                this.player.best_streak = this.player.streak;
        } else {
            this.player.streak = 0;
        }

        let streakMultiplier = 1.0;
        if      (this.player.streak >= 10) streakMultiplier = 2.0;
        else if (this.player.streak >= 5)  streakMultiplier = 1.5;
        else if (this.player.streak >= 3)  streakMultiplier = 1.25;

        // Damage — binary: hit or miss
        let player_damage  = 0;
        let monster_damage = 0;

        if (isPerfect) {
            this.player.total_correct++;
            const itemAttackMult = (this.active_item?.type === 'attack') ? this.active_item.attack_mult : 1.0;
            player_damage = Math.round(rollDice(1, this.player.attack_die) * streakMultiplier * itemAttackMult);
        } else {
            this.player.total_incorrect++;
            monster_damage = rollDice(1, this.current_monster.attack_die);
        }

        const effective_player_damage  = Math.max(player_damage  - this.current_monster.defense, 0);
        let   effective_monster_damage = Math.max(monster_damage - this.player.base_defense,     0);
        if (this.active_item?.type === 'defense')
            effective_monster_damage = Math.round(effective_monster_damage * (1 - this.active_item.defense_reduce));

        this.current_monster.hit_points -= effective_player_damage;
        this.player.hit_points          -= effective_monster_damage;

        let defeated_monster    = false;
        let defeated_player     = false;
        const xp_gained         = 10;
        let levelsGained        = 0;
        const question_repeated = !isPerfect;

        this.player.xp += xp_gained;
        levelsGained    = this.checkLevelUp();

        if (this.current_monster.hit_points <= 0) {
            defeated_monster = true;
        }
        if (this.player.hit_points <= 0) defeated_player = true;
        if (!isPerfect) this.questions_to_ask.push(this.current_question);

        this.questions_asked++;

        this.answer_history.push({
            question:             q.question,
            correct_answers:      acceptable,
            selected:             [inputText],
            correct_selections:   isPerfect ? [inputText] : [],
            incorrect_selections: isPerfect ? [] : [inputText],
            missed_correct:       isPerfect ? [] : acceptable,
            was_perfect:          isPerfect,
        });

        return {
            effective_player_damage,
            effective_monster_damage,
            defeated_monster,
            defeated_player,
            xp_gained,
            question_repeated,
            correctSelections:   isPerfect ? [inputText] : [],
            incorrectSelections: isPerfect ? [] : [inputText],
            missedCorrect:       isPerfect ? [] : acceptable,
            levelsGained,
            feedback:         q.feedback || null,
            streakMultiplier,
            streakCount:      this.player.streak,
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
        const pairs = q.pairs || [];   // [{ term, definition }]

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

        // Streak
        if (isPerfect) {
            this.player.streak++;
            if (this.player.streak > this.player.best_streak)
                this.player.best_streak = this.player.streak;
        } else {
            this.player.streak = 0;
        }

        let streakMultiplier = 1.0;
        if      (this.player.streak >= 10) streakMultiplier = 2.0;
        else if (this.player.streak >= 5)  streakMultiplier = 1.5;
        else if (this.player.streak >= 3)  streakMultiplier = 1.25;

        // Proportional damage — roll one die per correct/wrong pair
        let player_damage = 0;
        for (let i = 0; i < correctCount; i++)
            player_damage += rollDice(1, this.player.attack_die);
        const itemAttackMult = (this.active_item?.type === 'attack') ? this.active_item.attack_mult : 1.0;
        player_damage = Math.round(player_damage * streakMultiplier * itemAttackMult);

        let monster_damage = 0;
        for (let i = 0; i < wrongCount; i++)
            monster_damage += rollDice(1, this.current_monster.attack_die);

        const effective_player_damage  = Math.max(player_damage  - this.current_monster.defense, 0);
        let   effective_monster_damage = Math.max(monster_damage - this.player.base_defense,     0);
        if (this.active_item?.type === 'defense')
            effective_monster_damage = Math.round(effective_monster_damage * (1 - this.active_item.defense_reduce));

        this.current_monster.hit_points -= effective_player_damage;
        this.player.hit_points          -= effective_monster_damage;

        let defeated_monster    = false;
        let defeated_player     = false;
        const xp_gained         = 10;
        let levelsGained        = 0;
        const question_repeated = !isPerfect;

        this.player.xp += xp_gained;
        levelsGained    = this.checkLevelUp();

        if (this.current_monster.hit_points <= 0) {
            defeated_monster = true;
        }
        if (this.player.hit_points <= 0) defeated_player = true;
        if (!isPerfect) this.questions_to_ask.push(this.current_question);

        this.questions_asked++;

        // Build human-readable correct/incorrect arrays for the results screen
        const correctSelections   = correctTerms.map(t => `${t} → ${correctMap.get(t)}`);
        const incorrectSelections = wrongTerms.map(t => {
            const student = selectedPairs.find(p => p.term === t)?.definition ?? '(none)';
            return `${t}: chose "${student}" — correct: "${correctMap.get(t)}"`;
        });

        this.answer_history.push({
            question:             q.question,
            correct_answers:      pairs.map(p => `${p.term} → ${p.definition}`),
            selected:             selectedPairs.map(p => `${p.term} → ${p.definition}`),
            correct_selections:   correctSelections,
            incorrect_selections: incorrectSelections,
            missed_correct:       [],
            was_perfect:          isPerfect,
        });

        return {
            effective_player_damage,
            effective_monster_damage,
            defeated_monster,
            defeated_player,
            xp_gained,
            question_repeated,
            correctSelections,
            incorrectSelections,
            missedCorrect: [],
            levelsGained,
            feedback:         q.feedback || null,
            streakMultiplier,
            streakCount:      this.player.streak,
        };
    }

    checkLevelUp() {
        let levelsGained = 0;
        while (this.player.xp >= this.player.xp_to_next_level) {
            this.player.xp              -= this.player.xp_to_next_level;
            this.player.level           += 1;
            this.player.xp_to_next_level = Math.round(100 * Math.pow(1.25, this.player.level - 1));
            levelsGained++;
        }
        return levelsGained;
    }
}
