import { CueData } from '../cueTypes';
import { ILightingController } from '../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../controllers/DmxLightManager';

export interface ICue {
  /**
   * The name of the cue, used for identification
   */
  name: string;

  /**
   * Execute the cue with the given parameters
   * @param parameters The cue parameters
   * @param sequencer The lighting controller
   * @param lightManager The DMX light manager
   */
  execute(parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void>;
} 