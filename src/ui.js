import { shuffle } from "./util.js";

const LEVEL_TITLES = [
  { minLevel: 1,  title: "Apprentice" },
  { minLevel: 3,  title: "Student" },
  { minLevel: 5,  title: "Journeyman" },
  { minLevel: 8,  title: "Scholar" },
  { minLevel: 11, title: "Adept" },
  { minLevel: 14, title: "Expert" },
  { minLevel: 17, title: "Master" },
  { minLevel: 20, title: "Grandmaster" },
];

function getLevelTitle(level) {
  let title = LEVEL_TITLES[0].title;
  for (const entry of LEVEL_TITLES) {
    if (level >= entry.minLevel) title = entry.title;
    else break;
  }
  return title;
}

function renderTemplate(root, id) {
  root.innerHTML = "";
  const tpl = document.getElementById(id);
  if (!tpl) throw new Error(`Missing template: ${id}`);
  root.appendChild(tpl.content.cloneNode(true));
  return root;
}

const $ = (root, sel) => root.querySelector(sel);

export class GameUI {
  constructor(root, model, controller = null) {
    this.root = root;
    this.model = model;
    this.controller = controller;
    this._kbAbort = null;
  }

  setModel(model) { this.model = model; }
  setController(controller) { this.controller = controller; }
  clear() { this.root.innerHTML = ""; }

  _clearKeyboard() {
    if (this._kbAbort) { this._kbAbort.abort(); this._kbAbort = null; }
  }

  _esc(str) {
    const d = document.createElement("div");
    d.textContent = String(str);
    return d.innerHTML;
  }

  _getSetTitle() {
    return this.controller?.getSetTitle?.() || "";
  }

  _populateEncounterHeader(root) {
    const p = this.model.player;
    const m = this.model.current_monster;

    const crumb = $(root, "[data-ref=breadcrumb]");
    if (crumb) {
      const title = this._getSetTitle();
      crumb.textContent = title ? `▶ ${title}` : "▶ Loop of the Recursive Dragon";
    }

    $(root, "[data-ref=mName]").textContent = m.monster_name;
    $(root, "[data-ref=mDesc]").textContent = m.initial_description ? ` — ${m.initial_description}` : "";

    $(root, "[data-ref=mHP]").textContent = m.hit_points;
    const hpBar = $(root, "[data-ref=mHPBar]");
    if (hpBar) {
      const pct = m.max_hit_points > 0 ? m.hit_points / m.max_hit_points : 1;
      hpBar.style.width = `${Math.max(0, Math.round(pct * 100))}%`;
      hpBar.className = "monster-hp-bar " + (pct > 0.6 ? "hp-high" : pct > 0.25 ? "hp-mid" : "hp-low");
    }

    $(root, "[data-ref=pHP]").textContent = `${p.hit_points}/${p.max_hit_points}`;
    $(root, "[data-ref=pLvl]").textContent = p.level;
    $(root, "[data-ref=pXP]").textContent = `${p.xp}/${p.xp_to_next_level}`;
    $(root, "[data-ref=pRevive]").textContent = p.revive_charges;

    const streakEl = $(root, "[data-ref=streak]");
    if (streakEl) {
      if (p.streak >= 3) {
        const bonus = p.streak >= 10 ? "2×" : p.streak >= 5 ? "1.5×" : "1.25×";
        streakEl.textContent = `🔥 Streak: ${p.streak}  (${bonus} damage bonus active)`;
        streakEl.hidden = false;
      } else if (p.streak > 0) {
        streakEl.textContent = `🔥 Streak: ${p.streak}`;
        streakEl.hidden = false;
      } else {
        streakEl.hidden = true;
      }
    }

    if (m.image) {
      const wrap = $(root, "[data-ref=imgWrap]");
      const img = $(root, "[data-ref=img]");
      img.src = `images/monsters/${m.image}`;
      img.alt = m.monster_name;
      wrap.hidden = false;
    }

    const itemSlot = $(root, "[data-ref=itemSlot]");
    const itemSep = $(root, "[data-ref=itemSep]");
    const item = this.model.active_item;
    if (itemSlot) {
      if (item) {
        itemSlot.textContent = `${item.emoji} ${item.name}`;
        itemSlot.hidden = false;
        if (itemSep) itemSep.hidden = false;
      } else {
        itemSlot.hidden = true;
        if (itemSep) itemSep.hidden = true;
      }
    }
  }

