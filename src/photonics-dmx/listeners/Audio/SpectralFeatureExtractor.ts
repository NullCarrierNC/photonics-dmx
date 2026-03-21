/**
 * Stateless spectral feature extraction from FFT magnitude data.
 * All methods accept AnalyserNode-style data (Uint8Array 0–255) and return 0–1 normalised values.
 */

const EPSILON = 1e-10

export interface SpectralFeatures {
  spectralCentroid: number
  spectralFlatness: number
  spectralRolloff: number
  spectralCrest: number
  spectralSpread: number
  hfcOnset: number
  zeroCrossingRate: number
}

/**
 * Spectral centroid: weighted mean frequency (perceived brightness).
 * Normalised to 0–1 against Nyquist (sampleRate/2).
 */
export function spectralCentroid(
  data: Uint8Array | number[],
  binSize: number,
  nyquistHz?: number,
): number {
  let sumMag = 0
  let sumFreqMag = 0
  const len = data.length
  for (let i = 0; i < len; i++) {
    const mag = (data[i] ?? 0) / 255
    const freq = (i + 0.5) * binSize
    sumMag += mag
    sumFreqMag += freq * mag
  }
  if (sumMag < EPSILON) return 0
  const centroidHz = sumFreqMag / sumMag
  const nyquist = nyquistHz ?? len * binSize
  return nyquist > 0 ? Math.min(1, centroidHz / nyquist) : 0
}

/**
 * Spectral flatness: geometric mean / arithmetic mean. 0 = tonal, 1 = noise-like.
 */
export function spectralFlatness(data: Uint8Array | number[]): number {
  const len = data.length
  let sumLog = 0
  let sum = 0
  let count = 0
  for (let i = 0; i < len; i++) {
    const mag = (data[i] ?? 0) / 255 + EPSILON
    sumLog += Math.log(mag)
    sum += mag
    count++
  }
  if (count === 0 || sum < EPSILON) return 0
  const geoMean = Math.exp(sumLog / count)
  const arithMean = sum / count
  return arithMean > EPSILON ? Math.min(1, geoMean / arithMean) : 0
}

/**
 * Spectral rolloff: frequency below which cutoff (default 0.85) of energy sits.
 * Normalised to 0–1 against Nyquist.
 */
export function spectralRolloff(
  data: Uint8Array | number[],
  binSize: number,
  cutoff = 0.85,
  nyquistHz?: number,
): number {
  let total = 0
  const len = data.length
  for (let i = 0; i < len; i++) {
    total += (data[i] ?? 0) / 255
  }
  if (total < EPSILON) return 0
  const threshold = total * cutoff
  let cum = 0
  for (let i = 0; i < len; i++) {
    cum += (data[i] ?? 0) / 255
    if (cum >= threshold) {
      const rolloffHz = (i + 0.5) * binSize
      const nyquist = nyquistHz ?? len * binSize
      return nyquist > 0 ? Math.min(1, rolloffHz / nyquist) : 0
    }
  }
  const nyquist = nyquistHz ?? len * binSize
  return nyquist > 0 ? Math.min(1, (len * binSize) / nyquist) : 0
}

/**
 * Spectral crest: max magnitude / mean magnitude (peakiness).
 */
export function spectralCrest(data: Uint8Array | number[]): number {
  const len = data.length
  if (len === 0) return 0
  let max = 0
  let sum = 0
  for (let i = 0; i < len; i++) {
    const mag = (data[i] ?? 0) / 255
    if (mag > max) max = mag
    sum += mag
  }
  const mean = sum / len
  return mean > EPSILON ? Math.min(1, max / mean) : 0
}

/**
 * High-frequency content: sum(k * mag[k]^2). Good for percussive onset detection.
 */
export function hfc(data: Uint8Array | number[]): number {
  const len = data.length
  let sum = 0
  for (let k = 0; k < len; k++) {
    const mag = (data[k] ?? 0) / 255
    sum += (k + 1) * mag * mag
  }
  const normaliser = (len * (len + 1)) / 2
  return normaliser > 0 ? Math.min(1, sum / normaliser) : 0
}

/**
 * Spectral spread: second central moment around centroid (bandwidth).
 */
