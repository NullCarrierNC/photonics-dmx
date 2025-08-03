import { ICue, CueStyle } from '../../interfaces/ICue';
import { CueData } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';

/**
 * StageKit Silhouettes Cue - Silhouette effect
 * Set green to all, others to none
 */
export class StageKitSilhouettesCue implements ICue {
  id = 'stagekit-silhouettes';
  cueId = 'StageKitSilhouettes';
  description = 'StageKit silhouettes pattern - stub implementation';
  style = CueStyle.Primary;

  async execute(_cueData: CueData, _controller: ILightingController, _lightManager: DmxLightManager): Promise<void> {
    // TODO: Implement silhouettes pattern
    // - Simple static pattern
    // - Set green to all, others to none
    console.log('StageKitSilhouettesCue: All green silhouettes pattern (stub)');
  }

  onStop(): void {
    
  }

  onPause(): void {
   
  }

  onDestroy(): void {
   
  }
} 