  _renderProgress(root) {
    const section = $(root, "[data-ref=progressSection]");
    if (!section) return;

    const total = this.model.questions.length;
    const status = new Map();
    this.model.answer_history.forEach(h => {
      if (h.was_perfect) {
        status.set(h.question, true);
      } else if (!status.get(h.question)) {
        status.set(h.question, false);
      }
    });

    const done = [...status.values()].filter(v => v).length;
    const requeue = [...status.values()].filter(v => !v).length;
    const unseen = total - done - requeue;

    const addBlock = (parent, cls) => {
      const b = document.createElement("span");
      b.className = `prog-block ${cls}`;
      parent.appendChild(b);
    };

    const bar = $(root, "[data-ref=progBar]");
    for (let i = 0; i < done; i++) addBlock(bar, "prog-done");
    for (let i = 0; i < requeue; i++) addBlock(bar, "prog-requeue");
    for (let i = 0; i < unseen; i++) addBlock(bar, "prog-unseen");

    const parts = [`${done} of ${total} complete`];
    if (requeue > 0) parts.push(`${requeue} to retry`);
    if (unseen > 0) parts.push(`${unseen} unseen`);
    $(root, "[data-ref=progStats]").textContent = parts.join(" · ");

    if (requeue > 0) {
      const retryRow = $(root, "[data-ref=retryRow]");
      const retryBar = $(root, "[data-ref=retryBar]");
      for (let i = 0; i < requeue; i++) addBlock(retryBar, "prog-requeue");
      $(root, "[data-ref=retryText]").textContent =
        `${requeue} question${requeue !== 1 ? "s" : ""} need${requeue === 1 ? "s" : ""} another attempt`;
      retryRow.hidden = false;
    }
  }

