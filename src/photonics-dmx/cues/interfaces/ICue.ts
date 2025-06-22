import { CueData } from '../cueTypes';
import { ILightingController } from '../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../controllers/DmxLightManager';

export interface ICue {
  /**
   * The name of the cue
   */
  name: string;

  /**
   * Description of the cue effect's appearance
   */
  description?: string;

  /**
   * Execute the cue with the given parameters
   * @param parameters The cue parameters
   * @param sequencer The lighting controller
   * @param lightManager The DMX light manager
   */
  execute(parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void>;

  /**
   * Called when the cue is stopped or being replaced by another cue
   * Use this to clean up any persistent state (static variables, timers, etc.)
   */
  onStop?(): void;

  /**
   * Called when the cue is paused
   */
  onPause?(): void;

  /**
   * Called when the cue is completely removed/destroyed
   * Use this for final cleanup of resources
   */
  onDestroy?(): void;
} 