import { ICue, CueStyle } from '../../interfaces/ICue';
import { CueData, CueType } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';


/**
 * StageKit Flare Fast Cue - Blue lights (with green if previous was cool)
 */
export class StageKitFlareFastCue implements ICue {
  id = 'stagekit-flare-fast';
  cueId = CueType.Flare_Fast;
  description = 'StageKit flare fast pattern - blue lights';
  style = CueStyle.Primary;

  async execute(_cueData: CueData, controller: ILightingController, lightManager: DmxLightManager): Promise<void> {
    
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