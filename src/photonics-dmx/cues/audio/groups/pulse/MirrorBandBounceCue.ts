import { IAudioCue } from '../../../interfaces/IAudioCue'
import { AudioCueData, BuiltInAudioCues } from '../../../types/audioCueTypes'
import { DmxLightManager } from '../../../../controllers/DmxLightManager'
import { ILightingController } from '../../../../controllers/sequencer/interfaces'
import { getEffectSingleColor } from '../../../../effects'
import {
  clamp01,
  getDominantBand,
  getRangeAndColor,
  scaleColor,
  getIntensityScale,
} from '../../utils/bandUtils'
import { clearCueLayers } from '../../utils/cueLayerUtils'

export class MirrorBandBounceCue implements IAudioCue {
  id = 'audio-mirror-band-bounce'
  cueType = BuiltInAudioCues.MirrorBandBounce
  description = 'Mirrors the dominant band across front/back halves.'
  private readonly layers = [0, 1, 2, 3]
  private sequencerRef: ILightingController | null = null
  private lightManagerRef: DmxLightManager | null = null

  async execute(
    data: AudioCueData,
    sequencer: ILightingController,
    lightManager: DmxLightManager,
  ): Promise<void> {
    this.sequencerRef = sequencer
    this.lightManagerRef = lightManager
    const dominant = getDominantBand(data)
    if (!dominant) {
      return
    }

    const rangeColor = getRangeAndColor(data.config, dominant.bandIndex, 1, 'add', 1)
    if (!rangeColor) {
      return
    }

    const frontA = lightManager.getLights('front', 'half-1')
    const frontB = lightManager.getLights('front', 'half-2')
    const backA = lightManager.getLights('back', 'half-1')
    const backB = lightManager.getLights('back', 'half-2')

    const anyLights = frontA.length + frontB.length + backA.length + backB.length
    if (anyLights === 0) {
      return
    }

    const phase = data.executionCount % 4
    const activeFront = phase < 2 ? frontA : frontB
    const inactiveFront = phase < 2 ? frontB : frontA
    const activeBack = phase < 2 ? backB : backA
    const inactiveBack = phase < 2 ? backA : backB

    const linearResponse = data.config.linearResponse !== false
    const rawActiveScale = clamp01(0.5 + dominant.intensity * 0.6)
    const rawInactiveScale = clamp01(0.15 + dominant.intensity * 0.25)
    const activeScale = getIntensityScale(rawActiveScale, linearResponse)
    const inactiveScale = getIntensityScale(rawInactiveScale, linearResponse)

    if (activeFront.length > 0) {
      const effect = getEffectSingleColor({
        lights: activeFront,
        color: scaleColor(rangeColor.color, Math.min(1, activeScale * 1.3)),
        duration: 120,
        layer: 9,
      })
      sequencer.addEffect('mirror-front-active', effect)
    }

    if (inactiveFront.length > 0) {
      const effect = getEffectSingleColor({
        lights: inactiveFront,
        color: scaleColor(rangeColor.color, Math.min(1, inactiveScale * 1.3)),
        duration: 140,
        layer: 10,
      })
      sequencer.addEffect('mirror-front-inactive', effect)
    }

    if (activeBack.length > 0) {
      const effect = getEffectSingleColor({
        lights: activeBack,
        color: scaleColor(rangeColor.color, Math.min(1, activeScale * 1.3 * 0.85)),
        duration: 120,
        layer: 11,
      })
      sequencer.addEffect('mirror-back-active', effect)
    }

    if (inactiveBack.length > 0) {
      const effect = getEffectSingleColor({
        lights: inactiveBack,
        color: scaleColor(rangeColor.color, Math.min(1, inactiveScale * 1.3 * 0.9)),
        duration: 140,
        layer: 12,
      })
      sequencer.addEffect('mirror-back-inactive', effect)
    }
  }

  onStop(): void {
    clearCueLayers(this.sequencerRef, this.layers, this.lightManagerRef)
  }

  onDestroy(): void {
    clearCueLayers(this.sequencerRef, this.layers, this.lightManagerRef)
  }
}
