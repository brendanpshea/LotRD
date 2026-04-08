// app.js
/* UI rendering and game controller for "Loop of the Recursive Dragon".

Classes:
- SoundSystem    – Web Audio API sound effects (no external dependencies)
- GameUI         – renders every screen; manages keyboard listeners
- GameController – orchestrates game flow, persistence, and sound
*/

import { loadJSON, GameModel } from "./model.js";

// ─── Template / DOM helpers ───────────────────────────────────────────────────
function renderTemplate(root, id) {
  root.innerHTML = "";
  const tpl = document.getElementById(id);
  if (!tpl) throw new Error(`Missing template: ${id}`);
  root.appendChild(tpl.content.cloneNode(true));
  return root;
}
const $  = (root, sel) => root.querySelector(sel);
const $$ = (root, sel) => [...root.querySelectorAll(sel)];

// ─── Sound System ─────────────────────────────────────────────────────────────
class SoundSystem {
  constructor() {
    this._ctx    = null;
    this.enabled = true;
  }

  _getCtx() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Resume if tab was backgrounded
    if (this._ctx.state === 'suspended') this._ctx.resume();
    return this._ctx;
  }

  _beep(freq, dur, type = 'square', vol = 0.12, delay = 0) {
    if (!this.enabled) return;
    try {
      const ctx  = this._getCtx();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type            = type;
      osc.frequency.value = freq;
      const t = ctx.currentTime + delay;
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.start(t);
      osc.stop(t + dur);
    } catch (_) { /* AudioContext unavailable in this environment */ }
  }

  correct() {
    // Ascending arpeggio – C5, E5, G5
    this._beep(523, 0.08);
    this._beep(659, 0.08, 'square', 0.12, 0.09);
    this._beep(784, 0.15, 'square', 0.12, 0.18);
  }

  incorrect() {
    // Descending buzz
    this._beep(220, 0.12, 'sawtooth', 0.10);
    this._beep(165, 0.25, 'sawtooth', 0.10, 0.13);
  }

  levelUp() {
    // Four-note fanfare
    [523, 659, 784, 1047].forEach((f, i) =>
      this._beep(f, 0.14, 'square', 0.11, i * 0.14));
  }

  victory() {
    // Longer fanfare
    [523, 659, 784, 659, 784, 1047].forEach((f, i) =>
      this._beep(f, 0.16, 'square', 0.11, i * 0.15));
  }

  gameOver() {
    // Descending sad tones
    [330, 247, 196, 147].forEach((f, i) =>
      this._beep(f, 0.22, 'sawtooth', 0.10, i * 0.22));
  }

  monsterDefeated() {
    this._beep(660, 0.08);
    this._beep(880, 0.14, 'square', 0.11, 0.09);
  }

  streakHit(n) {
    // Pitch rises with streak length
    const f = Math.min(400 + n * 40, 880);
    this._beep(f,        0.06, 'square', 0.09);
    this._beep(f * 1.25, 0.10, 'square', 0.09, 0.08);
  }
}

// ─── GameUI ───────────────────────────────────────────────────────────────────
export class GameUI {
  constructor(root, model) {
    this.root     = root;
    this.model    = model;
    this._kbAbort = null;
  }

  setModel(model) { this.model = model; }
  clear()         { this.root.innerHTML = ""; }

  /** Abort any active keyboard handler attached to this screen. */
  _clearKeyboard() {
    if (this._kbAbort) { this._kbAbort.abort(); this._kbAbort = null; }
  }

  /** Minimal HTML escaping for strings inserted via innerHTML. */
  _esc(str) {
    const d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
  }

  // ── Screens ──────────────────────────────────────────────────────────────────

  showInitialScreen(startCallback) {
    this._clearKeyboard();
    renderTemplate(this.root, "tpl-initial");
    const btn = $(this.root, "[data-action=start]");
    btn.addEventListener("click", () => startCallback());
    btn.focus();
  }

  showQuestionSetSelection(availableSets, startCallback) {
    this._clearKeyboard();
    renderTemplate(this.root, "tpl-set-select");
    const select = $(this.root, "[data-ref=setSelect]");
    availableSets.forEach(set => {
      const opt = document.createElement("option");
      opt.value = set; opt.textContent = set;
      select.appendChild(opt);
    });
    $(this.root, "[data-action=load]")
      .addEventListener("click", () => startCallback(select.value));
    select.focus();
  }

