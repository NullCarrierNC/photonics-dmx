/**
 * Mel-scale filterbank for perceptually spaced frequency bands.
 * Uses HTK formula: mel = 2595 * log10(1 + f / 700).
 */

const LOW_HZ = 0
const DEFAULT_NUM_BANDS = 24

function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700)
}

function melToHz(mel: number): number {
  return 700 * (Math.pow(10, mel / 2595) - 1)
}

/**
 * Precomputed triangular mel filterbank: for each band, an array of (binIndex, weight).
 * Bands are equally spaced in mel from 0 to Nyquist.
 */
export class MelBandAnalyser {
  private readonly sampleRate: number
  private readonly numBands: number
  private readonly binSize: number
  private readonly frequencyBinCount: number
  /** Per band: array of [bin index, weight] for bins with non-zero weight */
  private readonly filterbank: Array<Array<[number, number]>>

  constructor(sampleRate: number, fftSize: number, numBands: number = DEFAULT_NUM_BANDS) {
    this.sampleRate = sampleRate
    this.numBands = numBands
    this.binSize = sampleRate / fftSize
    this.frequencyBinCount = fftSize >> 1
    this.filterbank = this.buildFilterbank()
  }

  private buildFilterbank(): Array<Array<[number, number]>> {
    const nyquistHz = this.sampleRate / 2
    const lowMel = hzToMel(LOW_HZ)
    const highMel = hzToMel(nyquistHz)
    const bandEdgesMel: number[] = []
    for (let i = 0; i <= this.numBands + 1; i++) {
      bandEdgesMel.push(lowMel + (highMel - lowMel) * (i / (this.numBands + 1)))
    }
    const bandEdgesHz = bandEdgesMel.map(melToHz)
    const bandEdgesBin = bandEdgesHz.map((hz) =>
      Math.min(this.frequencyBinCount - 1, Math.max(0, Math.floor(hz / this.binSize))),
    )

    const filters: Array<Array<[number, number]>> = []
    for (let b = 0; b < this.numBands; b++) {
      const left = bandEdgesBin[b]!
      const center = bandEdgesBin[b + 1]!
      const right = bandEdgesBin[b + 2]!
      const coeffs: Array<[number, number]> = []
      for (let k = left; k <= right; k++) {
        let weight = 0
        if (k <= center) {
          weight = left < center ? (k - left) / (center - left) : 1
        } else {
          weight = center < right ? (right - k) / (right - center) : 1
        }
        if (weight > 0) coeffs.push([k, weight])
      }
      filters.push(coeffs)
    }
    return filters
  }

  /**
   * Compute mel band energies from FFT magnitude data (0–255).
   * Returns array of length numBands, each value 0–1 normalised.
   */
  computeMelBands(frequencyData: Uint8Array | number[]): number[] {
    const result: number[] = []
    for (let b = 0; b < this.numBands; b++) {
      let sum = 0
      const coeffs = this.filterbank[b]!
      for (let i = 0; i < coeffs.length; i++) {
        const [bin, weight] = coeffs[i]!
        const mag = (frequencyData[bin] ?? 0) / 255
        sum += weight * mag
      }
      result.push(Math.min(1, sum))
    }
    return result
  }
}
