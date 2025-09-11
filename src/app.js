// app.js
/* This file contains the main game logic and UI rendering for the "Loop of the Recursive Dragon" game. 

Classes and methods overview:
- GameUI: Handles the user interface and rendering.
- GameController: Manages the game flow and interactions between the model and UI.
- GameModel: Represents the game state, including the player, monsters, and questions (from model.js).

*/

import { loadJSON, GameModel } from "./model.js";


// helpers for working with <template>
function renderTemplate(root, id) {
  root.innerHTML = "";
  const tpl = document.getElementById(id);
  if (!tpl) throw new Error(`Missing template: ${id}`);
  const frag = tpl.content.cloneNode(true);
  root.appendChild(frag);
  return root;
}
const $  = (root, sel) => root.querySelector(sel);
const $$ = (root, sel) => [...root.querySelectorAll(sel)];

export class GameUI {
  constructor(root, model) {
    this.root = root;
    this.model = model;
  }

  setModel(model) { this.model = model; }

  clear() { this.root.innerHTML = ""; }

  showQuestionSetSelection(availableSets, startCallback) {
    renderTemplate(this.root, "tpl-set-select");
    const select = $(this.root, "[data-ref=setSelect]");
    availableSets.forEach(set => {
      const opt = document.createElement("option");
      opt.value = set; opt.textContent = set;
      select.appendChild(opt);
    });
    $(this.root, "[data-action=load]")
      .addEventListener("click", () => startCallback(select.value));
  }

  showInitialScreen(startCallback) {
    renderTemplate(this.root, "tpl-initial");
    $(this.root, "[data-action=start]")
      .addEventListener("click", () => startCallback());
  }

  showEncounter() {
    const p = this.model.player;
    const m = this.model.current_monster;
    const q = this.model.current_question;

    renderTemplate(this.root, "tpl-encounter");

    // Fill monster/player info
    $ (this.root, "[data-ref=mName]").textContent  = m.monster_name;
    $ (this.root, "[data-ref=mDesc]").textContent  = " " + (m.initial_description || "");
    $ (this.root, "[data-ref=mHP]").textContent    = m.hit_points;
    $ (this.root, "[data-ref=pHP]").textContent    = `${p.hit_points}/${p.max_hit_points}`;
    $ (this.root, "[data-ref=pLvl]").textContent   = p.level;
    $ (this.root, "[data-ref=pXP]").textContent    = `${p.xp}/${p.xp_to_next_level}`;
    $ (this.root, "[data-ref=pWeap]").textContent  = p.weapon.name;
    $ (this.root, "[data-ref=pArmor]").textContent = p.armor.name;
    $ (this.root, "[data-ref=qText]").textContent  = q.question;

    // Optional image
    if (m.image) {
      const wrap = $(this.root, "[data-ref=imgWrap]");
      const img  = $(this.root, "[data-ref=img]");
      img.src = `images/monsters/${m.image}`;
      img.alt = m.monster_name;
      wrap.hidden = false;
    }

    // Options
    const options = [...(q.correct || []), ...(q.incorrect || [])];
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    const optBox = $(this.root, "[data-ref=options]");
    const checkboxes = [];
    options.forEach(opt => {
      const id = `opt-${Math.random().toString(36).slice(2)}`;
      const label = document.createElement("label");
      label.className = "checkbox-label";
      const cb = document.createElement("input");
      cb.type = "checkbox"; cb.value = opt; cb.id = id;
      const txt = document.createTextNode(" " + opt);
      label.appendChild(cb);
      label.appendChild(txt);
      optBox.appendChild(label);
      checkboxes.push(cb);
    });

    $(this.root, "[data-action=submit]").addEventListener("click", () => {
      const selected = checkboxes.filter(c => c.checked).map(c => c.value);
      // keep current contract with your controller
      window.gameController.submitAnswer(selected);
    });
  }

  showHint(hint) {
    // remove existing hint if any
    const old = this.root.querySelector(".hint");
    if (old) old.remove();
    const tpl = document.getElementById("tpl-hint");
    const frag = tpl.content.cloneNode(true);
    frag.querySelector("[data-ref=hintText]").textContent = hint;
    this.root.appendChild(frag);
  }

