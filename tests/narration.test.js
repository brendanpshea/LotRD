// The mentors' narration (src/narration.js): which lines a scene speaks and in
// what order, the clip names shared with tools/narrate.py, and the player's
// switch, speed, and silence when there is no clip.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// A stand-in <audio>: records what it was asked to play, and lets a test end a
// clip or fail to load one.
class FakeAudio {
  constructor() { this.listeners = {}; this.played = []; this.paused = true; FakeAudio.last = this; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeAttribute(name) { if (name === 'src') this.src = ''; }
  pause() { this.paused = true; }
  play() { this.paused = false; this.played.push(this.src); return Promise.resolve(); }
  fire(type) { for (const fn of this.listeners[type] || []) fn(); }
}
const store = new Map();
globalThis.Audio = FakeAudio;
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
};

const { clipName, sceneLines, sceneHasNarration, Narrator, stopNarration, NARRATION_DIR } = await import('../src/narration.js');

const scene = {
  type: 'npc_demo', npc: 'nia', intro: 'Nia waits.', intro_narrate: 'Hello there.',
  steps: [
    { say: 'One.', beats: [{ say: 'One.', narrate: 'First,  one.' }, { code: 'x++', narrate: 'Look at the code.' }],
      check: { prompt: 'Q?', answer: 'a', wrong: ['b'], why: 'W.', narrate: 'Which is it?', why_narrate: 'Because.' } },
    { say: 'Two.', beats: [{ say: 'Two.', narrate: 'Second.' }] },
  ],
  outro: 'Bye.', outro_narrate: 'Off you go.',
};

describe('narration: lines and names', () => {
  it('a scene speaks its lines in the order a student meets them, squashed', () => {
    assert.deepEqual(sceneLines(scene), ['Hello there.', 'First, one.', 'Look at the code.', 'Which is it?', 'Because.', 'Second.', 'Off you go.']);
  });

  it('a scene with no narrate fields has no narration', () => {
    assert.equal(sceneHasNarration({ type: 'npc_demo', steps: [{ say: 'x', beats: [{ say: 'x' }] }] }), false);
    assert.equal(sceneHasNarration(scene), true);
  });

  it('a clip is named by voice and line, whitespace aside', () => {
    assert.match(clipName('v', 'a line'), /^[0-9a-f]{16}$/);
    assert.equal(clipName('v', ' a   line '), clipName('v', 'a line'));
    assert.notEqual(clipName('v', 'a line'), clipName('w', 'a line'));
    assert.notEqual(clipName('v', 'a line'), clipName('v', 'a line.'));
  });
});

describe('narration: the player', () => {
  beforeEach(() => { store.clear(); stopNarration(); });

  it('is off until turned on, and says nothing while off', () => {
    const n = new Narrator('v');
    assert.equal(n.on, false);
    n.say(['Hello.']);
    assert.equal(FakeAudio.last?.played?.length ?? 0, 0);
  });

  it('plays a frame\'s lines one after another, each from its clip', () => {
    const n = new Narrator('v');
    n.on = true;
    n.say(['One.', 'Two.']);
    const a = FakeAudio.last;
    assert.deepEqual(a.played, [`${NARRATION_DIR}${clipName('v', 'One.')}.mp3`]);
    a.fire('ended');
    assert.deepEqual(a.played.slice(1), [`${NARRATION_DIR}${clipName('v', 'Two.')}.mp3`]);
    a.fire('ended');
    assert.equal(a.played.length, 2);
  });

  it('says which line is being spoken, and when the voice stops', () => {
    const n = new Narrator('v');
    n.on = true;
    const seen = [];
    n.say(['One.', '', 'Three.'], i => seen.push(i));   // the empty line is skipped, the others keep their places
    const a = FakeAudio.last;
    a.fire('ended');
    a.fire('ended');
    assert.deepEqual(seen, [0, 2, null]);
    n.say(['Four.'], i => seen.push(i));
    stopNarration();
    assert.deepEqual(seen.slice(3), [0, null]);
  });

  it('goes on to the next line when a clip is missing', () => {
    const n = new Narrator('v');
    n.on = true;
    n.say(['Missing.', 'There.']);
    FakeAudio.last.fire('error');
    assert.equal(FakeAudio.last.played.at(-1), `${NARRATION_DIR}${clipName('v', 'There.')}.mp3`);
  });

  it('a new frame cuts off the old one, and stopping silences it', () => {
    const n = new Narrator('v');
    n.on = true;
    n.say(['One.', 'Two.']);
    const a = FakeAudio.last;            // one <audio> serves every scene, so count from here
    const base = a.played.length;
    n.say(['Three.']);
    assert.equal(a.played.at(-1), `${NARRATION_DIR}${clipName('v', 'Three.')}.mp3`);
    a.fire('ended');
    assert.equal(a.played.length, base + 1, 'Two. was dropped with its frame');
    n.say(['Four.']);
    stopNarration();
    assert.equal(a.paused, true);
    a.fire('ended');
    assert.equal(a.played.length, base + 2);
  });

  it('turning it off stops it, and the choice is remembered', () => {
    const n = new Narrator('v');
    n.on = true;
    n.say(['One.', 'Two.']);
    n.on = false;
    assert.equal(FakeAudio.last.paused, true);
    assert.equal(new Narrator('w').on, false);
    n.on = true;
    assert.equal(new Narrator('w').on, true);
  });

  it('cycles its speed through 1, 1.25, 1.5 and 0.75, and remembers it', () => {
    const n = new Narrator('v');
    assert.equal(n.rate, 1);
    assert.deepEqual([n.cycleRate(), n.cycleRate(), n.cycleRate(), n.cycleRate()], [1.25, 1.5, 0.75, 1]);
    n.cycleRate();
    assert.equal(new Narrator('w').rate, 1.25);
  });
});
