import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { ICue, CueStyle } from '../../../interfaces/ICue';
import { getColor } from '../../../../helpers/dmxHelpers';
import { getSweepEffect } from '../../../../effects/sweepEffect';
import { RGBIO } from '../../../../types';

export class MenuCue implements ICue {
  id = 'default-menu';
  cueId = CueType.Menu;
  description = 'Continuous slow blue sweep effect that moves around all lights in a circular pattern with a 2 sec delay between passes';
  style = CueStyle.Primary;

  private isFirstExecution: boolean = true;

  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const frontLights = lightManager.getLights(['front'], 'all');
    const backLights = lightManager.getLights(['back'], 'all');

    // Merge the sorted arrays into allLights
    const allLights = [...frontLights, ...backLights];
   
    const blue: RGBIO = getColor('blue', 'low');
    const brightBlue: RGBIO = getColor('blue', 'high');

    const sweep = getSweepEffect({
      lights: allLights,
      high: brightBlue,
      low: blue,
      sweepTime: 3000,
      fadeInDuration: 300,
      fadeOutDuration: 600,
      lightOverlap: 70,
      betweenSweepDelay: 2000,
      layer: 0,
    });
    // Use unblocked to avoid breaking the sweep timing.
    if (this.isFirstExecution) {
      await sequencer.setEffectUnblockedName('menu', sweep, true);
      this.isFirstExecution = false;
    } else {
      await sequencer.addEffectUnblockedName('menu', sweep, true);
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