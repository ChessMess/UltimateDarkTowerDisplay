import { TowerSampleAudio } from '../../src/audio/TowerSampleAudio';

// ───── Inline Web Audio + fetch mocks ────────────────────────────────────
// jsdom doesn't provide Web Audio. Each test resets these and asserts on the
// recorded mock instances.

class MockAudioParam {
  value = 1;
  cancelScheduledValues = jest.fn<void, [number]>();
  setValueAtTime = jest.fn<void, [number, number]>();
  linearRampToValueAtTime = jest.fn<void, [number, number]>();
}

class MockGainNode {
  gain = new MockAudioParam();
  connect = jest.fn();
}

class MockBufferSource {
  buffer: unknown = null;
  loop = false;
  connect = jest.fn();
  startCalls = 0;
  stopCalls = 0;
  start(): void { this.startCalls++; }
  stop(_when?: number): void { this.stopCalls++; }
}

class MockAudioContext {
  state: 'running' | 'suspended' | 'closed' = 'running';
  currentTime = 0;
  destination = {};
  resume = jest.fn(() => Promise.resolve());
  close = jest.fn(() => Promise.resolve());
  createGain(): MockGainNode {
    const g = new MockGainNode();
    createdGains.push(g);
    return g;
  }
  createBufferSource(): MockBufferSource {
    const s = new MockBufferSource();
    createdBufferSources.push(s);
    return s;
  }
  decodeAudioData(_arr: ArrayBuffer): Promise<AudioBuffer> {
    decodeCalls++;
    return Promise.resolve({ __id: decodeCalls } as unknown as AudioBuffer);
  }
}

let createdContexts: MockAudioContext[] = [];
let createdGains: MockGainNode[] = [];
let createdBufferSources: MockBufferSource[] = [];
let decodeCalls = 0;
let fetchCalls: string[] = [];

const ContextSpy = jest.fn(() => {
  const ctx = new MockAudioContext();
  createdContexts.push(ctx);
  return ctx;
});

beforeEach(() => {
  createdContexts = [];
  createdGains = [];
  createdBufferSources = [];
  decodeCalls = 0;
  fetchCalls = [];
  ContextSpy.mockClear();
  (globalThis as unknown as { AudioContext: unknown }).AudioContext = ContextSpy;
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn((url: string) => {
    fetchCalls.push(url);
    return Promise.resolve({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    } as unknown as Response);
  });
});

// Wait for any number of microtasks to settle. The play() pipeline awaits
// fetch → arrayBuffer → decodeAudioData, so two flushes is enough.
async function flush(): Promise<void> {
  for (let i = 0; i < 4; i++) await Promise.resolve();
}

const LIB = {
  0x25: '/audio/Battle_start_01.ogg', // BattleStart
  0x6E: '/audio/Music-Battle-Loop.ogg', // RotateLoop placeholder
};

// ───── Tests ──────────────────────────────────────────────────────────────