  showResumePrompt(saveData, resumeCallback, newGameCallback) {
    this._clearKeyboard();
    renderTemplate(this.root, "tpl-resume");
    const info      = $(this.root, "[data-ref=resumeInfo]");
    const remaining = saveData.questions_to_ask?.length ?? 0;
    const savedAt   = saveData.savedAt
      ? new Date(saveData.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      : 'a previous session';
    info.innerHTML = `
      Saved game from <span class="yellow">${this._esc(savedAt)}</span>.<br>
      Level: <span class="yellow">${saveData.player?.level ?? 1}</span> &nbsp;&nbsp;
      Questions remaining: <span class="yellow">${remaining}</span><br>
      Resume where you left off, or start a new game?
    `;
    const resumeBtn = $(this.root, "[data-action=resume]");
    resumeBtn.addEventListener("click", () => resumeCallback());
    $(this.root, "[data-action=new-game]").addEventListener("click", () => newGameCallback());
    resumeBtn.focus();
  }

  showEncounter() {
    this._clearKeyboard();
    const p = this.model.player;
    const m = this.model.current_monster;
    const q = this.model.current_question;

    renderTemplate(this.root, "tpl-encounter");

    // Monster / player stats
    $(this.root, "[data-ref=mName]") .textContent = m.monster_name;
    $(this.root, "[data-ref=mDesc]") .textContent = " " + (m.initial_description || "");
    $(this.root, "[data-ref=mHP]")   .textContent = m.hit_points;
    $(this.root, "[data-ref=pHP]")   .textContent = `${p.hit_points}/${p.max_hit_points}`;
    $(this.root, "[data-ref=pLvl]")  .textContent = p.level;
    $(this.root, "[data-ref=pXP]")   .textContent = `${p.xp}/${p.xp_to_next_level}`;
    $(this.root, "[data-ref=pWeap]") .textContent = p.weapon.name;
    $(this.root, "[data-ref=pArmor]").textContent = p.armor.name;

    // Streak display
    const streakEl = $(this.root, "[data-ref=streak]");
    if (streakEl) {
      if (p.streak >= 3) {
        const bonus = p.streak >= 10 ? '2×' : p.streak >= 5 ? '1.5×' : '1.25×';
        streakEl.textContent = `🔥 Streak: ${p.streak}  (${bonus} damage bonus active)`;
        streakEl.hidden = false;
      } else if (p.streak > 0) {
        streakEl.textContent = `🔥 Streak: ${p.streak}`;
        streakEl.hidden = false;
      } else {
        streakEl.hidden = true;
      }
    }

    // Question text (also used as ARIA label for the option group)
    const qEl = $(this.root, "[data-ref=qText]");
    qEl.textContent = q.question;
    qEl.id = "encounter-question-label";

    // Monster image
    if (m.image) {
      const wrap = $(this.root, "[data-ref=imgWrap]");
      const img  = $(this.root, "[data-ref=img]");
      img.src    = `images/monsters/${m.image}`;
      img.alt    = m.monster_name;
      wrap.hidden = false;
    }

    // Build answer options (shuffled)
    const options = [...(q.correct || []), ...(q.incorrect || [])];
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }

    const optBox = $(this.root, "[data-ref=options]");
    optBox.setAttribute("role", "group");
    optBox.setAttribute("aria-labelledby", "encounter-question-label");

    const checkboxes = [];
    options.forEach((opt, idx) => {
      const id    = `opt-${Math.random().toString(36).slice(2)}`;
      const label = document.createElement("label");
      label.className = "checkbox-label";

      const cb = document.createElement("input");
      cb.type  = "checkbox";
      cb.value = opt;
      cb.id    = id;
      cb.setAttribute("aria-label", `Option ${idx + 1}: ${opt}`);

      const num = document.createElement("span");
      num.className   = "option-num";
      num.textContent = `${idx + 1}.\u00a0`;
      num.setAttribute("aria-hidden", "true");

      label.appendChild(cb);
      label.appendChild(num);
      label.appendChild(document.createTextNode(opt));
      optBox.appendChild(label);
      checkboxes.push(cb);
    });

    // Keyboard shortcut hint
    const kbHint = $(this.root, "[data-ref=kbHint]");
    if (kbHint) kbHint.textContent = `Keys: 1–${options.length} toggle options · Enter submits`;

    // Submit button
    const submitBtn = $(this.root, "[data-action=submit]");
    submitBtn.addEventListener("click", () => {
      const selected = checkboxes.filter(c => c.checked).map(c => c.value);
      window.gameController.submitAnswer(selected);
    });

    // Keyboard navigation for this screen
    this._kbAbort = new AbortController();
    document.addEventListener("keydown", (e) => {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= checkboxes.length) {
        e.preventDefault();
        checkboxes[n - 1].checked = !checkboxes[n - 1].checked;
      } else if (e.key === "Enter") {
        e.preventDefault();
        submitBtn.click();
      }
    }, { signal: this._kbAbort.signal });

