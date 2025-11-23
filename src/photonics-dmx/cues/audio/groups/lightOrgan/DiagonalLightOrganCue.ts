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
  getOrganColorByIndex,
  splitLightsForBands
} from '../../utils/bandUtils';
import { clearCueLayers } from '../../utils/cueLayerUtils';

export class DiagonalLightOrganCue implements IAudioCue {
  id = 'audio-light-organ-diagonal';
  cueType = AudioCueType.DiagonalLightOrgan;
  description = 'Offsets each band by a moving segment to mimic diagonal chases from old-school light organs';
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
    const lights = lightManager.getLights(['front', 'back'], 'linear');
    if (lights.length === 0) {
      return;
    }

    const bandIndices = getActiveBandIndices(data.enabledBandCount);
    const segments = splitLightsForBands(lights, bandIndices.length);
    if (segments.length === 0) {
      return;
    }

    const offset = data.executionCount % segments.length;
    const rotated = segments.map((_, index) => segments[(index + offset) % segments.length]);

    rotated.forEach((segment, idx) => {
      if (segment.length === 0) {
        return;
      }

      const bandIndex = bandIndices[idx] ?? bandIndices[bandIndices.length - 1];
      const intensity = clamp01(getBandValue(data.audioData.frequencyBands, bandIndex));
      const colour = getColor(getOrganColorByIndex(idx), 'high', 'add');
      colour.intensity = Math.min(255, Math.floor(colour.intensity * (0.25 + intensity)));
      colour.opacity = clamp01(0.35 + intensity * 0.6);

      const effect = getEffectSingleColor({
        lights: segment,
        color: colour,
        duration: 120,
        layer: 85 + idx
      });
      sequencer.addEffect(`light-organ-diagonal-${idx}`, effect);
    });

  }

  onStop(): void {
    clearCueLayers(this.sequencerRef, this.layers, this.lightManagerRef);
  }

  onDestroy(): void {
    clearCueLayers(this.sequencerRef, this.layers, this.lightManagerRef);
  }
}


