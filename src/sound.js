// Sound effects: ZzFX sounds (see zzfx.js), built once into buffers and played
// through one Web Audio context. A sound is only worth playing at the moment it
// belongs to, so the audio is kept ready ahead of it: every press wakes it (so
// it is running by the time the answer that press leads to wants a sound), and
// a sound that cannot start at once is dropped rather than played late, at
// some unrelated moment.

import { buildSamples, ZZFX_SAMPLE_RATE } from "./zzfx.js";

/**
 * Every sound, as ZzFX parameters: [volume, randomness, frequency, attack,
 * sustain, release, shape, shapeCurve, slide, deltaSlide, pitchJump,
 * pitchJumpTime, repeatTime, noise, modulation, bitCrush, delay, sustainVolume,
 * decay, tremolo, filter]. Paste one into https://killedbyapixel.github.io/ZzFX
 * to hear or reshape it, or try them all in tools/sound-board.html.
 */
export const SFX = {
  // The fight: each plays on the stage beat that shows it (sfxFor, stage.js).
  swing:    [.5, .05, 520, .01, .02, .11, 0, 1, -3, , , , , 1.6],                 // the hero lunges
  charged:  [.6, .05, 640, .01, .04, .16, 0, 1, -2, , 380, .05, , 1.2],           // ...on a streak
  hit:      [1, .05, 300, 0, .03, .17, 2, 1.4, -1.5, , , , , .8, , .05],           // the blow lands on the monster
  claw:     [.7, .05, 170, .01, .05, .16, 2, 1, -.5, , , , , 2.2],                // the monster strikes back
  hurt:     [.8, .05, 420, 0, .04, .2, 2, 1, -2],                                 // ...and lands on the hero
  defeat:   [1, .05, 260, .01, .12, .5, 4, 1, -.3, , , , , .4, , .2],             // a monster vanishes
  boom:     [1.2, .05, 110, .01, .22, .8, 4, 1, -.1, , , , , .9, , .3],           // a Logic Bomb goes off
  down:     [.8, 0, 380, .02, .35, .55, 2, 1, -.6],                               // the hero is knocked out
  revive:   [.7, 0, 330, .03, .3, .25, 1, 1, , , 82.5, .09, .09],                 // ...and gets back up
  block:    [.8, .05, 880, 0, .03, .3, 0, 1, , , , , , , 48],                     // a Firewall Shard takes the blow
  reflect:  [.6, 0, 1100, .01, .12, .3, 0, 1, 2, , , , .06, , , , , , , .4],      // a Stack Mirror sends it back
  heal:     [.6, 0, 520, .05, .2, .3, 0, 1, 1],                                   // HP comes back
  buff:     [.5, 0, 880, .01, .05, .15, 0, 1, , , 440, .05],                      // an item is armed
  gold:     [.6, 0, 1675, , .06, .24, 1, 1.82, , , 837, .06],                     // a revive charge
  throw:    [.5, .05, 320, .01, .02, .15, 0, 1, 3, , , , , 1.2],                  // an item is thrown
  drop:     [.6, 0, 560, .01, .03, .12, 1, 1, , , 560, .04],                      // a beaten monster drops an item
  // Outside the fight.
  wrong:    [.6, 0, 160, 0, .08, .12, 2, 1, , , , , , , , .1],                    // a miss with nothing to show for it
  levelUp:  [.8, 0, 392, .01, .36, .2, 1, 1, , , 98, .09, .09],
  victory:  [1, 0, 330, .02, .5, .2, 1, 1, , , 165, .15, .15, , , , .12],
  gameOver: [1, 0, 300, .05, .5, .4, 2, 1, , , -40, .2, .2],
};

const MASTER = 0.3;      // ZzFX's own master volume
const IDLE_MS = 120000;  // no press for this long: release the audio, so the device and the computer can sleep
const LATE_MS = 120;     // a sound still waiting on the audio device after this long is dropped

