/**
 * Beat detection state and algorithm for reuse in AudioCaptureManager and tests.
 * Uses multi-feature onset envelope, noise-floor normalisation, and tempo-aware gating.
 */

export interface BeatDetectionConfig {
  threshold: number
  decayRate: number
  minInterval: number
}

const DEFAULT_BEAT_CONFIG: BeatDetectionConfig = {
  threshold: 0.3,
  decayRate: 0.8,
  minInterval: 100,
}

const ENERGY_HISTORY_SIZE = 43
const SPECTRAL_HISTORY_SIZE = 86
const SHORT_ENERGY_HISTORY_SIZE = 12
const MAX_BEAT_HISTORY = 8
const MINIMUM_ENERGY_FOR_BEAT = 0.05
const MAX_BEAT_FREQUENCY = 2000
const NOISE_FLOOR_MIN = 0.01
const NOISE_FLOOR_DECAY = 0.9995
const DOUBLE_TRIGGER_WINDOW = 0.25

export interface BeatDetectorResult {
  beatDetected: boolean
  bpm: number | null
  bpmConfidence: number
}

function computeStats(values: number[]): { mean: number; stdDev: number; count: number } {
  const count = values.length
  if (count === 0) return { mean: 0, stdDev: 0, count }
  const mean = values.reduce((sum, value) => sum + value, 0) / count
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / count
  return { mean, stdDev: Math.sqrt(variance), count }
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

export class BeatDetector {
  private config: BeatDetectionConfig
  private lastBeatTime = 0
  private energyHistory: number[] = []
  private bassEnergyHistory: number[] = []
  private spectralFluxHistory: number[] = []
  private recentEnergyHistory: number[] = []
  private previousSpectrum: Float32Array | null = null
  private beatTimestamps: number[] = []
  private currentBpm: number | null = null
  private bpmConfidence = 0
  private noiseFloor = 0.02

  constructor(config?: Partial<BeatDetectionConfig>) {
    this.config = { ...DEFAULT_BEAT_CONFIG, ...config }
  }

  updateConfig(config: Partial<BeatDetectionConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Process one frame and return beat/BPM result.
   * @param timeMs - Monotonic time in ms (caller-driven, e.g. from performance.now() or fixture time)
   */
  processFrame(
    analysisEnergy: number,
    bassEnergy: number,
    spectrumData: Uint8Array | number[],
    binSize: number,
    timeMs: number,
  ): BeatDetectorResult {
    if (analysisEnergy < this.noiseFloor * 1.2) {
      this.noiseFloor = Math.max(NOISE_FLOOR_MIN, Math.min(this.noiseFloor * 1.001, analysisEnergy))
    } else {
      this.noiseFloor = Math.max(NOISE_FLOOR_MIN, this.noiseFloor * NOISE_FLOOR_DECAY)
    }
    const normalisedEnergy = Math.max(0, analysisEnergy - this.noiseFloor)

    this.energyHistory.push(normalisedEnergy)
    if (this.energyHistory.length > ENERGY_HISTORY_SIZE) this.energyHistory.shift()
    const energyStats = computeStats(this.energyHistory)

    this.recentEnergyHistory.push(normalisedEnergy)
    if (this.recentEnergyHistory.length > SHORT_ENERGY_HISTORY_SIZE) {
      this.recentEnergyHistory.shift()
    }
    const shortEnergyStats = computeStats(this.recentEnergyHistory)

    this.bassEnergyHistory.push(bassEnergy)
    if (this.bassEnergyHistory.length > ENERGY_HISTORY_SIZE) this.bassEnergyHistory.shift()
    const avgBass =
      this.bassEnergyHistory.length > 0
        ? this.bassEnergyHistory.reduce((s, v) => s + v, 0) / this.bassEnergyHistory.length
        : 0

    const spectralFlux = this.computeSpectralFlux(spectrumData, binSize)
    this.spectralFluxHistory.push(spectralFlux)
    if (this.spectralFluxHistory.length > SPECTRAL_HISTORY_SIZE) {
      this.spectralFluxHistory.shift()
    }
    const fluxStats = computeStats(this.spectralFluxHistory)

    const bassRise = Math.max(0, bassEnergy - avgBass)
    const fluxNorm =
      fluxStats.stdDev > 1e-6
        ? Math.max(0, Math.min(1, (spectralFlux - fluxStats.mean) / (fluxStats.stdDev * 2)))
        : 0
    const bassRiseNorm = avgBass > 1e-6 ? Math.min(1, bassRise / (avgBass * 2)) : 0
    const onsetEnvelope = 0.6 * fluxNorm + 0.4 * bassRiseNorm
    const onsetThreshold = 0.25 + this.config.threshold * 0.5
    const fluxGate = fluxStats.count >= 4 && onsetEnvelope > onsetThreshold

    const dynamicEnergyMultiplier = 0.35 + this.config.threshold * 0.45
    const dynamicEnergyThreshold = energyStats.mean + energyStats.stdDev * dynamicEnergyMultiplier
    const minEnergyGate = Math.max(MINIMUM_ENERGY_FOR_BEAT, dynamicEnergyThreshold)
    const energyGate = normalisedEnergy > minEnergyGate

    const bassMultiplier = 1 + this.config.threshold * 0.75
    const bassBaseline = avgBass > 0 ? avgBass * bassMultiplier : MINIMUM_ENERGY_FOR_BEAT * 0.5
    const bassGate = bassEnergy > bassBaseline

    const shortTermGate =
      shortEnergyStats.count >= 4
        ? normalisedEnergy > shortEnergyStats.mean * (1.05 + this.config.threshold * 0.3)
        : false

    const previousEnergy =
      this.energyHistory.length > 1
        ? this.energyHistory[this.energyHistory.length - 2]!
        : normalisedEnergy
    const energyDelta = normalisedEnergy - previousEnergy
    const derivativeGate =
      energyDelta > energyStats.stdDev * (0.3 + this.config.threshold * 0.25) + 0.01

    const combinedEnergyGate = energyGate || shortTermGate || derivativeGate
    const timeSinceLastBeat = timeMs - this.lastBeatTime

    let doubleTriggerSuppress = false
    if (this.currentBpm !== null && this.currentBpm >= 40 && this.currentBpm <= 200) {
      const beatPeriodMs = 60000 / this.currentBpm
      if (timeSinceLastBeat < DOUBLE_TRIGGER_WINDOW * beatPeriodMs) {
        doubleTriggerSuppress = true
      }
    }

    const minIntervalOk = timeSinceLastBeat > this.config.minInterval
    const candidateBeat =
      ((fluxGate && (combinedEnergyGate || bassGate)) ||
        ((shortTermGate || derivativeGate) && bassGate)) &&
      minIntervalOk &&
      !doubleTriggerSuppress

    let beatDetected = false
    if (candidateBeat) {
      beatDetected = true
      this.lastBeatTime = timeMs
      this.beatTimestamps.push(timeMs)
      if (this.beatTimestamps.length > MAX_BEAT_HISTORY) this.beatTimestamps.shift()

      if (this.beatTimestamps.length >= 4) {
        const intervals: number[] = []
        for (let i = 1; i < this.beatTimestamps.length; i++) {
          intervals.push(this.beatTimestamps[i]! - this.beatTimestamps[i - 1]!)
        }
        const medianInterval = median(intervals)
        const filtered = intervals.filter(
          (d) => d >= medianInterval * 0.5 && d <= medianInterval * 1.5,
        )
        if (filtered.length >= 2) {
          const meanInterval = filtered.reduce((s, d) => s + d, 0) / filtered.length
          const variance =
            filtered.reduce((s, d) => s + (d - meanInterval) ** 2, 0) / filtered.length
          const stdInterval = Math.sqrt(variance)
          const calculatedBpm = Math.round(60000 / meanInterval)
          if (calculatedBpm >= 40 && calculatedBpm <= 200) {
            this.currentBpm = calculatedBpm
            const cv = meanInterval > 1e-6 ? stdInterval / meanInterval : 1
            this.bpmConfidence = Math.max(0, Math.min(1, 1 - cv))
          }
        }
      }
    }

    return {
      beatDetected,
      bpm: this.currentBpm,
      bpmConfidence: this.bpmConfidence,
    }
  }

  private computeSpectralFlux(spectrumData: Uint8Array | number[], binSize: number): number {
    const length = spectrumData.length
    const invByteMax = 1 / 255
    const hadPrevious = this.previousSpectrum && this.previousSpectrum.length === length
    if (!hadPrevious) this.previousSpectrum = new Float32Array(length)

    if (!hadPrevious || !this.previousSpectrum) {
      for (let i = 0; i < length; i++) {
        this.previousSpectrum![i] = (spectrumData[i] ?? 0) * invByteMax
      }
      return 0
    }

    const maxBin = Math.min(length, Math.max(1, Math.floor(MAX_BEAT_FREQUENCY / binSize)))
    let flux = 0
    for (let i = 0; i < maxBin; i++) {
      const current = (spectrumData[i] ?? 0) * invByteMax
      const diff = current - this.previousSpectrum[i]!
      if (diff > 0) {
        flux += diff * (1 - (i / maxBin) * 0.4)
      }
      this.previousSpectrum[i] = current
    }
    for (let i = maxBin; i < length; i++) {
      this.previousSpectrum[i] = (spectrumData[i] ?? 0) * invByteMax
    }
    return flux
  }

  reset(): void {
    this.lastBeatTime = 0
    this.energyHistory = []
    this.bassEnergyHistory = []
    this.spectralFluxHistory = []
    this.recentEnergyHistory = []
    this.previousSpectrum = null
    this.beatTimestamps = []
    this.currentBpm = null
    this.bpmConfidence = 0
    this.noiseFloor = 0.02
  }
}
