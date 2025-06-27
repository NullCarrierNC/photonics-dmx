import { CueData } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { ICue, CueStyle } from '../../interfaces/ICue';
import { YargCue } from '../YargCue';
import { getColor } from '../../../helpers/dmxHelpers';
import { getSweepEffect } from '../../../effects/sweepEffect';
import { randomBetween } from '../../../helpers/utils';
import { getEffectSingleColor } from '../../../effects';

export class CoolManualCue implements ICue {
  name = YargCue.CoolManual;
  description = 'Manual green and blue cross-fade with beat-triggered cycling';
  style = CueStyle.Primary;

  async execute(parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const blue = getColor('blue', 'medium');
    const green = getColor('green', 'medium');
    const blueLow = getColor('blue', 'low');
    const greenLow = getColor('green', 'low');
    const transparent = getColor('transparent', 'max');

    const mainColor = parameters.venueSize == 'Large' ? blueLow : greenLow;
    const highColor = parameters.venueSize == 'Large' ? green : blue;

    const lights = lightManager.getLights(['front', 'back'], 'all');
    const frontLights = lightManager.getLights(['front'], 'all');


    const dir = randomBetween(0, 1);
    if (dir === 1) {
      lights.reverse();
    }

    const solid = getEffectSingleColor({
      lights: lights,
      color: mainColor,
      duration: 0,
      layer: 0,
    });
   
    sequencer.setEffect('alt-cool-manual-base', solid);

    const sweep = getSweepEffect({
      lights: frontLights,
      high: highColor,
      low: transparent,
      sweepTime: 1400,
      fadeInDuration: 500,
      fadeOutDuration: 600,
      lightOverlap: 90,
      layer: 101,
      waitFor: 'measure',
    });

    sequencer.addEffectUnblockedName('sweep', sweep);
  }
} 