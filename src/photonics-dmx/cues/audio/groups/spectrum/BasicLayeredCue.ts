import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { getEffectSingleColor } from '../../../../effects';
import { getColor, validateColorString } from '../../../../helpers';
import { AudioCueData, BuiltInAudioCues } from '../../../types/audioCueTypes';
import { IAudioCue } from '../../../interfaces/IAudioCue';

/**
 * BasicLayered cue - applies each frequency range to its own layer
 * - Bass (range1) = layer 0
 * - Range2 = layer 1
 * - Range3 = layer 2
 * - Range4 = layer 3
 * - Range5 = layer 4
 * Each layer uses the configured color and brightness for that range
 */
export class BasicLayeredCue implements IAudioCue {
  id = 'audio-basic-layered';
  cueType = BuiltInAudioCues.BasicLayered;
  description = 'Applies each frequency range to its own layer, starting with Bass on layer 0';

  async execute(
    data: AudioCueData,
    sequencer: ILightingController,
    lightManager: DmxLightManager
  ): Promise<void> {
    const { audioData, config } = data;
    const { frequencyBands } = audioData;

    const allLights = lightManager.getLights(['front', 'back'], 'all');
    if (!allLights || allLights.length === 0) {
      return;
    }

    const ranges = config.frequencyBands?.ranges || [];
    if (ranges.length === 0) {
      return;
    }

    const configBandCount = config.frequencyBands?.bandCount;
    const enabledBandCount = data.enabledBandCount ?? configBandCount ?? 4;
    const activeRangeIndices =
      enabledBandCount === 3
        ? [0, 2, 4]
        : enabledBandCount === 4
          ? [0, 1, 2, 3]
          : [0, 1, 2, 3, 4];

    const bandValues = [
      frequencyBands.range1,
      frequencyBands.range2,
      frequencyBands.range3,
      frequencyBands.range4,
      frequencyBands.range5
    ];

    activeRangeIndices.forEach((rangeIndex, orderIndex) => {
      const range = ranges[rangeIndex];
      if (!range) {
        return;
      }

      const bandIntensity = bandValues[rangeIndex];
      const layer = orderIndex;

      if (bandIntensity < 0.01) {
        sequencer.removeEffectByLayer(layer);
        return;
      }

      const color = validateColorString(range.color);
      if (!color) {
        console.warn(`Invalid color for range ${range.name}: ${range.color}`);
        return;
      }

      const brightness = range.brightness || 'medium';
      const rgbColor = getColor(color, brightness, 'add');

      rgbColor.intensity = Math.floor(rgbColor.intensity * bandIntensity);
      rgbColor.opacity = bandIntensity;

      const effect = getEffectSingleColor({
        lights: allLights,
        color: rgbColor,
        duration: 100,
        layer
      });

      sequencer.addEffect(`audio-basic-layered-${range.id}`, effect);
    });

    if (audioData.beatDetected) {
      // Reserved for future beat effect
    }
  }

  onStop(): void {
    // Cleanup if needed
  }

  onDestroy(): void {
    // Cleanup if needed
  }
}

