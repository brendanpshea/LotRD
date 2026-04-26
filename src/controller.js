import { loadJSON, GameModel } from "./model.js";
import { ITEM_DROPS } from "./items.js";
import { SoundSystem } from "./sound.js";
import { GameUI } from "./ui.js";
import { shuffle } from "./util.js";
import { pickDragonLine } from "./dragon.js";

export class GameController {
  constructor() {
    this.root = document.getElementById("game-root");
    this.ui = new GameUI(this.root, null, this);
    this.sounds = new SoundSystem();
    this._setName = null;
    this._setTitle = null;
    this._setTopic = null;
    this._catalog = null;
    this.model = null;
    this._isReview = false;

    const soundBtn = document.getElementById("sound-toggle");
    if (soundBtn) {
      try {
        if (localStorage.getItem("lotrd_sound") === "0") {
          this.sounds.enabled = false;
          soundBtn.textContent = "🔇";
          soundBtn.setAttribute("aria-pressed", "false");
          soundBtn.setAttribute("aria-label", "Sound effects: off. Click to enable.");
        }
      } catch (_) {}
      soundBtn.addEventListener("click", () => {
        this.sounds.enabled = !this.sounds.enabled;
        const on = this.sounds.enabled;
        soundBtn.textContent = on ? "🔊" : "🔇";
        soundBtn.setAttribute("aria-pressed", String(on));
        soundBtn.setAttribute("aria-label", `Sound effects: ${on ? "on" : "off"}. Click to toggle.`);
        try { localStorage.setItem("lotrd_sound", on ? "1" : "0"); } catch (_) {}
      });
    }

    const backBtn = document.getElementById("back-btn");
    if (backBtn) {
      backBtn.addEventListener("click", () => {
        this._updateGlobalStats();
        this.saveGame();
        this.showMainMenu();
      });
    }

    const params = new URLSearchParams(window.location.search);
    const specifiedSet = params.get("set");
    if (specifiedSet) {
      this.loadSpecifiedSet(specifiedSet);
    } else {
      this.showMainMenu();
    }
  }

  getSetTitle() {
    return this._setTitle || "";
  }

  _createUi(model = this.model) {
    this.ui = new GameUI(this.root, model, this);
  }

  _saveKey(setName)       { return `lotrd_save_${setName}`; }
  _completionKey(setName) { return `lotrd_done_${setName}`; }
  _attemptKey(setName)    { return `lotrd_attempt_${setName}`; }
  _globalKey()            { return "lotrd_global"; }
  _globalLevelKey()       { return "lotrd_player_level"; }

  _loadGlobalLevel() {
    try { const r = localStorage.getItem(this._globalLevelKey()); return r ? JSON.parse(r) : null; } catch (_) { return null; }
  }

  _saveGlobalLevel() {
    if (!this.model) return;
    const p = this.model.player;
    try {
      localStorage.setItem(this._globalLevelKey(), JSON.stringify({
        level: p.level,
        xp: p.xp,
        revive_charges: p.revive_charges,
      }));
    } catch (_) {}
  }

  _sampleReviewQuestions(sourceDatas, sampleSize) {
    const seen = new Set();
    const perSourceUnique = sourceDatas.map(data => {
      const arr = Array.isArray(data) ? data : (data.questions || []);
      const out = [];
      for (const q of arr) {
        const key = q.question;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(q);
      }
      return shuffle(out);
    });

    const perSource = Math.floor(sampleSize / sourceDatas.length);
    const picked = [];
    const leftovers = [];
    for (const pool of perSourceUnique) {
      picked.push(...pool.slice(0, perSource));
      leftovers.push(...pool.slice(perSource));
    }

    const remaining = sampleSize - picked.length;
    if (remaining > 0) picked.push(...shuffle(leftovers).slice(0, remaining));
    return shuffle(picked);
  }

  saveGame() {
    if (this._isReview) return;
    if (!this._setName || !this.model) return;
    try {
      localStorage.setItem(
        this._saveKey(this._setName),
        JSON.stringify({ ...this.model.toSaveData(), setName: this._setName, savedAt: new Date().toISOString() })
      );
    } catch (_) {}
    this._saveGlobalLevel();
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
    if (this._isReview) return;
    if (!this._setName || !this.model) return;
    const p = this.model.player;
    const pct = (p.total_correct + p.total_incorrect) > 0
      ? Math.round(p.total_correct / (p.total_correct + p.total_incorrect) * 100)
      : 0;
    try {
      localStorage.setItem(this._completionKey(this._setName), JSON.stringify({
        completedAt: new Date().toISOString(),
        score_pct: pct,
        level: p.level,
      }));
    } catch (_) {}
  }

