import { IAudioCue } from '../../../interfaces/IAudioCue'
import { AudioCueData, BuiltInAudioCues } from '../../../types/audioCueTypes'
import { DmxLightManager } from '../../../../controllers/DmxLightManager'
import { ILightingController } from '../../../../controllers/sequencer/interfaces'
import { getEffectFadeInColorFadeOut } from '../../../../effects'
import { getColor } from '../../../../helpers'
import { clamp01, getDominantBand, getRangeAndColor } from '../../utils/bandUtils'
import { clearCueLayers } from '../../utils/cueLayerUtils'

export class BeatSpectrumMorphCue implements IAudioCue {
  id = 'audio-beat-spectrum-morph'
  cueType = BuiltInAudioCues.BeatSpectrumMorph
  description =
    'On each beat, moves the entire rig toward the dominant spectrum colour, then drifts back between beats'
  private readonly layers = [0]
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

    const dominant = getDominantBand(data)
    const baseColor = getColor('purple', 'low', 'add')
    baseColor.opacity = 0.15

    if (!dominant) {
      const effect = getEffectFadeInColorFadeOut({
        lights,
        startColor: baseColor,
        endColor: baseColor,
        waitBeforeFadeIn: 0,
        fadeInDuration: 120,
        holdDuration: 80,
        fadeOutDuration: 120,
        waitAfterFadeOut: 0,
        layer: 40,
      })
      sequencer.addEffect('beat-spectrum-morph-idle', effect)
      return
    }

    const rangeColor = getRangeAndColor(
      data.config,
      dominant.bandIndex,
      dominant.intensity,
      'add',
      1.4,
    )
    if (!rangeColor) {
      return
    }

    const morphLevel = clamp01(0.4 + dominant.intensity)
    const effect = getEffectFadeInColorFadeOut({
      lights,
      startColor: baseColor,
      endColor: {
        ...rangeColor.color,
        intensity: Math.min(255, Math.floor(rangeColor.color.intensity * morphLevel)),
        opacity: clamp01(rangeColor.color.opacity * morphLevel),
      },
      waitBeforeFadeIn: 0,
      fadeInDuration: data.audioData.beatDetected ? 80 : 140,
      holdDuration: 60,
      fadeOutDuration: 180,
      waitAfterFadeOut: 0,
      layer: 40,
      waitFor: data.audioData.beatDetected ? 'beat' : 'none',
    })

    sequencer.addEffect('beat-spectrum-morph', effect)
  }

  onStop(): void {
    clearCueLayers(this.sequencerRef, this.layers, this.lightManagerRef)
  }

  onDestroy(): void {
    clearCueLayers(this.sequencerRef, this.layers, this.lightManagerRef)
  }
}
