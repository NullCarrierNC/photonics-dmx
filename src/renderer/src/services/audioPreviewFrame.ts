/**
 * Decides whether an analysis frame is different enough to be worth pushing at the preview.
 *
 * Beat and tempo changes always count. Everything else has to move: energy by more than the
 * threshold, or one of three sampled FFT bins by more than 2 of its 255 steps.
 */
import type { AudioLightingData } from '../../../photonics-dmx/listeners/Audio/AudioTypes'

/** How far apart two sampled bin values must be to count as a change. */
const BIN_CHANGE_STEPS = 2

export function previewFrameChanged(
  previous: AudioLightingData | null,
  next: AudioLightingData,
  energyThreshold: number,
): boolean {
  if (!previous) {
    return true
  }
  if (next.beatDetected !== previous.beatDetected) {
    return true
  }
  if (next.bpm !== previous.bpm) {
    return true
  }
  if ((next.bpmConfidence ?? 0) !== (previous.bpmConfidence ?? 0)) {
    return true
  }
  if (Math.abs(next.energy - previous.energy) > energyThreshold) {
    return true
  }

  const nextRaw = next.rawFrequencyData
  const previousRaw = previous.rawFrequencyData
  if (nextRaw && previousRaw && nextRaw.length === previousRaw.length) {
    // Low, middle and high, which is enough to catch a moving spectrum without comparing it all.
    const sampled = [0, Math.floor(nextRaw.length / 2), nextRaw.length - 1]
    return sampled.some((index) => Math.abs(nextRaw[index] - previousRaw[index]) > BIN_CHANGE_STEPS)
  }
  return nextRaw !== previousRaw
}
