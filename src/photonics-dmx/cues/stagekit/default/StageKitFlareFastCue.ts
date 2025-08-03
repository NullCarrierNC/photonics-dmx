import { ICue, CueStyle } from '../../interfaces/ICue';
import { CueData } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';

/**
 * StageKit Flare Fast Cue - Fast flare effect
 * Set blue to all, green to all (if previous was cool), others to none
 */
export class StageKitFlareFastCue implements ICue {
  id = 'stagekit-flarefast';
  cueId = 'StageKitFlareFast';
  description = 'StageKit flarefast pattern - stub implementation';
  style = CueStyle.Primary;

  async execute(_cueData: CueData, _controller: ILightingController, _lightManager: DmxLightManager): Promise<void> {
    // TODO: Implement flare fast pattern
    // - Fast flare effect
    // - Set blue to all, green to all (if previous was cool), others to none
    console.log('StageKitFlareFastCue: Fast flare effect (stub)');
  }

  onStop(): void {
    
  }

  onPause(): void {
   
  }

  onDestroy(): void {
   
  }
} 