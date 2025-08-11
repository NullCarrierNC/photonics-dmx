import { ICue, CueStyle } from '../../interfaces/ICue';
import { CueData, CueType } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';

/**
 * StageKit Strobe Off Cue - Disables strobe effects
 */
export class StageKitStrobeOffCue implements ICue {
  id = 'stagekit-strobeoff';
  cueId = CueType.Strobe_Off;
  description = 'StageKit strobeoff pattern - stub implementation';
  style = CueStyle.Primary;

  async execute(_cueData: CueData, _controller: ILightingController, _lightManager: DmxLightManager): Promise<void> {
    // TODO: Implement strobe off pattern

    console.log('StageKitStrobeOffCue: Disable strobe effects (stub)');
  }

  onStop(): void {
    
  }

  onPause(): void {
   
  }

  onDestroy(): void {
   
  }
} 