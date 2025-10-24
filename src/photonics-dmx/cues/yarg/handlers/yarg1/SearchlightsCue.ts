import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { ICue, CueStyle } from '../../../interfaces/ICue';
import { getColor } from '../../../../helpers/dmxHelpers';
import { getSweepEffect } from '../../../../effects/sweepEffect';
import {  RGBIO } from '../../../../types';
import { randomBetween } from '../../../../helpers/utils';

var ltr = true;

export class SearchlightsCue implements ICue {
  id = 'default-searchlights';
  cueId = CueType.Searchlights;
  description = 'Slow sweeping effect of a random bright color (red, green, blue, or white) that alternates direction with each activation';
  style = CueStyle.Secondary;


  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const frontLights = lightManager.getLights(['front'], 'all');
    const backLights = lightManager.getLights(['back'], 'all');

     const allLights = [...frontLights, ...backLights];
   
    if (!ltr) {
      allLights.reverse();
    }

    const transparent: RGBIO = getColor('transparent', 'low');
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
    const didAdd =  sequencer.addEffectUnblockedName('searchlights', sweep);
    if (didAdd) {
      ltr = !ltr;
    }
  }

  onStop(): void {
 
  }

  onPause(): void {
    // Pause handled by effect system
  }

  onDestroy(): void {
    // Cleanup handled by effect system
  }
} 