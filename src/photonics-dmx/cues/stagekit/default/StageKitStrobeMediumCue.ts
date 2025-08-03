import { ICue, CueStyle } from '../../interfaces/ICue';
import { CueData } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';

/**
 * StageKit Strobe Medium Cue - Medium-paced strobe effect
 */
export class StageKitStrobeMediumCue implements ICue {
  id = 'stagekit-strobemedium';
  cueId = 'StageKitStrobeMedium';
  description = 'StageKit strobemedium pattern - stub implementation';
  style = CueStyle.Primary;

  async execute(_cueData: CueData, _controller: ILightingController, _lightManager: DmxLightManager): Promise<void> {
    // TODO: Implement strobe medium pattern

    console.log('StageKitStrobeMediumCue: Medium strobe effect (stub)');
  }

  onStop(): void {
    
  }

  onPause(): void {
   
  }

  onDestroy(): void {
   
  }
} 