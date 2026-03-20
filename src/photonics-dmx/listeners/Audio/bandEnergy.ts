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