  showResults(battleData, continueCallback) {
    const p = this.model.player;
    const m = this.model.current_monster;

    renderTemplate(this.root, "tpl-results");
    const body = $(this.root, "[data-ref=resultsBody]");

    // Feedback lists
    const buildList = (titleClass, titleText, items) => {
      const title = document.createElement("div");
      title.className = titleClass;
      title.textContent = titleText;
      body.appendChild(title);
      const ul = document.createElement("ul");
      if (items.length === 0) {
        const li = document.createElement("li");
        li.textContent = "None.";
        ul.appendChild(li);
      } else {
        items.forEach(item => {
          const li = document.createElement("li");
          li.textContent = item;
          ul.appendChild(li);
        });
      }
      body.appendChild(ul);
    };

    const fbWrap = document.createElement("div");
    fbWrap.className = "feedback-container";
    body.appendChild(fbWrap);
    // Temporarily point "body" at fbWrap while building lists
    const savedBody = body;
    const tmpBody = fbWrap;

    // Correct / Incorrect / Missed
    (function (b) {
      const add = (cls, title, arr) => {
        const d = document.createElement("div");
        d.className = cls;
        d.textContent = title;
        b.appendChild(d);
        const ul = document.createElement("ul");
        if (arr.length === 0) {
          const li = document.createElement("li"); li.textContent = "None.";
          ul.appendChild(li);
        } else {
          arr.forEach(x => { const li = document.createElement("li"); li.textContent = x; ul.appendChild(li); });
        }
        b.appendChild(ul);
      };
      add("correct",   "✔ Correctly selected:",  battleData.correctSelections);
      add("incorrect", "✖ Incorrectly selected:", battleData.incorrectSelections);
      add("missed",    "⚠ Missed correct answers:", battleData.missedCorrect);
    })(tmpBody);

    // Damage + state
    const lines = [];
    lines.push(
      (battleData.effective_player_damage > 0)
        ? `You deal ${battleData.effective_player_damage} damage.`
        : "Your attack was ineffective."
    );
    if (battleData.effective_monster_damage > 0) {
      lines.push(`The monster hits you for ${battleData.effective_monster_damage} damage.`);
    } else {
      if (!battleData.defeated_monster && battleData.effective_monster_damage === 0) {
        lines.push("The monster cannot penetrate your armor.");
      } else {
        lines.push("No counter-attack from the monster.");
      }
    }
    if (battleData.defeated_monster) {
      lines.push(`You defeated the monster!`);
      lines.push(`XP gained: ${battleData.xp_gained} (Total: ${p.xp}/${p.xp_to_next_level})`);
    }
    if (m && m.hit_points > 0) {
      lines.push(`Monster HP: ${m.hit_points}`);
    }
    lines.push(`Your HP: ${p.hit_points}/${p.max_hit_points}`);
    if (battleData.question_repeated) {
      lines.push("You will face this question again.");
    }
    if (battleData.feedback) {
      const block = document.createElement("div");
      block.className = "custom-feedback";
      block.innerHTML = `<br><div class='bold'>Feedback:</div><div class='feedback-text'></div>`;
      block.querySelector(".feedback-text").textContent = battleData.feedback;
      savedBody.appendChild(block);
    }

    const dmg = document.createElement("div");
    dmg.innerHTML = lines.map(s => `${s}<br>`).join("");
    savedBody.appendChild(dmg);

    $(this.root, "[data-action=continue]")
      .addEventListener("click", () => continueCallback());
  }

  showLevelUp(levelsGained, continueCallback) {
    const p = this.model.player;
    renderTemplate(this.root, "tpl-levelup");
    $(this.root, "[data-ref=level]").textContent = p.level;
    $(this.root, "[data-ref=levelsGainedText]").textContent =
      (levelsGained > 1) ? `You've gained ${levelsGained} levels!` : `You've gained 1 level!`;
    $(this.root, "[data-ref=weaponName]").textContent = p.weapon.name;
    $(this.root, "[data-ref=weaponDie]").textContent  = `Attack Die: d${p.weapon.attack_die}`;
    $(this.root, "[data-ref=armorName]").textContent  = p.armor.name;
    $(this.root, "[data-ref=armorDef]").textContent   = p.armor.defense;
    $(this.root, "[data-ref=maxHP]").textContent      = p.max_hit_points;
    $(this.root, "[data-action=continue]")
      .addEventListener("click", () => continueCallback());
  }

  showVictory() {
    const p = this.model.player;
    renderTemplate(this.root, "tpl-victory");
    const stats = $(this.root, "[data-ref=victoryStats]");
    stats.innerHTML = `
      All questions answered.<br>
      Correct: <span class='yellow'>${p.total_correct}</span><br>
      Incorrect: <span class='yellow'>${p.total_incorrect}</span><br>
      Level: <span class='yellow'>${p.level}</span><br>
      HP: <span class='yellow'>${p.hit_points}/${p.max_hit_points}</span><br>
      Weapon: <span class='yellow'>${p.weapon.name}</span><br>
      Armor: <span class='yellow'>${p.armor.name}</span>
    `;
  }

  showNoQuestions() {
    const p = this.model.player;
    renderTemplate(this.root, "tpl-no-questions");
    const stats = $(this.root, "[data-ref=finalStats]");
    stats.innerHTML = `
      <span class='bold'>Final Stats:</span><br>
      Correct: <span class='yellow'>${p.total_correct}</span><br>
      Incorrect: <span class='yellow'>${p.total_incorrect}</span><br>
      HP: <span class='yellow'>${p.hit_points}/${p.max_hit_points}</span><br>
      Level: <span class='yellow'>${p.level}</span>
    `;
  }

