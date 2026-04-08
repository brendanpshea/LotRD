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

export const WEAPONS = [
    { name: "Rusty Dagger",      attack_die: 4 },
    { name: "Copper Shortsword", attack_die: 5 },
    { name: "Iron Battle Axe",   attack_die: 6 },
    { name: "Steel Longsword",   attack_die: 7 },
    { name: "Mythril Hammer",    attack_die: 8 },
    { name: "Adamant Blade",     attack_die: 9 },
    { name: "Crystal Sword",     attack_die: 10 },
];

export const ARMORS = [
    { name: "Cloth Tunic",       defense: 0 },
    { name: "Leather Jerkin",    defense: 1 },
    { name: "Chainmail Vest",    defense: 2 },
    { name: "Iron Cuirass",      defense: 3 },
    { name: "Steel Plate",       defense: 4 },
    { name: "Mythril Armor",     defense: 5 },
    { name: "Dragon Scale Mail", defense: 6 },
];

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
    constructor() {
        this.level            = 1;
        this.xp               = 0;
        this.xp_to_next_level = 50;
        this.max_hit_points   = 20;
        this.hit_points       = 20;
        this.weapon           = WEAPONS[0];
        this.armor            = ARMORS[0];
        this.total_correct    = 0;
        this.total_incorrect  = 0;
        this.streak           = 0;  // consecutive perfect-answer streak
        this.best_streak      = 0;  // session high-water mark
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
        this.xp_value = this.hit_dice * 10;
    }
}

export class GameModel {
    /**
     * @param {object[]} questions  – full question array (already loaded from JSON)
     * @param {object[]} monsters   – monster definitions
     * @param {object|null} saveData – optional: resume from a localStorage snapshot
     */
    constructor(questions, monsters, saveData = null) {
        this.monsters         = monsters;
        this.current_monster  = null;
        this.current_question = null;

        if (saveData) {
            // ── Resume path ──────────────────────────────────────────────
            this.questions        = saveData.questions;
            this.questions_to_ask = saveData.questions_to_ask;
            this.questions_asked  = saveData.questions_asked || 0;
            this.answer_history   = saveData.answer_history  || [];

            const p = new Player();
            const sp = saveData.player;
            p.level            = sp.level;
            p.xp               = sp.xp;
            p.xp_to_next_level = sp.xp_to_next_level;
            p.max_hit_points   = sp.max_hit_points;
            p.hit_points       = sp.hit_points;
            p.total_correct    = sp.total_correct;
            p.total_incorrect  = sp.total_incorrect;
            p.streak           = sp.streak      || 0;
            p.best_streak      = sp.best_streak || 0;
            p.weapon           = WEAPONS[sp.weapon_index] || WEAPONS[0];
            p.armor            = ARMORS[sp.armor_index]  || ARMORS[0];
            this.player = p;
        } else {
            // ── Fresh game path ──────────────────────────────────────────
            this.questions       = [...questions];
            this.questions_asked = 0;
            this.answer_history  = [];
            this.player          = new Player();

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
                weapon_index:     WEAPONS.indexOf(p.weapon),
                armor_index:      ARMORS.indexOf(p.armor),
            },
        };
    }

    generateMonster() {
        let valid = this.monsters.filter(m => Math.abs(m.hit_dice - this.player.level) <= 1);
        if (valid.length === 0) valid = this.monsters;
        const chosen = valid[Math.floor(Math.random() * valid.length)];
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
            player_damage += rollDice(1, this.player.weapon.attack_die);
        }
        player_damage = Math.round(player_damage * streakMultiplier);

        let monster_damage = 0;
        for (let i = 0; i < monster_hits; i++) {
            monster_damage += rollDice(1, this.current_monster.attack_die);
        }

        const effective_player_damage  = Math.max(player_damage  - this.current_monster.defense, 0);
        const effective_monster_damage = Math.max(monster_damage - this.player.armor.defense,    0);

        this.current_monster.hit_points -= effective_player_damage;
        this.player.hit_points          -= effective_monster_damage;

        let defeated_monster  = false;
        let defeated_player   = false;
        let xp_gained         = 0;
        let question_repeated = false;
        let levelsGained      = 0;

        if (this.current_monster.hit_points <= 0) {
            defeated_monster = true;
            xp_gained        = this.current_monster.xp_value;
            this.player.xp  += xp_gained;
            levelsGained     = this.checkLevelUp();
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

    checkLevelUp() {
        let levelsGained = 0;
        while (this.player.xp >= this.player.xp_to_next_level) {
            this.player.xp            -= this.player.xp_to_next_level;
            this.player.level         += 1;
            levelsGained++;
            this.player.xp_to_next_level += 50;
            this.player.max_hit_points   += 10;
            this.player.hit_points        = this.player.max_hit_points;

            if (this.player.level % 2 === 0) {
                const wi = this.player.level / 2;
                if (wi < WEAPONS.length) this.player.weapon = WEAPONS[wi];
                else console.warn("Player level exceeds available weapons!");
            } else if (this.player.level > 1) {
                const ai = Math.floor((this.player.level - 1) / 2);
                if (ai < ARMORS.length) this.player.armor = ARMORS[ai];
                else console.warn("Player level exceeds available armor!");
            }
        }
        return levelsGained;
    }
}
