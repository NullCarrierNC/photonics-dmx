import { AudioLightingData, AudioConfig } from '../listeners/Audio/audioTypes';

import { AudioCueHandler } from '../cueHandlers/AudioCueHandler';
import { DmxLightManager } from '../controllers/DmxLightManager';
import { ILightingController } from '../controllers/sequencer/interfaces';
import { AudioCueType } from '../cues/types/audioCueTypes';
import { AudioCueRegistry } from '../cues/registries/AudioCueRegistry';

/**
 * AudioCueProcessor - Processes audio data using cue-based system
 * 
 * This processor receives audio analysis data from the renderer process (via IPC)
 * and delegates to the AudioCueHandler to execute the active audio cue.
 */
export class AudioCueProcessor {
  private config: AudioConfig;
  private isActive = false;
  private cueHandler: AudioCueHandler;
  private currentCueType: AudioCueType;
  private registry: AudioCueRegistry;

  constructor(
    lightManager: DmxLightManager,
    private sequencer: ILightingController,
    audioConfig: AudioConfig
  ) {
    this.config = audioConfig;
    this.registry = AudioCueRegistry.getInstance();
    this.currentCueType = this.selectActiveCueType();
    this.cueHandler = new AudioCueHandler(lightManager, sequencer);
  }

  /**
   * Start processing audio data
   */
  public start(): void {
    if (this.isActive) {
      console.warn('AudioCueProcessor: Already active');
      return;
    }
    this.isActive = true;
    console.log('AudioCueProcessor: Started with cue:', this.currentCueType);
  }

  /**
   * Stop processing audio data
   */
  public stop(): void {
    if (!this.isActive) return;

    this.isActive = false;
    this.cueHandler.stop();

    // Clear all audio-related effects
    // Remove effects from layers 0-4 (the frequency range layers)
    for (let layer = 0; layer < 5; layer++) {
      this.sequencer.removeEffectByLayer(layer, true);
    }

    console.log('AudioCueProcessor: Stopped');
  }

  /**
   * Update configuration
   */
  public updateConfig(config: AudioConfig): void {
    this.config = config;
    console.log('AudioCueProcessor: Configuration updated');
  }

  /**
   * Process audio data received from renderer via IPC
   * This is called by ControllerManager when it receives audio:data from renderer
   */
  public processAudioData(data: AudioLightingData): void {
    if (!this.isActive) return;

    const bandCount = this.getEnabledBandCount();
    this.cueHandler.handleAudioData(data, this.config, this.currentCueType, bandCount);
  }

  /**
   * Check if processor is active
   */
  public isProcessing(): boolean {
    return this.isActive;
  }

  /**
   * Shutdown and cleanup
   */
  public shutdown(): void {
    this.stop();
    this.cueHandler.destroy();
    console.log('AudioCueProcessor: Shutdown complete');
  }

  /**
   * Re-evaluate which cue type should be active based on enabled audio cue groups
   */
  public refreshCueSelection(): void {
    const selected = this.selectActiveCueType();
    if (selected !== this.currentCueType) {
      console.log(`AudioCueProcessor: Switching cue from ${this.currentCueType} to ${selected}`);
      this.currentCueType = selected;
    }
  }

  /**
   * Determine which cue type should be used
   */
  private selectActiveCueType(): AudioCueType {
    const availableCueTypes = this.registry.getAvailableCueTypes();
    if (availableCueTypes.length > 0) {
      return availableCueTypes[0];
    }

    // Fallback to first cue from any registered group
    const allCueTypes = this.registry.getAvailableCueTypes(true);
    if (allCueTypes.length > 0) {
      return allCueTypes[0];
    }

    // Absolute fallback
    return AudioCueType.BasicLayered;
  }

  private getEnabledBandCount(): number {
    return this.config.frequencyBands?.bandCount ?? 3;
  }
}

