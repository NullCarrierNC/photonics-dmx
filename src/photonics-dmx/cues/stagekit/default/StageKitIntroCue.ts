import { ICue, CueStyle } from '../../interfaces/ICue';
import { CueData, CueType } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';

/**
 * StageKit Intro Cue - Simple intro lighting - all green
 * Set green to all, others to none
 */
export class StageKitIntroCue implements ICue {
  id = 'stagekit-intro';
  cueId = CueType.Intro;
  description = 'StageKit intro pattern - stub implementation';
  style = CueStyle.Primary;

  async execute(_cueData: CueData, _controller: ILightingController, _lightManager: DmxLightManager): Promise<void> {
    // TODO: Implement intro pattern
    // - Simple static pattern
    // - Set green to all, others to none
    console.log('StageKitIntroCue: All green intro pattern (stub)');
  }

  onStop(): void {
    
  }

  onPause(): void {
   
  }

  onDestroy(): void {
   
  }
} 