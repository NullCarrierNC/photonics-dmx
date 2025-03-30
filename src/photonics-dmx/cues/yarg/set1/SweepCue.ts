import { CueData } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { ICue } from '../../interfaces/ICue';
import { getColor } from '../../../helpers/dmxHelpers';
import { getSweepEffect } from '../../../effects/sweepEffect';
import { randomBetween } from '../../../helpers/utils';

export class SweepCue implements ICue {
  name = 'sweep';

  async execute(parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const transparent = getColor('transparent', 'high');
    const red = getColor('red', 'max');
    const yellow = getColor('yellow', 'max');
    const green = getColor('green', 'max');
    const blue = getColor('blue', 'max');

    const lights = lightManager.getLights(['front'], 'all');

    const dir = randomBetween(0, 1);
    if (dir === 1) {
      lights.reverse();
    }

    let color = yellow;
    const rndClr = randomBetween(0, 1);

    if (parameters.venueSize === 'Small') {
      if (rndClr === 0) {
        color = blue;
      } else {
        color = green;
      }
    } else {
      if (rndClr === 0) {
        color = red;
      } else {
        color = yellow;
      }
    }

    const sweep = getSweepEffect({
      lights: lights,
      high: color,
      low: transparent,
      sweepTime: 900,
      fadeInDuration: 300,
      fadeOutDuration: 600,
      lightOverlap: 70,
      layer: 101,
    });

    sequencer.addEffectUnblockedName('sweep', sweep);
  }
} 