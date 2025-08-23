import { ICue, CueStyle } from '../../interfaces/ICue';
import { CueData, CueType } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';

/**
 * StageKit Harmony Cue
 */
export class StageKitHarmonyCue implements ICue {
  id = 'stagekit-harmony';
  cueId = CueType.Harmony;
  description = 'StageKit harmony pattern - stub implementation';
  style = CueStyle.Primary;

  async execute(_cueData: CueData, _controller: ILightingController, _lightManager: DmxLightManager): Promise<void> {
    // TODO: Implement harmony pattern
    // - Venue-dependent patterns
    // - Large venue: Yellow and red patterns
    // - Small venue: Green and blue patterns
    console.log('StageKitHarmonyCue: Venue-dependent harmony patterns (stub)');
  }

  onStop(): void {
    
  }

  onPause(): void {
   
  }

  onDestroy(): void {
   
  }
} 