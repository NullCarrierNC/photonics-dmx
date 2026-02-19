import { IAudioCue } from '../../../interfaces/IAudioCue'
import { AudioCueData, BuiltInAudioCues } from '../../../types/audioCueTypes'
import { DmxLightManager } from '../../../../controllers/DmxLightManager'
import { ILightingController } from '../../../../controllers/sequencer/interfaces'
import { getEffectFlashColor } from '../../../../effects'
import { getColor } from '../../../../helpers'
import { clamp01, getBandValue, getIntensityScale } from '../../utils/bandUtils'
import { clearCueLayers } from '../../utils/cueLayerUtils'

export class BassSnareRippleCue implements IAudioCue {
  id = 'audio-bass-snare-ripple'
  cueType = BuiltInAudioCues.BassSnareRipple
  description =
    'Bass pushes a warm ripple across the front wash while mids snap the rear lights for snare hits'
  private readonly layers = [1, 1]
  private sequencerRef: ILightingController | null = null
  private lightManagerRef: DmxLightManager | null = null

  async execute(
    data: AudioCueData,
    sequencer: ILightingController,
    lightManager: DmxLightManager,
  ): Promise<void> {
    this.sequencerRef = sequencer
    this.lightManagerRef = lightManager
    const { audioData } = data

    const frontLights = lightManager.getLights('front', 'linear')
    const backLights = lightManager.getLights('back', 'linear')

    if (frontLights.length === 0 && backLights.length === 0) {
      return
    }

    const bassLevel = clamp01(getBandValue(audioData.frequencyBands, 0))
    const snareLevel = clamp01(getBandValue(audioData.frequencyBands, 2))

    const bassThreshold = 0.28 // Other rigs may prefer 0.22 or 0.35 depending on how hot the mic runs.
    const snareThreshold = 0.24

    const linearResponse = data.config.linearResponse !== false
    const adjustedBassLevel = getIntensityScale(bassLevel, linearResponse)
    const adjustedSnareLevel = getIntensityScale(snareLevel, linearResponse)

    if (frontLights.length > 0 && bassLevel > bassThreshold) {
      const bassColor = getColor('orange', 'high', 'add')
      bassColor.intensity = Math.min(
        255,
        Math.floor(bassColor.intensity * (0.6 + adjustedBassLevel)),
      )
      bassColor.opacity = clamp01(0.4 + adjustedBassLevel * 0.6)

      const effect = getEffectFlashColor({
        lights: frontLights,
        color: bassColor,
        durationIn: 60,
        holdTime: 40 + Math.floor(bassLevel * 90),
        durationOut: 160,
        layer: 6,
        startTrigger: 'none',
        endTrigger: 'none',
      })
      sequencer.addEffect('bass-snare-front', effect)
    }

    if (backLights.length > 0 && snareLevel > snareThreshold) {
      const snareColor = getColor('cyan', 'medium', 'add')
      snareColor.intensity = Math.min(
        255,
        Math.floor(snareColor.intensity * (0.5 + adjustedSnareLevel)),
      )
      snareColor.opacity = clamp01(0.35 + adjustedSnareLevel * 0.5)

      const effect = getEffectFlashColor({
        lights: backLights,
        color: snareColor,
        durationIn: 40,
        holdTime: 30 + Math.floor(snareLevel * 60),
        durationOut: 120,
        layer: 7,
        startTrigger: audioData.beatDetected ? 'beat' : 'none',
        endTrigger: 'none',
      })
      sequencer.addEffect('bass-snare-back', effect)
    }
  }

  onStop(): void {
    clearCueLayers(this.sequencerRef, this.layers, this.lightManagerRef)
  }

  onDestroy(): void {
    clearCueLayers(this.sequencerRef, this.layers, this.lightManagerRef)
  }
}
