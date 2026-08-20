// The mentors who teach the npc_demo scenes. The roster lives in
// assets/npcs.json (name, portrait, pronouns, domain); this module loads it
// once and resolves a scene's `npc` id to a profile.
//
// A scene names its mentor by id. If the id is unknown — a set authored before
// the roster existed, or a typo — the scene still runs: the caller falls back
// to showing the raw value as a name with no portrait, so a missing mentor is
// never a blank screen.
import { loadJSON } from "./model.js";

let _rosterPromise = null;

export function loadNpcRoster() {
  if (!_rosterPromise) {
    _rosterPromise = loadJSON("assets/npcs.json").catch(() => []);
  }
  return _rosterPromise;
}

/** Look up one mentor by id in an already-loaded roster. */
export function findNpc(roster, id) {
  if (!id) return null;
  const wanted = String(id).trim().toLowerCase();
  return (roster || []).find(n => n.id.toLowerCase() === wanted) || null;
}
