import { DmxLightManager } from "../../controllers/DmxLightManager";
import { ILightingController } from "../../controllers/sequencer/interfaces";
import { getEffectSingleColor } from "../../effects";
import { getColor, validateColorString } from "../../helpers";
import { AudioCueData, AudioCueType } from "../types/audioCueTypes";
import { IAudioCue } from "../interfaces/IAudioCue";

/**
 * SpectrumCue - acts like a spectrum analyzer by spreading frequency bands across lights
 * 
 * Distribution:
 * Front: third-1 (bass), third-2 (mids), third-3 (highs)
 * Back: 
 *   - third-1: low-mids if enabled (sensitivity > 0), otherwise bass
 *   - third-2: upper-mids if enabled, otherwise mids
 *   - third-3: highs
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

    // Get configured ranges
    const ranges = config.colorMapping?.ranges || [];
    if (ranges.length < 5) {
      return;
    }

    // Get frequency band values in order
    const bandValues = [
      frequencyBands.range1, // Bass
      frequencyBands.range2, // Low-Mids
      frequencyBands.range3, // Mids
      frequencyBands.range4, // Upper-Mids
      frequencyBands.range5  // Highs
    ];

    // Get front lights split into thirds
    const frontThird1 = lightManager.getLights(['front'], 'third-1');
    const frontThird2 = lightManager.getLights(['front'], 'third-2');
    const frontThird3 = lightManager.getLights(['front'], 'third-3');

    // Get back lights split into thirds
    const backThird1 = lightManager.getLights(['back'], 'third-3');
    const backThird2 = lightManager.getLights(['back'], 'third-2');
    const backThird3 = lightManager.getLights(['back'], 'third-1');

    // Check which ranges are enabled (sensitivity > 0)
    const range2Enabled = ranges[1]?.sensitivity > 0;
    const range4Enabled = ranges[3]?.sensitivity > 0;

    // Layer assignments to avoid conflicts
    let currentLayer = 0;

    // Front third-1: Bass (range1)
    if (frontThird1.length > 0 && bandValues[0] >= 0.01) {
      const range = ranges[0];
      const color = validateColorString(range.color);
      if (color) {
        const brightness = range.brightness || 'medium';
        const rgbColor = getColor(color, brightness, 'replace');
        rgbColor.intensity = Math.floor(rgbColor.intensity * bandValues[0]);
        rgbColor.opacity = bandValues[0];

        const effect = getEffectSingleColor({
          lights: frontThird1,
          color: rgbColor,
          duration: 100,
          layer: currentLayer
        });
        sequencer.addEffect(`audio-spectrum-front-third-1-bass`, effect);
      }
    } else {
      sequencer.removeEffectByLayer(currentLayer);
    }

    // Back third-1: Low-Mids (range2) if enabled, otherwise Bass (range1)
    if (backThird1.length > 0) {
      const useRange2 = range2Enabled && bandValues[1] >= 0.01;
      const rangeIndex = useRange2 ? 1 : 0;
      const bandIntensity = useRange2 ? bandValues[1] : bandValues[0];

      if (bandIntensity >= 0.01) {
        const range = ranges[rangeIndex];
        const color = validateColorString(range.color);
        if (color) {
          const brightness = range.brightness || 'medium';
          const rgbColor = getColor(color, brightness, 'replace');
          rgbColor.intensity = Math.floor(rgbColor.intensity * bandIntensity);
          rgbColor.opacity = bandIntensity;

          const effect = getEffectSingleColor({
            lights: backThird1,
            color: rgbColor,
            duration: 100,
            layer: currentLayer + 1
          });
          sequencer.addEffect(`audio-spectrum-back-third-1-${useRange2 ? 'low-mids' : 'bass'}`, effect);
        }
      } else {
        sequencer.removeEffectByLayer(currentLayer + 1);
      }
    }

    // Front third-2: Mids (range3)
    if (frontThird2.length > 0 && bandValues[2] >= 0.01) {
      const range = ranges[2];
      const color = validateColorString(range.color);
      if (color) {
        const brightness = range.brightness || 'medium';
        const rgbColor = getColor(color, brightness, 'replace');
        rgbColor.intensity = Math.floor(rgbColor.intensity * bandValues[2]);
        rgbColor.opacity = bandValues[2];

        const effect = getEffectSingleColor({
          lights: frontThird2,
          color: rgbColor,
          duration: 100,
          layer: currentLayer + 2
        });
        sequencer.addEffect(`audio-spectrum-front-third-2-mids`, effect);
      }
    } else {
      sequencer.removeEffectByLayer(currentLayer + 2);
    }

    // Back third-2: Upper-Mids (range4) if enabled, otherwise Mids (range3)
    if (backThird2.length > 0) {
      const useRange4 = range4Enabled && bandValues[3] >= 0.01;
      const rangeIndex = useRange4 ? 3 : 2;
      const bandIntensity = useRange4 ? bandValues[3] : bandValues[2];

      if (bandIntensity >= 0.01) {
        const range = ranges[rangeIndex];
        const color = validateColorString(range.color);
        if (color) {
          const brightness = range.brightness || 'medium';
          const rgbColor = getColor(color, brightness, 'replace');
          rgbColor.intensity = Math.floor(rgbColor.intensity * bandIntensity);
          rgbColor.opacity = bandIntensity;

          const effect = getEffectSingleColor({
            lights: backThird2,
            color: rgbColor,
            duration: 100,
            layer: currentLayer + 3
          });
          sequencer.addEffect(`audio-spectrum-back-third-2-${useRange4 ? 'upper-mids' : 'mids'}`, effect);
        }
      } else {
        sequencer.removeEffectByLayer(currentLayer + 3);
      }
    }

    // Front third-3: Highs (range5)
    if (frontThird3.length > 0 && bandValues[4] >= 0.01) {
      const range = ranges[4];
      const color = validateColorString(range.color);
      if (color) {
        const brightness = range.brightness || 'medium';
        const rgbColor = getColor(color, brightness, 'replace');
        rgbColor.intensity = Math.floor(rgbColor.intensity * bandValues[4]);
        rgbColor.opacity = bandValues[4];

        const effect = getEffectSingleColor({
          lights: frontThird3,
          color: rgbColor,
          duration: 100,
          layer: currentLayer + 4
        });
        sequencer.addEffect(`audio-spectrum-front-third-3-highs`, effect);
      }
    } else {
      sequencer.removeEffectByLayer(currentLayer + 4);
    }

    // Back third-3: Highs (range5)
    if (backThird3.length > 0 && bandValues[4] >= 0.01) {
      const range = ranges[4];
      const color = validateColorString(range.color);
      if (color) {
        const brightness = range.brightness || 'medium';
        const rgbColor = getColor(color, brightness, 'replace');
        rgbColor.intensity = Math.floor(rgbColor.intensity * bandValues[4]);
        rgbColor.opacity = bandValues[4];

        const effect = getEffectSingleColor({
          lights: backThird3,
          color: rgbColor,
          duration: 100,
          layer: currentLayer + 5
        });
        sequencer.addEffect(`audio-spectrum-back-third-3-highs`, effect);
      }
    } else {
      sequencer.removeEffectByLayer(currentLayer + 5);
    }
  }

  onStop(): void {
    // Cleanup if needed
  }

  onDestroy(): void {
    // Cleanup if needed
  }
}