export function spectralSpread(
  data: Uint8Array | number[],
  binSize: number,
  centroidHz: number,
  nyquistHz?: number,
): number {
  let sumMag = 0
  let sumSq = 0
  const len = data.length
  for (let i = 0; i < len; i++) {
    const mag = (data[i] ?? 0) / 255
    const freq = (i + 0.5) * binSize
    const diff = freq - centroidHz
    sumMag += mag
    sumSq += mag * diff * diff
  }
  if (sumMag < EPSILON) return 0
  const variance = sumSq / sumMag
  const spreadHz = Math.sqrt(Math.max(0, variance))
  const nyquist = nyquistHz ?? len * binSize
  return nyquist > 0 ? Math.min(1, spreadHz / nyquist) : 0
}

/**
 * Zero-crossing rate: fraction of samples where sign changes. Percussive vs sustained.
 */
export function zeroCrossingRate(timeDomainData: Float32Array): number {
  const len = timeDomainData.length
  if (len < 2) return 0
  let crossings = 0
  for (let i = 1; i < len; i++) {
    if (
      (timeDomainData[i - 1]! >= 0 && timeDomainData[i]! < 0) ||
      (timeDomainData[i - 1]! < 0 && timeDomainData[i]! >= 0)
    ) {
      crossings++
    }
  }
  return Math.min(1, crossings / (len - 1))
}

/**
 * Extract all spectral features for one frame.
 */
export interface BandSpectralFeatures {
  /** 0–1, noise vs tonal within this band */
  flatness: number
  /** 0–1, peakiness within this band */
  crest: number
  /** 0–1, centre of energy within this band (normalised between bandMinHz and bandMaxHz) */
  centroid: number
}

/**
 * Flatness, crest, and centroid for an FFT slice [startBin, endBin).
 * Centroid is the energy-weighted mean frequency in Hz, mapped to 0–1 across the band Hz span.
 */
function fftSlice(
  data: Uint8Array | number[],
  startBin: number,
  endBin: number,
): Uint8Array | number[] {
  if (data instanceof Uint8Array) {
    return data.subarray(startBin, endBin)
  }
  return data.slice(startBin, endBin)
}

export function extractBandFeatures(
  data: Uint8Array | number[],
  binSize: number,
  startBin: number,
  endBin: number,
  bandMinHz: number,
  bandMaxHz: number,
): BandSpectralFeatures {
  const len = Math.max(0, endBin - startBin)
  if (len === 0) {
    return { flatness: 0, crest: 0, centroid: 0 }
  }
  const slice = fftSlice(data, startBin, endBin)
  const flatness = spectralFlatness(slice)
  const crest = spectralCrest(slice)

  let sumMag = 0
  let sumFreqMag = 0
  for (let i = 0; i < len; i++) {
    const mag = (slice[i] ?? 0) / 255
    const freq = (startBin + i + 0.5) * binSize
    sumMag += mag
    sumFreqMag += freq * mag
  }
  const span = bandMaxHz - bandMinHz
  if (sumMag < EPSILON || span <= EPSILON) {
    return { flatness, crest, centroid: 0 }
  }
  const centroidHz = sumFreqMag / sumMag
  const centroid = Math.min(1, Math.max(0, (centroidHz - bandMinHz) / span))
  return { flatness, crest, centroid }
}

export function extractAll(
  frequencyData: Uint8Array | number[],
  timeDomainData: Float32Array | null,
  binSize: number,
  sampleRate: number,
): SpectralFeatures {
  const nyquistHz = sampleRate / 2
  const centroidNorm = spectralCentroid(frequencyData, binSize, nyquistHz)
  const centroidHz = centroidNorm * nyquistHz
  return {
    spectralCentroid: centroidNorm,
    spectralFlatness: spectralFlatness(frequencyData),
    spectralRolloff: spectralRolloff(frequencyData, binSize, 0.85, nyquistHz),
    spectralCrest: spectralCrest(frequencyData),
    spectralSpread: spectralSpread(frequencyData, binSize, centroidHz, nyquistHz),
    hfcOnset: hfc(frequencyData),
    zeroCrossingRate: timeDomainData ? zeroCrossingRate(timeDomainData) : 0,
  }
}
