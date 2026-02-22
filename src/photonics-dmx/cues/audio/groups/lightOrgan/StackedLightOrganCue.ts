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
} from '../../utils/bandUtils'
import { clearCueLayers } from '../../utils/cueLayerUtils'

export class StackedLightOrganCue implements IAudioCue {
  id = 'audio-light-organ-stacked'
  cueType = BuiltInAudioCues.StackedLightOrgan
  description = 'Stacks each band on its own layer across the full rig.'
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
    const lights = lightManager.getLights(['front', 'back'], 'all')
    if (lights.length === 0) {
      return
    }

    const bandIndices = getActiveBandIndices(data.enabledBandCount)

    bandIndices.forEach((bandIndex, idx) => {
      const intensity = clamp01(getBandValue(data.audioData.frequencyBands, bandIndex))
      if (intensity < 0.04) {
        sequencer.removeEffectByLayer(80 + idx)
        return
      }

      const colour = getColor(getOrganColorByIndex(idx), idx === 0 ? 'high' : 'medium', 'add')
      colour.intensity = Math.min(255, Math.floor(colour.intensity * (0.3 + intensity)))
      colour.opacity = clamp01(0.35 + intensity * 0.6)

      const effect = getEffectSingleColor({
        lights,
        color: colour,
        duration: 110,
        layer: 80 + idx,
      })

      sequencer.addEffect(`light-organ-stacked-${idx}`, effect)
    })

    // Alternate configuration: send the highest band to a dedicated strobe layer for flashier disco looks.
  }

  onStop(): void {
    clearCueLayers(this.sequencerRef, this.layers, this.lightManagerRef)
  }

  onDestroy(): void {
    clearCueLayers(this.sequencerRef, this.layers, this.lightManagerRef)
  }
}
