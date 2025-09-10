// main.js
import { loadJSON, GameModel } from "./model.js";


export class GameUI {
    constructor(root, model) {
        this.root = root;
        this.model = model;
    }

    clear() {
        this.root.innerHTML = '';
    }

    showQuestionSetSelection(availableSets, startCallback) {
        this.clear();
        let html = `
            <div class='bbs-container'>
                <div class='title'>Choose Your Question Set</div>
                <div class='section'>
                    Select a question set to begin your adventure.
                </div>
            </div>
        `;
        this.root.insertAdjacentHTML('beforeend', html);

        const select = document.createElement('select');
        availableSets.forEach(set => {
            const option = document.createElement('option');
            option.value = set;
            option.textContent = set;
            select.appendChild(option);
        });
        select.classList.add('question-set-select'); // Added Class

        this.root.appendChild(select);

        const btnContainer = document.createElement('div');
        btnContainer.className = 'button-container'; // Added Class

        const startBtn = document.createElement('button');
        startBtn.textContent = "Load Questions";
        startBtn.onclick = () => {
            const chosenSet = select.value;
            startCallback(chosenSet);
        };
        startBtn.classList.add('action-button'); // Added Class

        btnContainer.appendChild(startBtn);
        this.root.appendChild(btnContainer);
    }

    showInitialScreen(startCallback) {
        this.clear();
        const html = `
            <div class='bbs-container'>
                <div class='title'>Welcome to the Loop of the Recursive Dragon!</div>
                <div class='section'>
                    In this game, you'll get to battle monsters to master ideas about computer science, databases, cybersecurity, the ethics of technology, or other areas. You'll do damage to monsters when you get answers right. They'll do damage to when you get answers wrong. Good luck!
                    
                    <p>A game by Brendan Shea, PhD (Brendan.Shea@rctc.edu)</p>
                </div>
            </div>
        `;
        this.root.insertAdjacentHTML('beforeend', html);

        const btnContainer = document.createElement('div');
        btnContainer.className = 'button-container'; // Added Class

        const startBtn = document.createElement('button');
        startBtn.textContent = "Start Adventure";
        startBtn.onclick = () => startCallback();
        startBtn.classList.add('action-button'); // Added Class

        btnContainer.appendChild(startBtn);
        this.root.appendChild(btnContainer);
    }

    showEncounter() {
        this.clear();
        const p = this.model.player;
        const m = this.model.current_monster;
        const q = this.model.current_question;

        let encounter_html = `
            <div class='bbs-container'>
                <div class='title'>Loop of the Recursive Dragon</div>
                <div class='monster-container'>
        `;

        // If the monster has an image, include it
        if (m.image) {
            encounter_html += `
                <div class='monster-image-container'>
                    <img src='images/monsters/${m.image}' alt='${m.monster_name}' class='monster-image'/>
                </div>
            `;
        }

        encounter_html += `
            <div class='monster-info'>
                You encounter <span class='bold underline'>${m.monster_name}</span>! ${m.initial_description}<br>
                Monster HP: <span class='yellow'>${m.hit_points}</span><br>
                Your HP: <span class='yellow'>${p.hit_points}/${p.max_hit_points}</span>, Lvl: <span class='yellow'>${p.level}</span>, XP: <span class='yellow'>${p.xp}/${p.xp_to_next_level}</span><br>
                Weapon: <span class='yellow'>${p.weapon.name}</span>, Armor: <span class='yellow'>${p.armor.name}</span>
            </div>
        `;

        encounter_html += `
            </div>
            <div class='bbs-container'>
                <div class='section'>
                    <span class='bold'>Question:</span> ${q.question}
                </div>
            </div>
        `;
        this.root.insertAdjacentHTML('beforeend', encounter_html);

        const options = [...(q.correct || []), ...(q.incorrect || [])];
        for (let i = options.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [options[i], options[j]] = [options[j], options[i]];
        }

        const checkboxContainer = document.createElement('div');
        checkboxContainer.className = 'checkbox-container';

        const checkboxes = [];
        options.forEach(opt => {
            const label = document.createElement('label');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = opt;
            label.appendChild(cb);
            label.appendChild(document.createTextNode(' ' + opt));
            label.classList.add('checkbox-label'); // Added Class
            checkboxContainer.appendChild(label);
            checkboxes.push(cb);
        });

        this.root.appendChild(checkboxContainer);

        const btnContainer = document.createElement('div');
        btnContainer.className = 'button-container'; // Added Class

        const submitBtn = document.createElement('button');
        submitBtn.textContent = "Submit Answer";
        submitBtn.onclick = () => {
            const selected = checkboxes.filter(c => c.checked).map(c => c.value);
            window.gameController.submitAnswer(selected);
        };
        submitBtn.classList.add('action-button'); // Added Class


        btnContainer.appendChild(submitBtn);
        // Removed hint button code here
        this.root.appendChild(btnContainer);
    }

