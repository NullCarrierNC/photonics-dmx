import { IAudioCue } from '../../../interfaces/IAudioCue';
import { AudioCueData, AudioCueType } from '../../../types/audioCueTypes';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { getEffectSingleColor } from '../../../../effects';
import { getColor } from '../../../../helpers';
import { clamp01, scaleColor, getIntensityScale } from '../../utils/bandUtils';
import { clearCueLayers } from '../../utils/cueLayerUtils';

export class BeatSplitPulseCue implements IAudioCue {
  id = 'audio-beat-split-pulse';
  cueType = AudioCueType.BeatSplitPulse;
  description = 'Alternates halves of the front flash on beat, leaving a softer glow on the opposite side.';
  private readonly layers = [0, 1, 2];
  private sequencerRef: ILightingController | null = null;
  private lightManagerRef: DmxLightManager | null = null;

  async execute(
    data: AudioCueData,
    sequencer: ILightingController,
    lightManager: DmxLightManager
  ): Promise<void> {
    this.sequencerRef = sequencer;
    this.lightManagerRef = lightManager;
    const { audioData } = data;
    const frontHalfA = lightManager.getLights('front', 'half-1');
    const frontHalfB = lightManager.getLights('front', 'half-2');

    if (frontHalfA.length === 0 && frontHalfB.length === 0) {
      return;
    }

    const beatPhase = data.executionCount % 2 === 0;
    const activeLights = beatPhase ? frontHalfA : frontHalfB;
    const trailingLights = beatPhase ? frontHalfB : frontHalfA;

    const activeBaseColor = getColor('magenta', 'high', 'add');
    const trailBaseColor = getColor('blue', 'medium', 'add');

    const beatBoost = audioData.beatDetected ? 0.45 : 0;
    const rawActiveScale = clamp01(audioData.overallLevel * 0.6 + beatBoost);
    const rawTrailingScale = clamp01(audioData.energy * 0.25);
    const rawBackScale = clamp01(audioData.energy * 0.4);
    const linearResponse = data.config.linearResponse !== false;
    const activeScale = getIntensityScale(rawActiveScale, linearResponse);
    const trailingScale = getIntensityScale(rawTrailingScale, linearResponse);
    const backScale = getIntensityScale(rawBackScale, linearResponse);

    if (activeLights.length > 0 && activeScale > 0.05) {
      const effect = getEffectSingleColor({
        lights: activeLights,
        color: scaleColor(activeBaseColor, 0.4 + activeScale),
        duration: 110,
        layer: 3,
        waitFor: audioData.beatDetected ? 'beat' : 'none'
      });
      sequencer.addEffect('beat-split-active', effect);
    } else {
      sequencer.removeEffectByLayer(3);
    }

    if (trailingLights.length > 0 && trailingScale > 0.02) {
      const effect = getEffectSingleColor({
        lights: trailingLights,
        color: scaleColor(trailBaseColor, 0.15 + trailingScale),
        duration: 160,
        layer: 4
      });
      sequencer.addEffect('beat-split-trail', effect);
    } else {
      sequencer.removeEffectByLayer(4);
    }

    const backLights = lightManager.getLights('back', 'all');
    if (backLights.length > 0) {
      const backColor = scaleColor(getColor('violet', 'medium', 'add'), backScale);
      const effect = getEffectSingleColor({
        lights: backLights,
        color: backColor,
        duration: 180,
        layer: 5
      });
      sequencer.addEffect('beat-split-back', effect);
    }
  }

  onStop(): void {
    clearCueLayers(this.sequencerRef, this.layers, this.lightManagerRef);
  }

  onDestroy(): void {
    clearCueLayers(this.sequencerRef, this.layers, this.lightManagerRef);
  }
}


