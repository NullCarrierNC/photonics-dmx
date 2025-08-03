import { ICue, CueStyle } from '../../interfaces/ICue';
import { CueData } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';

/**
 * StageKit Strobe Fast Cue - Fast-paced strobe effect
 */
export class StageKitStrobeFastCue implements ICue {
  id = 'stagekit-strobefast';
  cueId = 'StageKitStrobeFast';
  description = 'StageKit strobefast pattern - stub implementation';
  style = CueStyle.Primary;

  async execute(_cueData: CueData, _controller: ILightingController, _lightManager: DmxLightManager): Promise<void> {
    // TODO: Implement strobe fast pattern
    console.log('StageKitStrobeFastCue: Fast strobe effect (stub)');
  }

  onStop(): void {
    
  }

  onPause(): void {
   
  }

  onDestroy(): void {
   
  }
} 