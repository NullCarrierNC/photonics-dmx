import { IAudioCue } from '../../../interfaces/IAudioCue'
import { AudioCueData, BuiltInAudioCues } from '../../../types/audioCueTypes'
import { DmxLightManager } from '../../../../controllers/DmxLightManager'
import { ILightingController } from '../../../../controllers/sequencer/interfaces'
import { getEffectSingleColor } from '../../../../effects'
import {
  DEFAULT_LAYER_DURATION,
  getActiveBandIndices,
  getBandValue,
  getRangeAndColor,
  scaleColor,
} from '../../utils/bandUtils'
import { clearCueLayers } from '../../utils/cueLayerUtils'

export class BandShellCue implements IAudioCue {
  id = 'audio-band-shell'
  cueType = BuiltInAudioCues.BandShell
  description = 'Maps low/mid/high bands to outer, mid, and inner lights'
  private readonly layers = [0, 1, 2]
  private sequencerRef: ILightingController | null = null
  private lightManagerRef: DmxLightManager | null = null

  async execute(
    data: AudioCueData,
    sequencer: ILightingController,
    lightManager: DmxLightManager,
  ): Promise<void> {
    this.sequencerRef = sequencer
    this.lightManagerRef = lightManager
    const shells = [
      lightManager.getLights(['front', 'back'], 'outter-half-major'),
      lightManager.getLights(['front', 'back'], 'inner-half-major'),
      lightManager.getLights(['front', 'back'], 'inner-half-minor'),
    ]

    const activeBands = getActiveBandIndices(data.enabledBandCount).slice(0, shells.length)
    const anyLights = shells.reduce((sum, arr) => sum + arr.length, 0)
    if (anyLights === 0) {
      return
    }

    activeBands.forEach((bandIndex, shellIndex) => {
      const shellLights = shells[shellIndex]
      if (shellLights.length === 0) {
        return
      }

      const intensity = getBandValue(data.audioData.frequencyBands, bandIndex)
      if (intensity < 0.05) {
        sequencer.removeEffectByLayer(20 + shellIndex)
        return
      }

      const rangeColor = getRangeAndColor(data.config, bandIndex, intensity, 'add', 1.1)
      if (!rangeColor) {
        return
      }

      const effect = getEffectSingleColor({
        lights: shellLights,
        color: scaleColor(rangeColor.color, 0.5 + intensity),
        duration: DEFAULT_LAYER_DURATION + shellIndex * 20,
        layer: 20 + shellIndex,
      })
      sequencer.addEffect(`band-shell-${shellIndex}`, effect)
    })
  }

  onStop(): void {
    clearCueLayers(this.sequencerRef, this.layers, this.lightManagerRef)
  }

  onDestroy(): void {
    clearCueLayers(this.sequencerRef, this.layers, this.lightManagerRef)
  }
}
