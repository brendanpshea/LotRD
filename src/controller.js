import { loadJSON, GameModel } from "./model.js";
import { ITEMS } from "./items.js";
import { SoundSystem } from "./sound.js";
import { GameUI } from "./ui.js";
import {
  shuffle, reviewDue, advanceReviewStage,
  TIER_APPRENTICE, TIER_MASTER, nextTierInfo, sampleTrialQuestions,
} from "./util.js";
import { pickDragonLine } from "./dragon.js";

const SAVE_DATA_VERSION = "2026-04-26";
const SAVE_DATA_VERSION_KEY = "lotrd_save_data_version";

// Spaced review ("Sharpen"): a cleared set becomes "due" again on an expanding
// schedule (see reviewDue/advanceReviewStage in util.js). Each completed review
// advances the stage. Purely an in-game nudge — never touches the SCORM score.
const REVIEW_SAMPLE_SIZE = 5;

/** Escape text for safe interpolation into innerHTML (e.g. ?set= URL param). */
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

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
    this._sharpenReviewId = null;
    // Rank-trial state: set when the current run is a Journeyman/Master trial.
    this._trialSetId = null;
    this._trialTier = null;
    // Which set's historical miss counts this run should feed (null for the
    // multi-source review mixes, which don't belong to any single set).
    this._missRecordId = null;

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

    this._applySaveDataVersion();

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
  _reviewKey(setName)     { return `lotrd_review_${setName}`; }
  _tierKey(setName)       { return `lotrd_tier_${setName}`; }
  _missKey(setName)       { return `lotrd_misses_${setName}`; }
  _globalKey()            { return "lotrd_global"; }
  _globalLevelKey()       { return "lotrd_player_level"; }

  _applySaveDataVersion() {
    try {
      const current = localStorage.getItem(SAVE_DATA_VERSION_KEY);
      if (current === SAVE_DATA_VERSION) return;

      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (!key) continue;
        if (key.startsWith("lotrd_save_")) {
          localStorage.removeItem(key);
        }
      }

      localStorage.setItem(SAVE_DATA_VERSION_KEY, SAVE_DATA_VERSION);
    } catch (_) {}
  }

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
      const arr = (Array.isArray(data) ? data : (data.questions || []))
        // NPC teaching scenes are first-exposure scaffolding, not retrieval.
        .filter(q => q.type !== "npc_demo");
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

  _loadReview(setName) {
    try { const r = localStorage.getItem(this._reviewKey(setName)); return r ? JSON.parse(r) : null; } catch (_) { return null; }
  }

  // ─── Mastery tiers (Apprentice → Journeyman → Master) ─────────────────────
  // Tier record shape: { tier, apprenticeAt, journeymanAt?, masterAt?, legacy? }
  // Timestamps are ISO strings. See util.js for the schedule math.

  _loadTier(setName) {
    try { const r = localStorage.getItem(this._tierKey(setName)); return r ? JSON.parse(r) : null; } catch (_) { return null; }
  }

  _saveTier(setName, rec) {
    try { localStorage.setItem(this._tierKey(setName), JSON.stringify(rec)); } catch (_) {}
  }

  /**
   * Sets cleared before tiers existed have a completion record but no tier
   * record. Grandfather them at Master so the gradebook score of a student
   * who already finished never drops when the tier system arrives.
   */
  _migrateLegacyTiers(catalog) {
    for (const topic of catalog) {
      for (const entry of (topic.sets || [])) {
        if (entry.review || !entry.id) continue;
        const done = this._loadCompletion(entry.id);
        if (!done || this._loadTier(entry.id)) continue;
        const at = done.completedAt || new Date(0).toISOString();
        this._saveTier(entry.id, {
          tier: TIER_MASTER, apprenticeAt: at, journeymanAt: at, masterAt: at, legacy: true,
        });
      }
    }
  }

  /** Historical miss counts for a set: question text → times answered imperfectly. */
  _loadMisses(setName) {
    try {
      const r = localStorage.getItem(this._missKey(setName));
      const parsed = r ? JSON.parse(r) : null;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (_) { return {}; }
  }

  /**
   * Fold this run's stumbles into the set's historical miss counts. Rank
   * trials use these to weight their sample toward what actually needs work.
   */
  _recordMisses() {
    if (!this._missRecordId || !this.model) return;
    const counts = this._loadMisses(this._missRecordId);
    let changed = false;
    for (const h of this.model.answer_history) {
      if (h && h.was_perfect === false && h.question) {
        counts[h.question] = (counts[h.question] || 0) + 1;
        changed = true;
      }
    }
    if (!changed) return;
    try { localStorage.setItem(this._missKey(this._missRecordId), JSON.stringify(counts)); } catch (_) {}
  }

  /** If the just-finished run was a rank trial, award the earned tier. */
  _recordTierAdvanceIfTrial() {
    if (!this._trialSetId) return;
    const setId = this._trialSetId;
    const earnedTier = this._trialTier;
    this._trialSetId = null;
    this._trialTier = null;
    const rec = this._loadTier(setId);
    const next = nextTierInfo(rec);
    if (!next || next.nextTier !== earnedTier) return; // stale/duplicate finish
    const nowIso = new Date().toISOString();
    const merged = { ...(rec ?? {}), tier: earnedTier };
    if (earnedTier === TIER_MASTER) merged.masterAt = nowIso;
    else merged.journeymanAt = nowIso;
    this._saveTier(setId, merged);
  }

  /**
   * Whether a cleared set is due for spaced review, and how "deep" it is in the
   * expanding schedule. Sharpen reviews only apply once a set reaches Master —
   * below that, the rank trials ARE the spaced re-encounters. Anchor is the
   * last review (falling back to the mastery timestamp, then the completion),
   * and mastered sets start at stage 2 so the first Sharpen lands ~21 days
   * after mastery rather than 2. Returns null when the set isn't cleared yet.
   */
  _reviewDueInfo(setName, completion, tierRec = null) {
    if (!completion) return null;
    const rec = this._loadReview(setName);
    const anchor = tierRec?.masterAt ?? completion.completedAt;
    const stage = Math.max(rec?.stage ?? 0, tierRec ? 2 : 0);
    return reviewDue({ ...(rec ?? {}), stage }, anchor);
  }

  /** Advance the spaced-review schedule after a completed review run. */
  _recordReview(setName) {
    const rec = this._loadReview(setName);
    try {
      localStorage.setItem(this._reviewKey(setName), JSON.stringify({
        lastReviewedAt: new Date().toISOString(),
        stage: advanceReviewStage(rec?.stage ?? 0),
      }));
    } catch (_) {}
  }

  _recordCompletion() {
    if (this._isReview) return;
    if (!this._setName || !this.model) return;
    const p = this.model.player;
    const pct = (p.total_correct + p.total_incorrect) > 0
      ? Math.round(p.total_correct / (p.total_correct + p.total_incorrect) * 100)
      : 0;
    const nowIso = new Date().toISOString();
    try {
      localStorage.setItem(this._completionKey(this._setName), JSON.stringify({
        completedAt: nowIso,
        score_pct: pct,
        level: p.level,
      }));
    } catch (_) {}
    // First full clear starts the rank ladder at Apprentice. Replays of an
    // already-ranked set leave the record alone — rank only moves via trials.
    if (!this._loadTier(this._setName)) {
      this._saveTier(this._setName, { tier: TIER_APPRENTICE, apprenticeAt: nowIso });
    }
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
        <div class='section red bold'>Error: ${escapeHtml(message)}</div>
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
      this._migrateLegacyTiers(catalog);
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
            const tierRec = this._loadTier(entry.id);
            entry.tier = tierRec?.tier ?? TIER_APPRENTICE;
            entry.tierNext = nextTierInfo(tierRec);
            entry.reviewDue = entry.tier >= TIER_MASTER
              && !!this._reviewDueInfo(entry.id, done, tierRec)?.due;
          } else if (save && (save.questions_to_ask?.length ?? 0) > 0) {
            entry.status = { type: "in_progress", remaining: save.questions_to_ask.length };
          } else if (attempted) {
            entry.status = { type: "attempted" };
          } else {
            entry.status = { type: "not_started" };
          }
        });
      });

      this.ui.showMainMenu(catalog, globalStats, levelData, (setId, mode) => {
        if (mode === "trial") return this._launchTierTrial(setId);
        return this._launchSet(setId, mode);
      });
    } catch (err) {
      this.root.innerHTML = `<div class='bbs-container'><div class='section red bold'>Error loading catalog: ${escapeHtml(err.message)}</div></div>`;
    }
  }

  /** Locate a set in the catalog and set the breadcrumb title/topic. */
  _applySetTitle(setId) {
    this._setTitle = null;
    this._setTopic = null;
    if (!this._catalog) return;
    for (const topic of this._catalog) {
      const entry = (topic.sets || []).find(s => s.id === setId);
      if (entry) {
        this._setTitle = `${topic.topic}: ${entry.title}`;
        this._setTopic = topic.topic;
        break;
      }
    }
  }

  /**
   * Launch a short spaced-review run of an already-cleared set: a small sample
   * of its questions, run in review mode (no save, no completion/score change).
   * Finishing it advances the set's expanding review schedule.
   */
  async _launchReview(setId) {
    try {
      if (!this._catalog) {
        try { this._catalog = await loadJSON("question_sets/catalog.json"); } catch (_) {}
      }
      this._applySetTitle(setId);

      const [questions_data, monsters_data] = await Promise.all([
        loadJSON(`question_sets/${setId}`),
        loadJSON("assets/monsters.json"),
      ]);
      const sample = this._sampleReviewQuestions([questions_data], REVIEW_SAMPLE_SIZE);

      const newURL = new URL(window.location);
      newURL.searchParams.set("set", setId);
      window.history.replaceState({}, "", newURL);

      this._setName = setId;
      this._isReview = true;
      this._sharpenReviewId = setId;
      this._trialSetId = null;
      this._trialTier = null;
      this._missRecordId = setId;

      const levelData = this._loadGlobalLevel();
      this.model = new GameModel(sample, monsters_data, null, levelData);
      this._createUi(this.model);
      this.ui.showInitialScreen({
        title: this._setTitle,
        review: { questionCount: sample.length },
      }, () => this.startAdventure());
    } catch (err) {
      this.root.innerHTML = `<div class='bbs-container'><div class='section red bold'>Error loading review for "${escapeHtml(setId)}": ${escapeHtml(err.message)}</div></div>`;
    }
  }

  /**
   * Launch a rank trial (Journeyman or Master) for an already-cleared set:
   * about half of its questions, weighted toward the ones the student has
   * historically missed, run in review mode (no save, no completion record).
   * Finishing the run — including the retrieval boss — earns the rank, which
   * raises the set's gradebook credit.
   */
  async _launchTierTrial(setId) {
    try {
      if (!this._catalog) {
        try { this._catalog = await loadJSON("question_sets/catalog.json"); } catch (_) {}
      }
      this._applySetTitle(setId);

      const tierRec = this._loadTier(setId);
      const next = nextTierInfo(tierRec);
      if (!next?.due) { this.showMainMenu(); return; }

      const [questions_data, monsters_data] = await Promise.all([
        loadJSON(`question_sets/${setId}`),
        loadJSON("assets/monsters.json"),
      ]);
      const pool = Array.isArray(questions_data) ? questions_data : (questions_data.questions || []);
      const sample = sampleTrialQuestions(pool, this._loadMisses(setId));

      const newURL = new URL(window.location);
      newURL.searchParams.set("set", setId);
      window.history.replaceState({}, "", newURL);

      this._setName = setId;
      this._isReview = true;
      this._sharpenReviewId = null;
      this._trialSetId = setId;
      this._trialTier = next.nextTier;
      this._missRecordId = setId;

      const levelData = this._loadGlobalLevel();
      this.model = new GameModel(sample, monsters_data, null, levelData);
      this._createUi(this.model);
      this.ui.showInitialScreen({
        title: this._setTitle,
        trial: { tier: next.nextTier, questionCount: sample.length },
      }, () => this.startAdventure());
    } catch (err) {
      this.root.innerHTML = `<div class='bbs-container'><div class='section red bold'>Error loading trial for "${escapeHtml(setId)}": ${escapeHtml(err.message)}</div></div>`;
    }
  }

  async _launchSet(setId, mode) {
    if (mode === "review") return this._launchReview(setId);
    try {
      if (!this._catalog) {
        try { this._catalog = await loadJSON("question_sets/catalog.json"); } catch (_) {}
      }

      this._sharpenReviewId = null;
      this._applySetTitle(setId);

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
        this._trialSetId = null;
        this._trialTier = null;
        this._missRecordId = null;

        const levelData = this._loadGlobalLevel();
        this.model = new GameModel(questions_data, monsters_data, null, levelData);
        this._createUi(this.model);
        this.ui.showInitialScreen({
          title: this._setTitle,
          review: { questionCount: questions_data.length },
        }, () => this.startAdventure());
        return;
      }

      this._isReview = false;
      this._trialSetId = null;
      this._trialTier = null;
      this._missRecordId = setId;

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
      // Full runs keep the authored order: sets are written as a progression,
      // and NPC teaching scenes must precede their paired questions. Missed
      // questions still requeue, and reviews/trials shuffle their samples.
      this.model = new GameModel(questions_data, monsters_data, null, levelData, { sequential: true });
      this._createUi(this.model);
      this.ui.showInitialScreen({
        title: this._setTitle,
        intro: catalogEntry?.intro || null,
        questionCount: catalogEntry?.question_count ?? null,
      }, () => this.startAdventure());
    } catch (err) {
      this.root.innerHTML = `<div class='bbs-container'><div class='section red bold'>Error loading "${escapeHtml(setId)}": ${escapeHtml(err.message)}</div></div>`;
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
      this._recordMisses();
      this._recordCompletion();
      this._recordTierAdvanceIfTrial();
      this._recordReviewIfReviewing();
      this._updateGlobalStats(!this._isReview);
      this._saveGlobalLevel();
      this.sounds.victory();
      this._setInGame(false);
      this._showWithDragon(line => this.ui.showVictory(() => this.startReview("victory"), line));
    } else if (status === "no_questions") {
      this._clearSave();
      this._recordMisses();
      this._recordCompletion();
      this._recordTierAdvanceIfTrial();
      this._recordReviewIfReviewing();
      this._updateGlobalStats(!this._isReview);
      this._saveGlobalLevel();
      this._setInGame(false);
      this._showWithDragon(line => this.ui.showNoQuestions(() => this.startReview("no_questions"), line));
    } else if (status === "boss_start") {
      this._setInGame(true);
      const count = this.model.current_monster?.max_hit_points ?? this.model.boss_queue.length + 1;
      pickDragonLine({ boss_intro: true })
        .then(line => this.ui.showBossIntro(count, line, () => this._renderEncounter()))
        .catch(() => this.ui.showBossIntro(count, null, () => this._renderEncounter()));
    } else {
      this._renderEncounter();
    }
  }

  /** If the just-finished run was a spaced review, advance its schedule. */
  _recordReviewIfReviewing() {
    if (this._sharpenReviewId) {
      this._recordReview(this._sharpenReviewId);
      this._sharpenReviewId = null;
    }
  }

  /** Render the appropriate encounter screen for the current question type. */
  _renderEncounter() {
    this._setInGame(true);
    const qtype = this.model.current_question?.type;
    if (qtype === "fill_blank" || qtype === "dynamic_numeric") {
      this.ui.showEncounterFillBlank();
    } else if (qtype === "code_trace") {
      this.ui.showEncounterCodeTrace();
    } else if (qtype === "code_line") {
      this.ui.showEncounterCodeLine();
    } else if (qtype === "matching") {
      this.ui.showEncounterMatching();
    } else if (qtype === "ordering") {
      this.ui.showEncounterOrdering();
    } else if (qtype === "npc_demo") {
      this.ui.showNpcScene(() => this.completeNpcScene());
    } else {
      this.ui.showEncounter();
    }
  }

  /** An NPC teaching scene ended (finished or skipped) — no combat resolution. */
  completeNpcScene() {
    if (this.model.current_question?.type !== "npc_demo") return;
    this.model.current_question = null;
    this.continueAdventure();
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
    if (result.status === "invalid") {
      this.ui.showFeedbackInline(result.message);
      return;
    }
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

  submitCodeLine(inputText, { confirmed = false } = {}) {
    if (!this.model.current_question) return;
    if (!inputText.trim()) {
      this.ui.showFeedbackInline("Please type an answer before submitting.");
      return;
    }

    const result = this.model.submitCodeLineGuess(inputText, { confirmed });

    if (result.status === "typo") {
      this.ui.showCodeLineTypoConfirm(
        result.suggestion,
        inputText,
        () => this.submitCodeLine(inputText, { confirmed: true }),
        () => this.ui.focusCodeLineInput(),
      );
      return;
    }

    if (result.status === "wrong") {
      if (result.defeated_player && this.model.player.revive_charges > 0) {
        this.model.player.revive_charges--;
        this.model.player.hit_points = 10;
        result.defeated_player = false;
        result.revived = true;
      }
      if (result.defeated_player) {
        const finalResult = this.model.forceCodeLineFail();
        finalResult.defeated_player = true;
        this._resolveBattle(finalResult);
        return;
      }
      this.sounds.incorrect();
      this.ui.showCodeLineAttempt(result);
      this.saveGame();
      return;
    }

    this._resolveBattle(result);
  }

  submitMatching(selectedPairs) {
    if (!this.model.current_question) return;
    this._evaluateWithMulligan(() => this.model.evaluateMatching(selectedPairs));
  }

  submitOrdering(selectedItems) {
    if (!this.model.current_question) return;
    this._evaluateWithMulligan(() => this.model.evaluateOrdering(selectedItems));
  }

  submitAnswer(selected) {
    if (!this.model.current_question) return;
    if (selected.length === 0) {
      this.ui.showFeedbackInline("Please select at least one option. Press Enter to submit.");
      return;
    }
    this._evaluateWithMulligan(() => this.model.evaluateAnswer(selected));
  }

  /**
   * Wrap an evaluator call so an active Mulligan can rewind a non-perfect
   * outcome and let the player retry the same question once. Mulligan does NOT
   * apply on perfect answers (no need) or on monster-defeating wins (the win
   * stands; the player wouldn't choose to undo it anyway).
   */
  _evaluateWithMulligan(evaluate) {
    const mulliganArmed = this.model.pending_effects.has('mulligan');
    const snap = mulliganArmed ? this._mulliganSnapshot() : null;
    const battleData = evaluate();

    const wasPerfect = !(battleData.incorrectSelections?.length || battleData.missedCorrect?.length);
    const monsterDead = battleData.defeated_monster;
    if (mulliganArmed && !wasPerfect && !monsterDead) {
      this._mulliganRestore(snap);
      this.model.pending_effects.delete('mulligan');
      this.sounds.incorrect();
      this.ui.showFeedbackInline("🔁 Mulligan! That answer was rolled back. Try again.");
      this.saveGame();
      return;
    }

    this._resolveBattle(battleData);
  }

  _mulliganSnapshot() {
    const p = this.model.player;
    return {
      player: { ...p },
      monsterHp: this.model.current_monster.hit_points,
      current_question: this.model.current_question,
      questions_to_ask: [...this.model.questions_to_ask],
      boss_queue: [...this.model.boss_queue],
      pending_effects: new Set(this.model.pending_effects),
      questions_asked: this.model.questions_asked,
      answer_history_len: this.model.answer_history.length,
    };
  }

  _mulliganRestore(snap) {
    Object.assign(this.model.player, snap.player);
    this.model.current_monster.hit_points = snap.monsterHp;
    // Evaluators null out current_question when they finalize the turn; restore
    // it so the player can actually re-submit the same question.
    this.model.current_question = snap.current_question;
    this.model.questions_to_ask = snap.questions_to_ask;
    // The rolled-back turn may have re-queued the question (into boss_queue
    // during the boss fight) and burned other armed items — undo both, or the
    // player pays for a turn that never happened.
    this.model.boss_queue = snap.boss_queue;
    this.model.pending_effects = snap.pending_effects;
    this.model.questions_asked = snap.questions_asked;
    this.model.answer_history.length = snap.answer_history_len;
  }

  _resolveBattle(battleData) {
    if (battleData.defeated_player && this.model.player.revive_charges > 0) {
      this.model.player.revive_charges--;
      this.model.player.hit_points = 10;
      battleData = { ...battleData, defeated_player: false, revived: true };
    }

    let itemDrop = null;
    if (battleData.defeated_monster) {
      if (Math.random() < 1 / 3) {
        const tier = this.model.current_monster.hit_dice;
        const eligible = ITEMS.filter(d => (d.min_tier ?? 1) <= tier);
        const pool = eligible.length > 0 ? eligible : ITEMS;
        const drop = pool[Math.floor(Math.random() * pool.length)];
        const placement = this.model.addItemDrop({ ...drop });
        itemDrop = { ...drop, placed_slot: placement.placed, displaced: placement.displaced };
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
        this._recordMisses();
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

  /**
   * Activate the item in the given inventory slot. Instant items fire now and
   * may need a screen refresh / encounter advance; pending items just arm a
   * flag and re-render the HUD.
   */
  useItem(slotIdx) {
    if (!this.model || !this.model.current_question) return;
    const item = this.model.inventory[slotIdx];
    if (!item) return;

    if (item.kind === "pending") {
      this.model.consumeSlot(slotIdx);
      this.model.pending_effects.add(item.effect);
      this.sounds.correct();
      this.ui.showFeedbackInline(`${item.emoji} ${item.name} armed.`);
      this.ui.refreshHUD();
      this.saveGame();
      return;
    }

    // ── Instant items ──
    switch (item.effect) {
      case "heal": {
        const room = this.model.player.max_hit_points - this.model.player.hit_points;
        if (room <= 0) {
          // Don't burn the item for +0 HP — keep it for when it can do something.
          this.ui.showFeedbackInline(`${item.emoji} ${item.name} — already at full HP. Saved for later.`);
          return;
        }
        const actual = Math.max(0, Math.min(item.amount, room));
        this.model.player.hit_points += actual;
        this.model.consumeSlot(slotIdx);
        this.sounds.correct();
        this.ui.showFeedbackInline(`${item.emoji} ${item.name} — +${actual} HP.`);
        this.ui.refreshHUD();
        break;
      }
      case "max_hp": {
        this.model.player.max_hit_points += item.amount;
        this.model.player.hit_points     += item.amount;
        this.model.consumeSlot(slotIdx);
        this.sounds.levelUp();
        this.ui.showFeedbackInline(`${item.emoji} ${item.name} — +${item.amount} max HP!`);
        this.ui.refreshHUD();
        break;
      }
      case "add_revive": {
        this.model.player.revive_charges++;
        this.model.consumeSlot(slotIdx);
        this.sounds.levelUp();
        this.ui.showFeedbackInline(`${item.emoji} ${item.name} — +1 revive charge.`);
        this.ui.refreshHUD();
        break;
      }
      case "bomb": {
        if (this.model.boss_phase) {
          this.ui.showFeedbackInline("🐉 The dragon is immune to shortcuts — answer to drive it back.");
          return;
        }
        this.model.consumeSlot(slotIdx);
        this.sounds.monsterDefeated();
        this.model.current_monster.hit_points = 0;
        // Re-queue the current question so the player still has to face it later.
        // Bomb buys time without letting the player skip the question.
        const idx = Math.min(3, this.model.questions_to_ask.length);
        this.model.questions_to_ask.splice(idx, 0, this.model.current_question);
        this.model.current_question = null;
        this.continueAdventure();
        break;
      }
      default:
        return;
    }
    this.saveGame();
  }

  /** Right-click / long-press support: discard the slot's item without using it. */
  discardItem(slotIdx) {
    if (!this.model) return;
    if (!this.model.inventory[slotIdx]) return;
    this.model.consumeSlot(slotIdx);
    this.ui.refreshHUD();
    this.saveGame();
  }
}