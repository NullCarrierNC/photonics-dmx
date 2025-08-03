import { ICue, CueStyle } from '../../interfaces/ICue';
import { CueData, CueType } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';

/**
 * StageKit Blackout Cue - Turns off all lights
 * Set all lights to off
 */
export class StageKitBlackoutCue implements ICue {
  id = 'stagekit-blackout';
  cueId = CueType.Blackout_Fast;
  description = 'StageKit blackout pattern - stub implementation';
  style = CueStyle.Primary;

  async execute(_cueData: CueData, _controller: ILightingController, _lightManager: DmxLightManager): Promise<void> {
    // TODO: Implement blackout pattern
    // - Turns off all lights
    // - Set all colors to none
    console.log('StageKitBlackoutCue: All lights off (stub)');
  }

  onStop(): void {
    
  }

  onPause(): void {
   
  }

  onDestroy(): void {
   
  }
} 