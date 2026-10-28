// tests/sound.test.js — when sound effects play (src/sound.js): the audio is
// woken by a press ahead of the sound that press leads to, kept awake, and a
// sound that cannot start at once is dropped instead of playing late. And the
// sounds themselves: every one builds, is audible, and is short.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { SoundSystem, SFX } from '../src/sound.js';
import { buildSamples, ZZFX_SAMPLE_RATE } from '../src/zzfx.js';

/**
 * A stand-in AudioContext that records what was started, and resumes after
 * `wakeMs`: an oscillator as its frequency (the hum), a sound as its length.
 */
class FakeContext {
  static made = [];
  static wakeMs = 0;
  constructor() {
    this.state = 'suspended';
    this.currentTime = 0;
    this.destination = {};
    this.started = [];
    this.suspended = 0;
    FakeContext.made.push(this);
  }
  resume() {
    return new Promise(done => setTimeout(() => { this.state = 'running'; done(); }, FakeContext.wakeMs));
  }
  suspend() { this.state = 'suspended'; this.suspended++; return Promise.resolve(); }
  createOscillator() {
    const osc = { frequency: { value: 0 }, connect() {}, start: () => this.started.push(osc.frequency.value) };
    return osc;
  }
  createGain() { return { gain: { value: 1 }, connect() {} }; }
  createBuffer(_channels, length) {
    const data = new Float32Array(length);
    return { length, getChannelData: () => data };
  }
  createBufferSource() {
    const src = { buffer: null, playbackRate: { value: 1 }, connect() {},
      start: () => this.started.push(`sound of ${src.buffer.length}`) };
    return src;
  }
}

/** A document that keeps its listeners, so a test can press a key. */
const listeners = {};
globalThis.window = { AudioContext: FakeContext };
globalThis.document = { addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); } };
const press = (type = 'pointerdown') => listeners[type].at(-1)();
const until = ms => new Promise(r => setTimeout(r, ms));
const lengthOf = name => { const p = [...SFX[name]]; p[1] = 0; return buildSamples(...p).length; };

describe('when sound effects play', () => {
  let sounds;
  beforeEach(() => {
    FakeContext.made = [];
    FakeContext.wakeMs = 0;
    sounds = new SoundSystem();
  });
  afterEach(() => sounds._sleep());   // clears the idle timer, which would hold the process open

  it('a press wakes the audio and starts one inaudible hum to keep it awake', async () => {
    press();
    await until(5);
    const [ctx] = FakeContext.made;
    assert.equal(ctx.state, 'running');
    assert.deepEqual(ctx.started, [30]);
    press('keydown');
    assert.deepEqual(ctx.started, [30], 'one hum, however many presses');
    assert.equal(FakeContext.made.length, 1);
  });

  it('with the audio awake, a sound starts at once', async () => {
    press();
    await until(5);
    sounds.play('hit');
    assert.deepEqual(FakeContext.made[0].started, [30, `sound of ${lengthOf('hit')}`]);
  });

  it('a sound waits for audio that is waking quickly', async () => {
    FakeContext.wakeMs = 20;
    sounds.play('claw');
    await until(60);
    assert.deepEqual(FakeContext.made[0].started, [30, `sound of ${lengthOf('claw')}`]);
  });

  it('a sound is dropped, not played late, when the audio takes too long to wake', async () => {
    FakeContext.wakeMs = 250;
    sounds.play('claw');
    await until(300);
    assert.equal(FakeContext.made[0].state, 'running');
    assert.deepEqual(FakeContext.made[0].started, [30], 'only the hum');
  });

  it('switched off: presses make no audio, and switching off releases it', async () => {
    press();
    await until(5);
    sounds.enabled = false;
    assert.equal(FakeContext.made[0].suspended, 1);
    sounds.play('hit');
    press();
    assert.deepEqual(FakeContext.made[0].started, [30]);
    assert.equal(FakeContext.made.length, 1);
  });

  it('an unknown sound is nothing, not an error', async () => {
    press();
    await until(5);
    sounds.play('no-such-sound');
    assert.deepEqual(FakeContext.made[0].started, [30]);
  });
});

describe('the sounds', () => {
  for (const [name, params] of Object.entries(SFX)) {
    it(`${name}: builds, is heard, and is over within 1.5 s`, () => {
      const p = [...params];
      p[1] = 0;
      const samples = buildSamples(...p);
      assert.ok(samples.length > 0 && samples.length <= 1.5 * ZZFX_SAMPLE_RATE, `${samples.length} samples`);
      let peak = 0;
      for (const s of samples) {
        assert.ok(Number.isFinite(s), 'a sample that is not a number');
        peak = Math.max(peak, Math.abs(s));
      }
      assert.ok(peak > 0.1, `peak ${peak}: too quiet to hear`);
    });
  }
});
