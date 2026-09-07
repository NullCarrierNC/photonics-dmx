/**
 * Maps FFT bins onto the configured frequency bands, and derives the per-band onset windows the
 * multiband detector runs on. A bin belongs to the first band whose range covers its centre
 * frequency, and a bin below every band, such as sub-20 Hz, belongs to none.
 */
import type { AudioBandDefinition } from '../../../photonics-dmx/listeners/Audio/AudioTypes'
import type { BandOnsetConfig } from '../../../photonics-dmx/listeners/Audio/MultibandOnsetDetector'

export interface BinToBandMapping {
  /** Band index per bin, or -1 where no band covers it. */
  binToBandMap: Int8Array
  /** Gain per band index, in the order the bands are configured. */
  bandGains: number[]
  onsetConfigs: BandOnsetConfig[]
}

export function buildBinToBandMap(
  sampleRate: number,
  fftSize: number,
  binCount: number,
  bands: AudioBandDefinition[],
): BinToBandMapping {
  const binSize = sampleRate / fftSize
  const binToBandMap = new Int8Array(binCount)
  binToBandMap.fill(-1)

  for (let binIndex = 0; binIndex < binCount; binIndex++) {
    const centreFreq = binIndex * binSize
    for (let bandIndex = 0; bandIndex < bands.length; bandIndex++) {
      const band = bands[bandIndex]
      if (centreFreq >= band.minHz && centreFreq < band.maxHz) {
        binToBandMap[binIndex] = bandIndex
        break
      }
    }
  }

  return {
    binToBandMap,
    bandGains: bands.map((band) => band.gain),
    onsetConfigs: bands.map((band) => ({
      id: band.id,
      startBin: Math.floor(band.minHz / binSize),
      endBin: Math.min(Math.ceil(band.maxHz / binSize), binCount),
    })),
  }
}
