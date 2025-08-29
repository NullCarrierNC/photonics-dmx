import { ICue, CueStyle } from '../../../interfaces/ICue';
import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';


/**
 * StageKit Flare Slow Cue
 */
export class StageKitFlareSlowCue implements ICue {
  id = 'stagekit-flare-slow';
  cueId = CueType.Flare_Slow;
  description = 'StageKit flare slow pattern - all colors on all lights';
  style = CueStyle.Primary;

  async execute(_cueData: CueData, _sequencer: ILightingController, _lightManager: DmxLightManager): Promise<void> {

  }

  onStop(): void {
    // Cleanup handled by effect system
  }

  onPause(): void {
    // Pause handled by effect system
  }

  onDestroy(): void {
    // Cleanup handled by effect system
  }
} 