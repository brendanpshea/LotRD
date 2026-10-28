// tests/sound.test.js — when sound effects play (src/sound.js): the audio is
// woken by a press ahead of the sound that press leads to, kept awake, and a
// sound that cannot start at once is dropped instead of playing late.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { SoundSystem } from '../src/sound.js';

/** A stand-in AudioContext that records what was started, and resumes after `wakeMs`. */
class FakeContext {
  static made = [];
  static wakeMs = 0;
  constructor() {
    this.state = 'suspended';
    this.currentTime = 0;
    this.destination = {};
    this.started = [];            // frequencies of oscillators started
    this.suspended = 0;
    FakeContext.made.push(this);
  }
  resume() {
    return new Promise(done => setTimeout(() => { this.state = 'running'; done(); }, FakeContext.wakeMs));
  }
  suspend() { this.state = 'suspended'; this.suspended++; return Promise.resolve(); }
  createOscillator() {
    const osc = { frequency: { value: 0 }, type: 'sine', connect() {}, stop() {},
      start: () => this.started.push(osc.frequency.value) };
    return osc;
  }
  createGain() {
    return { gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
  }
}

/** A document that keeps its listeners, so a test can press a key. */
const listeners = {};
globalThis.window = { AudioContext: FakeContext };
globalThis.document = { addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); } };
const press = (type = 'pointerdown') => listeners[type].at(-1)();
const until = ms => new Promise(r => setTimeout(r, ms));

describe('sound effects', () => {
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
    sounds.correct();
    assert.deepEqual(FakeContext.made[0].started, [30, 523, 659, 784]);
  });

  it('a sound waits for audio that is waking quickly', async () => {
    FakeContext.wakeMs = 20;
    sounds.incorrect();
    await until(60);
    assert.deepEqual(FakeContext.made[0].started.slice(-2), [220, 165]);
  });

  it('a sound is dropped, not played late, when the audio takes too long to wake', async () => {
    FakeContext.wakeMs = 250;
    sounds.incorrect();
    await until(300);
    assert.equal(FakeContext.made[0].state, 'running');
    assert.deepEqual(FakeContext.made[0].started, [30], 'only the hum');
  });

  it('switched off: presses make no audio, and switching off releases it', async () => {
    press();
    await until(5);
    sounds.enabled = false;
    assert.equal(FakeContext.made[0].suspended, 1);
    sounds.correct();
    press();
    assert.deepEqual(FakeContext.made[0].started, [30]);
    assert.equal(FakeContext.made.length, 1);
  });
});