    showHint(hint) {
        const oldHint = this.root.querySelector('.hint');
        if (oldHint) oldHint.remove();

        const hintDiv = document.createElement('div');
        hintDiv.className = 'bbs-container hint';
        hintDiv.innerHTML = `<div class='section'><span class='cyan'>Hint: ${hint}</span></div>`;
        this.root.appendChild(hintDiv);
    }

    showResults(battleData, continueCallback) {
        // Remove question and answer elements by targeting their existing classes
        const questionBBSContainer = this.root.querySelector('.bbs-container .section span.bold'); // Targetting the 'Question:' section using a more specific selector
        if (questionBBSContainer && questionBBSContainer.closest('.bbs-container')) { // Need to remove the parent 'bbs-container' div
            questionBBSContainer.closest('.bbs-container').remove();
        }
        const answerCheckboxContainer = this.root.querySelector('.checkbox-container');
        if (answerCheckboxContainer) {
            answerCheckboxContainer.remove();
        }
        const actionButtonContainer = this.root.querySelector('.button-container');
        if (actionButtonContainer) {
            actionButtonContainer.remove();
        }


        const p = this.model.player;
        const m = this.model.current_monster;

        let html = "<div class='bbs-container battle-text'><div class='section'>";

        // Display feedback about correct and incorrect answers
        html += `<div class='feedback-container'>`;
        if (battleData.correctSelections.length > 0) {
            html += `<div class='correct'>✔ Correctly selected:</div><ul>`;
            battleData.correctSelections.forEach(item => {
                html += `<li>${item}</li>`;
            });
            html += `</ul>`;
        } else {
            html += `<div class='correct'>✔ No correct selections.</div>`;
        }

        if (battleData.incorrectSelections.length > 0) {
            html += `<div class='incorrect'>✖ Incorrectly selected:</div><ul>`;
            battleData.incorrectSelections.forEach(item => {
                html += `<li>${item}</li>`;
            });
            html += `</ul>`;
        } else {
            html += `<div class='incorrect'>✖ No incorrect selections.</div>`;
        }

        if (battleData.missedCorrect.length > 0) {
            html += `<div class='missed'>⚠ Missed correct answers:</div><ul>`;
            battleData.missedCorrect.forEach(item => {
                html += `<li>${item}</li>`;
            });
            html += `</ul>`;
        } else {
            html += `<div class='missed'>⚠ No missed correct answers.</div>`;
        }
        html += `</div>`; // Close feedback-container

        

        // Now display damage
        if (battleData.effective_player_damage > 0) {
            html += `You deal <span class='yellow'>${battleData.effective_player_damage}</span> damage.<br>`;
        } else {
            html += "Your attack was ineffective.<br>";
        }

        if (battleData.effective_monster_damage > 0) {
            html += `The monster hits you for <span class='red'>${battleData.effective_monster_damage}</span> damage.<br>`;
        } else {
            if (!battleData.defeated_monster && battleData.effective_monster_damage === 0) {
                html += "The monster cannot penetrate your armor.<br>";
            } else {
                html += "No counter-attack from the monster.<br>";
            }
        }

        if (battleData.defeated_monster) {
            html += `<span class='bold'>You defeated the monster!</span><br>`;
            html += `XP gained: <span class='yellow'>${battleData.xp_gained}</span> (Total: ${p.xp}/${p.xp_to_next_level})<br>`;
        }

        if (battleData.defeated_player) {
            html += `<span class='red bold'>You have been defeated! Game Over.</span></div></div>`;
            this.root.innerHTML = html;
            return;
        }

        if (m && m.hit_points > 0) {
            html += `Monster HP: <span class='yellow'>${m.hit_points}</span><br>`;
        }

        html += `Your HP: <span class='yellow'>${p.hit_points}/${p.max_hit_points}</span><br>`;
        if (battleData.question_repeated) {
            html += "<span class='cyan'>You will face this question again.</span><br>";
        }

        // Display custom feedback if present
        if (battleData.feedback) {
            html += `<div class='custom-feedback'>`;
            html += `<br><div class='bold'>Feedback:</div>`;
            html += `<div class='feedback-text'>${battleData.feedback}</div>`;
            html += `</div>`;
        }


        html += "</div></div>";


        this.root.insertAdjacentHTML('beforeend', html);
        const continueBtn = document.createElement('button');
        continueBtn.textContent = "Continue";
        continueBtn.onclick = () => continueCallback();
        continueBtn.classList.add('action-button'); // Ensure consistent styling
        this.root.appendChild(continueBtn);
    }

