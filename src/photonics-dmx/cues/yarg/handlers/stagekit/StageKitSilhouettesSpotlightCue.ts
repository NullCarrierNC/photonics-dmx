import { ICue, CueStyle } from '../../../interfaces/ICue';
import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';

/**
 * StageKit Silhouettes Spotlight Cue - Silhouette spotlight with vocal interaction
 */
export class StageKitSilhouettesSpotlightCue implements ICue {
  id = 'stagekit-silhouettesspotlight';
  cueId = CueType.Silhouettes_Spotlight;
  description = 'YALCY currently blacks out on this cue, so we do too.';
  style = CueStyle.Primary;

  async execute(_cueData: CueData, sequencer: ILightingController, _lightManager: DmxLightManager): Promise<void> {
    sequencer.blackout(0);
  }

  onStop(): void {
    
  }

  onPause(): void {
   
  }

  onDestroy(): void {
   
  }
} 