import { ICue, CueStyle } from '../../interfaces/ICue';
import { CueData, CueType } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';

/**
 * StageKit Strobe Fastest Cue - Extremely rapid strobe lighting
 */
export class StageKitStrobeFastestCue implements ICue {
  id = 'stagekit-strobefastest';
  cueId =  CueType.Strobe_Fastest;
  description = 'StageKit strobefastest pattern - stub implementation';
  style = CueStyle.Primary;

  async execute(_cueData: CueData, _controller: ILightingController, _lightManager: DmxLightManager): Promise<void> {
    // TODO: Implement strobe fastest pattern
    console.log('StageKitStrobeFastestCue: Fastest strobe effect (stub)');
  }

  onStop(): void {
    
  }

  onPause(): void {
   
  }

  onDestroy(): void {
   
  }
} 