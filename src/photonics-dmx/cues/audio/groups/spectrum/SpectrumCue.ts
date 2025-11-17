import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { getEffectSingleColor } from '../../../../effects';
import { getColor, validateColorString } from '../../../../helpers';
import type { AudioConfig } from '../../../../listeners/Audio/audioTypes';
import { AudioCueData, AudioCueType } from '../../../types/audioCueTypes';
import { IAudioCue } from '../../../interfaces/IAudioCue';
import type { TrackedLight } from '../../../../types';

type AudioRangeConfig = AudioConfig['frequencyBands']['ranges'][number];

/**
 * SpectrumCue - acts like a spectrum analyzer by spreading frequency bands across lights
 */
export class SpectrumCue implements IAudioCue {
  id = 'audio-spectrum';
  cueType = AudioCueType.SpectrumCue;
  description = 'Spectrum analyzer: spreads frequency bands across front and back lights';

  async execute(
    data: AudioCueData,
    sequencer: ILightingController,
    lightManager: DmxLightManager
  ): Promise<void> {
    const { audioData, config } = data;
    const { frequencyBands } = audioData;

    const ranges = config.frequencyBands?.ranges || [];
    if (ranges.length === 0) {
      return;
    }

    const configBandCount = config.frequencyBands?.bandCount;
    const enabledBandCount = data.enabledBandCount ?? configBandCount ?? 4;

    const bandValues = [
      frequencyBands.range1,
      frequencyBands.range2,
      frequencyBands.range3,
      frequencyBands.range4,
      frequencyBands.range5
    ];

    const allLights = lightManager.getLights(['front', 'back'], 'all');
    if (!allLights || allLights.length === 0) {
      return;
    }

    const orderedLights = [...allLights].sort((a, b) => {
      const positionDiff = (a.position ?? 0) - (b.position ?? 0);
      if (positionDiff !== 0) {
        return positionDiff;
      }
      return a.id.localeCompare(b.id);
    });

    const bandIndices =
      enabledBandCount >= 5
        ? [0, 1, 2, 3, 4]
        : enabledBandCount === 4
          ? [0, 1, 2, 3]
          : [0, 2, 4];
    type ActiveBand = { range: AudioRangeConfig; bandIntensity: number };
    const activeBands: ActiveBand[] = bandIndices
      .map((bandIndex) => {
        const range = ranges[bandIndex];
        if (!range) {
          return null;
        }
        return {
          range,
          bandIntensity: bandValues[bandIndex] ?? 0
        };
      })
      .filter((band): band is ActiveBand => band !== null);

    if (activeBands.length === 0) {
      return;
    }

    if (enabledBandCount === 4) {
      const specialMapping = this.mapLightsForFourBandMode(orderedLights);
      if (specialMapping) {
        specialMapping.forEach((lightsForBand, index) => {
          const band = activeBands[index];
          if (!band) {
            return;
          }
          this.applyBandToLights({
            lights: lightsForBand,
            range: band.range,
            bandIntensity: band.bandIntensity,
            layer: index,
            sequencer
          });
        });
        return;
      }
    }

    let startIndex = 0;
    let remainingLights = orderedLights.length;
    let remainingBands = activeBands.length;

    activeBands.forEach((band, index) => {
      if (remainingBands <= 0) {
        return;
      }

      let lightsForBand: TrackedLight[] = [];
      if (remainingLights > 0) {
        const isLastBand = index === activeBands.length - 1;
        let count = isLastBand
          ? remainingLights
          : Math.max(1, Math.floor(remainingLights / remainingBands));
        count = Math.min(count, remainingLights);
        lightsForBand = orderedLights.slice(startIndex, startIndex + count);
        startIndex += count;
        remainingLights -= count;
      }

      remainingBands -= 1;

      this.applyBandToLights({
        lights: lightsForBand,
        range: band.range,
        bandIntensity: band.bandIntensity,
        layer: index,
        sequencer
      });
    });
  }

  private applyBandToLights({
    lights,
    range,
    bandIntensity,
    layer,
    sequencer
  }: {
    lights: TrackedLight[] | undefined;
    range: AudioRangeConfig;
    bandIntensity: number;
    layer: number;
    sequencer: ILightingController;
  }): void {
    sequencer.removeEffectByLayer(layer);

    if (!lights || lights.length === 0 || !range) {
      return;
    }

    const normalizedIntensity = Math.max(0, Math.min(1, bandIntensity));
    if (normalizedIntensity < 0.02 || range.sensitivity === 0) {
      return;
    }

    const activeLightCount = Math.max(1, Math.round(normalizedIntensity * lights.length));
    const activeLights = lights.slice(0, activeLightCount);

    if (activeLights.length === 0) {
      return;
    }

    const color = validateColorString(range.color);
    if (!color) {
      console.warn(`Invalid color for range ${range.name}: ${range.color}`);
      return;
    }

    const brightness = range.brightness || 'medium';
    const rgbColor = getColor(color, brightness, 'replace');
    rgbColor.intensity = Math.floor(rgbColor.intensity * normalizedIntensity);
    rgbColor.opacity = normalizedIntensity;

    const effect = getEffectSingleColor({
      lights: activeLights,
      color: rgbColor,
      duration: 100,
      layer
    });

    sequencer.addEffect(`audio-spectrum-band-${layer}`, effect);
  }

  onStop(): void {
    // Cleanup if needed
  }

  onDestroy(): void {
    // Cleanup if needed
  }

  private mapLightsForFourBandMode(lights: TrackedLight[]): TrackedLight[][] | null {
    if (lights.length === 4) {
      return lights.map((light) => [light]);
    }

    if (lights.length === 8) {
      return [
        [lights[0], lights[7]],
        [lights[1], lights[6]],
        [lights[2], lights[5]],
        [lights[3], lights[4]]
      ];
    }

    return null;
  }
}

