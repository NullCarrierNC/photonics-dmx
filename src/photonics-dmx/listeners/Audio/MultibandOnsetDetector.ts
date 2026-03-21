/**
 * Per-band spectral-flux onset strength (0–1) from half-wave rectified frame-to-frame differences.
 */

export interface BandOnsetConfig {
  id: string
  /** Inclusive start bin index */
  startBin: number
  /** Exclusive end bin index (same convention as getBandEnergy) */
  endBin: number
}

function computeStats(values: number[]): { mean: number; stdDev: number; count: number } {
  const count = values.length
  if (count === 0) return { mean: 0, stdDev: 0, count }
  const mean = values.reduce((sum, value) => sum + value, 0) / count
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / count
  return { mean, stdDev: Math.sqrt(variance), count }
}

const DEFAULT_HISTORY_SIZE = 86

export class MultibandOnsetDetector {
  private bands: BandOnsetConfig[] = []
  private readonly historySize: number
  private prevSlices = new Map<string, Float32Array>()
  private fluxHistory = new Map<string, number[]>()

  constructor(bands: BandOnsetConfig[], historySize: number = DEFAULT_HISTORY_SIZE) {
    this.historySize = historySize
    this.reconfigure(bands)
  }

  reconfigure(bands: BandOnsetConfig[]): void {
    this.bands = bands
    this.prevSlices.clear()
    this.fluxHistory.clear()
  }

  reset(): void {
    this.prevSlices.clear()
    this.fluxHistory.clear()
  }

  /** Process one frame. Returns onset strength (0–1) per band id. */
  processFrame(spectrumData: Uint8Array | number[]): Record<string, number> {
    const out: Record<string, number> = {}
    const invByteMax = 1 / 255

    for (const b of this.bands) {
      const len = Math.max(0, b.endBin - b.startBin)
      if (len <= 0) {
        out[b.id] = 0
        continue
      }

      let prev = this.prevSlices.get(b.id)
      if (!prev || prev.length !== len) {
        prev = new Float32Array(len)
        for (let i = 0; i < len; i++) {
          const idx = b.startBin + i
          prev[i] = (spectrumData[idx] ?? 0) * invByteMax
        }
        this.prevSlices.set(b.id, prev)
        let hist = this.fluxHistory.get(b.id)
        if (!hist) {
          hist = []
          this.fluxHistory.set(b.id, hist)
        }
        out[b.id] = 0
        continue
      }

      let flux = 0
      for (let i = 0; i < len; i++) {
        const idx = b.startBin + i
        const cur = (spectrumData[idx] ?? 0) * invByteMax
        const diff = cur - prev[i]!
        if (diff > 0) {
          flux += diff
        }
        prev[i] = cur
      }

      const hist = this.fluxHistory.get(b.id)!
      hist.push(flux)
      if (hist.length > this.historySize) {
        hist.shift()
      }
      const fluxStats = computeStats(hist)
      const onsetStrength =
        fluxStats.stdDev > 1e-6
          ? Math.max(0, Math.min(1, (flux - fluxStats.mean) / (fluxStats.stdDev * 2)))
          : 0
      out[b.id] = onsetStrength
    }

    return out
  }
}
