import { IAudioCue } from '../../../interfaces/IAudioCue';
import { AudioCueData, BuiltInAudioCues } from '../../../types/audioCueTypes';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { getEffectFadeInColorFadeOut } from '../../../../effects';
import { getColor } from '../../../../helpers';
import { clamp01 } from '../../utils/bandUtils';
import { clearCueLayers } from '../../utils/cueLayerUtils';

export class AuroraDriftCue implements IAudioCue {
  id = 'audio-aurora-drift';
  cueType = BuiltInAudioCues.AuroraDrift;
  description = 'Slow aurora-style drifts that swell with energy and soften when the audio backs off. Uses fixed colours and linear brightness scaling.';
  private readonly layers = [0, 1];
  private sequencerRef: ILightingController | null = null;
  private lightManagerRef: DmxLightManager | null = null;

  async execute(
    data: AudioCueData,
    sequencer: ILightingController,
    lightManager: DmxLightManager
  ): Promise<void> {
    this.sequencerRef = sequencer;
    this.lightManagerRef = lightManager;
    const front = lightManager.getLights('front', 'all');
    const back = lightManager.getLights('back', 'all');

    if (front.length === 0 && back.length === 0) {
      return;
    }

    const energyLevel = clamp01(data.audioData.energy * 0.9 + data.audioData.overallLevel * 0.4);
    const driftDuration = 280 + Math.floor(energyLevel * 320);

    const frontStart = getColor('teal', 'medium', 'add');
    const frontEnd = getColor('cyan', 'high', 'add');
    const backStart = getColor('violet', 'medium', 'add');
    const backEnd = getColor('magenta', 'high', 'add');

    [frontStart, frontEnd, backStart, backEnd].forEach((colour) => {
      colour.intensity = Math.min(255, Math.floor(colour.intensity * (0.3 + energyLevel)));
      colour.opacity = clamp01(0.25 + energyLevel * 0.5);
    });

    if (front.length > 0) {
      const effect = getEffectFadeInColorFadeOut({
        lights: front,
        startColor: frontStart,
        endColor: frontEnd,
        waitBeforeFadeIn: 0,
        fadeInDuration: driftDuration,
        holdDuration: 120,
        fadeOutDuration: driftDuration,
        waitAfterFadeOut: 40,
        layer: 44
      });
      sequencer.addEffect('aurora-front', effect);
    }

    if (back.length > 0) {
      const effect = getEffectFadeInColorFadeOut({
        lights: back,
        startColor: backStart,
        endColor: backEnd,
        waitBeforeFadeIn: 0,
        fadeInDuration: driftDuration + 80,
        holdDuration: 140,
        fadeOutDuration: driftDuration + 120,
        waitAfterFadeOut: 40,
        layer: 45
      });
      sequencer.addEffect('aurora-back', effect);
    }

    // Alternate configuration: shorten fade durations to ~160ms for more shimmer on small rigs.
  }

  onStop(): void {
    clearCueLayers(this.sequencerRef, this.layers, this.lightManagerRef);
  }

  onDestroy(): void {
    clearCueLayers(this.sequencerRef, this.layers, this.lightManagerRef);
  }
}