describe('TowerSampleAudio', () => {
  it('sync is a no-op when disabled (no AudioContext, no fetch)', async () => {
    const audio = new TowerSampleAudio();
    audio.setLibrary(LIB);
    audio.sync(0x25, false, 0);
    await flush();

    expect(createdContexts).toHaveLength(0);
    expect(fetchCalls).toHaveLength(0);
    expect(createdBufferSources).toHaveLength(0);
  });

  it('first sync lazily creates an AudioContext and starts a buffer source', async () => {
    const audio = new TowerSampleAudio();
    audio.setLibrary(LIB);
    audio.setEnabled(true);
    audio.sync(0x25, false, 0);
    await flush();

    expect(createdContexts).toHaveLength(1);
    expect(fetchCalls).toEqual(['/audio/Battle_start_01.ogg']);
    expect(createdBufferSources).toHaveLength(1);
    const src = createdBufferSources[0];
    expect(src.startCalls).toBe(1);
    expect(src.loop).toBe(false);
  });

  it('sample change stops the old source and starts a new one', async () => {
    const audio = new TowerSampleAudio();
    audio.setLibrary(LIB);
    audio.setEnabled(true);

    audio.sync(0x25, false, 0);
    await flush();
    expect(createdBufferSources).toHaveLength(1);

    audio.sync(0x6E, true, 0);
    await flush();
    expect(createdBufferSources).toHaveLength(2);
    expect(createdBufferSources[0].stopCalls).toBe(1);
    expect(createdBufferSources[1].startCalls).toBe(1);
    expect(createdBufferSources[1].loop).toBe(true);
  });

  it('sync with force=true replays the same sample', async () => {
    const audio = new TowerSampleAudio();
    audio.setLibrary(LIB);
    audio.setEnabled(true);

    audio.sync(0x25, false, 0);
    await flush();
    expect(createdBufferSources).toHaveLength(1);

    // Same sample, no force → dedup keeps the source count at 1.
    audio.sync(0x25, false, 0);
    await flush();
    expect(createdBufferSources).toHaveLength(1);

    // Same sample, force=true → fresh source created and old one stopped.
    audio.sync(0x25, false, 0, true);
    await flush();
    expect(createdBufferSources).toHaveLength(2);
    expect(createdBufferSources[0].stopCalls).toBe(1);
    expect(createdBufferSources[1].startCalls).toBe(1);
  });

  it('volume-only change adjusts gain without restarting the source', async () => {
    const audio = new TowerSampleAudio();
    audio.setLibrary(LIB);
    audio.setEnabled(true);
    audio.sync(0x25, false, 0); // audible
    await flush();
    const sourceCount = createdBufferSources.length;
    const gain = createdGains[0];
    gain.gain.setValueAtTime.mockClear();

    audio.sync(0x25, false, 3); // mute
    await flush();

    expect(createdBufferSources).toHaveLength(sourceCount); // no new source
    expect(gain.gain.setValueAtTime).toHaveBeenCalled();
    const lastCall = gain.gain.setValueAtTime.mock.calls.at(-1)!;
    expect(lastCall[0]).toBeCloseTo(0.0);
  });

  it('volume 3 mutes, all other values play at full gain', async () => {
    const audio = new TowerSampleAudio();
    audio.setLibrary(LIB);
    audio.setEnabled(true);
    audio.sync(0x25, false, 1);
    await flush();
    const gain = createdGains[0];
    // Initial play sets gain 1.0 via setValueAtTime for any non-mute value
    const setCalls = gain.gain.setValueAtTime.mock.calls;
    expect(setCalls[setCalls.length - 1][0]).toBeCloseTo(1.0);

    audio.sync(0x25, false, 3); // Mute
    await flush();
    const last = gain.gain.setValueAtTime.mock.calls.at(-1)!;
    expect(last[0]).toBeCloseTo(0.0);
  });

  it('sample 0 stops playback (silence convention)', async () => {
    const audio = new TowerSampleAudio();
    audio.setLibrary(LIB);
    audio.setEnabled(true);
    audio.sync(0x25, false, 0);
    await flush();
    const src = createdBufferSources[0];

    audio.sync(0, false, 0);
    expect(src.stopCalls).toBe(1);
  });

  it('unknown sample id warns once and does not start a source', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => { });
    const audio = new TowerSampleAudio();
    audio.setLibrary(LIB);
    audio.setEnabled(true);

    audio.sync(0x99, false, 0);
    await flush();
    audio.sync(0x99, false, 0); // diff'd as same — sync alone won't replay
    audio.sync(0x25, false, 0); // play known
    await flush();
    audio.sync(0x99, false, 0); // unknown again — should not warn twice
    await flush();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('0x99');
    warn.mockRestore();
  });

  it('setLibrary drops cached buffers so sync re-fetches', async () => {
    const audio = new TowerSampleAudio();
    audio.setLibrary(LIB);
    audio.setEnabled(true);
    audio.sync(0x25, false, 0);
    await flush();
    expect(fetchCalls).toHaveLength(1);

    // Replace the library — same id maps to the same URL but cache is reset.
    audio.setLibrary({ 0x25: '/audio/Battle_start_01.ogg' });
    audio.sync(0, false, 0); // stop
    audio.sync(0x25, false, 0); // re-trigger
    await flush();
    expect(fetchCalls).toHaveLength(2);
  });

  it('cached buffer is reused on second play of the same sample (no refetch)', async () => {
    const audio = new TowerSampleAudio();
    audio.setLibrary(LIB);
    audio.setEnabled(true);
    audio.sync(0x25, false, 0);
    await flush();
    expect(fetchCalls).toHaveLength(1);

    audio.sync(0, false, 0);  // silence
    audio.sync(0x25, false, 0); // play same sample again
    await flush();
    expect(fetchCalls).toHaveLength(1); // cached
  });

  it('setEnabled(false) stops playback; setEnabled(true) replays the last active sample', async () => {
    const audio = new TowerSampleAudio();
    audio.setLibrary(LIB);
    audio.setEnabled(true);
    audio.sync(0x25, true, 1);
    await flush();
    expect(createdBufferSources).toHaveLength(1);

    audio.setEnabled(false);
    expect(createdBufferSources[0].stopCalls).toBe(1);

    audio.setEnabled(true);
    await flush();
    // A new source is created; loop and volume are preserved from last state.
    expect(createdBufferSources).toHaveLength(2);
    expect(createdBufferSources[1].loop).toBe(true);
  });

  it('setEnabled(true) does not replay if last state was silence', async () => {
    const audio = new TowerSampleAudio();
    audio.setLibrary(LIB);
    audio.sync(0, false, 0); // disabled, but caches lastSample=0
    audio.setEnabled(true);
    await flush();
    expect(createdBufferSources).toHaveLength(0);
  });

  it('dispose closes the context and stops in-flight playback', async () => {
    const audio = new TowerSampleAudio();
    audio.setLibrary(LIB);
    audio.setEnabled(true);
    audio.sync(0x25, false, 0);
    await flush();

    const ctx = createdContexts[0];
    audio.dispose();

    expect(ctx.close).toHaveBeenCalled();
    expect(createdBufferSources[0].stopCalls).toBe(1);
  });

  it('dispose without ever syncing is a safe no-op', () => {
    const audio = new TowerSampleAudio();
    audio.dispose();
    expect(createdContexts).toHaveLength(0);
  });

  it('resumes a suspended AudioContext on first play', async () => {
    const audio = new TowerSampleAudio();
    audio.setLibrary(LIB);
    audio.setEnabled(true);

    ContextSpy.mockImplementationOnce(() => {
      const ctx = new MockAudioContext();
      ctx.state = 'suspended';
      createdContexts.push(ctx);
      return ctx;
    });

    audio.sync(0x25, false, 0);
    await flush();
    expect(createdContexts[0].resume).toHaveBeenCalled();
  });

  it('rapid sample switch: stale decode does not overwrite the newer source', async () => {
    const audio = new TowerSampleAudio();
    audio.setLibrary(LIB);
    audio.setEnabled(true);

    audio.sync(0x25, false, 0); // decode A in flight
    audio.sync(0x6E, false, 0); // decode B starts before A resolves
    await flush();

    // Only the newest sample should result in an active source.
    const activeSources = createdBufferSources.filter((s) => s.startCalls > 0);
    expect(activeSources).toHaveLength(1);
  });
});
