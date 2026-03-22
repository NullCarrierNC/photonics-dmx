/**
 * Repeatable fixtures for beat detection benchmarks.
 * Synthetic FFT-like frames with known ground-truth beat times and BPM.
 */

export interface BeatDetectionFixtureFrame {
  timeMs: number
  analysisEnergy: number
  bassEnergy: number
  spectrumData: number[]
  binSize: number
  /** Ground truth: beat on this frame */
  expectedBeat?: boolean
}

export interface BeatDetectionFixture {
  name: string
  bpm: number
  durationMs: number
  framesPerSecond: number
  frames: BeatDetectionFixtureFrame[]
  /** Ground truth beat times in ms */
  expectedBeatTimesMs: number[]
}

const BASS_BINS = 8
const DEFAULT_BIN_SIZE = 44100 / 2048

/**
 * Build a synthetic fixture: constant baseline with periodic energy spikes at beat times.
 */
export function buildSyntheticFixture(
  bpm: number,
  durationMs: number,
  framesPerSecond: number,
  options?: {
    baselineEnergy?: number
    beatEnergy?: number
    spectrumLength?: number
    binSize?: number
  },
): BeatDetectionFixture {
  const baselineEnergy = options?.baselineEnergy ?? 0.08
  const beatEnergy = options?.beatEnergy ?? 0.6
  const spectrumLength = options?.spectrumLength ?? 1024
  const binSize = options?.binSize ?? DEFAULT_BIN_SIZE

  const beatPeriodMs = 60000 / bpm
  const expectedBeatTimesMs: number[] = []
  for (let t = 0; t < durationMs; t += beatPeriodMs) {
    expectedBeatTimesMs.push(t)
  }

  const frames: BeatDetectionFixtureFrame[] = []
  const msPerFrame = 1000 / framesPerSecond

  for (let i = 0; i < Math.ceil((durationMs / 1000) * framesPerSecond); i++) {
    const timeMs = i * msPerFrame
    const isBeatFrame = expectedBeatTimesMs.some((bt) => Math.abs(timeMs - bt) < msPerFrame * 1.5)
    const energy = isBeatFrame ? beatEnergy : baselineEnergy
    const bass = isBeatFrame ? beatEnergy * 0.9 : baselineEnergy * 0.5

    const spectrumData = new Array(spectrumLength).fill(0)
    for (let b = 0; b < BASS_BINS; b++) {
      spectrumData[b] = Math.min(255, (isBeatFrame ? 200 : 30) + b * 2)
    }
    for (let b = BASS_BINS; b < spectrumLength; b++) {
      spectrumData[b] = isBeatFrame ? 40 : 20
    }

    frames.push({
      timeMs,
      analysisEnergy: energy,
      bassEnergy: bass,
      spectrumData,
      binSize,
      expectedBeat: isBeatFrame,
    })
  }

  return {
    name: `synthetic_${bpm}bpm_${durationMs}ms`,
    bpm,
    durationMs,
    framesPerSecond,
    frames,
    expectedBeatTimesMs,
  }
}

/**
 * Fixture that mimics low-energy / noisy input (few or no beats expected).
 */
export function buildQuietFixture(
  durationMs: number,
  framesPerSecond: number,
): BeatDetectionFixture {
  const spectrumLength = 1024
  const binSize = DEFAULT_BIN_SIZE
  const msPerFrame = 1000 / framesPerSecond
  const frameCount = Math.ceil((durationMs / 1000) * framesPerSecond)
  const frames: BeatDetectionFixtureFrame[] = []

  for (let i = 0; i < frameCount; i++) {
    const timeMs = i * msPerFrame
    const t = (i % 17) / 17
    frames.push({
      timeMs,
      analysisEnergy: 0.03 + t * 0.02,
      bassEnergy: 0.02,
      spectrumData: new Array(spectrumLength).fill(15 + (i % 10)),
      binSize,
      expectedBeat: false,
    })
  }

  return {
    name: 'quiet_noise',
    bpm: 0,
    durationMs,
    framesPerSecond,
    frames,
    expectedBeatTimesMs: [],
  }
}
