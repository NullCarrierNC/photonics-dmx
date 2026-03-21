/**
 * Shared band energy calculation for EQ preview and audio-trigger nodes.
 * Ensures identical 0-1 normalized energy so preview bars and node thresholds align.
 */

/**
 * Compute normalized energy (0-1) in a frequency range from raw FFT byte data.
 * Average of normalized bin values in the range; same algorithm used by
 * AudioNodeCue trigger nodes so EQ bars and trigger thresholds match.
 */
export function getBandEnergy(
  rawData: number[],
  sampleRate: number,
  fftSize: number,
  minHz: number,
  maxHz: number,
): number {
  if (!rawData.length || sampleRate <= 0 || fftSize <= 0) return 0
  const binSize = sampleRate / fftSize
  const startBin = Math.floor(minHz / binSize)
  const endBin = Math.min(Math.ceil(maxHz / binSize), rawData.length)
  let energy = 0
  let count = 0
  for (let i = startBin; i < endBin; i++) {
    energy += rawData[i] / 255
    count++
  }
  return count > 0 ? Math.min(Math.max(energy / count, 0), 1) : 0
}

/**
 * Picks the configured band whose Hz range overlaps the trigger range most (by overlap / trigger span).
 * Returns null if overlap is below minOverlapRatio of the trigger span.
 */
export function findBestMatchingBandId(
  bands: readonly { id: string; minHz: number; maxHz: number }[],
  triggerMinHz: number,
  triggerMaxHz: number,
  minOverlapRatio = 0.25,
): string | null {
  const t0 = Math.min(triggerMinHz, triggerMaxHz)
  const t1 = Math.max(triggerMinHz, triggerMaxHz)
  const triggerSpan = t1 - t0
  if (triggerSpan <= 0) return null

  let bestId: string | null = null
  let bestScore = -1
  for (const band of bands) {
    const lo = Math.max(t0, band.minHz)
    const hi = Math.min(t1, band.maxHz)
    const overlap = Math.max(0, hi - lo)
    const score = overlap / triggerSpan
    if (score > bestScore) {
      bestScore = score
      bestId = band.id
    }
  }
  return bestScore >= minOverlapRatio ? bestId : null
}
