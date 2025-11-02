import { AudioLightingData, AudioConfig } from '../listeners/Audio/AudioTypes';
import { AudioCueType } from '../listeners/Audio/AudioCueTypes';
import { AudioCueHandler } from '../cueHandlers/AudioCueHandler';
import { DmxLightManager } from '../controllers/DmxLightManager';
import { ILightingController } from '../controllers/sequencer/interfaces';

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

  constructor(
    private _lightManager: DmxLightManager,
    private sequencer: ILightingController,
    audioConfig: AudioConfig,
    cueType: AudioCueType = AudioCueType.BasicLayered
  ) {
    this.config = audioConfig;
    this.currentCueType = cueType;
    this.cueHandler = new AudioCueHandler(_lightManager, sequencer);
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

    // Delegate to cue handler
    this.cueHandler.handleAudioData(data, this.config, this.currentCueType);
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
   * Set the active cue type
   */
  public setCueType(cueType: AudioCueType): void {
    this.currentCueType = cueType;
    // Restart if active
    if (this.isActive) {
      this.stop();
      this.start();
    }
  }

  /**
   * Get the current cue type
   */
  public getCueType(): AudioCueType {
    return this.currentCueType;
  }
}

