/**
 * Chromagram: fold FFT magnitude spectrum into 12 pitch classes (C, C#, …, B).
 * Uses A4 = 440 Hz as reference. Each bin contributes to the pitch class given by
 * round(12 * log2(freq / refFreq)) mod 12.
 */

const A4_HZ = 440
const MIN_MAG = 1 / 255

/**
 * Compute 12-dimensional chromagram from FFT magnitude data.
 * @param frequencyData - FFT magnitudes (0–255)
 * @param binSize - frequency resolution in Hz (sampleRate / fftSize)
 * @returns Array of 12 values (C=0, C#=1, …, B=11), normalised so max is 1
 */
export function computeChromagram(frequencyData: Uint8Array | number[], binSize: number): number[] {
  const chroma = new Array<number>(12).fill(0)
  const len = frequencyData.length
  for (let i = 0; i < len; i++) {
    const mag = (frequencyData[i] ?? 0) / 255
    if (mag < MIN_MAG) continue
    const freqHz = (i + 0.5) * binSize
    if (freqHz < 20) continue
    const semitonesFromA4 = 12 * Math.log2(freqHz / A4_HZ)
    const pitchClass = (Math.round(semitonesFromA4) + 9 + 12) % 12
    chroma[pitchClass] += mag
  }
  const max = Math.max(...chroma, 1e-10)
  return chroma.map((c) => c / max)
}
