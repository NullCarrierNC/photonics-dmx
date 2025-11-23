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

export class SplitLightOrganCue implements IAudioCue {
  id = 'audio-light-organ-split';
  cueType = AudioCueType.SplitLightOrgan;
  description = 'Low bands sit on the front line while upper bands mirror on the back for a two-plane organ';
  private readonly layers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  private sequencerRef: ILightingController | null = null;
  private lightManagerRef: DmxLightManager | null = null;

  async execute(
    data: AudioCueData,
    sequencer: ILightingController,
    lightManager: DmxLightManager
  ): Promise<void> {
    this.sequencerRef = sequencer;
    this.lightManagerRef = lightManager;
    const front = lightManager.getLights('front', 'linear');
    const back = lightManager.getLights('back', 'linear');

    if (front.length === 0 && back.length === 0) {
      return;
    }

    const bandIndices = getActiveBandIndices(data.enabledBandCount);
    const frontCount = Math.max(1, Math.min(bandIndices.length - 1, 3));
    const backCount = Math.max(1, bandIndices.length - frontCount);

    const frontSegments = front.length > 0 ? splitLightsForBands(front, frontCount) : [];
    const backSegments = back.length > 0 ? splitLightsForBands(back, backCount) : [];

    const applySegments = (
      segments: ReturnType<typeof splitLightsForBands>,
      startIndex: number,
      layerBase: number
    ): void => {
      segments.forEach((segment, localIndex) => {
        if (segment.length === 0) {
          return;
        }

        const bandIndex = bandIndices[startIndex + localIndex] ?? bandIndices[bandIndices.length - 1];
        const intensity = clamp01(getBandValue(data.audioData.frequencyBands, bandIndex));
        const colour = getColor(getOrganColorByIndex(startIndex + localIndex), 'high', 'add');
        colour.intensity = Math.min(255, Math.floor(colour.intensity * (0.25 + intensity)));
        colour.opacity = clamp01(0.35 + intensity * 0.6);

        if (colour.opacity < 0.05) {
          sequencer.removeEffectByLayer(layerBase + localIndex);
          return;
        }

        const effect = getEffectSingleColor({
          lights: segment,
          color: colour,
          duration: 120,
          layer: layerBase + localIndex
        });
        sequencer.addEffect(`light-organ-split-${layerBase}-${localIndex}`, effect);
      });
    };

    applySegments(frontSegments, 0, 70);
    applySegments(backSegments, frontSegments.length, 75);

  }

  onStop(): void {
    clearCueLayers(this.sequencerRef, this.layers, this.lightManagerRef);
  }

  onDestroy(): void {
    clearCueLayers(this.sequencerRef, this.layers, this.lightManagerRef);
  }
}


