// A mentor's voice for the teaching scenes (npc_demo). A narrated scene carries
// spoken lines beside what is shown: `narrate` on a beat, `narrate` and
// `why_narrate` on a check, `intro_narrate` and `outro_narrate` on the scene.
// Each line is an MP3 under narration/, named by a hash of the mentor's voice
// and the line: the name tools/narrate.py gives it. A line edited without
// running the tool again has no clip, so it plays nothing, never the old audio.
//
// Narration is off until the student turns it on, and the choice is kept in
// this browser. Every clip plays on one shared <audio> element: the first
// play, from the student's own press of the button, is what lets later clips
// play when a beat appears.

export const NARRATION_DIR = "narration/";
export const NARRATION_RATES = [1, 1.25, 1.5, 0.75];

const KEY_ON = "lotrd_narration";
const KEY_RATE = "lotrd_narration_rate";

/** Runs of whitespace as one space, trimmed: how a line is hashed and sent. */
export const squash = text => String(text ?? "").replace(/\s+/g, " ").trim();

/**
 * The clip's file name, without ".mp3": FNV-1a (64-bit) over the UTF-8 of
 * voice, a newline, and the squashed line, as 16 hex digits. Must match
 * clip_name in tools/narrate.py.
 */
export function clipName(voice, text) {
  const bytes = new TextEncoder().encode(`${voice}\n${squash(text)}`);
  let h = 0xcbf29ce484222325n;
  for (const b of bytes) h = ((h ^ BigInt(b)) * 0x100000001b3n) & 0xffffffffffffffffn;
  return h.toString(16).padStart(16, "0");
}

/** Every spoken line of a scene, in the order a student meets them. */
export function sceneLines(q) {
  const lines = [q?.intro_narrate];
  for (const step of q?.steps || []) {
    for (const beat of step.beats || []) lines.push(beat?.narrate);
    if (step.check) lines.push(step.check.narrate, step.check.why_narrate);
  }
  lines.push(q?.outro_narrate);
  return lines.filter(line => typeof line === "string" && squash(line)).map(squash);
}

export const sceneHasNarration = q => sceneLines(q).length > 0;

function readPref(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch (_) { return fallback; }
}
function writePref(key, value) {
  try { localStorage.setItem(key, value); } catch (_) {}
}

let _audio = null;
let _active = null;   // the Narrator whose lines are playing

function sharedAudio() {
  if (!_audio && typeof Audio !== "undefined") {
    _audio = new Audio();
    _audio.preload = "auto";
    const next = () => _active?._next();
    _audio.addEventListener("ended", next);
    _audio.addEventListener("error", next);   // no clip for this line: go on to the next
  }
  return _audio;
}

/** Silence whatever a mentor is saying: the screen is changing. */
export function stopNarration() {
  _active?.stop();
}

/** One mentor's voice in one scene. */
export class Narrator {
  constructor(voice) {
    this.voice = voice;
    this._queue = [];
  }

  get on() { return readPref(KEY_ON, "0") === "1"; }
  set on(value) {
    writePref(KEY_ON, value ? "1" : "0");
    if (!value) this.stop();
  }

  get rate() {
    const r = Number(readPref(KEY_RATE, "1"));
    return NARRATION_RATES.includes(r) ? r : 1;
  }
  /** The next speed in NARRATION_RATES, applied at once. */
  cycleRate() {
    const rates = NARRATION_RATES;
    const r = rates[(rates.indexOf(this.rate) + 1) % rates.length];
    writePref(KEY_RATE, String(r));
    if (_audio && _active === this) _audio.playbackRate = r;
    return r;
  }

  /** Speak these lines in order, cutting off anything still being said. */
  say(lines) {
    this.stop();
    if (!this.on) return;
    this._queue = (lines || []).filter(line => typeof line === "string" && squash(line));
    _active = this;
    this._next();
  }

  stop() {
    this._queue = [];
    if (_active === this) {
      _active = null;
      if (_audio) { _audio.pause(); _audio.removeAttribute("src"); }
    }
  }

  _next() {
    const audio = sharedAudio();
    const line = this._queue.shift();
    if (!audio || line === undefined || _active !== this) return;
    audio.src = `${NARRATION_DIR}${clipName(this.voice, line)}.mp3`;
    audio.playbackRate = this.rate;
    audio.play().catch(err => {
      // Refused outright (no press yet to allow sound): stop, don't spin.
      if (err?.name === "NotAllowedError") this.stop();
    });
  }
}
