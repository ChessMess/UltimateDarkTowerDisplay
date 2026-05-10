/**
 * Plays decoded tower-sample audio (state.audio.sample / loop / volume).
 *
 * - The library is a sparse map from sample id (TOWER_AUDIO_LIBRARY values,
 *   0x01–0x71) to URL. Unmapped ids warn-once and stop playback.
 * - `sample === 0` means silence; current playback fades out.
 * - volume === 3 is treated as mute (gain 0); all other values play at full
 *   volume (gain 1).
 * - Decoded buffers are cached per sample id. A monotonic decode token is
 *   used to bail out of stale loads when a newer sync supersedes them.
 *
 * Mirrors `DrumRotationAudio` in lifecycle: lazy AudioContext, opt-in via
 * `setEnabled(true)`, single GainNode, short fade on stop to avoid clicks.
 */
const DEFAULT_GAIN = 1.0;
const STOP_FADE_SEC = 0.08;

export class TowerSampleAudio {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private library: Record<number, string> = {};
  private readonly buffers = new Map<number, AudioBuffer>();
  private readonly warned = new Set<number>();
  private decodeToken = 0;
  private enabled = false;

  private lastSample: number | null = null;
  private lastLoop: boolean | null = null;
  private lastVolume: number | null = null;

  /** Replace the sample-id → URL map. Cached buffers are dropped. */
  setLibrary(library: Record<number, string>): void {
    this.library = library;
    this.buffers.clear();
    this.warned.clear();
  }

  /**
   * Enable or disable playback. Disabled by default. Toggling on while a
   * non-silent sample is the current state will re-play it (so users who
   * enable audio mid-loop hear the loop without waiting for the next state).
   */
  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) {
      this.stop();
      return;
    }
    if (this.lastSample !== null && this.lastSample !== 0) {
      void this.play(this.lastSample, this.lastLoop ?? false, this.lastVolume ?? 0);
    }
  }

  /** Reconcile playback with the latest decoded state.audio fields. */
  sync(sample: number, loop: boolean, volume: number): void {
    const sampleChanged = sample !== this.lastSample;
    const loopChanged = loop !== this.lastLoop;
    const volumeChanged = volume !== this.lastVolume;
    this.lastSample = sample;
    this.lastLoop = loop;
    this.lastVolume = volume;

    if (!this.enabled) return;

    if (sample === 0) {
      this.stop();
      return;
    }

    if (sampleChanged || loopChanged) {
      void this.play(sample, loop, volume);
    } else if (volumeChanged) {
      this.applyGain(volume);
    }
  }

  /** Hard stop with a short fade. Safe to call when nothing is playing. */
  stop(): void {
    if (!this.ctx || !this.gain || !this.source) return;
    const now = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(this.gain.gain.value, now);
    this.gain.gain.linearRampToValueAtTime(0, now + STOP_FADE_SEC);
    const src = this.source;
    this.source = null;
    try {
      src.stop(now + STOP_FADE_SEC);
    } catch {
      // already stopped — safe to ignore
    }
  }

  dispose(): void {
    this.enabled = false;
    this.decodeToken++;
    this.stopImmediate();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.gain = null;
    this.buffers.clear();
    this.warned.clear();
    this.lastSample = null;
    this.lastLoop = null;
    this.lastVolume = null;
  }

  private async play(sample: number, loop: boolean, volume: number): Promise<void> {
    const url = this.library[sample];
    if (!url) {
      if (!this.warned.has(sample)) {
        this.warned.add(sample);
        // eslint-disable-next-line no-console
        console.warn(`[TowerSampleAudio] no asset mapped for sample 0x${sample.toString(16)}`);
      }
      this.stop();
      return;
    }

    const ctx = this.ensureCtx(true);
    const token = ++this.decodeToken;

    let buffer = this.buffers.get(sample);
    if (!buffer) {
      try {
        const res = await fetch(url);
        const arr = await res.arrayBuffer();
        buffer = await ctx.decodeAudioData(arr);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[TowerSampleAudio] failed to load', url, err);
        return;
      }
      if (token !== this.decodeToken) return;
      this.buffers.set(sample, buffer);
    }

    if (token !== this.decodeToken) return;

    this.stopImmediate();

    if (!this.gain) {
      this.gain = ctx.createGain();
      this.gain.connect(ctx.destination);
    }
    const now = ctx.currentTime;
    const target = volume === 3 ? 0.0 : DEFAULT_GAIN;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(target, now);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = loop;
    src.connect(this.gain);
    src.start();
    this.source = src;
  }

  private stopImmediate(): void {
    if (!this.source) return;
    const src = this.source;
    this.source = null;
    try {
      src.stop();
    } catch {
      // already stopped — safe to ignore
    }
  }

  private applyGain(volume: number): void {
    if (!this.ctx || !this.gain) return;
    const now = this.ctx.currentTime;
    const target = volume === 3 ? 0.0 : DEFAULT_GAIN;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(target, now);
  }

  private ensureCtx(resume: boolean): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (resume && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }
}
