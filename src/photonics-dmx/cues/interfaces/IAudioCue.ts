import { AudioCueData, AudioCueType } from '../types/audioCueTypes';
import { ILightingController } from '../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../controllers/DmxLightManager';


/**
 * Interface for audio-reactive lighting cues
 */
export interface IAudioCue {
  /** Unique identifier for the cue */
  id: string;
  
  /** The AudioCueType this cue implements */
  cueType: AudioCueType;
  
  /** Description of the cue effect's appearance */
  description: string;
  
  /**
   * Execute the cue with the given audio data
   * @param data The audio cue data
   * @param sequencer The lighting controller
   * @param lightManager The DMX light manager
   */
  execute(
    data: AudioCueData,
    sequencer: ILightingController,
    lightManager: DmxLightManager
  ): void | Promise<void>;
  
  /**
   * Called when the cue is stopped or being replaced
   */
  onStop?(): void;
  
  /**
   * Called when the cue is paused
   */
  onPause?(): void;
  
  /**
   * Called when the cue is completely removed/destroyed
   */
  onDestroy?(): void;
}