  showMainMenu(catalog, globalStats, levelData, launchCallback) {
    this._clearKeyboard();
    renderTemplate(this.root, "tpl-main-menu");

    const level = levelData?.level ?? 1;
    const title = getLevelTitle(level);
    const bar = $(this.root, "[data-ref=globalStats]");
    const totalSel = (globalStats?.total_correct ?? 0) + (globalStats?.total_incorrect ?? 0);
    const pct = totalSel > 0 ? Math.round((globalStats.total_correct ?? 0) / totalSel * 100) : 0;

    bar.innerHTML = `
      <span class="stat-item">⚔ Level: <span class="yellow">${level}</span> <span class="dim">(${title})</span></span>
      <span class="stat-item">📋 Answered: <span class="yellow">${globalStats?.total_answered ?? 0}</span></span>
      <span class="stat-item">🎯 Accuracy: <span class="yellow">${pct}%</span></span>
      <span class="stat-item">🔥 Best streak: <span class="yellow">${globalStats?.best_streak ?? 0}</span></span>
      <span class="stat-item">🏆 Completed: <span class="yellow">${globalStats?.sets_completed ?? 0}</span></span>
    `;
    bar.hidden = false;

    const inProgressEntries = [];
    catalog.forEach(topic => {
      (topic.sets || []).forEach(entry => {
        if (entry.status?.type === "in_progress") inProgressEntries.push(entry);
      });
    });

    if (inProgressEntries.length > 0) {
      const section = $(this.root, "[data-ref=inProgressSection]");
      const list = $(this.root, "[data-ref=inProgressList]");
      inProgressEntries.forEach(entry => {
        const row = document.createElement("div");
        row.className = "in-progress-row";
        row.innerHTML = `
          <span class="ip-title">${this._esc(entry.title)}</span>
          <span class="ip-remaining">${entry.status.remaining} questions left</span>
        `;
        const btn = document.createElement("button");
        btn.className = "action-button set-btn";
        btn.textContent = "Resume";
        btn.setAttribute("aria-label", `Resume ${entry.title}`);
        btn.addEventListener("click", () => launchCallback(entry.id, "resume"));
        row.appendChild(btn);
        list.appendChild(row);
      });
      section.hidden = false;
    }

    const topicContainer = $(this.root, "[data-ref=topicSections]");
    catalog.forEach(topic => {
      const playableSets = (topic.sets || []).filter(e => !e.review);
      const hasInProgress = playableSets.some(e => e.status?.type === "in_progress");
      const completedCount = playableSets.filter(e => e.status?.type === "complete").length;

      const section = document.createElement("details");
      section.className = `bbs-container topic-section${topic.coming_soon ? " topic-coming-soon" : ""}`;
      if (hasInProgress) section.open = true;

      const heading = document.createElement("summary");
      heading.className = "topic-heading";

      const label = document.createElement("span");
      label.className = "topic-heading-label";
      label.textContent = topic.topic.toUpperCase();
      heading.appendChild(label);

      if (topic.coming_soon) {
        const badge = document.createElement("span");
        badge.className = "coming-soon-badge";
        badge.textContent = "Coming Soon";
        heading.appendChild(badge);
      } else if (playableSets.length > 0) {
        const meta = document.createElement("span");
        meta.className = "topic-heading-meta";
        meta.textContent = completedCount > 0
          ? `${playableSets.length} sets · ${completedCount} cleared`
          : `${playableSets.length} sets`;
        heading.appendChild(meta);
      }

      section.appendChild(heading);
      if (topic.coming_soon || !topic.sets?.length) {
        topicContainer.appendChild(section);
        return;
      }

      const setList = document.createElement("div");
      setList.className = "set-list";
      const ordered = [
        ...topic.sets.filter(e => e.review),
        ...topic.sets.filter(e => !e.review),
      ];

      ordered.forEach(entry => {
        const row = document.createElement("div");
        row.className = "set-row" + (entry.review ? " set-row--review" : "");

        const info = document.createElement("div");
        info.className = "set-info";
        if (entry.review) {
          info.innerHTML = `
            <span class="set-title">🔀 ${this._esc(entry.title)}</span>
            <span class="set-desc">${this._esc(entry.description)}</span>
            <span class="set-count">${entry.sample_size} random questions</span>
          `;
        } else {
          info.innerHTML = `
            <span class="set-title">${this._esc(entry.title)}</span>
            <span class="set-desc">${this._esc(entry.description)}</span>
            <span class="set-count">${entry.question_count} questions</span>
          `;
        }

        const actions = document.createElement("div");
        actions.className = "set-actions";

        if (entry.review) {
          const badge = document.createElement("span");
          badge.className = "status-badge status-new";
          badge.textContent = "🔀 Review";
          actions.appendChild(badge);

          const btn = document.createElement("button");
          btn.className = "action-button set-btn";
          btn.textContent = "New Mix";
          btn.setAttribute("aria-label", `Start a new ${entry.title} mix`);
          btn.addEventListener("click", () => launchCallback(entry.id, "new"));
          actions.appendChild(btn);

          row.appendChild(info);
          row.appendChild(actions);
          setList.appendChild(row);
          return;
        }

        const status = entry.status ?? { type: "not_started" };
        const badge = document.createElement("span");
        if (status.type === "complete") {
          badge.className = "status-badge status-complete";
          badge.textContent = "✔ Cleared";
        } else if (status.type === "in_progress") {
          badge.className = "status-badge status-progress";
          badge.textContent = `▶ ${status.remaining} left`;
        } else if (status.type === "attempted") {
          badge.className = "status-badge status-attempted";
          badge.textContent = "◉ Attempted";
        } else {
          badge.className = "status-badge status-new";
          badge.textContent = "○ New";
        }
        actions.appendChild(badge);

        const btn = document.createElement("button");
        btn.className = "action-button set-btn";
        if (status.type === "in_progress") {
          btn.textContent = "Resume";
          btn.setAttribute("aria-label", `Resume ${entry.title}`);
          btn.addEventListener("click", () => launchCallback(entry.id, "resume"));

          const newLink = document.createElement("button");
          newLink.className = "action-button action-button--secondary set-btn-sm";
          newLink.textContent = "New Game";
          newLink.setAttribute("aria-label", `Start a new game of ${entry.title}`);
          newLink.addEventListener("click", () => launchCallback(entry.id, "new"));
          actions.appendChild(btn);
          actions.appendChild(newLink);
        } else if (status.type === "complete" || status.type === "attempted") {
          btn.textContent = "Play Again";
          btn.setAttribute("aria-label", `Play ${entry.title} again`);
          btn.addEventListener("click", () => launchCallback(entry.id, "new"));
          actions.appendChild(btn);
        } else {
          btn.textContent = "Start";
          btn.setAttribute("aria-label", `Start ${entry.title}`);
          btn.addEventListener("click", () => launchCallback(entry.id, "new"));
          actions.appendChild(btn);
        }

        row.appendChild(info);
        row.appendChild(actions);
        setList.appendChild(row);
      });

      section.appendChild(setList);
      topicContainer.appendChild(section);
    });

    const searchInput = $(this.root, "[data-ref=setSearch]");
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        const q = searchInput.value.trim().toLowerCase();
        const sections = topicContainer.querySelectorAll(".topic-section");
        sections.forEach(sec => {
          const rows = sec.querySelectorAll(".set-row");
          if (!q) {
            rows.forEach(r => { r.hidden = false; });
            sec.hidden = false;
            sec.open = sec.querySelector(".status-progress") !== null;
            return;
          }
          let anyVisible = false;
          rows.forEach(r => {
            const title = (r.querySelector(".set-title")?.textContent || "").toLowerCase();
            const desc = (r.querySelector(".set-desc")?.textContent || "").toLowerCase();
            const match = title.includes(q) || desc.includes(q);
            r.hidden = !match;
            if (match) anyVisible = true;
          });
          sec.hidden = !anyVisible;
          if (anyVisible) sec.open = true;
        });
      });
    }
  }

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
    const info = $(this.root, "[data-ref=resumeInfo]");
    const remaining = saveData.questions_to_ask?.length ?? 0;
    const savedAt = saveData.savedAt
      ? new Date(saveData.savedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
      : "a previous session";
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
    const q = this.model.current_question;
    renderTemplate(this.root, "tpl-encounter");
    this._populateEncounterHeader(this.root);

    const qEl = $(this.root, "[data-ref=qText]");
    qEl.textContent = q.question;
    qEl.id = "encounter-question-label";

    const options = shuffle([...(q.correct || []), ...(q.incorrect || [])]);
    const isSingle = (q.correct || []).length === 1;
    const inputType = isSingle ? "radio" : "checkbox";
    const radioGroup = `answer-group-${Math.random().toString(36).slice(2)}`;

    const hintEl = $(this.root, "[data-ref=answerHint]");
    if (hintEl) {
      hintEl.textContent = isSingle
        ? "Select one answer."
        : `Select all that apply (${(q.correct || []).length} correct).`;
      hintEl.hidden = false;
    }

    const optBox = $(this.root, "[data-ref=options]");
    optBox.setAttribute("role", isSingle ? "radiogroup" : "group");
    optBox.setAttribute("aria-labelledby", "encounter-question-label");

    const inputs = [];
    options.forEach((opt, idx) => {
      const id = `opt-${Math.random().toString(36).slice(2)}`;
      const label = document.createElement("label");
      label.className = "checkbox-label";
      const inp = document.createElement("input");
      inp.type = inputType;
      inp.value = opt;
      inp.id = id;
      if (isSingle) inp.name = radioGroup;
      inp.setAttribute("aria-label", `Option ${idx + 1}: ${opt}`);
      const num = document.createElement("span");
      num.className = "option-num";
      num.textContent = `${idx + 1}.\u00a0`;
      num.setAttribute("aria-hidden", "true");
      label.appendChild(inp);
      label.appendChild(num);
      label.appendChild(document.createTextNode(opt));
      optBox.appendChild(label);
      inputs.push(inp);
    });

    const kbHint = $(this.root, "[data-ref=kbHint]");
    if (kbHint) {
      kbHint.textContent = isSingle
        ? `Keys: 1–${options.length} select · Enter submits`
        : `Keys: 1–${options.length} toggle · Enter submits`;
    }

    const submitBtn = $(this.root, "[data-action=submit]");
    submitBtn.addEventListener("click", () => {
      this.controller.submitAnswer(inputs.filter(c => c.checked).map(c => c.value));
    });

    this._kbAbort = new AbortController();
    document.addEventListener("keydown", (e) => {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= inputs.length) {
        e.preventDefault();
        if (isSingle) {
          inputs.forEach(inp => { inp.checked = false; });
          inputs[n - 1].checked = true;
        } else {
          inputs[n - 1].checked = !inputs[n - 1].checked;
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        submitBtn.click();
      }
    }, { signal: this._kbAbort.signal });

    this._renderProgress(this.root);
    if (inputs.length > 0) inputs[0].focus();
  }

  showEncounterFillBlank() {
    this._clearKeyboard();
    const q = this.model.current_question;
    renderTemplate(this.root, "tpl-encounter-fill-blank");
    this._populateEncounterHeader(this.root);
    $(this.root, "[data-ref=qText]").textContent = q.question;

    const answers = q.correct || [];
    const canonical = answers[0] || "";
    const caseSens = q.case_sensitive === true;
    const charHint = canonical.split(" ")
      .map(word => `${"_".repeat(word.length)} (${word.length})`)
      .join("  ");
    $(this.root, "[data-ref=charHint]").textContent =
      `${charHint}${caseSens ? "  [case-sensitive]" : "  [not case-sensitive]"}`;

    this._updateWordleStatus(0);

    const input = $(this.root, "[data-ref=answerInput]");
    const submitBtn = $(this.root, "[data-action=submit]");
    submitBtn.addEventListener("click", () => {
      this.controller.submitFillBlank(input.value);
    });

    this._kbAbort = new AbortController();
    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && document.activeElement === input) {
        e.preventDefault();
        submitBtn.click();
      }
    }, { signal: this._kbAbort.signal });

    this._renderProgress(this.root);
    input.focus();
  }

  _updateWordleStatus(attemptsUsed) {
    const el = $(this.root, "[data-ref=wordleStatus]");
    if (!el) return;
    const total = 3;
    const next = Math.min(attemptsUsed + 1, total);
    el.textContent = `Guess ${next} of ${total} — type your answer below.`;
  }

  _appendWordleRow(feedback) {
    const grid = $(this.root, "[data-ref=wordleGrid]");
    if (!grid) return;
    const row = document.createElement("div");
    row.className = "wordle-row";
    feedback.forEach(({ char, status }) => {
      const tile = document.createElement("span");
      tile.className = `wordle-tile wordle-tile--${status}`;
      tile.textContent = char;
      row.appendChild(tile);
    });
    grid.appendChild(row);
  }

  showFillBlankAttempt(result) {
    this._populateEncounterHeader(this.root);
    this._appendWordleRow(result.feedback);
    this._updateWordleStatus(result.attemptsUsed);

    if (result.effective_monster_damage > 0) {
      const hud = this.root.querySelector(".player-hud");
      this._spawnFloatNumber(hud, `-${result.effective_monster_damage}`, "dmg-float--recv");
      const container = document.querySelector(".game-container");
      if (container) {
        container.classList.add("player-hit");
        container.addEventListener("animationend", () => container.classList.remove("player-hit"), { once: true });
      }
    }
    if (result.revived) {
      this.showFeedbackInline("⚗️ A Revive Charge was consumed — you survive with 10 HP!");
    }

    const input = $(this.root, "[data-ref=answerInput]");
    if (input) {
      input.value = "";
      input.focus();
    }
  }

  showEncounterMatching() {
    this._clearKeyboard();
    const q = this.model.current_question;
    renderTemplate(this.root, "tpl-encounter-matching");
    this._populateEncounterHeader(this.root);
    $(this.root, "[data-ref=qText]").textContent = q.question;

    const pairs = q.pairs || [];
    const shuffled = shuffle(pairs.map(p => p.definition));
    const tableBody = $(this.root, "[data-ref=matchTable]");
    const selects = [];

    pairs.forEach((pair, idx) => {
      const row = document.createElement("div");
      row.className = "match-row";

      const termCell = document.createElement("div");
      termCell.className = "match-term";
      termCell.textContent = pair.term;

      const sel = document.createElement("select");
      sel.id = `match-sel-${idx}`;
      sel.className = "match-select";
      sel.setAttribute("aria-label", `Match for: ${pair.term}`);

      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "— choose a definition —";
      sel.appendChild(placeholder);

      shuffled.forEach(def => {
        const opt = document.createElement("option");
        opt.value = def;
        opt.textContent = def;
        sel.appendChild(opt);
      });

      selects.push({ term: pair.term, select: sel });
      row.appendChild(termCell);
      row.appendChild(sel);
      tableBody.appendChild(row);
    });

    const submitBtn = $(this.root, "[data-action=submit]");
    submitBtn.addEventListener("click", () => {
      const selectedPairs = selects.map(({ term, select }) => ({
        term,
        definition: select.value,
      }));
      if (selectedPairs.some(p => !p.definition)) {
        this.showFeedbackInline("Please match all terms before submitting.");
        return;
      }
      this.controller.submitMatching(selectedPairs);
    });

    this._renderProgress(this.root);
    if (selects.length > 0) selects[0].select.focus();
  }

  showFeedbackInline(msg) {
    const existing = this.root.querySelector(".inline-feedback");
    if (existing) existing.remove();
    const div = document.createElement("div");
    div.className = "inline-feedback";
    div.setAttribute("role", "alert");
    div.textContent = msg;
    this.root.appendChild(div);
  }

  showHint(msg) { this.showFeedbackInline(msg); }

  _spawnFloatNumber(anchorEl, text, extraClass) {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const span = document.createElement("span");
    span.className = `dmg-float ${extraClass}`;
    span.textContent = text;
    span.style.left = `${rect.left + rect.width / 2}px`;
    span.style.top = `${rect.top + rect.height / 2}px`;
    document.body.appendChild(span);
    span.addEventListener("animationend", () => span.remove(), { once: true });
  }

  _triggerCombatAnimations(battleData) {
    const dealingDamage = battleData.effective_player_damage > 0;
    const takingDamage = battleData.effective_monster_damage > 0;
    if (!dealingDamage && !takingDamage) return 0;

    if (dealingDamage) {
      const img = this.root.querySelector(".monster-image");
      if (img) {
        img.classList.add("monster-hit");
        img.addEventListener("animationend", () => img.classList.remove("monster-hit"), { once: true });
      }
      const imgWrap = this.root.querySelector(".monster-image-container") || this.root.querySelector(".monster-details");
      this._spawnFloatNumber(imgWrap, `-${battleData.effective_player_damage}`, "dmg-float--hit");
    }

    if (takingDamage) {
      const container = document.querySelector(".game-container");
      if (container) {
        container.classList.add("player-hit");
        container.addEventListener("animationend", () => container.classList.remove("player-hit"), { once: true });
      }
      const hud = this.root.querySelector(".player-hud");
      this._spawnFloatNumber(hud, `-${battleData.effective_monster_damage}`, "dmg-float--recv");
    }

    return 760;
  }

  showResults(battleData, itemDrop, continueCallback) {
    this._clearKeyboard();
    const animDelay = this._triggerCombatAnimations(battleData);
    setTimeout(() => this._renderResults(battleData, itemDrop, continueCallback), animDelay);
  }

  _renderResults(battleData, itemDrop, continueCallback) {
    renderTemplate(this.root, "tpl-results");
    const body = $(this.root, "[data-ref=resultsBody]");

    const fbWrap = document.createElement("div");
    fbWrap.className = "feedback-container";
    body.appendChild(fbWrap);

    const addList = (container, cls, title, arr) => {
      const h = document.createElement("div");
      h.className = cls;
      h.textContent = title;
      container.appendChild(h);
      const ul = document.createElement("ul");
      (arr.length === 0 ? ["None."] : arr).forEach(x => {
        const li = document.createElement("li");
        li.textContent = x;
        ul.appendChild(li);
      });
      container.appendChild(ul);
    };

    const q = this.model.current_question;
    if (q) {
      const qLine = document.createElement("div");
      qLine.className = "section";
      qLine.innerHTML = `<span class="bold">Question:</span> ${this._esc(q.question)}`;
      body.insertBefore(qLine, fbWrap);
    }

    addList(fbWrap, "correct", "✔ Correctly selected:", battleData.correctSelections);
    addList(fbWrap, "incorrect", "✖ Incorrectly selected:", battleData.incorrectSelections);
    addList(fbWrap, "missed", "⚠ Missed correct answers:", battleData.missedCorrect);

    if (battleData.streakMultiplier > 1) {
      const sb = document.createElement("div");
      sb.className = "streak-bonus-note";
      sb.textContent = `🔥 Streak ×${battleData.streakMultiplier} bonus applied to your attack!`;
      body.appendChild(sb);
    }

    if (battleData.streakState === "preserved" && battleData.streakCount > 0) {
      const sp = document.createElement("div");
      sp.className = "streak-bonus-note";
      sp.textContent = `🔥 Close enough! Streak of ${battleData.streakCount} preserved.`;
      body.appendChild(sp);
    }

    if (battleData.question_repeated) {
      const rep = document.createElement("div");
      rep.className = "missed";
      rep.textContent = "⟳ You will face this question again.";
      body.appendChild(rep);
    }

    if (battleData.revived) {
      const rev = document.createElement("div");
      rev.className = "correct";
      rev.style.marginTop = "8px";
      rev.textContent = "⚗️ A Revive Charge was consumed — you survive with 10 HP!";
      body.appendChild(rev);
    }

    if (battleData.feedback) {
      const block = document.createElement("div");
      block.className = "custom-feedback";
      block.innerHTML = "<div class='bold'>Feedback:</div><div class='feedback-text'></div>";
      block.querySelector(".feedback-text").textContent = battleData.feedback;
      body.appendChild(block);
    }

    if (itemDrop) {
      const effectLabel = itemDrop.type === "heal"
        ? `+${itemDrop.actual_heal} HP restored`
        : itemDrop.type === "attack"
          ? `${itemDrop.attack_mult}× attack for next fight`
          : `−${Math.round(itemDrop.defense_reduce * 100)}% incoming damage for next fight`;
      const loot = document.createElement("div");
      loot.className = "loot-drop";
      loot.setAttribute("aria-live", "polite");
      loot.innerHTML =
        "<div class=\"loot-header\">&gt;&gt;&gt; ITEM DROP &lt;&lt;&lt;</div>" +
        `<div class="loot-body">${itemDrop.emoji} <span class="loot-name">${this._esc(itemDrop.name)}</span><br>` +
        `<span class="loot-flavor">${this._esc(itemDrop.flavor)}</span><br>` +
        `<span class="loot-effect">${this._esc(effectLabel)}</span></div>`;
      body.appendChild(loot);
    }

    const cont = $(this.root, "[data-action=continue]");
    cont.addEventListener("click", () => continueCallback());
    cont.focus();
    this._kbAbort = new AbortController();
    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        continueCallback();
      }
    }, { signal: this._kbAbort.signal });
  }

  showLevelUp(levelsGained, rewards, continueCallback) {
    this._clearKeyboard();
    const p = this.model.player;
    renderTemplate(this.root, "tpl-levelup");
    $(this.root, "[data-ref=level]").textContent = p.level;
    $(this.root, "[data-ref=levelTitle]").textContent = getLevelTitle(p.level);
    $(this.root, "[data-ref=levelsGainedText]").textContent = levelsGained > 1 ? `${levelsGained} levels gained!` : "";

    const rewardsEl = $(this.root, "[data-ref=levelUpRewards]");
    if (rewardsEl) {
      const parts = [];
      if (rewards?.hp_gained > 0) parts.push(`+${rewards.hp_gained} max HP`);
      if (rewards?.defense_gained > 0) parts.push(`+${rewards.defense_gained} defense`);
      if (rewards?.revive_gained > 0) parts.push(`+${rewards.revive_gained} revive charge${rewards.revive_gained > 1 ? "s" : ""} ⚗️`);
      rewardsEl.textContent = parts.length ? parts.join(" · ") : "";
    }
    const cont = $(this.root, "[data-action=continue]");
    cont.addEventListener("click", () => continueCallback());
    cont.focus();
    this._kbAbort = new AbortController();
    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        continueCallback();
      }
    }, { signal: this._kbAbort.signal });
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
      Revive Charges: <span class='yellow'>${p.revive_charges}</span>
    `;
    const btn = $(this.root, "[data-action=review]");
    if (btn) {
      btn.addEventListener("click", () => reviewCallback());
      btn.focus();
    }
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
    if (btn) {
      btn.addEventListener("click", () => reviewCallback());
      btn.focus();
    }
  }

  showGameOver(reviewCallback, restartCallback) {
    this._clearKeyboard();
    const p = this.model.player;
    renderTemplate(this.root, "tpl-gameover");
    $(this.root, "[data-ref=gameOverStats]").innerHTML = `
      Correct: <span class='yellow'>${p.total_correct}</span><br>
      Incorrect: <span class='yellow'>${p.total_incorrect}</span><br>
      Best Streak: <span class='yellow'>${p.best_streak}</span><br>
      Level: <span class='yellow'>${p.level}</span><br>
      HP: <span class='yellow'>${p.hit_points}/${p.max_hit_points}</span><br>
      Revive Charges: <span class='yellow'>${p.revive_charges}</span>
    `;
    const reviewBtn = $(this.root, "[data-action=review]");
    if (reviewBtn) reviewBtn.addEventListener("click", () => reviewCallback());
    const restartBtn = $(this.root, "[data-action=restart]");
    if (restartBtn) restartBtn.addEventListener("click", () => restartCallback());
    if (reviewBtn) reviewBtn.focus();
  }

  showReview(history, player, outcomeType, setName, mainMenuCallback) {
    this._clearKeyboard();
    renderTemplate(this.root, "tpl-review");

    const titles = {
      victory: "Victory! — Session Review",
      game_over: "Game Over — Session Review",
      no_questions: "Session Complete — Review",
    };
    $(this.root, "[data-ref=reviewTitle]").textContent = titles[outcomeType] || "Session Review";

    const total = history.length;
    const perfect = history.filter(h => h.was_perfect).length;
    const pct = total > 0 ? Math.round(perfect / total * 100) : 0;
    $(this.root, "[data-ref=reviewSummary]").innerHTML = `
      Questions answered: <span class="yellow">${total}</span> &nbsp;&nbsp;
      Perfect answers: <span class="yellow">${perfect}/${total} (${pct}%)</span><br>
      Best streak: <span class="yellow">${player.best_streak}</span> &nbsp;&nbsp;
      Final level: <span class="yellow">${player.level}</span><br>
      Correct selections: <span class="yellow">${player.total_correct}</span> &nbsp;&nbsp;
      Incorrect selections: <span class="yellow">${player.total_incorrect}</span><br>
      Final HP: <span class="yellow">${player.hit_points}/${player.max_hit_points}</span> &nbsp;&nbsp;
      Revive Charges: <span class="yellow">${player.revive_charges}</span>
    `;

    const list = $(this.root, "[data-ref=reviewList]");
    if (history.length === 0) {
      list.innerHTML = "<div class='review-item'>No questions answered this session.</div>";
    } else {
      history.forEach((entry, i) => {
        const item = document.createElement("div");
        item.className = `review-item ${entry.was_perfect ? "review-pass" : "review-fail"}`;
        item.setAttribute("role", "listitem");
        let html = `<div><span class="review-num">${i + 1}.</span> <span class="${entry.was_perfect ? "review-badge-pass" : "review-badge-fail"}">[${entry.was_perfect ? "✔ PASS" : "✖ FAIL"}]</span> <span class="review-q">${this._esc(entry.question)}</span></div>`;
        if (!entry.was_perfect) {
          if (entry.incorrect_selections.length > 0) {
            html += `<div class="review-detail review-wrong">✖ Wrong: ${entry.incorrect_selections.map(s => this._esc(s)).join(", ")}</div>`;
          }
          if (entry.missed_correct.length > 0) {
            html += `<div class="review-detail review-missed">⚠ Missed: ${entry.missed_correct.map(s => this._esc(s)).join(", ")}</div>`;
          }
          html += `<div class="review-detail review-correct-ans">✔ Correct: ${entry.correct_answers.map(s => this._esc(s)).join(", ")}</div>`;
        }
        item.innerHTML = html;
        list.appendChild(item);
      });
    }

    $(this.root, "[data-action=export]").addEventListener("click", () => this._exportReview(history, player, outcomeType, setName));
    const mm = $(this.root, "[data-action=main-menu]");
    if (mm) {
      mm.addEventListener("click", () => mainMenuCallback());
      mm.focus();
    }
  }

  _exportReview(history, player, outcomeType, setName) {
    const date = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    const total = history.length;
    const perfect = history.filter(h => h.was_perfect).length;
    const imperfect = history.filter(h => !h.was_perfect);
    const pct = total > 0 ? Math.round(perfect / total * 100) : 0;
    const outcome = outcomeType === "victory" ? "Victory!" : outcomeType === "game_over" ? "Game Over" : "Completed";
    let t = `Loop of the Recursive Dragon — Session Review\n${"=".repeat(50)}\n`;
    t += `Question Set : ${setName}\nDate         : ${date}\nOutcome      : ${outcome}\n\n`;
    t += `SUMMARY\n${"-".repeat(30)}\n`;
    t += `Questions Answered   : ${total}\nPerfect Answers      : ${perfect} / ${total} (${pct}%)\n`;
    t += `Best Streak          : ${player.best_streak}\nCorrect Selections   : ${player.total_correct}\n`;
    t += `Incorrect Selections : ${player.total_incorrect}\nFinal Level          : ${player.level}\n`;
    t += `Revive Charges Left  : ${player.revive_charges}\n`;
    t += `Final HP             : ${player.hit_points}/${player.max_hit_points}\n\n`;
    t += `QUESTIONS BELOW 100%\n${"-".repeat(30)}\n`;
    if (imperfect.length === 0) {
      t += "None.\n";
    } else {
      imperfect.forEach((entry, i) => {
        t += `${i + 1}. ${entry.question}\n`;
      });
    }
    const url = URL.createObjectURL(new Blob([t], { type: "text/plain;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: `lotrd-${setName.replace(".json", "")}-${new Date().toISOString().slice(0, 10)}.txt`,
    });
    a.click();
    URL.revokeObjectURL(url);
  }
}