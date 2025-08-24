import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { ICue, CueStyle } from '../../../interfaces/ICue';
import { getColor } from '../../../../helpers/dmxHelpers';
import { getSweepEffect } from '../../../../effects/sweepEffect';
import { TrackedLight, RGBIP } from '../../../../types';

export class MenuCue implements ICue {
  id = 'default-menu';
  cueId = CueType.Menu;
  description = 'Continuous blue sweep effect that moves around all lights in a circular pattern with a 2-second delay between passes';
  style = CueStyle.Primary;

  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const frontLights = lightManager.getLights(['front'], 'all');
    const backLights = lightManager.getLights(['back'], 'all');

    // Merge the sorted arrays into allLights
    const allLights = [...frontLights, ...backLights];
   
    const blue: RGBIP = getColor('blue', 'low');
    const brightBlue: RGBIP = getColor('blue', 'high');

    const sweep = getSweepEffect({
      lights: allLights,
      high: brightBlue,
      low: blue,
      sweepTime: 2000,
      fadeInDuration: 300,
      fadeOutDuration: 600,
      lightOverlap: 70,
      betweenSweepDelay: 2000,
      layer: 0,
    });
    // Use unblocked to avoid breaking the sweep timing.
    sequencer.addEffectUnblockedName('menu', sweep, 0, true);
  }
} 