  _loadGlobalStats() {
    try { const r = localStorage.getItem(this._globalKey()); return r ? JSON.parse(r) : null; } catch (_) { return null; }
  }

  _updateGlobalStats(completed = false) {
    if (!this.model) return;
    const p = this.model.player;
    const offset = this.model.stats_offset ?? 0;
    const newHistory = this.model.answer_history.slice(offset);
    if (newHistory.length === 0 && !completed) return;

    const prev = this._loadGlobalStats() ?? {
      total_answered: 0,
      total_perfect: 0,
      total_correct: 0,
      total_incorrect: 0,
      best_streak: 0,
      sets_completed: 0,
    };

    let deltaCorrect = 0;
    let deltaIncorrect = 0;
    for (const h of newHistory) {
      deltaCorrect += (h.correct_selections ?? []).length;
      deltaIncorrect += (h.incorrect_selections ?? []).length;
    }

    const next = {
      total_answered: (prev.total_answered ?? 0) + newHistory.length,
      total_perfect: (prev.total_perfect ?? 0) + newHistory.filter(h => h.was_perfect).length,
      total_correct: (prev.total_correct ?? 0) + deltaCorrect,
      total_incorrect: (prev.total_incorrect ?? 0) + deltaIncorrect,
      best_streak: Math.max(prev.best_streak ?? 0, p.best_streak),
      sets_completed: (prev.sets_completed ?? 0) + (completed ? 1 : 0),
    };
    try { localStorage.setItem(this._globalKey(), JSON.stringify(next)); } catch (_) {}
    this.model.stats_offset = this.model.answer_history.length;
  }

  _setInGame(inGame) {
    const btn = document.getElementById("back-btn");
    if (btn) btn.hidden = !inGame;
  }

  _renderLoadError(message) {
    this.root.innerHTML = `
      <div class='bbs-container'>
        <div class='section red bold'>Error: ${message}</div>
        <div class='section'>
          <button class='action-button' data-action='main-menu'>Back to Main Menu</button>
        </div>
      </div>`;
    const button = this.root.querySelector("[data-action=main-menu]");
    if (button) button.addEventListener("click", () => this.showMainMenu());
  }

  async showMainMenu() {
    this._setInGame(false);
    const clean = new URL(window.location);
    clean.searchParams.delete("set");
    window.history.replaceState({}, "", clean);

    try {
      const catalog = await loadJSON("question_sets/catalog.json");
      this._catalog = catalog;
      const globalStats = this._loadGlobalStats();
      const levelData = this._loadGlobalLevel();

      catalog.forEach(topic => {
        (topic.sets || []).forEach(entry => {
          if (entry.review) { entry.status = { type: "review" }; return; }
          const done = this._loadCompletion(entry.id);
          const save = this._loadSave(entry.id);
          let attempted = false;
          try { attempted = !!localStorage.getItem(this._attemptKey(entry.id)); } catch (_) {}
          if (done) {
            entry.status = { type: "complete", ...done };
          } else if (save && (save.questions_to_ask?.length ?? 0) > 0) {
            entry.status = { type: "in_progress", remaining: save.questions_to_ask.length };
          } else if (attempted) {
            entry.status = { type: "attempted" };
          } else {
            entry.status = { type: "not_started" };
          }
        });
      });

      this.ui.showMainMenu(catalog, globalStats, levelData, (setId, mode) => this._launchSet(setId, mode));
    } catch (err) {
      this.root.innerHTML = `<div class='bbs-container'><div class='section red bold'>Error loading catalog: ${err.message}</div></div>`;
    }
  }

