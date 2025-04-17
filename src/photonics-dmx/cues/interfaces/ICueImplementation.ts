import { CueData } from '../cueTypes';
import { ILightingController } from '../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../controllers/DmxLightManager';

/**
 * Interface defining a cue implementation.
 * Each cue type can have multiple implementations that define
 * how the lighting should behave for that cue.
 */
export interface ICueImplementation {
  /**
   * Description of the cue effect's appearance
   */
  description?: string;
  
  /**
   * Execute the cue implementation
   * @param data The cue data containing timing and parameters
   * @param controller The lighting controller to use
   * @param lightManager The DMX light manager to use
   */
  execute(data: CueData, controller: ILightingController, lightManager: DmxLightManager): void;
} 