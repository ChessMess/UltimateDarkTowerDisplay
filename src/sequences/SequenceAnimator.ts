import gsap from 'gsap';
import type { SequenceAnimatorDeps } from './builders/types';
import { JSON_SEQUENCE_DATA, hasSequenceAnimation } from './jsonSequences';
import * as SequencePlayer from './SequencePlayer';

export type { SequenceAnimatorDeps } from './builders/types';
export { hasSequenceAnimation };

type GSAPTimeline = ReturnType<typeof gsap.timeline>;

/**
 * Drives the active firmware-style led_sequence on top of the per-LED renderer.
 * One active timeline at a time; identical-id reapplies are no-ops, distinct
 * ids cancel-and-restart. Returns whether a sequence is currently driving the
 * LEDs so callers can suppress their normal per-LED replay.
 *
 * Backed exclusively by the JSON-driven `SequencePlayer`. Sequence data lives
 * in `src/sequences/data/*.json`, parsed at module load into
 * `JSON_SEQUENCE_DATA`.
 */
export class SequenceAnimator {
  private currentTimeline: GSAPTimeline | null = null;
  private currentSequenceId = 0;

  constructor(private readonly deps: SequenceAnimatorDeps) {}

  apply(sequenceId: number, onComplete: () => void): boolean {
    if (sequenceId === 0) {
      this.stop();
      return false;
    }
    if (sequenceId === this.currentSequenceId && this.currentTimeline) {
      return true;
    }
    this.stop();

    const json = JSON_SEQUENCE_DATA.get(sequenceId);
    if (!json) return false;
    const timeline = SequencePlayer.build(
      json,
      this.deps,
      this.wrapComplete(onComplete),
    );
    if (!timeline) return false;
    this.currentSequenceId = sequenceId;
    this.currentTimeline = timeline;
    return true;
  }

  stop(): void {
    this.currentTimeline?.kill();
    this.currentTimeline = null;
    this.currentSequenceId = 0;
  }

  isActive(sequenceId: number): boolean {
    return this.currentSequenceId === sequenceId && this.currentTimeline !== null;
  }

  dispose(): void {
    this.stop();
  }

  private wrapComplete(onComplete: () => void): () => void {
    return () => {
      this.currentSequenceId = 0;
      this.currentTimeline = null;
      onComplete();
    };
  }
}
