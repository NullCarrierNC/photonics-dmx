import { AudioCueType } from '../AudioCueTypes';
import { IAudioCue } from '../interfaces/IAudioCue';
import { AudioCueData } from '../AudioCueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { getColor, validateColorString } from '../../../helpers/dmxHelpers';
import { getEffectSingleColor } from '../../../effects/effectSingleColor';

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
  cueType = AudioCueType.BasicLayered;
  description = 'Applies each frequency range to its own layer, starting with Bass on layer 0';

  async execute(
    data: AudioCueData,
    sequencer: ILightingController,
    lightManager: DmxLightManager
  ): Promise<void> {
    const { audioData, config } = data;
    const { frequencyBands } = audioData;

    // Get all lights
    const allLights = lightManager.getLights(['front', 'back'], 'all');
    if (!allLights || allLights.length === 0) {
      return;
    }

    // Get configured ranges
    const ranges = config.colorMapping?.ranges || [];
    if (ranges.length === 0) {
      return;
    }

    // Get frequency band values in order
    const bandValues = [
      frequencyBands.range1,
      frequencyBands.range2,
      frequencyBands.range3,
      frequencyBands.range4,
      frequencyBands.range5
    ];

    // Create an effect for each frequency range
    // Each range gets its own layer (starting at 0 for Bass)
    for (let rangeIndex = 0; rangeIndex < ranges.length && rangeIndex < bandValues.length; rangeIndex++) {
      const range = ranges[rangeIndex];
      const bandIntensity = bandValues[rangeIndex];
      const layer = rangeIndex; // Bass = layer 0, Range2 = layer 1, etc.

      // Skip if intensity is too low
      if (bandIntensity < 0.01) {
        // Remove effect for this layer if it exists
        sequencer.removeEffectByLayer(layer);
        continue;
      }

      // Validate color
      const color = validateColorString(range.color);
      if (!color) {
        console.warn(`Invalid color for range ${range.name}: ${range.color}`);
        continue;
      }

      // Get color with configured brightness
      const brightness = range.brightness || 'medium';
      const rgbColor = getColor(color, brightness, 'add');

      // Scale intensity based on band intensity
      rgbColor.intensity = Math.floor(rgbColor.intensity * bandIntensity);
      rgbColor.opacity = bandIntensity;

      // Create a single-color effect for this layer
      const effect = getEffectSingleColor({
        lights: allLights,
        color: rgbColor,
        duration: 100,
        layer: layer
      });

      // Apply effect using addEffect (allows multiple layers to coexist)
      sequencer.addEffect(`audio-basic-layered-${range.id}`, effect);
    }

    // Handle beat detection if needed (optional enhancement)
    if (audioData.beatDetected) {
      // Could add a beat effect on a higher layer (e.g., layer 10)
      // For now, BasicLayered doesn't handle beats - layers show frequency response
    }
  }

  onStop(): void {
    // Cleanup if needed
  }

  onDestroy(): void {
    // Cleanup if needed
  }
}

