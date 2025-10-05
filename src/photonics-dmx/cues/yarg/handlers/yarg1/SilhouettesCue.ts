import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { ICue, CueStyle } from '../../../interfaces/ICue';
import { getColor } from '../../../../helpers/dmxHelpers';
import { getEffectSingleColor } from '../../../../effects/effectSingleColor';


export class SilhouettesCue implements ICue {
  id = 'default-silhouettes';
  cueId = CueType.Silhouettes;
  description = 'Solid green color on back lights, or front lights if no back lights are available';
  style = CueStyle.Primary;

  private isFirstExecution: boolean = true;

  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const back = lightManager.getLights(['back'], 'all');
    const front = lightManager.getLights(['front'], 'all');
    const green = getColor('green', 'medium');

    const singleColor = getEffectSingleColor({
      color: green,
      duration: 500,
      lights: back.length > 0 ? back : front,
      layer: 0,
    });
    
    if (this.isFirstExecution) {
      await sequencer.setEffect('silhouettes', singleColor);
      this.isFirstExecution = false;
    } else {
      await sequencer.addEffect('silhouettes', singleColor);
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