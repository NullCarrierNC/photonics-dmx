/**
 * Key detection from chromagram using Krumhansl-Schmuckler key profiles.
 * Correlates input chroma with 24 profiles (12 major, 12 minor); returns best key and strength.
 */

const KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

/** C major profile (Krumhansl-Kessler) */
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
/** A minor profile (tonic at index 0 = A) */
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

function rotate(arr: number[], n: number): number[] {
  const len = arr.length
  const k = ((n % len) + len) % len
  return arr.slice(k).concat(arr.slice(0, k))
}

function correlation(a: number[], b: number[]): number {
  const n = a.length
  let sumA = 0
  let sumB = 0
  let sumAB = 0
  let sumA2 = 0
  let sumB2 = 0
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    sumA += x
    sumB += y
    sumAB += x * y
    sumA2 += x * x
    sumB2 += y * y
  }
  const nSumAB = n * sumAB - sumA * sumB
  const denom = Math.sqrt((n * sumA2 - sumA * sumA) * (n * sumB2 - sumB * sumB))
  return denom > 1e-10 ? nSumAB / denom : 0
}

export interface KeyDetectionResult {
  key: string
  mode: 'major' | 'minor'
  strength: number
}

const SMOOTH_ALPHA = 0.15

export class KeyDetector {
  private smoothedChroma: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  private readonly majorProfiles: number[][]
  private readonly minorProfiles: number[][]

  constructor() {
    this.majorProfiles = KEY_NAMES.map((_, i) => rotate(MAJOR_PROFILE, -i))
    this.minorProfiles = KEY_NAMES.map((_, i) => rotate(MINOR_PROFILE, (3 + i) % 12))
  }

  /**
   * Update smoothed chroma and return current key and strength.
   */
  detect(chroma: number[]): KeyDetectionResult {
    if (chroma.length !== 12) {
      return { key: 'C', mode: 'major', strength: 0 }
    }
    for (let i = 0; i < 12; i++) {
      this.smoothedChroma[i] =
        SMOOTH_ALPHA * (chroma[i] ?? 0) + (1 - SMOOTH_ALPHA) * (this.smoothedChroma[i] ?? 0)
    }
    const c = this.smoothedChroma
    let bestKey = 0
    let bestMode: 'major' | 'minor' = 'major'
    let bestCorr = -2
    for (let i = 0; i < 12; i++) {
      const rMajor = correlation(c, this.majorProfiles[i]!)
      if (rMajor > bestCorr) {
        bestCorr = rMajor
        bestKey = i
        bestMode = 'major'
      }
      const rMinor = correlation(c, this.minorProfiles[i]!)
      if (rMinor > bestCorr) {
        bestCorr = rMinor
        bestKey = i
        bestMode = 'minor'
      }
    }
    const strength = Math.max(0, Math.min(1, (bestCorr + 1) / 2))
    return {
      key: `${KEY_NAMES[bestKey]} ${bestMode}`,
      mode: bestMode,
      strength,
    }
  }

  reset(): void {
    this.smoothedChroma = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  }
}
