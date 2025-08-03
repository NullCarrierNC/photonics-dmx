import { ICue, CueStyle } from '../../interfaces/ICue';
import { CueData, CueType } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';

/**
 * StageKit Menu Cue - Blue lights rotating in sequence
 * 2-second cycle, blue lights rotating around all lights
 */
export class StageKitMenuCue implements ICue {
  id = 'stagekit-menu';
  cueId = CueType.Menu;
  description = 'StageKit menu pattern - blue lights rotating in sequence';
  style = CueStyle.Primary;

  async execute(_cueData: CueData, _controller: ILightingController, _lightManager: DmxLightManager): Promise<void> {
    // TODO: Implement menu pattern
    // - 2-second cycle
    // - Blue lights rotating in sequence
    // - Pattern: [0,1,2,3,4,5,6,7] with 2-second delay between steps
    console.log('StageKitMenuCue: Blue rotation pattern (stub)');
  }

  onStop(): void {
    
  }

  onPause(): void {
   
  }

  onDestroy(): void {
   
  }
} 