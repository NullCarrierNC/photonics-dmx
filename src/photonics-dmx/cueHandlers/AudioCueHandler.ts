import { EventEmitter } from 'events';
import { AudioLightingData, AudioConfig } from '../listeners/Audio/AudioTypes';
import { AudioCueData, AudioCueType } from '../listeners/Audio/AudioCueTypes';
import { IAudioCue } from '../listeners/Audio/interfaces/IAudioCue';
import { AudioCueRegistry } from '../listeners/Audio/AudioCueRegistry';
import { ILightingController } from '../controllers/sequencer/interfaces';
import { DmxLightManager } from '../controllers/DmxLightManager';

/**
 * Handler for audio-reactive lighting cues.
 */
export class AudioCueHandler extends EventEmitter {
  private registry: AudioCueRegistry;
  private currentCue: IAudioCue | null = null;
  private executionCount = 0;

  constructor(
    private lightManager: DmxLightManager,
    private sequencer: ILightingController
  ) {
    super();
    this.registry = AudioCueRegistry.getInstance();
  }

  /**
   * Handle audio data by executing the active cue
   * @param audioData The audio analysis data
   * @param config The audio configuration
   * @param cueType The type of cue to execute
   */
  public async handleAudioData(
    audioData: AudioLightingData,
    config: AudioConfig,
    cueType: AudioCueType
  ): Promise<void> {
    const cue = this.registry.getCueImplementation(cueType);
    if (!cue) {
      console.warn(`Audio cue not found: ${cueType}`);
      return;
    }

    // Update current cue if changed
    if (this.currentCue !== cue) {
      if (this.currentCue?.onStop) {
        this.currentCue.onStop();
      }
      this.currentCue = cue;
      this.executionCount = 0;
    }

    this.executionCount++;

    // Create cue data
    const cueData: AudioCueData = {
      audioData,
      config,
      timestamp: Date.now(),
      executionCount: this.executionCount
    };

    // Execute the cue
    await cue.execute(cueData, this.sequencer, this.lightManager);
  }

  /**
   * Stop the current cue
   */
  public stop(): void {
    if (this.currentCue?.onStop) {
      this.currentCue.onStop();
    }
    this.currentCue = null;
    this.executionCount = 0;
  }

  /**
   * Cleanup
   */
  public destroy(): void {
    if (this.currentCue?.onDestroy) {
      this.currentCue.onDestroy();
    }
    this.currentCue = null;
    this.executionCount = 0;
  }
}

