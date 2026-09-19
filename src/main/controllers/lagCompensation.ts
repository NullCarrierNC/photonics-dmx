import { normalizeLagCompensationMs } from '../../shared/lagCompensation'

/** Which inputs are currently driving the rig. */
export interface LagCompensationSources {
  isRb3Enabled: () => boolean
  isYargEnabled: () => boolean
  isAudioEnabled: () => boolean
}

/** Reads the two stored delays. */
export interface LagCompensationPrefs {
  getVideoLagCompensationMs: () => unknown
  getAudioLagCompensationMs: () => unknown
}

/**
 * Picks the delay for whatever is driving the rig.
 *
 * Audio carries its own value because an AV chain delays sound and picture by different amounts,
 * and a loopback capture is early where a room microphone is late.
 *
 * Precedence is RB3E over YARG over audio, matching `useCuePreviewInputPlatform`. Audio wins only
 * when nothing else is listening. Nothing enabled means the Cue Simulator or the Console is
 * driving, both watched on a display, so the video value applies there too.
 */
export function resolveLagCompensationMs(
  sources: LagCompensationSources,
  prefs: LagCompensationPrefs,
): number {
  const audioOwnsOutput =
    sources.isAudioEnabled() && !sources.isRb3Enabled() && !sources.isYargEnabled()
  return normalizeLagCompensationMs(
    audioOwnsOutput ? prefs.getAudioLagCompensationMs() : prefs.getVideoLagCompensationMs(),
  )
}
