import { IAudioCue } from '../../../interfaces/IAudioCue';
import { AudioCueData, AudioCueType } from '../../../types/audioCueTypes';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { getEffectCycleLights } from '../../../../effects';
import { getColor } from '../../../../helpers';
import { clamp01, getBandValue, getIntensityScale } from '../../utils/bandUtils';
import { clearCueLayers } from '../../utils/cueLayerUtils';

export class SpectrumStepperCue implements IAudioCue {
  id = 'audio-spectrum-stepper';
  cueType = AudioCueType.SpectrumStepper;
  description = 'Sequentially steps through the rig on every beat, scaling brightness by average spectrum energy. Uses cyan and blue.';
  private readonly layers = [0];
  private sequencerRef: ILightingController | null = null;
  private lightManagerRef: DmxLightManager | null = null;
  private currentIndex = 0;
  private initialized = false;

  async execute(
    data: AudioCueData,
    sequencer: ILightingController,
    lightManager: DmxLightManager
  ): Promise<void> {
    this.sequencerRef = sequencer;
    this.lightManagerRef = lightManager;
    const lights = lightManager.getLights(['front', 'back'], 'linear');
    if (lights.length === 0) {
      return;
    }

    const avg =
      (getBandValue(data.audioData.frequencyBands, 0) +
        getBandValue(data.audioData.frequencyBands, 1) +
        getBandValue(data.audioData.frequencyBands, 2) +
        getBandValue(data.audioData.frequencyBands, 3) +
        getBandValue(data.audioData.frequencyBands, 4)) /
      5;

    const scaled = clamp01(0.25 + avg);
    if (scaled < 0.1) {
      sequencer.removeEffectByLayer(31);
      return;
    }

    const linearResponse = data.config.linearResponse !== false;
    const activeScale = getIntensityScale(scaled, linearResponse);
    const baseScale = getIntensityScale(0.15, linearResponse);

    const activeColor = getColor('cyan', 'high', 'add');
    activeColor.intensity = Math.min(255, Math.floor(activeColor.intensity * activeScale));
    activeColor.opacity = clamp01(0.5 + activeScale * 0.5);

    const baseColor = getColor('blue', 'low', 'add');
    baseColor.intensity = Math.floor(baseColor.intensity * baseScale);
    baseColor.opacity = baseScale;

    const shouldStep = data.audioData.beatDetected || !this.initialized;
    if (!shouldStep) {
      return;
    }

    const rotatedLights = [
      ...lights.slice(this.currentIndex),
      ...lights.slice(0, this.currentIndex)
    ];
    this.currentIndex = (this.currentIndex + 1) % lights.length;
    this.initialized = true;

    const effect = getEffectCycleLights({
      lights: rotatedLights,
      activeColor,
      baseColor,
      transitionDuration: 120,
      layer: 31,
      waitFor: 'beat'
    });

    sequencer.addEffect('spectrum-stepper', effect);
  }

  onStop(): void {
    clearCueLayers(this.sequencerRef, this.layers, this.lightManagerRef);
    this.initialized = false;
    this.currentIndex = 0;
  }

  onDestroy(): void {
    clearCueLayers(this.sequencerRef, this.layers, this.lightManagerRef);
    this.initialized = false;
    this.currentIndex = 0;
  }

}

