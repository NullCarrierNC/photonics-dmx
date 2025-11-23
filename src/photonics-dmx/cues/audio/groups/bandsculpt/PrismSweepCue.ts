import { IAudioCue } from '../../../interfaces/IAudioCue';
import { AudioCueData, AudioCueType } from '../../../types/audioCueTypes';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { getEffectSingleColor } from '../../../../effects';
import { getColor } from '../../../../helpers';
import {
  DEFAULT_LAYER_DURATION,
  getBandValue,
  splitLightsForBands,
  clamp01,
  scaleColor
} from '../../utils/bandUtils';
import { clearCueLayers } from '../../utils/cueLayerUtils';

export class PrismSweepCue implements IAudioCue {
  id = 'audio-prism-sweep';
  cueType = AudioCueType.PrismSweep;
  description = 'Creates a four-part gradient sweep that brightens based on band-specific intensity';
  private readonly layers = [0, 1, 2, 3];
  private sequencerRef: ILightingController | null = null;
  private lightManagerRef: DmxLightManager | null = null;

  async execute(
    data: AudioCueData,
    sequencer: ILightingController,
    lightManager: DmxLightManager
  ): Promise<void> {
    this.sequencerRef = sequencer;
    this.lightManagerRef = lightManager;
    const linearLights = lightManager.getLights(['front', 'back'], 'linear');
    if (linearLights.length === 0) {
      return;
    }

    const segments = splitLightsForBands(linearLights, 4);
    const segmentColors = [
      getColor('red', 'high', 'add'),
      getColor('amber', 'medium', 'add'),
      getColor('green', 'medium', 'add'),
      getColor('blue', 'high', 'add')
    ];

    const bandMap = [0, 1, 2, 4];

    segments.forEach((segment, index) => {
      if (segment.length === 0) {
        return;
      }

      const bandIndex = bandMap[index] ?? index;
      const intensity = getBandValue(data.audioData.frequencyBands, bandIndex);
      const level = clamp01(0.2 + intensity);

      const effect = getEffectSingleColor({
        lights: segment,
        color: scaleColor(segmentColors[index], level),
        duration: DEFAULT_LAYER_DURATION + index * 25,
        layer: 24 + index
      });
      sequencer.addEffect(`prism-sweep-${index}`, effect);
    });

    // Alternative configurations can swap in teal/violet bands or change to 5 segments if rigs have more fixtures.
  }

  onStop(): void {
    clearCueLayers(this.sequencerRef, this.layers, this.lightManagerRef);
  }

  onDestroy(): void {
    clearCueLayers(this.sequencerRef, this.layers, this.lightManagerRef);
  }
}


