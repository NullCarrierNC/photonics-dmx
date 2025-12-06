import { IAudioCue } from '../../../interfaces/IAudioCue';
import { AudioCueData, BuiltInAudioCues } from '../../../types/audioCueTypes';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { getEffectFlashColor, getEffectSingleColor } from '../../../../effects';
import {
  clamp01,
  DEFAULT_LAYER_DURATION,
  getActiveBandIndices,
  getBandValue,
  getRangeAndColor,
  getIntensityScale,
  applyIntensityScale
} from '../../utils/bandUtils';
import { clearCueLayers } from '../../utils/cueLayerUtils';

export class PulseChaserCue implements IAudioCue {
  id = 'audio-pulse-chaser';
  cueType = BuiltInAudioCues.PulseChaser;
  description = 'Front/back chase that pulses on beat with colours derived from active bands';
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
    const { audioData, config, enabledBandCount } = data;
    const activeBandIndices = getActiveBandIndices(enabledBandCount);
    const dominantInfo = activeBandIndices
      .map((bandIndex) => ({
        bandIndex,
        intensity: getBandValue(audioData.frequencyBands, bandIndex)
      }))
      .sort((a, b) => b.intensity - a.intensity)[0];

    if (!dominantInfo) {
      return;
    }

    const rangeColor = getRangeAndColor(
      config,
      dominantInfo.bandIndex,
      1,
      'add',
      1
    );
    if (!rangeColor) {
      return;
    }

    const baseColor = rangeColor.color;
    const linearResponse = config.linearResponse !== false;

    const frontLights = lightManager.getLights('front', 'all');
    const backLights = lightManager.getLights('back', 'all');
    if (frontLights.length === 0 && backLights.length === 0) {
      return;
    }

    const dominantScale = getIntensityScale(dominantInfo.intensity, linearResponse);
    const frontColor = { ...baseColor };
    applyIntensityScale(frontColor, Math.min(1, dominantScale * 1.15));

    const beatIntensity = audioData.beatDetected ? 1 : clamp01(audioData.energy * 1.2);
    const beatScale = getIntensityScale(beatIntensity, linearResponse);
    const backColor = { ...baseColor };
    applyIntensityScale(backColor, beatScale);

    if (frontLights.length > 0) {
      const chaserEffect = getEffectSingleColor({
        lights: frontLights,
        color: frontColor,
        duration: DEFAULT_LAYER_DURATION,
        layer: 1
      });
      sequencer.addEffect('pulse-chaser-front', chaserEffect);
    }

    if (backLights.length > 0) {
      const flashEffect = getEffectFlashColor({
        lights: backLights,
        color: backColor,
        durationIn: 60,
        holdTime: 40,
        durationOut: 120,
        layer: 2,
        startTrigger: audioData.beatDetected ? 'beat' : 'none',
        startWait: 0,
        endTrigger: 'none'
      });
      sequencer.addEffect('pulse-chaser-back', flashEffect);
    }
  }

  onStop(): void {
    clearCueLayers(this.sequencerRef, this.layers, this.lightManagerRef);
  }

  onDestroy(): void {
    clearCueLayers(this.sequencerRef, this.layers, this.lightManagerRef);
  }
}


