// src/model.js
/* This file contains the data models and game logic for the "Loop of the Recursive Dragon" game. 

Classes and methods overview:
- Player: Represents the player character, including stats and equipment.
- Monster: Represents a monster with stats and methods to initialize hit points.
- GameModel: Manages the game state, including questions, monsters, player state, and encounter logic.
- loadJSON: Utility function to load JSON data from a URL.
- rollDice: Utility function to simulate dice rolls.
*/

export const WEAPONS = [
    { name: "Rusty Dagger", attack_die: 4 },
    { name: "Copper Shortsword", attack_die: 5 },
    { name: "Iron Battle Axe", attack_die: 6 },
    { name: "Steel Longsword", attack_die: 7 },
    { name: "Mythril Hammer", attack_die: 8 },
    { name: "Adamant Blade", attack_die: 9 },
    { name: "Crystal Sword", attack_die: 10 },
];

export const ARMORS = [
    { name: "Cloth Tunic", defense: 0 },
    { name: "Leather Jerkin", defense: 1 },
    { name: "Chainmail Vest", defense: 2 },
    { name: "Iron Cuirass", defense: 3 },
    { name: "Steel Plate", defense: 4 },
    { name: "Mythril Armor", defense: 5 },
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
        this.level = 1;
        this.xp = 0;
        this.xp_to_next_level = 50;
        this.max_hit_points = 20;
        this.hit_points = 20;
        this.weapon = WEAPONS[0];
        this.armor = ARMORS[0];
        this.total_correct = 0;
        this.total_incorrect = 0;
    }
}

export class Monster {
    constructor(data) {
        this.monster_name = data.monster_name;
        this.initial_description = data.initial_description || "";
        this.hit_dice = data.hit_dice;
        this.attack_die = data.attack_die;
        this.defense = data.defense;
        this.image = data.image || null;  // Optional image property
        this.hit_points = 0;
        for (let i = 0; i < this.hit_dice; i++) {
            this.hit_points += rollDice(1, 10);
        }
        this.xp_value = this.hit_dice * 10;
    }
}

export class GameModel {
    constructor(questions, monsters) {
        this.questions = [...questions];
        this.monsters = monsters;
        this.player = new Player();
        this.current_monster = null;
        this.current_question = null;
        this.questions_asked = 0;

        // Shuffle questions
        for (let i = this.questions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.questions[i], this.questions[j]] = [this.questions[j], this.questions[i]];
        }

        this.questions_to_ask = [...this.questions];
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
                this.current_monster = null;
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
        const q = this.current_question;
        const correctSet = new Set(q.correct || []);
        const incorrectSet = new Set(q.incorrect || []);
        const selectedSet = new Set(selectedOptions);

        const correctSelections = [...selectedSet].filter(s => correctSet.has(s));
        const incorrectSelections = [...selectedSet].filter(s => incorrectSet.has(s));
        const missedCorrect = [...correctSet].filter(c => !selectedSet.has(c));

        this.player.total_correct += correctSelections.length;
        this.player.total_incorrect += incorrectSelections.length;

        const player_hits = correctSelections.length + ([...incorrectSet].filter(i => !selectedSet.has(i)).length);
        const monster_hits = incorrectSelections.length + missedCorrect.length;

        let player_damage = 0;
        for (let i = 0; i < player_hits; i++) {
            player_damage += rollDice(1, this.player.weapon.attack_die);
        }

        let monster_damage = 0;
        for (let i = 0; i < monster_hits; i++) {
            monster_damage += rollDice(1, this.current_monster.attack_die);
        }

        const effective_player_damage = Math.max(player_damage - this.current_monster.defense, 0);
        const effective_monster_damage = Math.max(monster_damage - this.player.armor.defense, 0);

        this.current_monster.hit_points -= effective_player_damage;
        this.player.hit_points -= effective_monster_damage;

        let defeated_monster = false;
        let defeated_player = false;
        let xp_gained = 0;
        let question_repeated = false;
        let levelsGained = 0;

        if (this.current_monster.hit_points <= 0) {
            defeated_monster = true;
            xp_gained = this.current_monster.xp_value;
            this.player.xp += xp_gained;
            // Capture level-up information
            levelsGained = this.checkLevelUp();
        }

        if (this.player.hit_points <= 0) {
            defeated_player = true;
        }

        if (missedCorrect.length > 0 || incorrectSelections.length > 0) {
            this.questions_to_ask.push(this.current_question);
            question_repeated = true;
        }

        this.questions_asked += 1;

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
            levelsGained, // Include levels gained
            feedback: q.feedback || null // Include feedback if present
        };
    }


    // Revised checkLevelUp method:
    checkLevelUp() {
        let levelsGained = 0;
        while (this.player.xp >= this.player.xp_to_next_level) {
            this.player.xp -= this.player.xp_to_next_level;
            this.player.level += 1;
            levelsGained++;
            this.player.xp_to_next_level += 50;
            this.player.max_hit_points += 10;
            this.player.hit_points = this.player.max_hit_points;

            if (this.player.level % 2 === 0) { // Even level: upgrade weapon.
                const weaponIndex = this.player.level / 2; // Level 2 → index 1.
                if (weaponIndex < WEAPONS.length) {
                    this.player.weapon = WEAPONS[weaponIndex];
                } else {
                    console.warn("Player level exceeds available weapons!");
                }
            } else if (this.player.level > 1) { // Odd level (>1): upgrade armor.
                const armorIndex = Math.floor((this.player.level - 1) / 2); // Level 3 → index 1.
                if (armorIndex < ARMORS.length) {
                    this.player.armor = ARMORS[armorIndex];
                } else {
                    console.warn("Player level exceeds available armor!");
                }
            }
        }
        return levelsGained;
    }

    }
