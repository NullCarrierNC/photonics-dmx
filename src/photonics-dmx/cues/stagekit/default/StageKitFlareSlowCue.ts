import { ICue, CueStyle } from '../../interfaces/ICue';
import { CueData, CueType } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';

/**
 * StageKit Flare Slow Cue - Slow flare effect
 */
export class StageKitFlareSlowCue implements ICue {
  id = 'stagekit-flareslow';
  cueId = CueType.Flare_Slow;
  description = 'StageKit flareslow pattern - stub implementation';
  style = CueStyle.Primary;

  async execute(_cueData: CueData, _controller: ILightingController, _lightManager: DmxLightManager): Promise<void> {
    // TODO: Implement flare slow pattern
    // - Slow flare effect
    // - Set all colors to all
    console.log('StageKitFlareSlowCue: Slow flare effect (stub)');
  }

  onStop(): void {
    
  }

  onPause(): void {
   
  }

  onDestroy(): void {
   
  }
} 