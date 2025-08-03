import { ICue, CueStyle } from '../../interfaces/ICue';
import { CueData, CueType } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';

/**
 * StageKit Default Cue
 */
export class StageKitDefaultCue implements ICue {
  id = 'stagekit-default';
  cueId = CueType.Default;
  description = 'StageKit default pattern - stub implementation';
  style = CueStyle.Primary;

  async execute(_cueData: CueData, _controller: ILightingController, _lightManager: DmxLightManager): Promise<void> {
    // TODO: Implement default pattern
    // - Large venue: Listen patterns for keyframe events
    // - Small venue: Multiple listen patterns for different events
    // - Event-driven rather than continuous patterns
    console.log('StageKitDefaultCue: Event-driven patterns (stub)');
  }

  onStop(): void {
    
  }

  onPause(): void {
   
  }

  onDestroy(): void {
   
  }
} 