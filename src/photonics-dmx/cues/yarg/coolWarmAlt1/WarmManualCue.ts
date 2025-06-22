import { CueData } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { ICue } from '../../interfaces/ICue';
import { YargCue } from '../YargCue';
import { getColor } from '../../../helpers/dmxHelpers';
import { getSweepEffect } from '../../../effects/sweepEffect';
import { randomBetween } from '../../../helpers/utils';
import { getEffectSingleColor } from '../../../effects';

export class WarmManualCue implements ICue {
  name = YargCue.WarmManual;
  description = 'Creates a sweep like effect with red and yellow on the measure. Red is used as primary colour with yellow as the low colour on all the lights.';

  async execute(parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const red = getColor('red', 'medium');
    const yellow = getColor('yellow', 'medium');
    const redLow = getColor('red', 'low');
    const yellowLow = getColor('yellow', 'low');
    const transparent = getColor('transparent', 'max');

    const mainColor = parameters.venueSize == 'Large' ? redLow : yellowLow;
    const highColor = parameters.venueSize == 'Large' ? yellow : red;

    const lights = lightManager.getLights(['front'], 'all');

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
   
    sequencer.setEffect('alt-warm-manual-base', solid);

    const sweep = getSweepEffect({
      lights: lights,
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