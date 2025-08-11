import { ICue, CueStyle } from '../../interfaces/ICue';
import { CueData, CueType } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';


/**
 * StageKit Stomp Cue - Keyframe-based toggle with all lights
 * Starts with all lights on, toggles on/off with each keyframe
 */
export class StageKitStompCue implements ICue {
  id = 'stagekit-stomp';
  cueId = CueType.Stomp;
  description = 'StageKit stomp pattern - keyframe-based toggle';
  style = CueStyle.Primary;

  async execute(cueData: CueData, controller: ILightingController, lightManager: DmxLightManager): Promise<void> {
    
  }

  onStop(): void {
    // Cleanup handled by effect system
  }

  onPause(): void {
    // Pause handled by effect system
  }

  onDestroy(): void {
    // Cleanup handled by effect system
  }
} 