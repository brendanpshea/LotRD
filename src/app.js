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
    } catch (_) {}
  }

  correct()         { this._beep(523,.08); this._beep(659,.08,'square',.12,.09); this._beep(784,.15,'square',.12,.18); }
  incorrect()       { this._beep(220,.12,'sawtooth',.10); this._beep(165,.25,'sawtooth',.10,.13); }
  levelUp()         { [523,659,784,1047].forEach((f,i) => this._beep(f,.14,'square',.11,i*.14)); }
  victory()         { [523,659,784,659,784,1047].forEach((f,i) => this._beep(f,.16,'square',.11,i*.15)); }
  gameOver()        { [330,247,196,147].forEach((f,i) => this._beep(f,.22,'sawtooth',.10,i*.22)); }
  monsterDefeated() { this._beep(660,.08); this._beep(880,.14,'square',.11,.09); }
  streakHit(n)      { const f=Math.min(400+n*40,880); this._beep(f,.06,'square',.09); this._beep(f*1.25,.10,'square',.09,.08); }
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

  _clearKeyboard() {
    if (this._kbAbort) { this._kbAbort.abort(); this._kbAbort = null; }
  }

  _esc(str) {
    const d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
  }

  // ── Main menu ────────────────────────────────────────────────────────────────

  showMainMenu(catalog, globalStats, launchCallback) {
    this._clearKeyboard();
    renderTemplate(this.root, "tpl-main-menu");

    // Global stats bar
    if (globalStats && globalStats.total_answered > 0) {
      const bar = $(this.root, "[data-ref=globalStats]");
      const pct = globalStats.total_answered > 0
        ? Math.round(globalStats.total_correct / globalStats.total_answered * 100)
        : 0;
      bar.innerHTML = `
        <span class="stat-item">📋 Answered: <span class="yellow">${globalStats.total_answered}</span></span>
        <span class="stat-item">🎯 Accuracy: <span class="yellow">${pct}%</span></span>
        <span class="stat-item">🔥 Best streak: <span class="yellow">${globalStats.best_streak}</span></span>
        <span class="stat-item">🏆 Completed: <span class="yellow">${globalStats.sets_completed ?? 0}</span></span>
      `;
      bar.hidden = false;
    }

    // In-progress section
    const inProgressEntries = [];
    catalog.forEach(topic => {
      (topic.sets || []).forEach(entry => {
        if (entry.status?.type === 'in_progress') inProgressEntries.push(entry);
      });
    });

    if (inProgressEntries.length > 0) {
      const section = $(this.root, "[data-ref=inProgressSection]");
      const list    = $(this.root, "[data-ref=inProgressList]");
      inProgressEntries.forEach(entry => {
        const row = document.createElement("div");
        row.className = "in-progress-row";
        row.innerHTML = `
          <span class="ip-title">${this._esc(entry.title)}</span>
          <span class="ip-remaining">${entry.status.remaining} questions left</span>
        `;
        const btn = document.createElement("button");
        btn.className   = "action-button set-btn";
        btn.textContent = "Resume";
        btn.setAttribute("aria-label", `Resume ${entry.title}`);
        btn.addEventListener("click", () => launchCallback(entry.id, 'resume'));
        row.appendChild(btn);
        list.appendChild(row);
      });
      section.hidden = false;
    }

    // Topic sections
    const topicContainer = $(this.root, "[data-ref=topicSections]");
    catalog.forEach(topic => {
      const section = document.createElement("div");
      section.className = `bbs-container topic-section${topic.coming_soon ? ' topic-coming-soon' : ''}`;

      const heading = document.createElement("div");
      heading.className = "topic-heading";
      heading.textContent = topic.topic.toUpperCase();
      if (topic.coming_soon) {
        const badge = document.createElement("span");
        badge.className   = "coming-soon-badge";
        badge.textContent = "Coming Soon";
        heading.appendChild(badge);
      }
      section.appendChild(heading);

      if (topic.coming_soon || !topic.sets?.length) {
        topicContainer.appendChild(section);
        return;
      }

      const setList = document.createElement("div");
      setList.className = "set-list";

      topic.sets.forEach(entry => {
        const row = document.createElement("div");
        row.className = "set-row";

        // Info column
        const info = document.createElement("div");
        info.className = "set-info";
        info.innerHTML = `
          <span class="set-title">${this._esc(entry.title)}</span>
          <span class="set-desc">${this._esc(entry.description)}</span>
          <span class="set-count">${entry.question_count} questions</span>
        `;

        // Actions column
        const actions = document.createElement("div");
        actions.className = "set-actions";

        const status = entry.status ?? { type: 'not_started' };

        // Status badge
        const badge = document.createElement("span");
        if (status.type === 'complete') {
          badge.className   = "status-badge status-complete";
          badge.textContent = "✔ Complete";
        } else if (status.type === 'in_progress') {
          badge.className   = "status-badge status-progress";
          badge.textContent = `▶ ${status.remaining} left`;
        } else {
          badge.className   = "status-badge status-new";
          badge.textContent = "○ Not started";
        }
        actions.appendChild(badge);

        // Primary button
        const btn = document.createElement("button");
        btn.className = "action-button set-btn";
        if (status.type === 'in_progress') {
          btn.textContent = "Resume";
          btn.setAttribute("aria-label", `Resume ${entry.title}`);
          btn.addEventListener("click", () => launchCallback(entry.id, 'resume'));

          // Secondary: new game link
          const newLink = document.createElement("button");
          newLink.className   = "action-button action-button--secondary set-btn-sm";
          newLink.textContent = "New Game";
          newLink.setAttribute("aria-label", `Start a new game of ${entry.title}`);
          newLink.addEventListener("click", () => launchCallback(entry.id, 'new'));
          actions.appendChild(btn);
          actions.appendChild(newLink);
        } else if (status.type === 'complete') {
          btn.textContent = "Play Again";
          btn.setAttribute("aria-label", `Play ${entry.title} again`);
          btn.addEventListener("click", () => launchCallback(entry.id, 'start'));
          actions.appendChild(btn);
        } else {
          btn.textContent = "Start";
          btn.setAttribute("aria-label", `Start ${entry.title}`);
          btn.addEventListener("click", () => launchCallback(entry.id, 'start'));
          actions.appendChild(btn);
        }

        row.appendChild(info);
        row.appendChild(actions);
        setList.appendChild(row);
      });

      section.appendChild(setList);
      topicContainer.appendChild(section);
    });
  }

  // ── Screens ───────────────────────────────────────────────────────────────────

  showInitialScreen(startCallback) {
    this._clearKeyboard();
    renderTemplate(this.root, "tpl-initial");
    const btn = $(this.root, "[data-action=start]");
    btn.addEventListener("click", () => startCallback());
    btn.focus();
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

    $(this.root, "[data-ref=mName]") .textContent = m.monster_name;
    $(this.root, "[data-ref=mDesc]") .textContent = " " + (m.initial_description || "");
    $(this.root, "[data-ref=mHP]")   .textContent = m.hit_points;
    $(this.root, "[data-ref=pHP]")   .textContent = `${p.hit_points}/${p.max_hit_points}`;
    $(this.root, "[data-ref=pLvl]")  .textContent = p.level;
    $(this.root, "[data-ref=pXP]")   .textContent = `${p.xp}/${p.xp_to_next_level}`;
    $(this.root, "[data-ref=pWeap]") .textContent = p.weapon.name;
    $(this.root, "[data-ref=pArmor]").textContent = p.armor.name;

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

    const qEl = $(this.root, "[data-ref=qText]");
    qEl.textContent = q.question;
    qEl.id = "encounter-question-label";

    if (m.image) {
      const wrap = $(this.root, "[data-ref=imgWrap]");
      const img  = $(this.root, "[data-ref=img]");
      img.src    = `images/monsters/${m.image}`;
      img.alt    = m.monster_name;
      wrap.hidden = false;
    }

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
      cb.type  = "checkbox"; cb.value = opt; cb.id = id;
      cb.setAttribute("aria-label", `Option ${idx + 1}: ${opt}`);
      const num = document.createElement("span");
      num.className = "option-num"; num.textContent = `${idx + 1}.\u00a0`;
      num.setAttribute("aria-hidden", "true");
      label.appendChild(cb); label.appendChild(num); label.appendChild(document.createTextNode(opt));
      optBox.appendChild(label);
      checkboxes.push(cb);
    });

    const kbHint = $(this.root, "[data-ref=kbHint]");
    if (kbHint) kbHint.textContent = `Keys: 1–${options.length} toggle options · Enter submits`;

    const submitBtn = $(this.root, "[data-action=submit]");
    submitBtn.addEventListener("click", () => {
      window.gameController.submitAnswer(checkboxes.filter(c => c.checked).map(c => c.value));
    });

    this._kbAbort = new AbortController();
    document.addEventListener("keydown", (e) => {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= checkboxes.length) { e.preventDefault(); checkboxes[n-1].checked = !checkboxes[n-1].checked; }
      else if (e.key === "Enter") { e.preventDefault(); submitBtn.click(); }
    }, { signal: this._kbAbort.signal });

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

    const fbWrap = document.createElement("div");
    fbWrap.className = "feedback-container";
    body.appendChild(fbWrap);

    const addList = (container, cls, title, arr) => {
      const h = document.createElement("div"); h.className = cls; h.textContent = title; container.appendChild(h);
      const ul = document.createElement("ul");
      (arr.length === 0 ? ["None."] : arr).forEach(x => { const li = document.createElement("li"); li.textContent = x; ul.appendChild(li); });
      container.appendChild(ul);
    };
    addList(fbWrap, "correct",   "✔ Correctly selected:",     battleData.correctSelections);
    addList(fbWrap, "incorrect", "✖ Incorrectly selected:",   battleData.incorrectSelections);
    addList(fbWrap, "missed",    "⚠ Missed correct answers:", battleData.missedCorrect);

    if (battleData.streakMultiplier > 1) {
      const sb = document.createElement("div");
      sb.className = "streak-bonus-note";
      sb.textContent = `🔥 Streak ×${battleData.streakMultiplier} bonus applied to your attack!`;
      body.appendChild(sb);
    }

    const lines = [];
    lines.push(battleData.effective_player_damage > 0 ? `You deal ${battleData.effective_player_damage} damage.` : "Your attack was ineffective.");
    if (battleData.effective_monster_damage > 0) lines.push(`The monster hits you for ${battleData.effective_monster_damage} damage.`);
    else if (!battleData.defeated_monster)       lines.push("The monster cannot penetrate your armor.");
    if (battleData.defeated_monster) { lines.push(`You defeated the monster!`); lines.push(`XP gained: ${battleData.xp_gained} (Total: ${p.xp}/${p.xp_to_next_level})`); }
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
    this._kbAbort = new AbortController();
    document.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); continueCallback(); } }, { signal: this._kbAbort.signal });
  }

  showLevelUp(levelsGained, continueCallback) {
    this._clearKeyboard();
    const p = this.model.player;
    renderTemplate(this.root, "tpl-levelup");
    $(this.root, "[data-ref=level]")           .textContent = p.level;
    $(this.root, "[data-ref=levelsGainedText]").textContent = levelsGained > 1 ? `You've gained ${levelsGained} levels!` : `You've gained 1 level!`;
    $(this.root, "[data-ref=weaponName]").textContent = p.weapon.name;
    $(this.root, "[data-ref=weaponDie]") .textContent = `Attack Die: d${p.weapon.attack_die}`;
    $(this.root, "[data-ref=armorName]") .textContent = p.armor.name;
    $(this.root, "[data-ref=armorDef]")  .textContent = p.armor.defense;
    $(this.root, "[data-ref=maxHP]")     .textContent = p.max_hit_points;
    const cont = $(this.root, "[data-action=continue]");
    cont.addEventListener("click", () => continueCallback());
    cont.focus();
    this._kbAbort = new AbortController();
    document.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); continueCallback(); } }, { signal: this._kbAbort.signal });
  }

  showVictory(reviewCallback) {
    this._clearKeyboard();
    const p = this.model.player;
    renderTemplate(this.root, "tpl-victory");
    $(this.root, "[data-ref=victoryStats]").innerHTML = `
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
    $(this.root, "[data-ref=finalStats]").innerHTML = `
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
    $(this.root, "[data-ref=gameOverStats]").innerHTML = `
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

  // ── Session review ────────────────────────────────────────────────────────────

  showReview(history, player, outcomeType, setName, mainMenuCallback) {
    this._clearKeyboard();
    renderTemplate(this.root, "tpl-review");

    const titles = { victory: "Victory! — Session Review", game_over: "Game Over — Session Review", no_questions: "Session Complete — Review" };
    $(this.root, "[data-ref=reviewTitle]").textContent = titles[outcomeType] || "Session Review";

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

    const list = $(this.root, "[data-ref=reviewList]");
    if (history.length === 0) {
      list.innerHTML = "<div class='review-item'>No questions answered this session.</div>";
    } else {
      history.forEach((entry, i) => {
        const item = document.createElement("div");
        item.className = `review-item ${entry.was_perfect ? 'review-pass' : 'review-fail'}`;
        item.setAttribute('role', 'listitem');
        let html = `<div><span class="review-num">${i+1}.</span> <span class="${entry.was_perfect ? 'review-badge-pass' : 'review-badge-fail'}">[${entry.was_perfect ? '✔ PASS' : '✖ FAIL'}]</span> <span class="review-q">${this._esc(entry.question)}</span></div>`;
        if (!entry.was_perfect) {
          if (entry.incorrect_selections.length > 0)
            html += `<div class="review-detail review-wrong">✖ Wrong: ${entry.incorrect_selections.map(s => this._esc(s)).join(', ')}</div>`;
          if (entry.missed_correct.length > 0)
            html += `<div class="review-detail review-missed">⚠ Missed: ${entry.missed_correct.map(s => this._esc(s)).join(', ')}</div>`;
          html += `<div class="review-detail review-correct-ans">✔ Correct: ${entry.correct_answers.map(s => this._esc(s)).join(', ')}</div>`;
        }
        item.innerHTML = html;
        list.appendChild(item);
      });
    }

    $(this.root, "[data-action=export]")  .addEventListener("click", () => this._exportReview(history, player, outcomeType, setName));
    const mm = $(this.root, "[data-action=main-menu]");
    if (mm) { mm.addEventListener("click", () => mainMenuCallback()); mm.focus(); }
  }

  _exportReview(history, player, outcomeType, setName) {
    const date    = new Date().toLocaleDateString(undefined, { year:'numeric', month:'long', day:'numeric' });
    const total   = history.length;
    const perfect = history.filter(h => h.was_perfect).length;
    const pct     = total > 0 ? Math.round(perfect / total * 100) : 0;
    const outcome = outcomeType === 'victory' ? 'Victory!' : outcomeType === 'game_over' ? 'Game Over' : 'Completed';
    let t = `Loop of the Recursive Dragon — Session Review\n${'='.repeat(50)}\n`;
    t += `Question Set : ${setName}\nDate         : ${date}\nOutcome      : ${outcome}\n\n`;
    t += `SUMMARY\n${'-'.repeat(30)}\n`;
    t += `Questions Answered   : ${total}\nPerfect Answers      : ${perfect} / ${total} (${pct}%)\n`;
    t += `Best Streak          : ${player.best_streak}\nCorrect Selections   : ${player.total_correct}\n`;
    t += `Incorrect Selections : ${player.total_incorrect}\nFinal Level          : ${player.level}\n`;
    t += `Final Weapon         : ${player.weapon.name}\nFinal Armor          : ${player.armor.name}\n`;
    t += `Final HP             : ${player.hit_points}/${player.max_hit_points}\n\nQUESTION REVIEW\n${'-'.repeat(30)}\n\n`;
    history.forEach((e, i) => {
      t += `${i+1}. [${e.was_perfect ? '✔ PASS' : '✖ FAIL'}] ${e.question}\n   Correct: ${e.correct_answers.join(', ')}\n`;
      if (!e.was_perfect) {
        if (e.incorrect_selections.length > 0) t += `   Wrong:   ${e.incorrect_selections.join(', ')}\n`;
        if (e.missed_correct.length > 0)       t += `   Missed:  ${e.missed_correct.join(', ')}\n`;
      }
      t += '\n';
    });
    const url = URL.createObjectURL(new Blob([t], { type: 'text/plain;charset=utf-8' }));
    const a   = Object.assign(document.createElement('a'), { href: url, download: `lotrd-${setName.replace('.json','')}-${new Date().toISOString().slice(0,10)}.txt` });
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

    // Sound toggle
    const soundBtn = document.getElementById('sound-toggle');
    if (soundBtn) {
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

    // Back-to-menu button
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        this.saveGame();         // persist current progress
        this.showMainMenu();
      });
    }

    // Route: URL param allows instructors to share direct links
    const params       = new URLSearchParams(window.location.search);
    const specifiedSet = params.get('set');
    if (specifiedSet) {
      this.loadSpecifiedSet(specifiedSet);
    } else {
      this.showMainMenu();
    }
  }

  // ── Persistence ───────────────────────────────────────────────────────────────

  _saveKey(setName)       { return `lotrd_save_${setName}`; }
  _completionKey(setName) { return `lotrd_done_${setName}`; }
  _globalKey()            { return `lotrd_global`; }

  saveGame() {
    if (!this._setName || !this.model) return;
    try {
      localStorage.setItem(this._saveKey(this._setName),
        JSON.stringify({ ...this.model.toSaveData(), setName: this._setName, savedAt: new Date().toISOString() }));
    } catch (_) {}
  }

  _loadSave(setName) {
    try { const r = localStorage.getItem(this._saveKey(setName)); return r ? JSON.parse(r) : null; } catch (_) { return null; }
  }

  _clearSave() {
    if (!this._setName) return;
    try { localStorage.removeItem(this._saveKey(this._setName)); } catch (_) {}
  }

  _loadCompletion(setName) {
    try { const r = localStorage.getItem(this._completionKey(setName)); return r ? JSON.parse(r) : null; } catch (_) { return null; }
  }

  _recordCompletion() {
    if (!this._setName || !this.model) return;
    const p   = this.model.player;
    const pct = (p.total_correct + p.total_incorrect) > 0
      ? Math.round(p.total_correct / (p.total_correct + p.total_incorrect) * 100) : 0;
    try {
      localStorage.setItem(this._completionKey(this._setName), JSON.stringify({ completedAt: new Date().toISOString(), score_pct: pct, level: p.level }));
    } catch (_) {}
  }

  _loadGlobalStats() {
    try { const r = localStorage.getItem(this._globalKey()); return r ? JSON.parse(r) : null; } catch (_) { return null; }
  }

  _updateGlobalStats() {
    if (!this.model) return;
    const p    = this.model.player;
    const prev = this._loadGlobalStats() ?? { total_answered: 0, total_correct: 0, total_incorrect: 0, best_streak: 0, sets_completed: 0 };
    const next = {
      total_answered:  prev.total_answered  + this.model.answer_history.length,
      total_correct:   prev.total_correct   + p.total_correct,
      total_incorrect: prev.total_incorrect + p.total_incorrect,
      best_streak:     Math.max(prev.best_streak, p.best_streak),
      sets_completed:  prev.sets_completed,   // updated separately by _recordCompletion caller
    };
    try { localStorage.setItem(this._globalKey(), JSON.stringify(next)); } catch (_) {}
  }

  /** Show or hide the back-to-menu toolbar button. */
  _setInGame(inGame) {
    const btn = document.getElementById('back-btn');
    if (btn) btn.hidden = !inGame;
  }

  // ── Main menu ─────────────────────────────────────────────────────────────────

  async showMainMenu() {
    this._setInGame(false);
    // Clear ?set= from URL so the address bar reflects the lobby state
    const clean = new URL(window.location);
    clean.searchParams.delete('set');
    window.history.replaceState({}, '', clean);

    try {
      const catalog     = await loadJSON('question_sets/catalog.json');
      const globalStats = this._loadGlobalStats();

      // Annotate each set entry with its saved status
      catalog.forEach(topic => {
        (topic.sets || []).forEach(entry => {
          const done = this._loadCompletion(entry.id);
          const save = this._loadSave(entry.id);
          if (done) {
            entry.status = { type: 'complete', ...done };
          } else if (save && (save.questions_to_ask?.length ?? 0) > 0) {
            entry.status = { type: 'in_progress', remaining: save.questions_to_ask.length };
          } else {
            entry.status = { type: 'not_started' };
          }
        });
      });

      this.ui.showMainMenu(catalog, globalStats, (setId, mode) => this._launchSet(setId, mode));
    } catch (err) {
      this.root.innerHTML = `<div class='bbs-container'><div class='section red bold'>Error loading catalog: ${err.message}</div></div>`;
    }
  }

  /** Central dispatch for all "launch a set" actions from the main menu. */
  async _launchSet(setId, mode) {
    try {
      const [questions_data, monsters_data] = await Promise.all([
        loadJSON(`question_sets/${setId}`),
        loadJSON('assets/monsters.json'),
      ]);
      const newURL = new URL(window.location);
      newURL.searchParams.set('set', setId);
      window.history.replaceState({}, '', newURL);

      this._setName = setId;

      if (mode === 'resume') {
        const save = this._loadSave(setId);
        if (save && (save.questions_to_ask?.length ?? 0) > 0) {
          this.model = new GameModel(questions_data, monsters_data, save);
          this.ui    = new GameUI(this.root, this.model);
          this.startAdventure();
          return;
        }
        // Save was stale — fall through to fresh start
      }

      if (mode === 'new') {
        this._clearSave();
      }

      // Fresh or play-again: show welcome screen
      this.model = new GameModel(questions_data, monsters_data);
      this.ui    = new GameUI(this.root, this.model);
      this.ui.showInitialScreen(() => this.startAdventure());

    } catch (err) {
      this.root.innerHTML = `<div class='bbs-container'><div class='section red bold'>Error loading "${setId}": ${err.message}</div></div>`;
    }
  }

  // ── URL-param direct-link entry point ─────────────────────────────────────────

  async loadSpecifiedSet(setName) {
    try {
      const availableSets = await loadJSON('question_sets/index.json');
      if (!availableSets.includes(setName)) throw new Error(`Question set "${setName}" not found.`);
      await this._launchSet(setName, 'resume');   // honour any existing save
    } catch (err) {
      this.root.innerHTML = `
        <div class='bbs-container'>
          <div class='section red bold'>Error: ${err.message}</div>
          <div class='section'>
            <button class='action-button' onclick='window.gameController.showMainMenu()'>
              Back to Main Menu
            </button>
          </div>
        </div>`;
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
      this._recordCompletion();
      this._updateGlobalStats();
      this.sounds.victory();
      this._setInGame(false);
      this.ui.showVictory(() => this.startReview("victory"));
    } else if (status === "no_questions") {
      this._clearSave();
      this._updateGlobalStats();
      this._setInGame(false);
      this.ui.showNoQuestions(() => this.startReview("no_questions"));
    } else {
      this._setInGame(true);
      this.ui.showEncounter();
    }
  }

  startReview(outcomeType) {
    this.ui.showReview(
      this.model.answer_history,
      this.model.player,
      outcomeType,
      this._setName,
      () => this.showMainMenu()
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
      this._updateGlobalStats();
      this.sounds.gameOver();
      this._setInGame(false);
      this.ui.showGameOver(() => this.startReview("game_over"));
      return;
    }

    const hasErrors = battleData.incorrectSelections.length > 0 || battleData.missedCorrect.length > 0;
    if (battleData.defeated_monster)  this.sounds.monsterDefeated();
    else if (hasErrors)               this.sounds.incorrect();
    else {
      this.sounds.correct();
      if (battleData.streakCount >= 3) setTimeout(() => this.sounds.streakHit(battleData.streakCount), 250);
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
