// Sound effects, synthesized with the Web Audio API. A sound is only worth
// playing at the moment it belongs to, so the audio is kept ready ahead of it:
// every press wakes it (so it is running by the time the answer that press
// leads to wants a sound), and a sound that cannot start at once is dropped
// rather than played late, at some unrelated moment.

const IDLE_MS = 120000;  // no press for this long: release the audio, so the device and the computer can sleep
const LATE_MS = 120;     // a sound still waiting on the audio device after this long is dropped

export class SoundSystem {
  constructor() {
    this._ctx = null;
    this._enabled = true;
    this._hum = null;
    this._idle = null;
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

  /** Create or resume the audio, and restart the idle clock. Returns the context, or null. */
  _wake() {
    if (!this._enabled) return null;
    try {
      const ctx = this._ctx ??= new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
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

  /** Play notes, each [freq, dur, type, vol, delay], timed from one shared start. */
  _play(notes) {
    const ctx = this._wake();
    if (!ctx) return;
    const go = () => {
      const t0 = ctx.currentTime;
      for (const [freq, dur, type = "square", vol = 0.12, delay = 0] of notes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = type;
        osc.frequency.value = freq;
        const t = t0 + delay;
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.start(t);
        osc.stop(t + dur);
      }
    };
    try {
      if (ctx.state === "running") return go();
      const asked = performance.now();
      ctx.resume().then(() => { if (performance.now() - asked <= LATE_MS) go(); }).catch(() => {});
    } catch (_) {}
  }

  correct()         { this._play([[523, .08], [659, .08, "square", .12, .09], [784, .15, "square", .12, .18]]); }
  incorrect()       { this._play([[220, .12, "sawtooth", .10], [165, .25, "sawtooth", .10, .13]]); }
  levelUp()         { this._play([523, 659, 784, 1047].map((f, i) => [f, .14, "square", .11, i * .14])); }
  victory()         { this._play([523, 659, 784, 659, 784, 1047].map((f, i) => [f, .16, "square", .11, i * .15])); }
  gameOver()        { this._play([330, 247, 196, 147].map((f, i) => [f, .22, "sawtooth", .10, i * .22])); }
  monsterDefeated() { this._play([[660, .08], [880, .14, "square", .11, .09]]); }
  streakHit(n)      { const f = Math.min(400 + n * 40, 880); this._play([[f, .06, "square", .09], [f * 1.25, .10, "square", .09, .08]]); }
}