export class SoundSystem {
  constructor() {
    this._ctx = null;
    this._enabled = true;
    this._hum = null;
    this._idle = null;
    this._master = null;
    this._buffers = new Map();
    // Capture phase, so the audio starts waking before the press's own handler
    // runs. A click counts too: iOS only lets audio start from one.
    const wake = () => this._wake();
    for (const type of ["pointerdown", "keydown", "click"]) {
      globalThis.document?.addEventListener?.(type, wake, { capture: true, passive: true });
    }
  }

  get enabled() { return this._enabled; }
  set enabled(on) {
    this._enabled = on;
    if (on) this._wake();
    else this._sleep();
  }

  /** Play a sound from SFX. */
  play(name) {
    const params = SFX[name];
    if (params) this._start(ctx => this._source(ctx, this._buffer(ctx, name), nudge(params)));
  }

  /** Play a sound from its parameters, built afresh: for trying one out. */
  playParams(params) {
    this._start(ctx => this._source(ctx, toBuffer(ctx, params), nudge(params)));
  }

  levelUp()  { this.play("levelUp"); }
  victory()  { this.play("victory"); }
  gameOver() { this.play("gameOver"); }

  /** Create or resume the audio, and restart the idle clock. Returns the context, or null. */
  _wake() {
    if (!this._enabled) return null;
    try {
      if (!this._ctx) {
        this._ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
        // Build every sound now, off the press that woke the audio, so none is built as it plays.
        const ctx = this._ctx;
        setTimeout(() => { for (const name in SFX) this._buffer(ctx, name); }, 0);
      }
      const ctx = this._ctx;
      if (ctx.state !== "running") ctx.resume().catch(() => {});
      this._startHum(ctx);
      clearTimeout(this._idle);
      this._idle = setTimeout(() => this._sleep(), IDLE_MS);
      return ctx;
    } catch (_) {
      return null;
    }
  }

  _sleep() {
    clearTimeout(this._idle);
    if (this._ctx?.state === "running") this._ctx.suspend().catch(() => {});
  }

  /** Run `fn(ctx)` now if the audio is running, or as soon as it wakes, unless that is too late. */
  _start(fn) {
    const ctx = this._wake();
    if (!ctx) return;
    try {
      if (ctx.state === "running") return fn(ctx);
      const asked = performance.now();
      ctx.resume().then(() => { if (performance.now() - asked <= LATE_MS) fn(ctx); }).catch(() => {});
    } catch (_) {}
  }

  /**
   * Many sound drivers, and Bluetooth headsets, power down after a few seconds
   * of digital silence and swallow the start of the next sound while they wake.
   * A 30 Hz tone at -80 dBFS keeps them up: far below hearing, and below the
   * level at which a browser marks the tab as playing audio.
   */
  _startHum(ctx) {
    if (this._hum) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 30;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    this._hum = osc;
  }

  _buffer(ctx, name) {
    let buffer = this._buffers.get(name);
    if (!buffer) this._buffers.set(name, buffer = toBuffer(ctx, SFX[name]));
    return buffer;
  }

  _source(ctx, buffer, rate) {
    if (!this._master) {
      this._master = ctx.createGain();
      this._master.gain.value = MASTER;
      this._master.connect(ctx.destination);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    src.connect(this._master);
    src.start();
  }
}

/** The samples, built without ZzFX's pitch randomness: that comes from nudge() on each play. */
function toBuffer(ctx, params) {
  const p = [...params];
  p[1] = 0;
  const samples = buildSamples(...p);
  const buffer = ctx.createBuffer(1, Math.max(1, samples.length), ZZFX_SAMPLE_RATE);
  buffer.getChannelData(0).set(samples);
  return buffer;
}

/** A playback rate a little off 1, by up to the sound's randomness, so a repeated sound isn't identical. */
function nudge(params) {
  const randomness = params[1] ?? .05;
  return 1 + randomness * (Math.random() * 2 - 1);
}
