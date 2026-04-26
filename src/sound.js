export class SoundSystem {
  constructor() {
    this._ctx = null;
    this.enabled = true;
    this._kaTimer = null;
  }

  _getCtx() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return this._ctx;
  }

  _keepAlive() {
    clearTimeout(this._kaTimer);
    this._kaTimer = setTimeout(() => {
      if (this._ctx) {
        try {
          const buf = this._ctx.createBuffer(1, 1, this._ctx.sampleRate);
          const src = this._ctx.createBufferSource();
          src.buffer = buf;
          src.connect(this._ctx.destination);
          src.start();
        } catch (_) {}
      }
      this._keepAlive();
    }, 9000);
  }

  async _beep(freq, dur, type = "square", vol = 0.12, delay = 0) {
    if (!this.enabled) return;
    try {
      const ctx = this._getCtx();
      if (ctx.state !== "running") await ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.value = freq;
      const t = ctx.currentTime + delay;
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.start(t);
      osc.stop(t + dur);
    } catch (_) {}
  }

  correct()         { this._keepAlive(); this._beep(523, .08); this._beep(659, .08, "square", .12, .09); this._beep(784, .15, "square", .12, .18); }
  incorrect()       { this._keepAlive(); this._beep(220, .12, "sawtooth", .10); this._beep(165, .25, "sawtooth", .10, .13); }
  levelUp()         { this._keepAlive(); [523, 659, 784, 1047].forEach((f, i) => this._beep(f, .14, "square", .11, i * .14)); }
  victory()         { this._keepAlive(); [523, 659, 784, 659, 784, 1047].forEach((f, i) => this._beep(f, .16, "square", .11, i * .15)); }
  gameOver()        { this._keepAlive(); [330, 247, 196, 147].forEach((f, i) => this._beep(f, .22, "sawtooth", .10, i * .22)); }
  monsterDefeated() { this._keepAlive(); this._beep(660, .08); this._beep(880, .14, "square", .11, .09); }
  streakHit(n)      { this._keepAlive(); const f = Math.min(400 + n * 40, 880); this._beep(f, .06, "square", .09); this._beep(f * 1.25, .10, "square", .09, .08); }
}