  async _launchSet(setId, mode) {
    try {
      if (!this._catalog) {
        try { this._catalog = await loadJSON("question_sets/catalog.json"); } catch (_) {}
      }

      this._setTitle = null;
      this._setTopic = null;
      if (this._catalog) {
        for (const topic of this._catalog) {
          const entry = (topic.sets || []).find(s => s.id === setId);
          if (entry) {
            this._setTitle = `${topic.topic}: ${entry.title}`;
            this._setTopic = topic.topic;
            break;
          }
        }
      }

      let catalogEntry = null;
      if (this._catalog) {
        for (const topic of this._catalog) {
          const found = (topic.sets || []).find(s => s.id === setId);
          if (found) {
            catalogEntry = found;
            break;
          }
        }
      }

      if (catalogEntry?.review) {
        const [sourceDatas, monsters_data] = await Promise.all([
          Promise.all(catalogEntry.sources.map(src => loadJSON(`question_sets/${src}`))),
          loadJSON("assets/monsters.json"),
        ]);
        const questions_data = this._sampleReviewQuestions(sourceDatas, catalogEntry.sample_size);

        const newURL = new URL(window.location);
        newURL.searchParams.set("set", setId);
        window.history.replaceState({}, "", newURL);

        this._setName = setId;
        this._isReview = true;

        const levelData = this._loadGlobalLevel();
        this.model = new GameModel(questions_data, monsters_data, null, levelData);
        this._createUi(this.model);
        this.ui.showInitialScreen(() => this.startAdventure());
        return;
      }

      this._isReview = false;

      const [questions_data, monsters_data] = await Promise.all([
        loadJSON(`question_sets/${setId}`),
        loadJSON("assets/monsters.json"),
      ]);
      const newURL = new URL(window.location);
      newURL.searchParams.set("set", setId);
      window.history.replaceState({}, "", newURL);
      this._setName = setId;

      if (mode === "resume") {
        const save = this._loadSave(setId);
        if (save && (save.questions_to_ask?.length ?? 0) > 0) {
          this.model = new GameModel(questions_data, monsters_data, save);
          this._createUi(this.model);
          this.startAdventure();
          return;
        }
      }

      if (mode === "new") {
        this._clearSave();
      }

      const levelData = this._loadGlobalLevel();
      this.model = new GameModel(questions_data, monsters_data, null, levelData);
      this._createUi(this.model);
      this.ui.showInitialScreen(() => this.startAdventure());
    } catch (err) {
      this.root.innerHTML = `<div class='bbs-container'><div class='section red bold'>Error loading "${setId}": ${err.message}</div></div>`;
    }
  }

  async loadSpecifiedSet(setName) {
    try {
      if (!this._catalog) {
        try { this._catalog = await loadJSON("question_sets/catalog.json"); } catch (_) {}
      }
      const isReview = this._catalog?.some(t =>
        (t.sets || []).some(s => s.id === setName && s.review));
      if (!isReview) {
        const availableSets = await loadJSON("question_sets/index.json");
        if (!availableSets.includes(setName)) throw new Error(`Question set "${setName}" not found.`);
      }
      await this._launchSet(setName, isReview ? "new" : "resume");
    } catch (err) {
      this._renderLoadError(err.message);
    }
  }

  startAdventure() {
    if (!this._isReview) {
      try { localStorage.setItem(this._attemptKey(this._setName), "1"); } catch (_) {}
    }
    const status = this.model.nextEncounter();
    this.saveGame();
    this.showEncounterStatus(status);
  }

  showEncounterStatus(status) {
    if (status === "victory") {
      this._clearSave();
      this._recordCompletion();
      this._updateGlobalStats(!this._isReview);
      this._saveGlobalLevel();
      this.sounds.victory();
      this._setInGame(false);
      this._showWithDragon(line => this.ui.showVictory(() => this.startReview("victory"), line));
    } else if (status === "no_questions") {
      this._clearSave();
      this._updateGlobalStats();
      this._saveGlobalLevel();
      this._setInGame(false);
      this._showWithDragon(line => this.ui.showNoQuestions(() => this.startReview("no_questions"), line));
    } else {
      this._setInGame(true);
      const qtype = this.model.current_question?.type;
      if (qtype === "fill_blank") {
        this.ui.showEncounterFillBlank();
      } else if (qtype === "code_trace") {
        this.ui.showEncounterCodeTrace();
      } else if (qtype === "matching") {
        this.ui.showEncounterMatching();
      } else {
        this.ui.showEncounter();
      }
    }
  }

