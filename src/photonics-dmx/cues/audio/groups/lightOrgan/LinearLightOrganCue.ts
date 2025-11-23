import { IAudioCue } from '../../../interfaces/IAudioCue';
import { AudioCueData, AudioCueType } from '../../../types/audioCueTypes';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { getEffectSingleColor } from '../../../../effects';
import { getColor } from '../../../../helpers';
import {
  clamp01,
  getActiveBandIndices,
  getBandValue,
  splitLightsForBands,
  getOrganColorByIndex
} from '../../utils/bandUtils';
import { clearCueLayers } from '../../utils/cueLayerUtils';

export class LinearLightOrganCue implements IAudioCue {
  id = 'audio-light-organ-linear';
  cueType = AudioCueType.LinearLightOrgan;
  description = 'Classic linear light organ: splits the rig into contiguous segments driven by each band';
  private readonly layers = [0, 1, 2, 3, 4];
  private sequencerRef: ILightingController | null = null;
  private lightManagerRef: DmxLightManager | null = null;

  async execute(
    data: AudioCueData,
    sequencer: ILightingController,
    lightManager: DmxLightManager
  ): Promise<void> {
    this.sequencerRef = sequencer;
    this.lightManagerRef = lightManager;
    const allLights = lightManager.getLights(['front', 'back'], 'linear');
    if (allLights.length === 0) {
      return;
    }

    const bandIndices = getActiveBandIndices(data.enabledBandCount);
    const segments = splitLightsForBands(allLights, bandIndices.length);

    segments.forEach((segment, index) => {
      if (segment.length === 0) {
        return;
      }

      const bandIndex = bandIndices[index] ?? index;
      const intensity = clamp01(getBandValue(data.audioData.frequencyBands, bandIndex));
      const colourName = getOrganColorByIndex(index);
      const colour = getColor(colourName, 'high', 'add');

      colour.intensity = Math.min(255, Math.floor(colour.intensity * (0.25 + intensity)));
      colour.opacity = clamp01(0.35 + intensity * 0.6);

      if (colour.opacity < 0.05) {
        sequencer.removeEffectByLayer(60 + index);
        return;
      }

      const effect = getEffectSingleColor({
        lights: segment,
        color: colour,
        duration: 120,
        layer: 60 + index
      });

      sequencer.addEffect(`light-organ-linear-${index}`, effect);
    });

  }

  onStop(): void {
    clearCueLayers(this.sequencerRef, this.layers, this.lightManagerRef);
  }

  onDestroy(): void {
    clearCueLayers(this.sequencerRef, this.layers, this.lightManagerRef);
  }
}

