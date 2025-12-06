import { IAudioCue } from '../../../interfaces/IAudioCue';
import { AudioCueData, BuiltInAudioCues } from '../../../types/audioCueTypes';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { getEffectSingleColor } from '../../../../effects';
import { getColor } from '../../../../helpers';
import type { Color } from '../../../../types';
import {
  clamp01,
  getAverageBandIntensity
} from '../../utils/bandUtils';
import { clearCueLayers } from '../../utils/cueLayerUtils';

export class TriadCascadeCue implements IAudioCue {
  id = 'audio-triad-cascade';
  cueType = BuiltInAudioCues.TriadCascade;
  description = 'Low, mid, and high band groups cascade from front to back shortly after each beat';
  private readonly layersToClear = [0, 1, 2];
  private sequencerRef: ILightingController | null = null;
  private lightManagerRef: DmxLightManager | null = null;

  async execute(
    data: AudioCueData,
    sequencer: ILightingController,
    lightManager: DmxLightManager
  ): Promise<void> {
    this.sequencerRef = sequencer;
    this.lightManagerRef = lightManager;
    const layers: Array<{
      lights: ReturnType<DmxLightManager['getLights']>;
      bands: number[];
      colorName: Color;
    }> = [
      {
        lights: lightManager.getLights('front', 'third-1'),
        bands: [0, 1],
        colorName: 'red'
      },
      {
        lights: lightManager.getLights('front', 'third-2'),
        bands: [2],
        colorName: 'green'
      },
      {
        lights: lightManager.getLights('front', 'third-3'),
        bands: [3, 4],
        colorName: 'blue'
      }
    ];

    layers.forEach((layer, index) => {
      if (layer.lights.length === 0) {
        return;
      }

      const intensity = clamp01(
        getAverageBandIntensity(data.audioData, layer.bands) * (index === 0 ? 1.1 : 1)
      );
      if (intensity < 0.05) {
        sequencer.removeEffectByLayer(41 + index);
        return;
      }

      const color = getColor(layer.colorName as any, index === 2 ? 'high' : 'medium', 'add');
      color.intensity = Math.min(255, Math.floor(color.intensity * (0.4 + intensity)));
      color.opacity = clamp01(0.35 + intensity * 0.6);

      const effect = getEffectSingleColor({
        lights: layer.lights,
        color,
        duration: 150 + index * 40,
        layer: 41 + index,
        waitFor: data.audioData.beatDetected ? 'beat' : 'none',
        forTime: index * 30
      });

      sequencer.addEffect(`triad-cascade-${index}`, effect);
    });
  }

  onStop(): void {
    clearCueLayers(this.sequencerRef, this.layersToClear, this.lightManagerRef);
  }

  onDestroy(): void {
    clearCueLayers(this.sequencerRef, this.layersToClear, this.lightManagerRef);
  }
}