  showGameOver() {
    const p = this.model.player;
    renderTemplate(this.root, "tpl-gameover");
    const stats = $(this.root, "[data-ref=gameOverStats]");
    stats.innerHTML = `
      Correct: <span class='yellow'>${p.total_correct}</span><br>
      Incorrect: <span class='yellow'>${p.total_incorrect}</span><br>
      Level: <span class='yellow'>${p.level}</span><br>
      HP: <span class='yellow'>${p.hit_points}/${p.max_hit_points}</span><br>
      Weapon: <span class='yellow'>${p.weapon.name}</span><br>
      Armor: <span class='yellow'>${p.armor.name}</span>
    `;
  }
}

export class GameController {
    constructor() {
        this.root = document.getElementById('game-root');
        this.ui = new GameUI(this.root, null);

        // Parse URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const specifiedSet = urlParams.get('set');

        if (specifiedSet) {
            // Attempt to load the specified set
            this.loadSpecifiedSet(specifiedSet);
        } else {
            // Show the question set selection screen
            this.showQuestionSetSelection();
        }
    }

    async loadSpecifiedSet(setName) {
        try {
            // Fetch available question sets to validate the specified set
            const availableSets = await loadJSON('question_sets/index.json');
            if (!availableSets.includes(setName)) {
                throw new Error(`Question set "${setName}" does not exist.`);
            }

            // Load the specified question set
            const questions_url = `question_sets/${setName}`;
            const monsters_url = `assets/monsters.json`;
            const questions_data = await loadJSON(questions_url);
            const monsters_data = await loadJSON(monsters_url);
            this.model = new GameModel(questions_data, monsters_data);
            this.ui = new GameUI(this.root, this.model);
            this.ui.showInitialScreen(() => this.startAdventure());
        } catch (err) {
            // If there's an error (e.g., set doesn't exist), show an error message
            this.root.innerHTML = `
                <div class='bbs-container'>
                    <div class='section red bold'>Error loading question set "${setName}": ${err.message}</div>
                    <div class='section'>
                        <button class='action-button' onclick='window.gameController.showQuestionSetSelection()'>
                            Go Back to Selection
                        </button>
                    </div>
                </div>
            `;
        }
    }

    async showQuestionSetSelection() {
        try {
            // Fetch the list of available question sets from a known JSON index.
            const availableSets = await loadJSON('question_sets/index.json');
            this.ui.clear();
            this.ui.showQuestionSetSelection(availableSets, (chosenSet) => this.loadChosenSet(chosenSet));
        } catch (err) {
            this.root.innerHTML = `<div class='bbs-container'><div class='section red bold'>Error loading question sets: ${err.message}</div></div>`;
        }
    }

    async loadChosenSet(chosenSet) {
        try {
            const questions_url = `question_sets/${chosenSet}`;
            const monsters_url = `assets/monsters.json`;
            const questions_data = await loadJSON(questions_url);
            const monsters_data = await loadJSON(monsters_url);
            this.model = new GameModel(questions_data, monsters_data);
            this.ui = new GameUI(this.root, this.model);
            this.ui.showInitialScreen(() => this.startAdventure());

            // Optional: Update the URL to include the selected set
            const newURL = new URL(window.location);
            newURL.searchParams.set('set', chosenSet);
            window.history.replaceState({}, '', newURL);
        } catch (err) {
            this.root.innerHTML = `<div class='bbs-container'><div class='section red bold'>Error loading game data: ${err.message}</div></div>`;
        }
    }

    startAdventure() {
        const status = this.model.nextEncounter();
        this.showEncounterStatus(status);
    }

    showEncounterStatus(status) {
        if (status === "victory") {
            this.ui.showVictory();
        } else if (status === "no_questions") {
            this.ui.showNoQuestions();
        } else {
            this.ui.showEncounter();
        }
    }


    submitAnswer(selected) {
        if (!this.model.current_question) return;
        if (selected.length === 0) {
            this.ui.showHint("Please select at least one option.");
            return;
        }
        const battleData = this.model.evaluateAnswer(selected);
        if (battleData.defeated_player) {
            this.ui.showGameOver();
            return;
        }

        this.ui.showResults(battleData, () => { // Show results first
            if (battleData.levelsGained > 0) {
                this.ui.showLevelUp(battleData.levelsGained, () => this.continueAdventure());
            } else {
                this.continueAdventure(); // Continue after results
            }
        });
    }


    continueAdventure() {
        const status = this.model.nextEncounter();
        this.showEncounterStatus(status);
    }
}