  _showWithDragon(render) {
    if (this._isReview) { render(null); return; }
    const p = this.model.player;
    const total = p.total_correct + p.total_incorrect;
    const score_pct = total > 0 ? Math.round((p.total_correct / total) * 100) : 0;
    const global = this._loadGlobalStats();
    const sets_completed = global?.sets_completed ?? 0;
    const ctx = {
      score_pct,
      was_perfect: p.total_incorrect === 0 && total > 0,
      best_streak: p.best_streak,
      topic: this._setTopic,
      sets_completed,
      is_first_ever: sets_completed === 1,
    };
    pickDragonLine(ctx).then(render).catch(() => render(null));
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

  submitCodeTrace(inputText) {
    const normalized = (inputText || "")
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map(line => line.replace(/\s+$/, ""))
      .join("\n")
      .replace(/^\n+|\n+$/g, "");
    this.submitFillBlank(normalized);
  }

  submitFillBlank(inputText) {
    if (!this.model.current_question) return;
    if (!inputText.trim()) {
      this.ui.showFeedbackInline("Please type an answer before submitting.");
      return;
    }

    const result = this.model.submitFillBlankGuess(inputText);
    if (result.status === "wrong") {
      if (result.defeated_player && this.model.player.revive_charges > 0) {
        this.model.player.revive_charges--;
        this.model.player.hit_points = 10;
        result.defeated_player = false;
        result.revived = true;
      }
      if (result.defeated_player) {
        const finalResult = this.model.forceFillBlankFail();
        finalResult.defeated_player = true;
        this._resolveBattle(finalResult);
        return;
      }
      this.sounds.incorrect();
      this.ui.showFillBlankAttempt(result);
      this.saveGame();
      return;
    }

    this._resolveBattle(result);
  }

  submitMatching(selectedPairs) {
    if (!this.model.current_question) return;
    this._resolveBattle(this.model.evaluateMatching(selectedPairs));
  }

  submitAnswer(selected) {
    if (!this.model.current_question) return;
    if (selected.length === 0) {
      this.ui.showFeedbackInline("Please select at least one option. Press Enter to submit.");
      return;
    }
    this._resolveBattle(this.model.evaluateAnswer(selected));
  }

  _resolveBattle(battleData) {
    if (battleData.defeated_player && this.model.player.revive_charges > 0) {
      this.model.player.revive_charges--;
      this.model.player.hit_points = 10;
      battleData = { ...battleData, defeated_player: false, revived: true };
    }

    let itemDrop = null;
    if (battleData.defeated_monster) {
      this.model.active_item = null;
      if (Math.random() < 1 / 3) {
        const tier = this.model.current_monster.hit_dice;
        const eligible = ITEM_DROPS.filter(d => (d.min_tier ?? 1) <= tier);
        const pool = eligible.length > 0 ? eligible : ITEM_DROPS;
        const drop = pool[Math.floor(Math.random() * pool.length)];
        if (drop.type === "heal") {
          const maxHeal = this.model.player.max_hit_points - this.model.player.hit_points;
          const actualHeal = Math.min(drop.amount, maxHeal);
          this.model.player.hit_points += actualHeal;
          itemDrop = { ...drop, actual_heal: actualHeal };
        } else {
          this.model.active_item = drop;
          itemDrop = drop;
        }
      }
    }

    const hasErrors = battleData.incorrectSelections.length > 0 || battleData.missedCorrect.length > 0;
    if (battleData.defeated_monster) this.sounds.monsterDefeated();
    else if (hasErrors) this.sounds.incorrect();
    else {
      this.sounds.correct();
      if (battleData.streakCount >= 3) {
        setTimeout(() => this.sounds.streakHit(battleData.streakCount), 250);
      }
    }

    const afterResults = () => {
      if (battleData.defeated_player) {
        this._clearSave();
        this._updateGlobalStats();
        this._saveGlobalLevel();
        this.sounds.gameOver();
        this._setInGame(false);
        this.ui.showGameOver(
          () => this.startReview("game_over"),
          () => this._launchSet(this._setName, "new")
        );
        return;
      }
      if (battleData.levelsGained > 0) {
        this._saveGlobalLevel();
        this.sounds.levelUp();
        this.ui.showLevelUp(battleData.levelsGained, battleData.levelUpRewards, () => this.continueAdventure());
      } else {
        this.continueAdventure();
      }
    };

    this.ui.showResults(battleData, itemDrop, afterResults);
  }

  continueAdventure() {
    const status = this.model.nextEncounter();
    this.saveGame();
    this.showEncounterStatus(status);
  }
}