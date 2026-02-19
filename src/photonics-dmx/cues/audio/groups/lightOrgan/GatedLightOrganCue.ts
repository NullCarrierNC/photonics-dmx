import { IAudioCue } from '../../../interfaces/IAudioCue'
import { AudioCueData, BuiltInAudioCues } from '../../../types/audioCueTypes'
import { DmxLightManager } from '../../../../controllers/DmxLightManager'
import { ILightingController } from '../../../../controllers/sequencer/interfaces'
import { getEffectSingleColor } from '../../../../effects'
import { getColor } from '../../../../helpers'
import {
  clamp01,
  getActiveBandIndices,
  getBandValue,
  getOrganColorByIndex,
  splitLightsForBands,
} from '../../utils/bandUtils'
import { clearCueLayers } from '../../utils/cueLayerUtils'

export class GatedLightOrganCue implements IAudioCue {
  id = 'audio-light-organ-gated'
  cueType = BuiltInAudioCues.GatedLightOrgan
  description = 'Adds per-band gates so only loud hits punch through.'
  private readonly layers = [0, 1, 2, 3, 4]
  private sequencerRef: ILightingController | null = null
  private lightManagerRef: DmxLightManager | null = null

  async execute(
    data: AudioCueData,
    sequencer: ILightingController,
    lightManager: DmxLightManager,
  ): Promise<void> {
    this.sequencerRef = sequencer
    this.lightManagerRef = lightManager
    const frontLights = lightManager.getLights('front', 'linear')
    if (frontLights.length === 0) {
      return
    }

    const bandIndices = getActiveBandIndices(data.enabledBandCount)
    const segments = splitLightsForBands(frontLights, bandIndices.length)
    const gate = 0.3 // Raise toward 0.45 for quieter rooms or lower to 0.2 for sensitive rigs.

    segments.forEach((segment, idx) => {
      if (segment.length === 0) {
        return
      }

      const bandIndex = bandIndices[idx] ?? bandIndices[bandIndices.length - 1]
      const intensity = clamp01(getBandValue(data.audioData.frequencyBands, bandIndex))

      if (intensity < gate) {
        sequencer.removeEffectByLayer(90 + idx)
        return
      }

      const colour = getColor(getOrganColorByIndex(idx), 'high', 'add')
      colour.intensity = Math.min(255, Math.floor(colour.intensity * (0.25 + intensity)))
      colour.opacity = clamp01(0.35 + intensity * 0.6)

      const effect = getEffectSingleColor({
        lights: segment,
        color: colour,
        duration: 100,
        layer: 90 + idx,
      })
      sequencer.addEffect(`light-organ-gated-${idx}`, effect)
    })
  }

  onStop(): void {
    clearCueLayers(this.sequencerRef, this.layers, this.lightManagerRef)
  }

  onDestroy(): void {
    clearCueLayers(this.sequencerRef, this.layers, this.lightManagerRef)
  }
}
