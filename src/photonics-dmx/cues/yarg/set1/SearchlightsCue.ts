import { CueData } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { ICue } from '../../interfaces/ICue';
import { getColor } from '../../../helpers/dmxHelpers';
import { getSweepEffect } from '../../../effects/sweepEffect';
import { TrackedLight, RGBIP } from '../../../types';
import { randomBetween } from '../../../helpers/utils';
import { YargCue } from '../YargCue';

var ltr = true;

export class SearchlightsCue implements ICue {
  name = YargCue.Searchlights;

  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const frontLights = lightManager.getLights(['front'], 'all');
    const backLights = lightManager.getLights(['back'], 'all');

    const sortedFrontLights = frontLights.sort((a: TrackedLight, b: TrackedLight) => a.position - b.position);
    const sortedBackLights = backLights.sort((a: TrackedLight, b: TrackedLight) => b.position - a.position);

    const allLights = [...sortedFrontLights, ...sortedBackLights];
   
    if (!ltr) {
      allLights.reverse();
    }

    const transparent: RGBIP = getColor('transparent', 'low');
    const highRed = getColor('red', 'high');
    const highGreen = getColor('green', 'high');
    const highBlue = getColor('blue', 'high');
    const highWhite = getColor('white', 'high');

    const colors = [highBlue, highGreen, highRed, highWhite];
    const idx = randomBetween(0, colors.length - 1);
    const colour = colors[idx];

    const sweep = getSweepEffect({
      lights: allLights,
      high: colour,
      low: transparent,
      sweepTime: 2000,
      fadeInDuration: 300,
      fadeOutDuration: 600,
      lightOverlap: 70,
      layer: 101,
    });
    // Use unblocked to avoid breaking the sweep timing.
    const didAdd = sequencer.addEffectUnblockedName('searchlights', sweep);
    if (didAdd) {
      console.log(didAdd, ltr);
      ltr = !ltr;
    }
  }
} 