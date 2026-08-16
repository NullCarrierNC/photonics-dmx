import type { AudioCueData } from '../cues/types/audioCueTypes'

/**
 * A second consumer of the audio frame stream, fed alongside the DMX lighting fan-out rather than
 * through it. It follows the same primary and strobe cue types the lighting side runs, and decides for
 * itself whether its look plays; {@link AudioCueProcessor} reads that decision to know whether the
 * lighting frame should be suppressed so the secondary runs solo.
 */
export interface AudioSecondaryRuntime {
  handleFrame(data: AudioCueData, primaryCueType: string | null, strobeCueType: string | null): void
  /** Whether the last frame played, and whether it wants the lighting suppressed for that frame. */
  getLastDispatchDecision(): { plays: boolean; suppress: boolean }
  /** Drop the running look, so silence does not leave the last frame held. */
  blank(): void
}
