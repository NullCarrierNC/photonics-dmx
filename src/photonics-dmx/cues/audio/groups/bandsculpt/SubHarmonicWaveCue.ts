import { IAudioCue } from '../../../interfaces/IAudioCue'
import { AudioCueData, BuiltInAudioCues } from '../../../types/audioCueTypes'
import { DmxLightManager } from '../../../../controllers/DmxLightManager'
import { ILightingController } from '../../../../controllers/sequencer/interfaces'
import { getEffectSingleColor } from '../../../../effects'
import { getColor } from '../../../../helpers'
import { clamp01, getBandValue } from '../../utils/bandUtils'
import { clearCueLayers } from '../../utils/cueLayerUtils'

export class SubHarmonicWaveCue implements IAudioCue {
  id = 'audio-sub-harmonic-wave'
  cueType = BuiltInAudioCues.SubHarmonicWave
  description =
    'Alternates even/odd front fixtures based on bass and low-mid swells for a wave like effect.'
  private readonly layers = [0, 1]
  private sequencerRef: ILightingController | null = null
  private lightManagerRef: DmxLightManager | null = null

  async execute(
    data: AudioCueData,
    sequencer: ILightingController,
    lightManager: DmxLightManager,
  ): Promise<void> {
    this.sequencerRef = sequencer
    this.lightManagerRef = lightManager
    const evenFront = lightManager.getLights('front', 'even')
    const oddFront = lightManager.getLights('front', 'odd')
    const evenBack = lightManager.getLights('back', 'even')
    const oddBack = lightManager.getLights('back', 'odd')

    const evenLights = [...evenFront, ...evenBack]
    const oddLights = [...oddFront, ...oddBack]

    if (evenLights.length === 0 && oddLights.length === 0) {
      return
    }

    const bass = clamp01(getBandValue(data.audioData.frequencyBands, 0))
    const lowMid = clamp01(getBandValue(data.audioData.frequencyBands, 1))

    const evenColor = getColor('red', 'high', 'add')
    evenColor.intensity = Math.min(255, Math.floor(evenColor.intensity * (0.35 + bass)))
    evenColor.opacity = clamp01(0.4 + bass * 0.6)

    const oddColor = getColor('yellow', 'medium', 'add')
    oddColor.intensity = Math.min(255, Math.floor(oddColor.intensity * (0.3 + lowMid)))
    oddColor.opacity = clamp01(0.35 + lowMid * 0.5)

    if (evenLights.length > 0) {
      const effect = getEffectSingleColor({
        lights: evenLights,
        color: evenColor,
        duration: 150,
        waitFor: 'none',
        layer: 29,
      })
      sequencer.addEffect('sub-wave-even', effect)
    }

    if (oddLights.length > 0) {
      const effect = getEffectSingleColor({
        lights: oddLights,
        color: oddColor,
        duration: 150,
        waitFor: 'none',
        layer: 30,
      })
      sequencer.addEffect('sub-wave-odd', effect)
    }

    // Alternate configuration: offset the layers by 80ms via waitUntil to exaggerate the wave travel.
  }

  onStop(): void {
    clearCueLayers(this.sequencerRef, this.layers, this.lightManagerRef)
  }

  onDestroy(): void {
    clearCueLayers(this.sequencerRef, this.layers, this.lightManagerRef)
  }
}
