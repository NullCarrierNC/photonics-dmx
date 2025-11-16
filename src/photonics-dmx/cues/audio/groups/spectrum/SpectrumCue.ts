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
    if (ranges.length < 5) {
      return;
    }

    const configBandCount = config.frequencyBands?.bandCount;
    const enabledBandCount = data.enabledBandCount ?? configBandCount ?? 3;

    const bandValues = [
      frequencyBands.range1,
      frequencyBands.range2,
      frequencyBands.range3,
      frequencyBands.range4,
      frequencyBands.range5
    ];

    const frontThird1 = lightManager.getLights(['front'], 'third-1');
    const frontThird2 = lightManager.getLights(['front'], 'third-2');
    const frontThird3 = lightManager.getLights(['front'], 'third-3');

    const backThird1 = lightManager.getLights(['back'], 'third-3');
    const backThird2 = lightManager.getLights(['back'], 'third-2');
    const backThird3 = lightManager.getLights(['back'], 'third-1');

    const range2Enabled = enabledBandCount === 5 && ranges[1]?.sensitivity > 0;
    const range4Enabled = enabledBandCount === 5 && ranges[3]?.sensitivity > 0;

    // Bass front third-1
    this.applyBandToLights({
      lights: frontThird1,
      range: ranges[0],
      bandIntensity: bandValues[0],
      layer: 0,
      fallbackKey: 'front-third-1-bass',
      sequencer
    });

    // Back third-1: low-mids if enabled else bass
    this.applyBandToLights({
      lights: backThird1,
      range: range2Enabled ? ranges[1] : ranges[0],
      bandIntensity: range2Enabled ? bandValues[1] : bandValues[0],
      layer: 1,
      fallbackKey: `back-third-1-${range2Enabled ? 'low-mids' : 'bass'}`,
      sequencer
    });

    // Front third-2: mids
    this.applyBandToLights({
      lights: frontThird2,
      range: ranges[2],
      bandIntensity: bandValues[2],
      layer: 2,
      fallbackKey: 'front-third-2-mids',
      sequencer
    });

    // Back third-2: upper-mids if enabled else mids
    this.applyBandToLights({
      lights: backThird2,
      range: range4Enabled ? ranges[3] : ranges[2],
      bandIntensity: range4Enabled ? bandValues[3] : bandValues[2],
      layer: 3,
      fallbackKey: `back-third-2-${range4Enabled ? 'upper-mids' : 'mids'}`,
      sequencer
    });

    // Front third-3: highs
    this.applyBandToLights({
      lights: frontThird3,
      range: ranges[4],
      bandIntensity: bandValues[4],
      layer: 4,
      fallbackKey: 'front-third-3-highs',
      sequencer
    });

    // Back third-3: highs
    this.applyBandToLights({
      lights: backThird3,
      range: ranges[4],
      bandIntensity: bandValues[4],
      layer: 5,
      fallbackKey: 'back-third-3-highs',
      sequencer
    });
  }

  private applyBandToLights({
    lights,
    range,
    bandIntensity,
    layer,
    fallbackKey,
    sequencer
  }: {
    lights: TrackedLight[] | undefined;
    range: AudioRangeConfig;
    bandIntensity: number;
    layer: number;
    fallbackKey: string;
    sequencer: ILightingController;
  }): void {
    if (!lights || lights.length === 0 || !range) {
      return;
    }

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
    const rgbColor = getColor(color, brightness, 'replace');
    rgbColor.intensity = Math.floor(rgbColor.intensity * bandIntensity);
    rgbColor.opacity = bandIntensity;

    const effect = getEffectSingleColor({
      lights,
      color: rgbColor,
      duration: 100,
      layer
    });

    sequencer.addEffect(`audio-spectrum-${fallbackKey}`, effect);
  }

  onStop(): void {
    // Cleanup if needed
  }

  onDestroy(): void {
    // Cleanup if needed
  }
}

