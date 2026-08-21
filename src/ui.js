import {
  shuffle, TIER_MASTER, TIER_NAMES, TIER_BADGES, TIER_CREDIT, computeCourseGrade,
} from "./util.js";
import { highlightJava, highlightPython } from "./highlight.js";
import { parseClozeSegments, evaluateDynamicExpression, codeWriteExamples } from "./model.js";
import { loadNpcRoster, findNpc } from "./npcs.js";

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

  /**
   * Every encounter screen carries a [data-ref=encounterChrome] placeholder
   * where the shared monster header and journey progress belong. Clone the one
   * definition into it. No-ops once mounted, so refreshHUD() can re-populate
   * the same DOM without rebuilding it.
   */
  _mountEncounterChrome(root) {
    const slot = $(root, "[data-ref=encounterChrome]");
    if (!slot) return;
    const tpl = document.getElementById("tpl-encounter-chrome");
    if (!tpl) throw new Error("Missing template: tpl-encounter-chrome");
    slot.replaceWith(tpl.content.cloneNode(true));
  }

  /**
   * True only the very first time a monster of this name is drawn in this run.
   * Every later encounter — including the next question against the same
   * monster — starts folded away, which is the whole point: the description is
   * worth reading once, not once per question. Tracked on the UI rather than in
   * the save, so resuming a run re-introduces the cast, which is a feature.
   */
  _firstSighting(name) {
    if (!name) return false;
    this._seenMonsters ||= new Set();
    if (this._seenMonsters.has(name)) return false;
    this._seenMonsters.add(name);
    return true;
  }

  /**
   * @param {boolean} preserveExamine – true when re-drawing the HUD of an
   *   encounter already on screen (using an item). The student may have opened
   *   the description themselves; a HUD refresh must not slam it shut.
   */
  _populateEncounterHeader(root, preserveExamine = false) {
    this._mountEncounterChrome(root);
    const p = this.model.player;
    const m = this.model.current_monster;

    const crumb = $(root, "[data-ref=breadcrumb]");
    if (crumb) {
      const title = this._getSetTitle();
      crumb.textContent = title ? `▶ ${title}` : "▶ Loop of the Recursive Dragon";
    }

    $(root, "[data-ref=mName]").textContent = m.is_boss ? "🐉 The Recursive Dragon" : m.monster_name;

    const examine = $(root, "[data-ref=mExamine]");
    const desc = $(root, "[data-ref=mDesc]");
    const tier = $(root, "[data-ref=mTier]");

    if (m.is_boss) {
      // The dragon's line is live state, not flavour: it says how many concepts
      // are left. It must never be tucked behind a toggle.
      const left = m.hit_points;
      desc.textContent = `${left} concept${left === 1 ? "" : "s"} left to master`;
      if (examine) { examine.open = true; examine.classList.add("monster-examine--pinned"); }
      if (tier) tier.textContent = "";
    } else {
      desc.textContent = m.initial_description || "";
      if (tier) tier.textContent = m.hit_dice ? `Lv ${m.hit_dice}` : "";
      if (examine) {
        const wasOpen = examine.open;
        examine.classList.remove("monster-examine--pinned");
        examine.hidden = !m.initial_description;
        // Introduce a monster in full the first time it turns up this run;
        // after that the description is wallpaper, so leave it folded away.
        examine.open = preserveExamine ? wasOpen : this._firstSighting(m.monster_name);
      }
    }

    $(root, "[data-ref=mHP]").textContent = m.hit_points;
    const hpBar = $(root, "[data-ref=mHPBar]");
    if (hpBar) {
      const pct = m.max_hit_points > 0 ? m.hit_points / m.max_hit_points : 1;
      hpBar.style.width = `${Math.max(0, Math.round(pct * 100))}%`;
      hpBar.className = "monster-hp-bar " + (pct > 0.6 ? "hp-high" : pct > 0.25 ? "hp-mid" : "hp-low");
    }

    $(root, "[data-ref=pHP]").textContent = `${p.hit_points}/${p.max_hit_points}`;
    // Mirror the monster's bar, so a fight reads as two combatants rather than
    // a sprite with a stat list underneath it.
    const pBar = $(root, "[data-ref=pHPBar]");
    if (pBar) {
      const pct = p.max_hit_points > 0 ? Math.max(0, p.hit_points) / p.max_hit_points : 1;
      pBar.style.width = `${Math.max(0, Math.round(pct * 100))}%`;
      pBar.className = "player-hp-bar " + (pct > 0.6 ? "hp-high" : pct > 0.25 ? "hp-mid" : "hp-low");
    }
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

    this._renderInventory(root);
  }

  /** Refresh just the per-encounter HUD (HP/XP/inventory) without rerendering the question. */
  refreshHUD() {
    if (!this.model || !this.model.current_question) return;
    this._populateEncounterHeader(this.root, true);
  }

  _renderInventory(root) {
    const inv = this.model.inventory || [];

    // Before the first drop, two "empty" boxes are just noise on the screen a
    // new player is trying to read. Show the row once there is something in it.
    const invRow = $(root, "[data-ref=inventory]");
    if (invRow) invRow.hidden = !inv.some(s => s !== null);

    for (let i = 0; i < 2; i++) {
      const slot = $(root, `[data-ref=invSlot${i}]`);
      const icon = $(root, `[data-ref=invIcon${i}]`);
      const name = $(root, `[data-ref=invName${i}]`);
      if (!slot) continue;
      const item = inv[i];
      if (item) {
        slot.classList.remove("inv-slot--empty");
        slot.classList.add("inv-slot--filled");
        slot.disabled = false;
        slot.setAttribute("aria-label",
          `Item slot ${i + 1}: ${item.name} — ${item.flavor} (shortcut ${i === 0 ? "Q" : "W"})`);
        slot.title = `${item.name} — ${item.flavor}`;
        if (icon) icon.textContent = item.emoji;
        if (name) name.textContent = item.name;
      } else {
        slot.classList.add("inv-slot--empty");
        slot.classList.remove("inv-slot--filled");
        slot.disabled = true;
        slot.setAttribute("aria-label",
          `Item slot ${i + 1}, empty (shortcut ${i === 0 ? "Q" : "W"})`);
        slot.title = "";
        if (icon) icon.textContent = "·";
        if (name) name.textContent = "empty";
      }
    }

    const pendingEl = $(root, "[data-ref=invPending]");
    if (pendingEl) {
      const labels = {
        shield:    "🛡 Shield armed",
        mirror:    "🪞 Mirror armed",
        xp_double: "✨ 2× XP armed",
        double_damage: "⚡ 2× damage armed",
        mulligan:  "🔁 Mulligan ready",
      };
      const active = [...(this.model.pending_effects || [])]
        .map(e => labels[e]).filter(Boolean);
      pendingEl.textContent = active.length ? `[${active.join(" · ")}]` : "";
    }
  }

  /** Wire up Q/W and click handlers for inventory slots inside an encounter screen. */
  _attachInventoryHandlers() {
    if (!this.controller) return;
    [0, 1].forEach(i => {
      const slot = $(this.root, `[data-ref=invSlot${i}]`);
      if (!slot) return;
      slot.addEventListener("click", () => {
        if (!slot.disabled) this.controller.useItem(i);
      });
      slot.addEventListener("contextmenu", (e) => {
        if (slot.disabled) return;
        e.preventDefault();
        if (window.confirm("Discard this item?")) this.controller.discardItem(i);
      });
    });
  }

  /** True when the event carries a browser/OS shortcut modifier (Ctrl+W, Cmd+1…). */
  _hasShortcutModifier(e) {
    return e.ctrlKey || e.metaKey || e.altKey;
  }

  /** Bind Q/W shortcuts on the supplied AbortController; skips when typing in inputs. */
  _bindInventoryHotkeys(signal) {
    if (!this.controller) return;
    document.addEventListener("keydown", (e) => {
      if (this._hasShortcutModifier(e)) return;  // don't eat Ctrl+W / Cmd+Q
      if (e.key !== "q" && e.key !== "Q" && e.key !== "w" && e.key !== "W") return;
      const ae = document.activeElement;
      const tag = ae?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || ae?.isContentEditable) return;
      const idx = (e.key === "q" || e.key === "Q") ? 0 : 1;
      if (!this.model.inventory?.[idx]) return;
      e.preventDefault();
      this.controller.useItem(idx);
    }, { signal });
  }

  _renderProgress(root) {
    const section = $(root, "[data-ref=progressSection]");
    if (!section) return;

    // NPC teaching scenes never enter answer_history, so they'd read as
    // permanently "unseen" — count only real questions.
    const total = this.model.questions.filter(q => q.type !== "npc_demo").length;
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

    let parts;
    if (done === 0 && requeue === 0) {
      // "0 of 34 complete · 34 unseen" says the same thing twice.
      parts = [`${total} question${total === 1 ? "" : "s"}`, "none attempted yet"];
    } else {
      parts = [`${done} of ${total} complete`];
      if (requeue > 0) parts.push(`${requeue} to retry`);
      if (unseen > 0) parts.push(`${unseen} unseen`);
    }
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

  /**
   * The headline grade, plus an expandable derivation. Students are being graded
   * on this number, so it has to be inspectable: the panel shows every set's rank,
   * what each rank is worth, and what the next trial would add.
   */
  _renderGradePanel(catalog) {
    const panel = $(this.root, "[data-ref=gradePanel]");
    if (!panel) return;
    const grade = computeCourseGrade(catalog);
    if (grade.totalSets === 0) return;

    // The shim only exists in an LMS package; in the browser build there is no gradebook
    // to explain, so the same number gets framed as personal progress instead.
    const hasLms = (() => {
      try { return !!window.LotrdScorm?.hasLms?.(); } catch (_) { return false; }
    })();

    $(this.root, "[data-ref=gradeLabel]").textContent =
      hasLms ? "Course score (sent to your gradebook)" : "Overall progress score";
    $(this.root, "[data-ref=gradeValue]").textContent = `${grade.percent}%`;

    const fill = $(this.root, "[data-ref=gradeBarFill]");
    fill.style.width = `${grade.percent}%`;
    const bar = $(this.root, "[data-ref=gradeBar]");
    bar.setAttribute("aria-label", `${grade.percent} percent of the total score earned`);

    const [, apprentice, journeyman, master] = grade.tierCounts;
    const rankParts = [];
    if (master) rankParts.push(`${TIER_BADGES[3]} ${master} Master`);
    if (journeyman) rankParts.push(`${TIER_BADGES[2]} ${journeyman} Journeyman`);
    if (apprentice) rankParts.push(`${TIER_BADGES[1]} ${apprentice} Apprentice`);
    $(this.root, "[data-ref=gradeSummary]").innerHTML = grade.clearedSets === 0
      ? `<span class="dim">No sets cleared yet — finish any set to start earning credit.</span>`
      : `<span class="yellow">${grade.clearedSets}</span> of ${grade.totalSets} sets cleared` +
        (rankParts.length ? ` &nbsp;·&nbsp; ${rankParts.join(" &nbsp; ")}` : "");

    $(this.root, "[data-ref=gradeBreakdown]").innerHTML =
      this._gradeBreakdownHtml(grade, hasLms);
    panel.hidden = false;
  }

  _gradeBreakdownHtml(grade, hasLms) {
    const share = 100 / grade.totalSets;
    const fmt = n => (Math.round(n * 10) / 10).toString();
    const rankRow = (tier, count) => {
      const worth = share * TIER_CREDIT[tier];
      return `<tr>
        <td>${TIER_BADGES[tier]} ${TIER_NAMES[tier]}</td>
        <td class="dim grade-col-optional">${Math.round(TIER_CREDIT[tier] * 100)}% of a set's share</td>
        <td>${count} ${count === 1 ? "set" : "sets"}</td>
        <td class="yellow">${fmt(worth * count)}%</td>
      </tr>`;
    };

    const notCleared = grade.tierCounts[0];
    const rows = [3, 2, 1].map(t => rankRow(t, grade.tierCounts[t])).join("") +
      `<tr class="dim">
        <td>Not cleared</td><td class="grade-col-optional">no credit</td>
        <td>${notCleared} ${notCleared === 1 ? "set" : "sets"}</td><td>0%</td>
      </tr>`;

    // With several courses loaded, the headline is diluted across topics a given player
    // may never touch, so each topic also reports how far along it is on its own terms.
    const topicRows = grade.topics.length > 1
      ? `<div class="grade-subhead">By topic</div>
         <table class="grade-table">
           <tr><th>Topic</th><th>Cleared</th><th>This topic</th>
               <th class="grade-col-optional">Adds to total</th></tr>
           ${grade.topics.map(t => `<tr>
             <td>${this._esc(t.topic)}</td>
             <td>${t.totalSets - t.tierCounts[0]} of ${t.totalSets}</td>
             <td class="yellow">${t.percentOfTopic}%</td>
             <td class="grade-col-optional">${fmt(t.percentOfWhole)}%</td>
           </tr>`).join("")}
         </table>
         <p class="dim">“This topic” scores that topic on its own, counting only its sets —
         the number to watch if you are working through one course rather than all of
         them.<span class="grade-col-optional"> “Adds to total” is the slice of the headline
         percentage the topic currently contributes.</span></p>`
      : "";

    return `
      <p>Every set counts the same: with ${grade.totalSets} sets, each one is worth
      <span class="yellow">${fmt(share)}%</span> of the total. How much of that share a set
      pays out depends on the rank you have carried it to.</p>
      <table class="grade-table">
        <tr><th>Rank</th><th class="grade-col-optional">Pays</th><th>You have</th><th>Earned</th></tr>
        ${rows}
        <tr class="grade-total">
          <td colspan="3">Total</td><td class="yellow">${grade.percent}%</td>
        </tr>
      </table>
      ${topicRows}
      <p>Clearing a set the first time earns <strong>Apprentice</strong>. A rank trial — a
      short re-run of about half the set, weighted toward the questions you missed — raises it
      to <strong>Journeyman</strong> and then <strong>Master</strong>. Trials unlock only after
      a real waiting period, so full credit takes a few sittings spread over days rather than
      one long night.</p>
      <p class="dim">Your score never goes down. A trial can only add credit, so a bad day on a
      rank trial costs you nothing but the wait.</p>
      <p>${hasLms
        ? "This percentage is what gets written to your gradebook, and it updates as soon as you finish a set or a trial."
        : "You are playing without a learning-management system, so nothing is reported anywhere — this is just your own progress, saved in this browser."}</p>
    `;
  }

  showMainMenu(catalog, globalStats, levelData, launchCallback) {
    this._clearKeyboard();
    renderTemplate(this.root, "tpl-main-menu");

    const level = levelData?.level ?? 1;
    const title = getLevelTitle(level);
    const bar = $(this.root, "[data-ref=globalStats]");
    const totalSel = (globalStats?.total_correct ?? 0) + (globalStats?.total_incorrect ?? 0);
    const pct = totalSel > 0 ? Math.round((globalStats.total_correct ?? 0) / totalSel * 100) : 0;

    this._renderGradePanel(catalog);

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
          const tier = entry.tier ?? TIER_MASTER;
          badge.className = `status-badge status-complete status-tier-${tier}`;
          badge.textContent = `${TIER_BADGES[tier]} ${TIER_NAMES[tier]}`;
          badge.title = `Cleared — current rank: ${TIER_NAMES[tier]}`;
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

        if (status.type === "complete" && entry.reviewDue) {
          const due = document.createElement("span");
          due.className = "status-badge status-review-due";
          due.textContent = "🔁 Review due";
          actions.appendChild(due);
        }

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
        } else if (status.type === "complete" && entry.tierNext?.due) {
          const trialName = TIER_NAMES[entry.tierNext.nextTier];
          btn.textContent = `⚒ ${trialName} Trial`;
          btn.setAttribute("aria-label",
            `Take the ${trialName} trial for ${entry.title} — a short review that raises your rank and credit`);
          btn.addEventListener("click", () => launchCallback(entry.id, "trial"));
          actions.appendChild(btn);

          const again = document.createElement("button");
          again.className = "action-button action-button--secondary set-btn-sm";
          again.textContent = "Play Again";
          again.setAttribute("aria-label", `Play ${entry.title} again`);
          again.addEventListener("click", () => launchCallback(entry.id, "new"));
          actions.appendChild(again);
        } else if (status.type === "complete" && entry.tierNext && !entry.tierNext.due) {
          const trialName = TIER_NAMES[entry.tierNext.nextTier];
          const when = new Date(entry.tierNext.availableAt)
            .toLocaleDateString(undefined, { month: "short", day: "numeric" });
          const lock = document.createElement("span");
          lock.className = "tier-lock dim";
          lock.textContent = `🔒 ${trialName} trial ${when}`;
          lock.title = `The ${trialName} trial unlocks ${when} — spacing out reviews is what makes them work.`;
          actions.appendChild(lock);

          btn.textContent = "Play Again";
          btn.className = "action-button action-button--secondary set-btn-sm";
          btn.setAttribute("aria-label", `Play ${entry.title} again`);
          btn.addEventListener("click", () => launchCallback(entry.id, "new"));
          actions.appendChild(btn);
        } else if (status.type === "complete" && entry.reviewDue) {
          btn.textContent = "🔁 Review";
          btn.setAttribute("aria-label", `Spaced review of ${entry.title} — a few questions`);
          btn.addEventListener("click", () => launchCallback(entry.id, "review"));
          actions.appendChild(btn);

          const again = document.createElement("button");
          again.className = "action-button action-button--secondary set-btn-sm";
          again.textContent = "Play Again";
          again.setAttribute("aria-label", `Play ${entry.title} again`);
          again.addEventListener("click", () => launchCallback(entry.id, "new"));
          actions.appendChild(again);
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

  /**
   * Pre-run screen. `meta` shapes what it says:
   *   { title, intro: {story, objectives[]}, questionCount } – full set run
   *   { title, trial: {tier, questionCount} }               – rank trial
   *   { title, review: {questionCount} }                    – spaced review / mix
   *   null / no intro                                       – generic welcome
   */
  showInitialScreen(meta, startCallback) {
    this._clearKeyboard();
    renderTemplate(this.root, "tpl-initial");

    const titleEl   = $(this.root, "[data-ref=introTitle]");
    const genericEl = $(this.root, "[data-ref=introGeneric]");
    const storyEl   = $(this.root, "[data-ref=introStory]");
    const objWrap   = $(this.root, "[data-ref=introObjectivesWrap]");
    const objList   = $(this.root, "[data-ref=introObjectives]");
    const noteEl    = $(this.root, "[data-ref=introNote]");
    const btn       = $(this.root, "[data-action=start]");

    if (meta?.trial) {
      const trialName = TIER_NAMES[meta.trial.tier];
      titleEl.textContent = `⚒ ${trialName} Trial`;
      genericEl.hidden = true;
      storyEl.textContent = meta.title
        ? `The Dragon returns to ${meta.title}, testing whether the ideas you claimed still hold.`
        : "The Dragon returns, testing whether the ideas you claimed still hold.";
      storyEl.hidden = false;
      noteEl.textContent =
        `${meta.trial.questionCount} questions drawn from this dungeon — weighted toward the ones ` +
        `that gave you trouble. Finish the run to earn ${trialName} rank and raise your credit for this set.`;
      noteEl.hidden = false;
      btn.textContent = "Begin the Trial";
    } else if (meta?.review) {
      if (meta.title) titleEl.textContent = meta.title;
      genericEl.hidden = true;
      storyEl.textContent = "A quick return visit — a handful of questions to keep the ideas sharp.";
      storyEl.hidden = false;
      noteEl.textContent = `${meta.review.questionCount} questions. Reviews never lower your score.`;
      noteEl.hidden = false;
      btn.textContent = "Start Review";
    } else if (meta?.intro) {
      if (meta.title) titleEl.textContent = meta.title;
      genericEl.hidden = true;
      if (meta.intro.story) {
        storyEl.textContent = meta.intro.story;
        storyEl.hidden = false;
      }
      const objectives = meta.intro.objectives || [];
      if (objectives.length > 0) {
        objectives.forEach(obj => {
          const li = document.createElement("li");
          li.textContent = obj;
          objList.appendChild(li);
        });
        objWrap.hidden = false;
      }
      if (meta.questionCount) {
        noteEl.textContent = `${meta.questionCount} questions ahead. Missed ones return until you master them.`;
        noteEl.hidden = false;
      }
    } else if (meta?.title) {
      titleEl.textContent = meta.title;
    }

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
      if (this._hasShortcutModifier(e)) return;  // Ctrl+1 / Cmd+1 switch tabs
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

    this._attachInventoryHandlers();
    this._bindInventoryHotkeys(this._kbAbort.signal);
    this._renderProgress(this.root);
    if (inputs.length > 0) inputs[0].focus();
  }

  /**
   * An example expression for the hint that cannot itself be the answer.
   * Advertising "such as 7 * 7 * 7" on a question whose answer is 343 would
   * simply print the solution, so every candidate is checked against the
   * expected value (and its tolerance) before being shown.
   */
  _safeExpressionExample(meta) {
    const candidates = ["12 * 5", "9 + 4", "2 ** 6", "144 / 12", "25 - 8"];
    const expected = Number(meta?.expected);
    const tol = Number(meta?.tolerance_abs ?? 0);
    for (const text of candidates) {
      let value;
      try {
        value = evaluateDynamicExpression(text.replace(/\s+/g, ""), {});
      } catch (_) {
        continue;
      }
      if (!Number.isFinite(expected) || Math.abs(value - expected) > tol) return text;
    }
    // Every candidate collided, which needs no numbers at all to describe.
    return "a product or a power";
  }

  showEncounterFillBlank() {
    this._clearKeyboard();
    const q = this.model.current_question;
    const isDynamicNumeric = q.type === "dynamic_numeric";
    renderTemplate(this.root, "tpl-encounter-fill-blank");
    this._populateEncounterHeader(this.root);
    // This screen serves two types; "Fill in the blank" is wrong for the one
    // that asks for a computed number.
    const label = $(this.root, "[data-ref=qLabel]");
    if (label) label.textContent = isDynamicNumeric ? "Work out the answer:" : "Fill in the blank:";
    $(this.root, "[data-ref=qText]").textContent = q.question;

    const input = $(this.root, "[data-ref=answerInput]");
    const charHintEl = $(this.root, "[data-ref=charHint]");

    if (isDynamicNumeric) {
      const meta = this.model.getDynamicNumericMeta();
      const tol = meta ? String(meta.tolerance_abs) : "0";
      const tolNote = Number(tol) > 0 ? ` Answers within +/- ${tol} count as correct.` : "";
      if (q.allow_expression === false) {
        charHintEl.textContent = `Enter a number.${tolNote}`;
      } else {
        const example = this._safeExpressionExample(meta);
        charHintEl.textContent =
          `Enter a number, or arithmetic such as ${example} and it will be worked out for you.${tolNote}`;
      }
      input.setAttribute("inputmode", "decimal");
      input.placeholder = "Type a number…";
    } else {
      const answers = q.correct || [];
      const canonical = answers[0] || "";
      const caseSens = q.case_sensitive === true;
      const cloze = this.model.getFillBlankCloze();

      let charHint;
      if (cloze) {
        // Show the surrounding words inline; only the picked word is blanked.
        // Student types just the missing word into the input below.
        const blankWord = cloze.words[cloze.blankIndex];
        charHint = cloze.words
          .map((w, i) => i === cloze.blankIndex
            ? `${"_".repeat(blankWord.length)} (${blankWord.length})`
            : w)
          .join("  ");
      } else {
        charHint = canonical.split(" ")
          .map(word => `${"_".repeat(word.length)} (${word.length})`)
          .join("  ");
      }
      charHintEl.textContent =
        `${charHint}${caseSens ? "  [case-sensitive]" : "  [not case-sensitive]"}`;
      input.removeAttribute("inputmode");
      input.placeholder = "Type your answer…";
    }

    this._updateWordleStatus(0);

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

    this._attachInventoryHandlers();
    this._bindInventoryHotkeys(this._kbAbort.signal);
    this._renderProgress(this.root);
    input.focus();
  }

  showEncounterCodeTrace() {
    this._clearKeyboard();
    const q = this.model.current_question;
    renderTemplate(this.root, "tpl-encounter-code-trace");
    this._populateEncounterHeader(this.root);
    $(this.root, "[data-ref=qText]").textContent = q.question;

    const code = q.code || "";
    const lang = (q.language || "java").toLowerCase();
    const snippetEl = $(this.root, "[data-ref=codeSnippet]");
    if (lang === "java") {
      snippetEl.innerHTML = highlightJava(code);
    } else {
      snippetEl.textContent = code;
    }

    this._updateWordleStatus(0);

    const input = $(this.root, "[data-ref=answerInput]");
    const submitBtn = $(this.root, "[data-action=submit]");
    submitBtn.addEventListener("click", () => {
      this.controller.submitCodeTrace(input.value);
    });

    this._kbAbort = new AbortController();
    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && document.activeElement === input) {
        e.preventDefault();
        submitBtn.click();
      }
    }, { signal: this._kbAbort.signal });

    this._attachInventoryHandlers();
    this._bindInventoryHotkeys(this._kbAbort.signal);
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

  /** How each tile colour reads aloud, since colour alone carries the meaning. */
  static WORDLE_STATUS_WORDS = {
    correct: "correct",
    present: "wrong position",
    absent: "not in the answer",
  };

  _appendWordleRow(feedback) {
    const grid = $(this.root, "[data-ref=wordleGrid]");
    if (!grid) return;
    const row = document.createElement("div");
    row.className = "wordle-row";

    // The tiles say "right letter, wrong place" with colour and nothing else, so
    // a screen reader would hear only a string of letters. The row carries one
    // spoken summary instead, which reads far better than tagging every tile.
    const spoken = [];
    feedback.forEach(({ char, status }) => {
      const tile = document.createElement("span");
      tile.className = `wordle-tile wordle-tile--${status}`;
      tile.textContent = char;
      tile.setAttribute("aria-hidden", "true");
      row.appendChild(tile);
      const word = GameUI.WORDLE_STATUS_WORDS[status];
      if (word) spoken.push(`${char} ${word}`);
    });

    row.setAttribute("role", "group");
    row.setAttribute("aria-label",
      `Guess ${grid.children.length + 1}: ${spoken.join(", ")}`);
    grid.appendChild(row);
  }

  showEncounterCodeLine() {
    this._clearKeyboard();
    const q = this.model.current_question;
    renderTemplate(this.root, "tpl-encounter-code-line");
    this._populateEncounterHeader(this.root);
    $(this.root, "[data-ref=qText]").textContent = q.question;

    const langEl = $(this.root, "[data-ref=langTag]");
    if (langEl) langEl.textContent = q.language ? `[${q.language}]` : "";

    this._updateWordleStatus(0);

    const input = $(this.root, "[data-ref=answerInput]");
    const submitBtn = $(this.root, "[data-action=submit]");
    submitBtn.addEventListener("click", () => {
      this.controller.submitCodeLine(input.value);
    });

    this._kbAbort = new AbortController();
    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && document.activeElement === input) {
        e.preventDefault();
        submitBtn.click();
      }
    }, { signal: this._kbAbort.signal });

    this._attachInventoryHandlers();
    this._bindInventoryHotkeys(this._kbAbort.signal);
    this._renderProgress(this.root);
    input.focus();
  }

  showCodeLineAttempt(result) {
    this._populateEncounterHeader(this.root);
    this._appendWordleRow(result.feedback);
    this._updateWordleStatus(result.attemptsUsed);

    if (result.effective_monster_damage > 0) {
      const hud = this.root.querySelector(".player-hud");
      this._spawnFloatNumber(hud, `-${result.effective_monster_damage}`, "dmg-float--recv");
      const container = document.querySelector(".game-container");
      if (container) {
        container.classList.add("player-hit");
        this._removeAfterAnimation(container, () => container.classList.remove("player-hit"));
      }
    }
    if (result.shield_used) {
      this.showFeedbackInline("🛡 Firewall Shard absorbed the hit.");
    }
    if (result.revived) {
      this.showFeedbackInline("⚗️ A Revive Charge was consumed — you survive with 10 HP!");
    }

    this._clearTypoPrompt();
    const input = $(this.root, "[data-ref=answerInput]");
    if (input) {
      input.value = "";
      input.focus();
    }
  }

  showCodeLineTypoConfirm(suggestion, guessText, onConfirm, onEdit) {
    const promptEl = $(this.root, "[data-ref=typoPrompt]");
    if (!promptEl) { onConfirm(); return; }
    promptEl.hidden = false;
    promptEl.innerHTML = "";

    const msg = document.createElement("div");
    msg.className = "typo-prompt-msg";
    const label = document.createElement("span");
    label.textContent = "Did you mean: ";
    const code = document.createElement("code");
    code.textContent = suggestion;
    msg.appendChild(label);
    msg.appendChild(code);
    promptEl.appendChild(msg);

    const btnRow = document.createElement("div");
    btnRow.className = "typo-prompt-buttons";
    const yes = document.createElement("button");
    yes.type = "button";
    yes.className = "action-button";
    yes.textContent = "Yes, submit";
    yes.addEventListener("click", () => { this._clearTypoPrompt(); onConfirm(); });
    const no = document.createElement("button");
    no.type = "button";
    no.className = "action-button";
    no.textContent = "No, let me edit";
    no.addEventListener("click", () => { this._clearTypoPrompt(); onEdit(); });
    btnRow.appendChild(yes);
    btnRow.appendChild(no);
    promptEl.appendChild(btnRow);
    yes.focus();
  }

  focusCodeLineInput() {
    const input = $(this.root, "[data-ref=answerInput]");
    if (input) input.focus();
  }

  _clearTypoPrompt() {
    const el = $(this.root, "[data-ref=typoPrompt]");
    if (el) { el.hidden = true; el.innerHTML = ""; }
  }

  showFillBlankAttempt(result) {
    this._populateEncounterHeader(this.root);
    const isDynamicNumeric = this.model.current_question?.type === "dynamic_numeric";
    const notices = [];

    if (isDynamicNumeric) {
      // When the student typed arithmetic, show what it came to — otherwise
      // "Too high" is puzzling next to an expression they haven't evaluated.
      const typed = String(result.guessText ?? "").trim();
      const value = result.evaluated;
      const wasExpression = typed && Number.isFinite(value)
        && typed.replace(/[,_\s]/g, "") !== String(value);
      notices.push(wasExpression
        ? `${typed} = ${value} — ${result.feedbackText || ""}`.trim()
        : (result.feedbackText || ""));
    } else {
      this._appendWordleRow(result.feedback);
    }
    this._updateWordleStatus(result.attemptsUsed);

    if (result.effective_monster_damage > 0) {
      const hud = this.root.querySelector(".player-hud");
      this._spawnFloatNumber(hud, `-${result.effective_monster_damage}`, "dmg-float--recv");
      const container = document.querySelector(".game-container");
      if (container) {
        container.classList.add("player-hit");
        this._removeAfterAnimation(container, () => container.classList.remove("player-hit"));
      }
    }
    if (result.shield_used) {
      notices.push("🛡 Firewall Shard absorbed the hit.");
    }
    if (result.revived) {
      notices.push("⚗️ A Revive Charge was consumed — you survive with 10 HP!");
    }
    if (notices.length > 0) {
      this.showFeedbackInline(notices.join(" "));
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

    this._kbAbort = new AbortController();
    this._attachInventoryHandlers();
    this._bindInventoryHotkeys(this._kbAbort.signal);
    this._renderProgress(this.root);
    if (selects.length > 0) selects[0].select.focus();
  }

  /**
   * NPC teaching scene: a mentor walks through a worked example, step by step.
   * Steps may carry a low-stakes `check` (predict the next move) — a wrong tap
   * gets a gentle correction and the walkthrough continues. No damage, no XP,
   * no requeue: the paired combat question that follows is where it counts.
   */
  showNpcScene(onDone) {
    this._clearKeyboard();
    const q = this.model.current_question;
    renderTemplate(this.root, "tpl-npc-scene");

    // Name and portrait come from assets/npcs.json. Until it resolves (or if a
    // scene names a mentor the roster doesn't have) the scene still runs, just
    // with the raw value as a name and the placeholder glyph.
    const nameEl = $(this.root, "[data-ref=npcName]");
    nameEl.textContent = q.npc || "Your mentor";
    loadNpcRoster().then(roster => {
      const npc = findNpc(roster, q.npc);
      if (!npc || !nameEl.isConnected) return;
      nameEl.textContent = npc.name;
      const slot = $(this.root, "[data-ref=npcPortrait]");
      if (!slot) return;
      const img = document.createElement("img");
      img.className = "npc-portrait-img";
      img.src = npc.portrait;
      img.alt = "";                       // decorative; the name is right beside it
      // Keep the glyph if the file is missing rather than showing a broken image.
      img.addEventListener("error", () => img.remove(), { once: true });
      slot.replaceChildren(img);
      slot.classList.add("npc-portrait--image");
    }).catch(() => {});

    // The `question` field is the scene's title (and its identity in the data).
    $(this.root, "[data-ref=npcSceneTitle]").textContent = q.question || "";
    const dialogue = $(this.root, "[data-ref=npcDialogue]");
    const controls = $(this.root, "[data-ref=npcControls]");
    $(this.root, "[data-action=npc-skip]").addEventListener("click", () => onDone());

    const addLine = (text, cls = "npc-line npc-say") => {
      const div = document.createElement("div");
      div.className = cls;
      div.textContent = text;
      dialogue.appendChild(div);
      div.scrollIntoView?.({ block: "nearest" });
      return div;
    };

    /** The artifact under discussion — set apart from what the mentor is saying. */
    const addCode = (text, language) => {
      const wrap = document.createElement("pre");
      wrap.className = "npc-code";
      if (language) wrap.dataset.lang = language;
      wrap.textContent = text;
      dialogue.appendChild(wrap);
      wrap.scrollIntoView?.({ block: "nearest" });
      return wrap;
    };

    if (q.intro) addLine(q.intro, "npc-line npc-line--scene");

    const makeButton = (label, cls, onClick) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = cls;
      b.textContent = label;
      b.addEventListener("click", onClick);
      controls.appendChild(b);
      return b;
    };

    // Flatten the scene into one queue of reveals, so the student meets it a
    // beat at a time instead of a wall of text. A step's `beats` array is the
    // authored breakdown; a bare `say` string counts as a single beat.
    const queue = [];
    for (const step of (q.steps || [])) {
      const beats = Array.isArray(step.beats) && step.beats.length
        ? step.beats
        : [{ say: step.say }];
      for (const b of beats) queue.push({ kind: b.code != null ? "code" : "say", beat: b });
      if (step.check) queue.push({ kind: "check", check: step.check });
    }

    let pos = 0;
    const advance = () => {
      controls.innerHTML = "";
      if (pos >= queue.length) {
        if (q.outro) addLine(q.outro, "npc-line npc-line--scene");
        makeButton("Continue the adventure ⚔", "action-button", () => onDone()).focus();
        return;
      }
      const item = queue[pos++];

      if (item.kind === "code") {
        addCode(item.beat.code, item.beat.language);
        makeButton("Continue ▸", "action-button", advance).focus();
        return;
      }
      if (item.kind === "say") {
        addLine(item.beat.say);
        makeButton("Continue ▸", "action-button", advance).focus();
        return;
      }

      const check = item.check;
      addLine(check.prompt, "npc-line npc-check-prompt");
      shuffle([check.answer, ...(check.wrong || [])]).forEach(opt => {
        makeButton(opt, "action-button action-button--secondary npc-check-option", () => {
          if (opt === check.answer) {
            addLine(`✓ ${check.why || "Exactly right."}`, "npc-line npc-line--good");
          } else {
            addLine(`Not quite — it's "${check.answer}". ${check.why || ""}`.trim(),
              "npc-line npc-line--gentle");
          }
          advance();
        });
      });
    };

    this._kbAbort = new AbortController();
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      // Enter advances only when there's a single unambiguous button.
      const buttons = controls.querySelectorAll("button");
      if (buttons.length === 1) { e.preventDefault(); buttons[0].click(); }
    }, { signal: this._kbAbort.signal });

    advance();
  }

  /**
   * Multi-blank cloze: the prompt is rendered as flowing text with an inline
   * input wherever a {{n}} placeholder sits. All blanks are graded together in
   * one submission — no per-blank attempt loop.
   */
  showEncounterCloze() {
    this._clearKeyboard();
    const q = this.model.current_question;
    renderTemplate(this.root, "tpl-encounter-cloze");
    this._populateEncounterHeader(this.root);

    const blanks = q.blanks || [];
    const body = $(this.root, "[data-ref=clozeBody]");
    const inputs = new Map();

    // A cloze over code needs a monospace face and literal indentation, or the
    // shape of the program — which is half of what the question is testing —
    // is lost to the prose font.
    if (q.language) {
      body.classList.add("cloze-body--code");
      const label = $(this.root, "[data-ref=clozeLabel]");
      if (label) label.textContent = "Complete the code:";
    }

    // Instructions belong outside the listing: inside it they inherit `pre`, so a
    // sentence runs off the side of the screen instead of wrapping.
    const prompt = $(this.root, "[data-ref=clozePrompt]");
    if (prompt && q.prompt) {
      prompt.textContent = q.prompt;
      prompt.hidden = false;
    }

    parseClozeSegments(q.question).forEach(seg => {
      if (seg.type === "text") {
        body.appendChild(document.createTextNode(seg.value));
        return;
      }
      const spec = blanks[seg.index];
      if (!spec) return;
      // A repeated {{n}} reuses the same input rather than making a second one.
      if (inputs.has(seg.index)) {
        body.appendChild(document.createTextNode("…"));
        return;
      }
      const input = document.createElement("input");
      input.type = "text";
      input.className = "cloze-input";
      input.id = `cloze-blank-${seg.index}`;
      input.autocomplete = "off";
      input.autocapitalize = "off";
      input.spellcheck = false;
      // Wide enough for the longest accepted answer AND the placeholder hint,
      // or the hint renders truncated and tells the student nothing.
      const width = Math.max(
        ...(spec.accept || [""]).map(a => a.length),
        (spec.hint || "").length,
        4);
      input.size = width + 2;
      input.setAttribute("aria-label",
        `Blank ${seg.index + 1} of ${blanks.length}${spec.hint ? `: ${spec.hint}` : ""}`);
      if (spec.hint) input.placeholder = spec.hint;
      body.appendChild(input);
      inputs.set(seg.index, input);
    });

    const hintEl = $(this.root, "[data-ref=clozeHint]");
    if (hintEl) {
      const n = blanks.length;
      hintEl.textContent =
        `Fill in all ${n} blank${n === 1 ? "" : "s"}. Each is graded separately, ` +
        `so a partly-right answer still lands a partial hit.`;
    }

    const submitBtn = $(this.root, "[data-action=submit]");
    submitBtn.addEventListener("click", () => {
      const answers = blanks.map((_, i) => inputs.get(i)?.value ?? "");
      if (answers.every(a => !a.trim())) {
        this.showFeedbackInline("Fill in at least one blank before submitting.");
        return;
      }
      this.controller.submitCloze(answers);
    });

    this._kbAbort = new AbortController();
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const ae = document.activeElement;
      if (!ae || !ae.classList?.contains("cloze-input")) return;
      e.preventDefault();
      // Enter walks to the next blank, and submits from the last one.
      const ordered = [...inputs.keys()].sort((a, b) => a - b).map(k => inputs.get(k));
      const pos = ordered.indexOf(ae);
      if (pos > -1 && pos < ordered.length - 1) ordered[pos + 1].focus();
      else submitBtn.click();
    }, { signal: this._kbAbort.signal });

    this._attachInventoryHandlers();
    this._bindInventoryHotkeys(this._kbAbort.signal);
    this._renderProgress(this.root);
    const first = inputs.get([...inputs.keys()].sort((a, b) => a - b)[0]);
    if (first) first.focus();
  }

  showEncounterOrdering() {
    this._clearKeyboard();
    const q = this.model.current_question;
    renderTemplate(this.root, "tpl-encounter-ordering");
    this._populateEncounterHeader(this.root);
    $(this.root, "[data-ref=qText]").textContent = q.question;

    const items  = q.items || [];
    const isCode = !!q.language;

    // Never present the bank already in the correct order.
    let bankOrder = shuffle(items);
    if (items.length > 2) {
      let guard = 0;
      while (bankOrder.every((it, i) => it === items[i]) && guard++ < 10) {
        bankOrder = shuffle(items);
      }
    }

    const bank     = $(this.root, "[data-ref=orderBank]");
    const seqEl    = $(this.root, "[data-ref=orderSeq]");
    const sequence = [];
    const bankBtns = new Map();

    const renderSeq = () => {
      seqEl.innerHTML = "";
      if (sequence.length === 0) {
        const hint = document.createElement("span");
        hint.className = "dim order-seq-empty";
        hint.textContent = "Tap the steps below in order — tap a placed step to remove it.";
        seqEl.appendChild(hint);
        return;
      }
      sequence.forEach((item, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "order-seq-item" + (isCode ? " order-item--code" : "");
        b.textContent = `${i + 1}. ${item}`;
        b.setAttribute("aria-label", `Position ${i + 1}: ${item}. Click to remove.`);
        b.addEventListener("click", () => {
          sequence.splice(i, 1);
          const bankBtn = bankBtns.get(item);
          if (bankBtn) bankBtn.disabled = false;
          renderSeq();
        });
        seqEl.appendChild(b);
      });
    };

    bankOrder.forEach(item => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "order-bank-item" + (isCode ? " order-item--code" : "");
      b.textContent = item;
      b.setAttribute("aria-label", `Add to sequence: ${item}`);
      b.addEventListener("click", () => {
        if (b.disabled) return;
        sequence.push(item);
        b.disabled = true;
        renderSeq();
      });
      bank.appendChild(b);
      bankBtns.set(item, b);
    });
    renderSeq();

    const submitBtn = $(this.root, "[data-action=submit]");
    submitBtn.addEventListener("click", () => {
      if (sequence.length !== items.length) {
        this.showFeedbackInline("Place every step in the sequence before submitting.");
        return;
      }
      this.controller.submitOrdering([...sequence]);
    });

    this._kbAbort = new AbortController();
    this._attachInventoryHandlers();
    this._bindInventoryHotkeys(this._kbAbort.signal);
    this._renderProgress(this.root);
  }

  /**
   * Write-the-code: a CodingBat-style problem. The signature is fixed and shown
   * above the box; the student writes the body and runs it against the same test
   * table that will grade them. Running costs nothing and can be done as often as
   * they like — the point of the format is that patience is what pays.
   */
  showEncounterCodeWrite() {
    this._clearKeyboard();
    const q = this.model.current_question;
    renderTemplate(this.root, "tpl-encounter-code-write");
    this._populateEncounterHeader(this.root);
    $(this.root, "[data-ref=qText]").textContent = q.question;
    $(this.root, "[data-ref=signature]").innerHTML = highlightPython(q.signature || "");

    const examplesEl = $(this.root, "[data-ref=examples]");
    const examples = codeWriteExamples(q);
    if (examples.length) {
      const label = document.createElement("span");
      label.className = "bold";
      label.textContent = "For example:";
      examplesEl.appendChild(label);
      const list = document.createElement("ul");
      list.className = "code-write-example-list";
      examples.forEach(text => {
        const li = document.createElement("li");
        li.textContent = text;
        list.appendChild(li);
      });
      examplesEl.appendChild(list);
      examplesEl.hidden = false;
    }

    // A hint stays folded away: it is there for a student who is stuck, and
    // opening it should be their decision rather than the first thing they read.
    const hint = $(this.root, "[data-ref=hint]");
    if (hint && q.hint) {
      $(this.root, "[data-ref=hintText]").textContent = q.hint;
      hint.hidden = false;
    }

    const input = $(this.root, "[data-ref=bodyInput]");
    input.value = q.starter ? String(q.starter) : "";
    const paintEditor = this._bindCodeEditorChrome(input);

    const resultsEl = $(this.root, "[data-ref=runResults]");
    const runBtn = $(this.root, "[data-action=run]");
    const submitBtn = $(this.root, "[data-action=submit]");

    const runTests = () => {
      if (!input.value.trim()) {
        this._renderCodeWriteNotice(resultsEl, "Write some code first, then run it.");
        return;
      }
      const outcome = this.model.runCodeWrite(input.value);
      this._renderCodeWriteRun(resultsEl, outcome);
      // Mark the line the interpreter blamed, so "line 3" in the message and
      // line 3 in the gutter are visibly the same line.
      paintEditor(outcome && !outcome.ok ? outcome.error.line : null);
      // The table is what the student pressed Run for, and on a phone it can
      // land under the pinned row. `nearest` leaves the view alone when it is
      // already visible, so this never yanks the page mid-edit.
      resultsEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };

    runBtn.addEventListener("click", runTests);
    submitBtn.addEventListener("click", () => {
      if (!input.value.trim()) {
        this.showFeedbackInline("Write the body of the function before submitting.");
        return;
      }
      this.controller.submitCodeWrite(input.value);
    });

    // Indent buttons: a phone keyboard has no Tab key, so without these a
    // student on a phone cannot write the indented body at all.
    //
    // Tapping a button blurs the editor first, and a blurred textarea is
    // entitled to report a collapsed selection — so the caret is tracked while
    // the editor has focus and handed back on the way in. The obvious
    // alternative, cancelling pointerdown to hold focus, is what broke this on
    // iOS: Safari drops the click that follows a cancelled pointerdown but
    // moves focus to the button anyway, so the tap did nothing except take the
    // student out of the editor. Nothing here cancels a pointer event.
    let caret = { start: 0, end: 0 };
    const rememberCaret = () => {
      caret = { start: input.selectionStart, end: input.selectionEnd };
    };
    // Only while focused: reading the selection on blur is the unreliable case.
    ["keyup", "pointerup", "input", "select"].forEach(type =>
      input.addEventListener(type, rememberCaret));

    [["indent", false], ["outdent", true]].forEach(([action, dedent]) => {
      const btn = $(this.root, `[data-action=${action}]`);
      if (!btn) return;
      btn.addEventListener("click", () => {
        // focus() inside the tap gesture, so the keyboard comes back up on iOS.
        input.focus();
        input.setSelectionRange(caret.start, caret.end);
        this._shiftCodeLines(input, { dedent });
        rememberCaret();
        input.dispatchEvent(new Event("input"));
      });
    });

    this._kbAbort = new AbortController();

    // Hold the pinned row above the on-screen keyboard. iOS does not shrink the
    // layout viewport when the keyboard opens, so a row anchored to the bottom
    // of it would sit behind the keys — the visual viewport is the only thing
    // that reports where the usable bottom edge actually is. Nothing to do on a
    // desktop, where the inset stays 0.
    const actions = this.root.querySelector(".code-write-actions");
    const vv = window.visualViewport;
    if (actions && vv) {
      const trackKeyboard = () => {
        const inset = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
        actions.style.setProperty("--kb-inset", `${Math.round(inset)}px`);
      };
      vv.addEventListener("resize", trackKeyboard, { signal: this._kbAbort.signal });
      vv.addEventListener("scroll", trackKeyboard, { signal: this._kbAbort.signal });
      trackKeyboard();
    }

    this._bindCodeEditorKeys(input, this._kbAbort.signal);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        runTests();
      }
    }, { signal: this._kbAbort.signal });

    this._attachInventoryHandlers();
    this._bindInventoryHotkeys(this._kbAbort.signal);
    this._renderProgress(this.root);
    input.focus();
  }

  /**
   * Make a plain textarea behave enough like a code editor to type Python in:
   * Tab indents (and Shift+Tab out again), and Enter keeps the current
   * indentation, adding a level after a line that ends in a colon. Without this,
   * a student spends the exercise pressing space bar instead of thinking.
   */
  /**
   * Dress the plain textarea with a line-number gutter and a keyword highlight
   * layer, and return a repaint function.
   *
   * A textarea cannot colour its own text, so the highlighted copy is a <pre>
   * sitting exactly behind it while the textarea's own text goes transparent —
   * the caret and the selection still belong to the textarea, so typing,
   * scrolling and the phone's own text handles behave normally. The two layers
   * only line up while their font, line height, padding and tab size are
   * identical: styles.css keeps them on shared declarations for that reason.
   *
   * The transparency is applied here, from script, rather than in the
   * stylesheet: if this code never runs, the textarea keeps its own colour and
   * the student sees plain unhighlighted text instead of an empty box.
   *
   * Line numbers are worth the trouble because the interpreter's errors say
   * "line 3", counting the body the student typed — so the gutter is what turns
   * that message into a place to look.
   */
  _bindCodeEditorChrome(textarea) {
    const root = textarea.closest(".code-write-editor");
    const gutter = root?.querySelector("[data-ref=gutter]");
    const layer = root?.querySelector("[data-ref=highlight]");
    if (!gutter || !layer) return () => {};

    textarea.classList.add("code-write-body--overlaid");
    let errorLine = null;

    const paint = (blame) => {
      if (blame !== undefined) errorLine = blame;
      const value = textarea.value;
      // The trailing newline keeps a final empty line from collapsing, so the
      // last row of the gutter always has a line of text beside it.
      layer.innerHTML = highlightPython(value) + "\n";

      const count = value.split("\n").length;
      const rows = [];
      for (let n = 1; n <= count; n++) {
        rows.push(n === errorLine
          ? `<span class="code-gutter-line code-gutter-line--blamed">${n}</span>`
          : `<span class="code-gutter-line">${n}</span>`);
      }
      gutter.innerHTML = rows.join("");
      syncScroll();
    };

    const syncScroll = () => {
      layer.scrollTop = textarea.scrollTop;
      layer.scrollLeft = textarea.scrollLeft;
      gutter.scrollTop = textarea.scrollTop;
    };

    textarea.addEventListener("input", () => paint());
    textarea.addEventListener("scroll", syncScroll);
    paint(null);
    return paint;
  }

  /**
   * Indent or dedent whole lines — every line a selection touches, or the one
   * line the caret sits on. Shared by Tab/Shift+Tab and by the editor's indent
   * buttons, which are the only route on a phone: soft keyboards have no Tab
   * key, and Python without indentation does not run.
   */
  _shiftCodeLines(textarea, { dedent = false } = {}) {
    const UNIT = "    ";
    const { selectionStart: start, selectionEnd: end, value } = textarea;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const nextNl    = value.indexOf("\n", end);
    const blockEnd  = nextNl === -1 ? value.length : nextNl;

    let firstDelta = 0;
    const shifted = value.slice(lineStart, blockEnd).split("\n").map((line, i) => {
      const out = dedent ? line.replace(/^ {1,4}/, "") : UNIT + line;
      if (i === 0) firstDelta = out.length - line.length;
      return out;
    }).join("\n");

    textarea.value = value.slice(0, lineStart) + shifted + value.slice(blockEnd);
    if (start === end) {
      // Keep the caret where the student left it rather than selecting the
      // whole line, which on a phone pops up the text-selection toolbar.
      const caret = Math.max(lineStart, start + firstDelta);
      textarea.selectionStart = textarea.selectionEnd = caret;
    } else {
      textarea.selectionStart = lineStart;
      textarea.selectionEnd   = lineStart + shifted.length;
    }
  }

  _bindCodeEditorKeys(textarea, signal) {
    const UNIT = "    ";

    // Setting .value from script fires no input event, so the highlight layer
    // and the gutter would sit on stale text after every Tab and Enter.
    const edited = () => textarea.dispatchEvent(new Event("input"));

    const replaceRange = (start, end, text, caret) => {
      const value = textarea.value;
      textarea.value = value.slice(0, start) + text + value.slice(end);
      textarea.selectionStart = textarea.selectionEnd = caret;
    };

    textarea.addEventListener("keydown", (e) => {
      const { selectionStart: start, selectionEnd: end, value } = textarea;

      if (e.key === "Tab") {
        e.preventDefault();
        // A bare caret gets one indent step where it stands; a selection (or
        // Shift+Tab) shifts whole lines instead.
        if (start === end && !e.shiftKey) replaceRange(start, end, UNIT, start + UNIT.length);
        else this._shiftCodeLines(textarea, { dedent: e.shiftKey });
        edited();
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        const lineStart = value.lastIndexOf("\n", start - 1) + 1;
        const currentLine = value.slice(lineStart, start);
        const indent = (/^[ \t]*/.exec(currentLine) || [""])[0].replace(/\t/g, UNIT);
        const deeper = /:\s*$/.test(currentLine) ? UNIT : "";
        const insert = "\n" + indent + deeper;
        replaceRange(start, end, insert, start + insert.length);
        edited();
        // Keep the caret in view when the box has scrolled.
        textarea.blur();
        textarea.focus();
      }
    }, { signal });
  }

  _renderCodeWriteNotice(container, message) {
    container.innerHTML = "";
    const note = document.createElement("div");
    note.className = "code-write-notice dim";
    note.textContent = message;
    container.appendChild(note);
  }

  /** The results table the Run button fills in — expected against what ran. */
  _renderCodeWriteRun(container, outcome) {
    container.innerHTML = "";
    if (!outcome) return;

    if (!outcome.ok) {
      const box = document.createElement("div");
      box.className = "code-write-error";
      const head = document.createElement("div");
      head.className = "bold";
      head.textContent = outcome.error.line
        ? `Your code did not run — line ${outcome.error.line}`
        : "Your code did not run";
      box.appendChild(head);
      const msg = document.createElement("div");
      msg.textContent = outcome.error.message;
      box.appendChild(msg);
      if (outcome.error.hint) {
        const hint = document.createElement("div");
        hint.className = "code-write-hint";
        hint.textContent = outcome.error.hint;
        box.appendChild(hint);
      }
      container.appendChild(box);
      return;
    }

    const summary = document.createElement("div");
    const allPassed = outcome.passed === outcome.total;
    summary.className = `code-write-summary ${allPassed ? "correct" : "incorrect"}`;
    summary.textContent = allPassed
      ? `✔ All ${outcome.total} tests passed — ready to submit.`
      : `${outcome.passed} of ${outcome.total} tests passed.`;
    container.appendChild(summary);

    if (outcome.printedOnly) {
      const note = document.createElement("div");
      note.className = "code-write-hint";
      note.textContent =
        "Your code printed an answer but never returned one. A test can only see what you return.";
      container.appendChild(note);
    }

    const scroller = document.createElement("div");
    scroller.className = "code-write-table-wrap";
    const table = document.createElement("table");
    table.className = "code-write-table";

    const header = document.createElement("tr");
    ["", "Call", "Expected", "Your result"].forEach(text => {
      const th = document.createElement("th");
      th.textContent = text;
      header.appendChild(th);
    });
    table.appendChild(header);

    outcome.results.forEach(row => {
      const tr = document.createElement("tr");
      tr.className = row.passed ? "code-write-row--pass" : "code-write-row--fail";

      const mark = document.createElement("td");
      mark.className = "code-write-mark";
      mark.textContent = row.passed ? "✔" : "✖";
      mark.setAttribute("aria-label", row.passed ? "passed" : "failed");
      tr.appendChild(mark);

      const callCell = document.createElement("td");
      callCell.className = "code-write-call";
      callCell.textContent = row.call;
      tr.appendChild(callCell);

      const expectedCell = document.createElement("td");
      expectedCell.dataset.label = "Expected";
      expectedCell.textContent = row.expectedRepr;
      tr.appendChild(expectedCell);

      const got = document.createElement("td");
      got.dataset.label = "Your result";
      if (row.error) {
        // Only a marker here. The message itself goes under the table, once:
        // an error usually stops every row, and repeating a sentence down four
        // rows squeezes the columns to shreds on a phone.
        got.className = "code-write-cell-error";
        got.textContent = row.error.line ? `error on line ${row.error.line}` : "error";
      } else {
        got.textContent = row.actualRepr;
      }
      tr.appendChild(got);
      table.appendChild(tr);
    });

    scroller.appendChild(table);
    container.appendChild(scroller);

    const firstError = outcome.results.find(r => r.error);
    if (firstError) {
      const box = document.createElement("div");
      box.className = "code-write-error";
      const head = document.createElement("div");
      head.textContent = firstError.error.line
        ? `Line ${firstError.error.line}: ${firstError.error.message}`
        : firstError.error.message;
      box.appendChild(head);
      if (firstError.error.hint) {
        const hint = document.createElement("div");
        hint.className = "code-write-hint";
        hint.textContent = firstError.error.hint;
        box.appendChild(hint);
      }
      container.appendChild(box);
    }

    const printed = outcome.results.filter(r => r.output.length > 0);
    if (printed.length && !outcome.printedOnly) {
      const box = document.createElement("details");
      box.className = "code-write-printed";
      const label = document.createElement("summary");
      label.textContent = "What your code printed";
      box.appendChild(label);
      printed.forEach(row => {
        const line = document.createElement("div");
        line.textContent = `${row.call}: ${row.output.join(" ⏎ ")}`;
        box.appendChild(line);
      });
      container.appendChild(box);
    }
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
    // animationend never fires under prefers-reduced-motion (the stylesheet
    // disables the animation), so back it with a timer or these pile up in
    // <body> for the whole session.
    this._removeAfterAnimation(span, () => span.remove());
  }

  /**
   * Run `cleanup` when the element's animation ends, with a timer fallback for
   * when animations are disabled (reduced motion) and animationend never fires.
   */
  _removeAfterAnimation(el, cleanup) {
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cleanup();
    };
    const timer = setTimeout(run, 1000);
    el.addEventListener("animationend", run, { once: true });
  }

  /** True when the reader has asked for reduced motion (stylesheet disables our animations). */
  _prefersReducedMotion() {
    try {
      return !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    } catch (_) {
      return false;
    }
  }

  _triggerCombatAnimations(battleData) {
    const dealingDamage = battleData.effective_player_damage > 0;
    const takingDamage = battleData.effective_monster_damage > 0;
    if (!dealingDamage && !takingDamage) return 0;
    // Nothing animates under reduced motion, so don't hold the results screen
    // back waiting for animations that will never play.
    if (this._prefersReducedMotion()) return 0;

    if (dealingDamage) {
      const img = this.root.querySelector(".monster-image");
      if (img) {
        img.classList.add("monster-hit");
        this._removeAfterAnimation(img, () => img.classList.remove("monster-hit"));
      }
      const imgWrap = this.root.querySelector(".monster-image-container") || this.root.querySelector(".monster-details");
      this._spawnFloatNumber(imgWrap, `-${battleData.effective_player_damage}`, "dmg-float--hit");
    }

    if (takingDamage) {
      const container = document.querySelector(".game-container");
      if (container) {
        container.classList.add("player-hit");
        this._removeAfterAnimation(container, () => container.classList.remove("player-hit"));
      }
      const hud = this.root.querySelector(".player-hud");
      this._spawnFloatNumber(hud, `-${battleData.effective_monster_damage}`, "dmg-float--recv");
    }

    return 760;
  }

  /**
   * One line of combat outcome for the results screen. The floating damage
   * numbers are gone in under a second, and the results screen is where a
   * player actually stops to read — so restate the fight there: what each side
   * dealt, and where the HP bars ended up.
   */
  _battleSummary(battleData) {
    if (!this.model) return "";
    const p = this.model.player;
    const m = this.model.current_monster;
    const parts = [];

    const dealt = battleData.effective_player_damage;
    const taken = battleData.effective_monster_damage;
    if (typeof dealt !== "number" || typeof taken !== "number") return "";

    if (m?.is_boss) {
      // The dragon's HP is the review queue, so a damage number would be a lie.
      if (taken > 0) parts.push(`🩸 The dragon bites for ${taken}`);
    } else {
      parts.push(dealt > 0 ? `⚔ You hit for ${dealt}` : "⚔ You dealt no damage");
      if (taken > 0) parts.push(`🩸 ${m ? m.monster_name : "The monster"} hit you for ${taken}`);
    }

    parts.push(`❤ You ${Math.max(0, p.hit_points)}/${p.max_hit_points}`);
    if (m && !m.is_boss) {
      parts.push(m.hit_points <= 0
        ? `💀 ${m.monster_name} defeated`
        : `🐲 ${m.monster_name} ${m.hit_points}/${m.max_hit_points}`);
    }
    return parts.join("  ·  ");
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

    let questionText = battleData.questionText || this.model.current_question?.question || null;
    if (questionText) {
      // Cloze prompts carry {{1}}-style placeholders; show them as blanks here.
      // (Dynamic-numeric templates are already substituted before this point.)
      questionText = questionText.replace(/\{\{\s*\d+\s*\}\}/g, "___");
      const qLine = document.createElement("div");
      qLine.className = "section";
      qLine.innerHTML =
        `<span class="bold">Question:</span> <span class="question-text">${this._esc(questionText)}</span>`;
      body.insertBefore(qLine, fbWrap);
    }

    const addVerdictLine = (container, cls, label, text) => {
      const row = document.createElement("div");
      row.className = `verdict-line ${cls}`;
      const lab = document.createElement("span");
      lab.className = "verdict-label";
      lab.textContent = label;
      row.appendChild(lab);
      row.appendChild(document.createTextNode(` ${text}`));
      container.appendChild(row);
    };

    if (battleData.singleAnswer) {
      // One right option, so three lists (one of them reading "None.") only
      // obscures the result. Say what was picked and what was right.
      const gotIt = battleData.correctSelections.length > 0;
      if (gotIt) {
        addVerdictLine(fbWrap, "correct", "✔ Correct:", battleData.correctSelections[0]);
      } else {
        addVerdictLine(fbWrap, "incorrect", "✖ Your answer:",
          battleData.incorrectSelections[0] ?? "(nothing selected)");
        addVerdictLine(fbWrap, "missed", "✔ Correct answer:",
          battleData.missedCorrect[0] ?? "");
      }
    } else if (battleData.perItemScoring) {
      // Matching, ordering and cloze grade N independent items, so every item
      // lands in one of the first two lists. A third list reading "None." is
      // structurally always empty — pure noise.
      addList(fbWrap, "correct", "✔ Correct:", battleData.correctSelections);
      addList(fbWrap, "incorrect", "✖ Wrong:", battleData.incorrectSelections);
    } else {
      addList(fbWrap, "correct", "✔ Correctly selected:", battleData.correctSelections);
      addList(fbWrap, "incorrect", "✖ Incorrectly selected:", battleData.incorrectSelections);
      addList(fbWrap, "missed", "⚠ Missed correct answers:", battleData.missedCorrect);
    }

    // A write-the-code question always ends by showing a worked answer, whether
    // or not the student's own passed. Seeing one good version of the function
    // is the point of the exercise, and the question will come round again.
    if (battleData.referenceSolution) {
      const wrap = document.createElement("div");
      wrap.className = "reference-solution";
      const label = document.createElement("div");
      label.className = "bold";
      label.textContent = battleData.testsPassed === battleData.testsTotal
        ? "One way to write it:"
        : "A correct answer:";
      wrap.appendChild(label);
      const pre = document.createElement("pre");
      pre.className = "code-snippet";
      pre.innerHTML = highlightPython(battleData.referenceSolution);
      wrap.appendChild(pre);
      body.appendChild(wrap);
    }

    const battleLine = this._battleSummary(battleData);
    if (battleLine) {
      const bs = document.createElement("div");
      bs.className = "battle-summary";
      bs.textContent = battleLine;
      body.appendChild(bs);
    }

    // During the boss the dragon's HP is "concepts remaining," not dice damage —
    // reframe the turn around mastery instead of showing a meaningless hit number.
    const isBoss = this.model.boss_phase;
    if (isBoss) {
      const gotIt = !((battleData.incorrectSelections?.length) || (battleData.missedCorrect?.length));
      const note = document.createElement("div");
      note.className = gotIt ? "correct" : "incorrect";
      note.style.marginTop = "6px";
      note.textContent = gotIt
        ? "🐉 Concept re-mastered — the dragon recedes."
        : "🐉 The dragon strikes! That idea still has teeth.";
      body.appendChild(note);
    }

    if (!isBoss && battleData.streakMultiplier > 1) {
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

    const itemNote = (text) => {
      const el = document.createElement("div");
      el.className = "correct";
      el.style.marginTop = "4px";
      el.textContent = text;
      body.appendChild(el);
    };
    if (battleData.shield_used) itemNote("🛡 Firewall Shard absorbed the hit.");
    if (battleData.mirror_used) itemNote(`🪞 Stack Mirror reflected ${battleData.mirror_damage} damage to the monster.`);
    if (battleData.xp_doubled)  itemNote("✨ XP Magnet doubled your XP gain.");
    if (battleData.adrenaline_used) itemNote("⚡ Adrenaline Rush doubled your hit.");

    if (battleData.feedback) {
      const block = document.createElement("div");
      block.className = "custom-feedback";
      block.innerHTML = "<div class='bold'>Feedback:</div><div class='feedback-text'></div>";
      block.querySelector(".feedback-text").textContent = battleData.feedback;
      body.appendChild(block);
    }

    if (itemDrop) {
      const slotLabel = `Stored in slot ${itemDrop.placed_slot + 1} (${itemDrop.placed_slot === 0 ? "Q" : "W"})`;
      const displaced = itemDrop.displaced
        ? `<br><span class="loot-flavor">Discarded to make room: ${itemDrop.displaced.emoji} ${this._esc(itemDrop.displaced.name)}.</span>`
        : "";
      const loot = document.createElement("div");
      loot.className = "loot-drop";
      loot.setAttribute("aria-live", "polite");
      loot.innerHTML =
        "<div class=\"loot-header\">&gt;&gt;&gt; ITEM DROP &lt;&lt;&lt;</div>" +
        `<div class="loot-body">${itemDrop.emoji} <span class="loot-name">${this._esc(itemDrop.name)}</span><br>` +
        `<span class="loot-flavor">${this._esc(itemDrop.flavor)}</span><br>` +
        `<span class="loot-effect">${this._esc(slotLabel)}</span>${displaced}</div>`;
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

  /** Intro screen for the end-of-set retrieval boss. `count` = concepts to master. */
  showBossIntro(count, dragonLine, onContinue) {
    this._clearKeyboard();
    const safeLine = dragonLine ? this._esc(dragonLine) : null;
    this.root.innerHTML = `
      <div class="bbs-container">
        <div class="section center">
          <img src="images/monsters/quantum_dragon.png" alt="The Recursive Dragon"
               style="max-width:160px;image-rendering:pixelated;">
        </div>
        <div class="section red bold center">🐉 The Recursive Dragon blocks your path!</div>
        ${safeLine ? `<div class="section dragon-speech">“${safeLine}”</div>` : ""}
        <div class="section">
          It has hoarded <span class="yellow bold">${count}</span> idea${count === 1 ? "" : "s"} you stumbled on this run.
          Master ${count === 1 ? "it" : "them all"} to break free. Miss one and the dragon bites —
          but a missed idea simply returns until you get it right.
        </div>
        <div class="section center">
          <button class="action-button" data-action="boss-begin">Face the Dragon ⚔️</button>
        </div>
      </div>`;
    const btn = this.root.querySelector("[data-action=boss-begin]");
    if (btn) { btn.addEventListener("click", () => onContinue()); btn.focus(); }
  }

  showVictory(reviewCallback, dragonLine = null) {
    this._clearKeyboard();
    const p = this.model.player;
    renderTemplate(this.root, "tpl-victory");
    if (dragonLine) {
      const d = $(this.root, "[data-ref=dragonSpeech]");
      if (d) { d.textContent = dragonLine; d.hidden = false; }
    }
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

  showNoQuestions(reviewCallback, dragonLine = null) {
    this._clearKeyboard();
    const p = this.model.player;
    renderTemplate(this.root, "tpl-no-questions");
    if (dragonLine) {
      const d = $(this.root, "[data-ref=dragonSpeech]");
      if (d) { d.textContent = dragonLine; d.hidden = false; }
    }
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
      download: `lotrd-${String(setName ?? "session").replace(".json", "")}-${new Date().toISOString().slice(0, 10)}.txt`,
    });
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoking synchronously can cancel the download before it starts in some
    // browsers — give the click a tick to be picked up first.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}