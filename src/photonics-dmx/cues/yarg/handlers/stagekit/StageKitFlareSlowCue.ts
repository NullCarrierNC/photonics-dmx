import { ICue, CueStyle } from '../../../interfaces/ICue';
import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { getEffectSingleColor } from '../../../../effects';
import { getColor } from '../../../../helpers';


/**
 * StageKit Flare Slow Cue
 */
export class StageKitFlareSlowCue implements ICue {
  id = 'stagekit-flare-slow';
  cueId = CueType.Flare_Slow;
  description = 'All to white, high.';
  style = CueStyle.Primary;
  private isFirstExecution: boolean = true;

  async execute(_cueData: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const white = getColor('white', 'high');
    const allLights = lightManager.getLights(['front', 'back'], 'all');
    const effect = getEffectSingleColor({
      lights: allLights,
      color: white,
      duration: 100,
    });

    if (this.isFirstExecution) {
      sequencer.setEffect('stagekit-flare-slow', effect);
      this.isFirstExecution = false;
    } else {
      sequencer.addEffect('stagekit-flare-slow', effect);
    }
  }

  onStop(): void {
    this.isFirstExecution = true;
  }

  onPause(): void {
    // Pause handled by effect system
  }

  onDestroy(): void {
    // Cleanup handled by effect system
  }
} 