    // Revised showLevelUp function:
    showLevelUp(levelsGained, continueCallback) {
        const p = this.model.player;
        let html = `
            <div class='bbs-container level-up-container'>
                <div class='level-up-title'>🎉 Congratulations!</div>
                <div class='section'>
                    <span class='bold'>You've reached level ${p.level}!</span><br>
                    ${levelsGained > 1 ? `You've gained ${levelsGained} levels!` : `You've gained 1 level!`}
                </div>
                <div class='section new-gear'>
                    <span class='bold'>New Gear Unlocked:</span><br>
        `;
        if (p.level % 2 === 0) { // Even level: new weapon.
            html += `<span class='bold'>Weapon:</span> ${p.weapon.name} (Attack Die: d${p.weapon.attack_die})<br>`;
            html += `<span class='bold'>Armor:</span> ${p.armor.name} (Defense: ${p.armor.defense})<br>`;
        } else { // Odd level: new armor.
            html += `<span class='bold'>Armor:</span> ${p.armor.name} (Defense: ${p.armor.defense})<br>`;
            html += `<span class='bold'>Weapon:</span> ${p.weapon.name} (Attack Die: d${p.weapon.attack_die})<br>`;
        }
        html += `
                </div>
                <div class='section hit-points'>
                    <span class='bold'>Hit Points Increased:</span> Your maximum HP is now <span class='yellow'>${p.max_hit_points}</span>!
                </div>
            </div>
        `;
        this.root.innerHTML = html;

        const btnContainer = document.createElement('div');
        btnContainer.className = 'button-container';
        const continueBtn = document.createElement('button');
        continueBtn.textContent = "Continue Adventure";
        continueBtn.onclick = () => continueCallback();
        continueBtn.classList.add('action-button');
        btnContainer.appendChild(continueBtn);
        this.root.appendChild(btnContainer);
    }

    showVictory() {
        this.clear();
        const p = this.model.player;
        const html = `
            <div class='bbs-container'>
                <div class='title'>Victory!</div>
                <div class='section'>
                    All questions answered.<br>
                    Correct: <span class='yellow'>${p.total_correct}</span><br>
                    Incorrect: <span class='yellow'>${p.total_incorrect}</span><br>
                    Level: <span class='yellow'>${p.level}</span><br>
                    HP: <span class='yellow'>${p.hit_points}/${p.max_hit_points}</span><br>
                    Weapon: <span class='yellow'>${p.weapon.name}</span><br>
                    Armor: <span class='yellow'>${p.armor.name}</span>
                </div>
            </div>
        `;
        this.root.innerHTML = html;
    }

    showNoQuestions() {
        this.clear();
        const p = this.model.player;
        const html = `
            <div class='bbs-container'>
                <div class='section'>
                    <span class='bold red'>All questions have been answered!</span> The monster flees.
                </div>
                <div class='section'>
                    <span class='bold'>Final Stats:</span><br>
                    Correct: <span class='yellow'>${p.total_correct}</span><br>
                    Incorrect: <span class='yellow'>${p.total_incorrect}</span><br>
                    HP: <span class='yellow'>${p.hit_points}/${p.max_hit_points}</span><br>
                    Level: <span class='yellow'>${p.level}</span>
                </div>
            </div>
        `;
        this.root.innerHTML = html;
    }

    showGameOver() {
        this.clear();
        const p = this.model.player;
        const html = `
            <div class='bbs-container'>
                <div class='title'>Game Over</div>
                <div class='section'>
                    Correct: <span class='yellow'>${p.total_correct}</span><br>
                    Incorrect: <span class='yellow'>${p.total_incorrect}</span><br>
                    Level: <span class='yellow'>${p.level}</span><br>
                    HP: <span class='yellow'>${p.hit_points}/${p.max_hit_points}</span><br>
                    Weapon: <span class='yellow'>${p.weapon.name}</span><br>
                    Armor: <span class='yellow'>${p.armor.name}</span>
                </div>
            </div>
        `;
        this.root.innerHTML = html;
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
