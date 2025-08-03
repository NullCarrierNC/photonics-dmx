import { ICue, CueStyle } from '../../interfaces/ICue';
import { CueData, CueType } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';

/**
 * StageKit Strobe Slow Cue - Slow-paced strobe effect
 */
export class StageKitStrobeSlowCue implements ICue {
  id = 'stagekit-strobeslow';
  cueId = CueType.Strobe_Slow;
  description = 'StageKit strobeslow pattern - stub implementation';
  style = CueStyle.Primary;

  async execute(_cueData: CueData, _controller: ILightingController, _lightManager: DmxLightManager): Promise<void> {
    // TODO: Implement strobe slow pattern
    console.log('StageKitStrobeSlowCue: Slow strobe effect (stub)');
  }

  onStop(): void {
    
  }

  onPause(): void {
   
  }

  onDestroy(): void {
   
  }
} 