    // Focus first checkbox so keyboard users can start immediately
    if (checkboxes.length > 0) checkboxes[0].focus();
  }

  showHint(hint) {
    const old = this.root.querySelector(".hint");
    if (old) old.remove();
    const tpl  = document.getElementById("tpl-hint");
    const frag = tpl.content.cloneNode(true);
    frag.querySelector("[data-ref=hintText]").textContent = hint;
    this.root.appendChild(frag);
  }

  showResults(battleData, continueCallback) {
    this._clearKeyboard();
    const p = this.model.player;
    const m = this.model.current_monster;

    renderTemplate(this.root, "tpl-results");
    const body = $(this.root, "[data-ref=resultsBody]");

    // Correct / Incorrect / Missed lists
    const fbWrap = document.createElement("div");
    fbWrap.className = "feedback-container";
    body.appendChild(fbWrap);

    const addList = (container, cls, title, arr) => {
      const heading = document.createElement("div");
      heading.className   = cls;
      heading.textContent = title;
      container.appendChild(heading);
      const ul = document.createElement("ul");
      if (arr.length === 0) {
        const li = document.createElement("li"); li.textContent = "None."; ul.appendChild(li);
      } else {
        arr.forEach(x => { const li = document.createElement("li"); li.textContent = x; ul.appendChild(li); });
      }
      container.appendChild(ul);
    };
    addList(fbWrap, "correct",   "✔ Correctly selected:",     battleData.correctSelections);
    addList(fbWrap, "incorrect", "✖ Incorrectly selected:",   battleData.incorrectSelections);
    addList(fbWrap, "missed",    "⚠ Missed correct answers:", battleData.missedCorrect);

    // Streak bonus note
    if (battleData.streakMultiplier > 1) {
      const sb = document.createElement("div");
      sb.className   = "streak-bonus-note";
      sb.textContent = `🔥 Streak ×${battleData.streakMultiplier} bonus applied to your attack!`;
      body.appendChild(sb);
    }

    // Battle narrative
    const lines = [];
    lines.push(
      battleData.effective_player_damage > 0
        ? `You deal ${battleData.effective_player_damage} damage.`
        : "Your attack was ineffective."
    );
    if (battleData.effective_monster_damage > 0) {
      lines.push(`The monster hits you for ${battleData.effective_monster_damage} damage.`);
    } else if (!battleData.defeated_monster) {
      lines.push("The monster cannot penetrate your armor.");
    }
    if (battleData.defeated_monster) {
      lines.push(`You defeated the monster!`);
      lines.push(`XP gained: ${battleData.xp_gained} (Total: ${p.xp}/${p.xp_to_next_level})`);
    }
    if (m && m.hit_points > 0) lines.push(`Monster HP: ${m.hit_points}`);
    lines.push(`Your HP: ${p.hit_points}/${p.max_hit_points}`);
    if (battleData.question_repeated) lines.push("You will face this question again.");

    const dmg = document.createElement("div");
    dmg.innerHTML = lines.map(s => `${this._esc(s)}<br>`).join("");
    body.appendChild(dmg);

    if (battleData.feedback) {
      const block = document.createElement("div");
      block.className = "custom-feedback";
      block.innerHTML = `<div class='bold'>Feedback:</div><div class='feedback-text'></div>`;
      block.querySelector(".feedback-text").textContent = battleData.feedback;
      body.appendChild(block);
    }

    const cont = $(this.root, "[data-action=continue]");
    cont.addEventListener("click", () => continueCallback());
    cont.focus();

    // Enter key to continue
    this._kbAbort = new AbortController();
    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); continueCallback(); }
    }, { signal: this._kbAbort.signal });
  }

  showLevelUp(levelsGained, continueCallback) {
    this._clearKeyboard();
    const p = this.model.player;
    renderTemplate(this.root, "tpl-levelup");
    $(this.root, "[data-ref=level]")           .textContent = p.level;
    $(this.root, "[data-ref=levelsGainedText]").textContent =
      levelsGained > 1 ? `You've gained ${levelsGained} levels!` : `You've gained 1 level!`;
    $(this.root, "[data-ref=weaponName]").textContent = p.weapon.name;
    $(this.root, "[data-ref=weaponDie]") .textContent = `Attack Die: d${p.weapon.attack_die}`;
    $(this.root, "[data-ref=armorName]") .textContent = p.armor.name;
    $(this.root, "[data-ref=armorDef]")  .textContent = p.armor.defense;
    $(this.root, "[data-ref=maxHP]")     .textContent = p.max_hit_points;

    const cont = $(this.root, "[data-action=continue]");
    cont.addEventListener("click", () => continueCallback());
    cont.focus();

    this._kbAbort = new AbortController();
    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); continueCallback(); }
    }, { signal: this._kbAbort.signal });
  }

  showVictory(reviewCallback) {
    this._clearKeyboard();
    const p = this.model.player;
    renderTemplate(this.root, "tpl-victory");
    const stats = $(this.root, "[data-ref=victoryStats]");
    stats.innerHTML = `
      All questions answered!<br>
      Correct: <span class='yellow'>${p.total_correct}</span><br>
      Incorrect: <span class='yellow'>${p.total_incorrect}</span><br>
      Best Streak: <span class='yellow'>${p.best_streak}</span><br>
      Level: <span class='yellow'>${p.level}</span><br>
      HP: <span class='yellow'>${p.hit_points}/${p.max_hit_points}</span><br>
      Weapon: <span class='yellow'>${this._esc(p.weapon.name)}</span><br>
      Armor: <span class='yellow'>${this._esc(p.armor.name)}</span>
    `;
    const btn = $(this.root, "[data-action=review]");
    if (btn) { btn.addEventListener("click", () => reviewCallback()); btn.focus(); }
  }

  showNoQuestions(reviewCallback) {
    this._clearKeyboard();
    const p = this.model.player;
    renderTemplate(this.root, "tpl-no-questions");
    const stats = $(this.root, "[data-ref=finalStats]");
    stats.innerHTML = `
      <span class='bold'>Final Stats:</span><br>
      Correct: <span class='yellow'>${p.total_correct}</span><br>
      Incorrect: <span class='yellow'>${p.total_incorrect}</span><br>
      Best Streak: <span class='yellow'>${p.best_streak}</span><br>
      HP: <span class='yellow'>${p.hit_points}/${p.max_hit_points}</span><br>
      Level: <span class='yellow'>${p.level}</span>
    `;
    const btn = $(this.root, "[data-action=review]");
    if (btn) { btn.addEventListener("click", () => reviewCallback()); btn.focus(); }
  }

  showGameOver(reviewCallback) {
    this._clearKeyboard();
    const p = this.model.player;
    renderTemplate(this.root, "tpl-gameover");
    const stats = $(this.root, "[data-ref=gameOverStats]");
    stats.innerHTML = `
      Correct: <span class='yellow'>${p.total_correct}</span><br>
      Incorrect: <span class='yellow'>${p.total_incorrect}</span><br>
      Best Streak: <span class='yellow'>${p.best_streak}</span><br>
      Level: <span class='yellow'>${p.level}</span><br>
      HP: <span class='yellow'>${p.hit_points}/${p.max_hit_points}</span><br>
      Weapon: <span class='yellow'>${this._esc(p.weapon.name)}</span><br>
      Armor: <span class='yellow'>${this._esc(p.armor.name)}</span>
    `;
    const btn = $(this.root, "[data-action=review]");
    if (btn) { btn.addEventListener("click", () => reviewCallback()); btn.focus(); }
  }

  // ── Session review screen ──────────────────────────────────────────────────

  showReview(history, player, outcomeType, setName, newGameCallback) {
    this._clearKeyboard();
    renderTemplate(this.root, "tpl-review");

    const titles = {
      victory:      "Victory! — Session Review",
      game_over:    "Game Over — Session Review",
      no_questions: "Session Complete — Review",
    };
    $(this.root, "[data-ref=reviewTitle]").textContent = titles[outcomeType] || "Session Review";

    // Summary stats
    const total   = history.length;
    const perfect = history.filter(h => h.was_perfect).length;
    const pct     = total > 0 ? Math.round(perfect / total * 100) : 0;
    $(this.root, "[data-ref=reviewSummary]").innerHTML = `
      Questions answered: <span class="yellow">${total}</span> &nbsp;&nbsp;
      Perfect answers: <span class="yellow">${perfect}/${total} (${pct}%)</span><br>
      Best streak: <span class="yellow">${player.best_streak}</span> &nbsp;&nbsp;
      Final level: <span class="yellow">${player.level}</span><br>
      Correct selections: <span class="yellow">${player.total_correct}</span> &nbsp;&nbsp;
      Incorrect selections: <span class="yellow">${player.total_incorrect}</span><br>
      Final HP: <span class="yellow">${player.hit_points}/${player.max_hit_points}</span> &nbsp;&nbsp;
      Weapon: <span class="yellow">${this._esc(player.weapon.name)}</span> &nbsp;&nbsp;
      Armor: <span class="yellow">${this._esc(player.armor.name)}</span>
    `;

    // Question-by-question list
    const list = $(this.root, "[data-ref=reviewList]");
    if (history.length === 0) {
      list.innerHTML = "<div class='review-item'>No questions answered this session.</div>";
    } else {
      history.forEach((entry, i) => {
        const item = document.createElement("div");
        item.className = `review-item ${entry.was_perfect ? 'review-pass' : 'review-fail'}`;
        item.setAttribute('role', 'listitem');

        const badge    = entry.was_perfect ? '✔ PASS' : '✖ FAIL';
        const badgeCls = entry.was_perfect ? 'review-badge-pass' : 'review-badge-fail';
        let html = `<div><span class="review-num">${i + 1}.</span> <span class="${badgeCls}">[${badge}]</span> <span class="review-q">${this._esc(entry.question)}</span></div>`;

        if (!entry.was_perfect) {
          if (entry.incorrect_selections.length > 0) {
            html += `<div class="review-detail review-wrong">✖ Wrong: ${entry.incorrect_selections.map(s => this._esc(s)).join(', ')}</div>`;
          }
          if (entry.missed_correct.length > 0) {
            html += `<div class="review-detail review-missed">⚠ Missed: ${entry.missed_correct.map(s => this._esc(s)).join(', ')}</div>`;
          }
          html += `<div class="review-detail review-correct-ans">✔ Correct: ${entry.correct_answers.map(s => this._esc(s)).join(', ')}</div>`;
        }

        item.innerHTML = html;
        list.appendChild(item);
      });
    }

    // Export button
    $(this.root, "[data-action=export]").addEventListener("click", () =>
      this._exportReview(history, player, outcomeType, setName));

    // New game button
    const ngBtn = $(this.root, "[data-action=new-game]");
    ngBtn.addEventListener("click", () => newGameCallback());
    ngBtn.focus();
  }

  _exportReview(history, player, outcomeType, setName) {
    const date    = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    const total   = history.length;
    const perfect = history.filter(h => h.was_perfect).length;
    const pct     = total > 0 ? Math.round(perfect / total * 100) : 0;
    const outcome = outcomeType === 'victory' ? 'Victory!' : outcomeType === 'game_over' ? 'Game Over' : 'Completed';

    let t = `Loop of the Recursive Dragon — Session Review\n`;
    t += `${'='.repeat(50)}\n`;
    t += `Question Set : ${setName}\n`;
    t += `Date         : ${date}\n`;
    t += `Outcome      : ${outcome}\n\n`;

    t += `SUMMARY\n${'-'.repeat(30)}\n`;
    t += `Questions Answered   : ${total}\n`;
    t += `Perfect Answers      : ${perfect} / ${total} (${pct}%)\n`;
    t += `Best Streak          : ${player.best_streak}\n`;
    t += `Correct Selections   : ${player.total_correct}\n`;
    t += `Incorrect Selections : ${player.total_incorrect}\n`;
    t += `Final Level          : ${player.level}\n`;
    t += `Final Weapon         : ${player.weapon.name}\n`;
    t += `Final Armor          : ${player.armor.name}\n`;
    t += `Final HP             : ${player.hit_points}/${player.max_hit_points}\n\n`;

    t += `QUESTION REVIEW\n${'-'.repeat(30)}\n\n`;
    history.forEach((entry, i) => {
      const badge = entry.was_perfect ? '✔ PASS' : '✖ FAIL';
      t += `${i + 1}. [${badge}] ${entry.question}\n`;
      t += `   Correct: ${entry.correct_answers.join(', ')}\n`;
      if (!entry.was_perfect) {
        if (entry.incorrect_selections.length > 0)
          t += `   Wrong:   ${entry.incorrect_selections.join(', ')}\n`;
        if (entry.missed_correct.length > 0)
          t += `   Missed:  ${entry.missed_correct.join(', ')}\n`;
      }
      t += '\n';
    });

    const blob = new Blob([t], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `lotrd-${setName.replace('.json', '')}-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

// ─── GameController ───────────────────────────────────────────────────────────
export class GameController {
  constructor() {
    this.root     = document.getElementById('game-root');
    this.ui       = new GameUI(this.root, null);
    this.sounds   = new SoundSystem();
    this._setName = null;
    this.model    = null;

    // Wire the persistent sound toggle button
    const soundBtn = document.getElementById('sound-toggle');
    if (soundBtn) {
      // Restore saved preference
      try {
        if (localStorage.getItem('lotrd_sound') === '0') {
          this.sounds.enabled = false;
          soundBtn.textContent = '🔇';
          soundBtn.setAttribute('aria-pressed', 'false');
          soundBtn.setAttribute('aria-label',   'Sound effects: off. Click to enable.');
        }
      } catch (_) {}

      soundBtn.addEventListener('click', () => {
        this.sounds.enabled = !this.sounds.enabled;
        const on = this.sounds.enabled;
        soundBtn.textContent = on ? '🔊' : '🔇';
        soundBtn.setAttribute('aria-pressed', String(on));
        soundBtn.setAttribute('aria-label', `Sound effects: ${on ? 'on' : 'off'}. Click to toggle.`);
        try { localStorage.setItem('lotrd_sound', on ? '1' : '0'); } catch (_) {}
      });
    }

    // Route based on URL parameter
    const params       = new URLSearchParams(window.location.search);
    const specifiedSet = params.get('set');
    if (specifiedSet) {
      this.loadSpecifiedSet(specifiedSet);
    } else {
      this.showQuestionSetSelection();
    }
  }

  // ── Persistence ──────────────────────────────────────────────────────────────

  _saveKey(setName) { return `lotrd_save_${setName}`; }

  saveGame() {
    if (!this._setName || !this.model) return;
    try {
      const data = { ...this.model.toSaveData(), setName: this._setName, savedAt: new Date().toISOString() };
      localStorage.setItem(this._saveKey(this._setName), JSON.stringify(data));
    } catch (_) { /* localStorage full or disabled */ }
  }

  _loadSave(setName) {
    try {
      const raw = localStorage.getItem(this._saveKey(setName));
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  _clearSave() {
    if (!this._setName) return;
    try { localStorage.removeItem(this._saveKey(this._setName)); } catch (_) {}
  }

  // ── Loading ───────────────────────────────────────────────────────────────────

  async loadSpecifiedSet(setName) {
    try {
      const availableSets = await loadJSON('question_sets/index.json');
      if (!availableSets.includes(setName)) throw new Error(`Question set "${setName}" not found.`);
      const [questions_data, monsters_data] = await Promise.all([
        loadJSON(`question_sets/${setName}`),
        loadJSON('assets/monsters.json'),
      ]);
      await this._initSet(setName, questions_data, monsters_data);
    } catch (err) {
      this.root.innerHTML = `
        <div class='bbs-container'>
          <div class='section red bold'>Error loading "${setName}": ${err.message}</div>
          <div class='section'>
            <button class='action-button'
              onclick='window.gameController.showQuestionSetSelection()'>
              Back to Set Selection
            </button>
          </div>
        </div>`;
    }
  }

  async showQuestionSetSelection() {
    try {
      const availableSets = await loadJSON('question_sets/index.json');
      this.ui.clear();
      this.ui.showQuestionSetSelection(availableSets, chosenSet => this.loadChosenSet(chosenSet));
    } catch (err) {
      this.root.innerHTML = `<div class='bbs-container'><div class='section red bold'>Error loading question sets: ${err.message}</div></div>`;
    }
  }

  async loadChosenSet(chosenSet) {
    try {
      const [questions_data, monsters_data] = await Promise.all([
        loadJSON(`question_sets/${chosenSet}`),
        loadJSON('assets/monsters.json'),
      ]);
      const newURL = new URL(window.location);
      newURL.searchParams.set('set', chosenSet);
      window.history.replaceState({}, '', newURL);
      await this._initSet(chosenSet, questions_data, monsters_data);
    } catch (err) {
      this.root.innerHTML = `<div class='bbs-container'><div class='section red bold'>Error loading game data: ${err.message}</div></div>`;
    }
  }

  async _initSet(setName, questions_data, monsters_data) {
    this._setName = setName;
    const save    = this._loadSave(setName);

    if (save && (save.questions_to_ask?.length ?? 0) > 0) {
      // Restore model from save, then offer choice
      this.model = new GameModel(questions_data, monsters_data, save);
      this.ui    = new GameUI(this.root, this.model);
      this.ui.showResumePrompt(
        save,
        () => { this.startAdventure(); },                                    // Resume
        () => {                                                               // New game
          this._clearSave();
          this.model = new GameModel(questions_data, monsters_data);
          this.ui.setModel(this.model);
          this.ui.showInitialScreen(() => this.startAdventure());
        }
      );
    } else {
      this._clearSave();
      this.model = new GameModel(questions_data, monsters_data);
      this.ui    = new GameUI(this.root, this.model);
      this.ui.showInitialScreen(() => this.startAdventure());
    }
  }

  // ── Game flow ─────────────────────────────────────────────────────────────────

  startAdventure() {
    const status = this.model.nextEncounter();
    this.saveGame();
    this.showEncounterStatus(status);
  }

  showEncounterStatus(status) {
    if (status === "victory") {
      this._clearSave();
      this.sounds.victory();
      this.ui.showVictory(() => this.startReview("victory"));
    } else if (status === "no_questions") {
      this._clearSave();
      this.ui.showNoQuestions(() => this.startReview("no_questions"));
    } else {
      this.ui.showEncounter();
    }
  }

  startReview(outcomeType) {
    this.ui.showReview(
      this.model.answer_history,
      this.model.player,
      outcomeType,
      this._setName,
      () => this.showQuestionSetSelection()
    );
  }

  submitAnswer(selected) {
    if (!this.model.current_question) return;
    if (selected.length === 0) {
      this.ui.showHint("Please select at least one option. Press Enter to submit.");
      return;
    }

    const battleData = this.model.evaluateAnswer(selected);

    if (battleData.defeated_player) {
      this._clearSave();
      this.sounds.gameOver();
      this.ui.showGameOver(() => this.startReview("game_over"));
      return;
    }

    // Sound feedback
    const hasErrors = battleData.incorrectSelections.length > 0 || battleData.missedCorrect.length > 0;
    if (battleData.defeated_monster) {
      this.sounds.monsterDefeated();
    } else if (hasErrors) {
      this.sounds.incorrect();
    } else {
      this.sounds.correct();
      if (battleData.streakCount >= 3) {
        setTimeout(() => this.sounds.streakHit(battleData.streakCount), 250);
      }
    }

    this.ui.showResults(battleData, () => {
      if (battleData.levelsGained > 0) {
        this.sounds.levelUp();
        this.ui.showLevelUp(battleData.levelsGained, () => this.continueAdventure());
      } else {
        this.continueAdventure();
      }
    });
  }

  continueAdventure() {
    const status = this.model.nextEncounter();
    this.saveGame();
    this.showEncounterStatus(status);
  }
}
