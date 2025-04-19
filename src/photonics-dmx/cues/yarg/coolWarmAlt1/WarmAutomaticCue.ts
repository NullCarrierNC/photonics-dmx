import { CueData } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { ICue } from '../../interfaces/ICue';
import { getColor } from '../../../helpers/dmxHelpers';
import { getEffectSingleColor, getEffectCycleLights } from '../../../effects';
import { YargCue } from '../YargCue';
import { randomBetween } from '../../../helpers/utils';

export class WarmAutomaticCue implements ICue {
  name = YargCue.WarmAutomatic;
  description = 'Sequential pattern where front lights change one by one on beat, cycling through all positions with warm colours';

  async execute(parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const frontLights = lightManager.getLights(['front'], 'all');
    const backLights = lightManager.getLights(['back'], 'all');
    
    // Determine base color based on venue size from parameters
    const isLargeVenue = parameters.venueSize === "Large";
    const red = getColor('red', 'medium');
    const yellow = getColor('yellow', 'medium');
    const redLow = getColor('red', 'low');
    const yellowLow = getColor('yellow', 'low');
    const baseColor = isLargeVenue ? yellow : red;
    const backBaseColor = isLargeVenue ? yellowLow : redLow;
    const alternateColor = isLargeVenue ? red : yellow;
    const numFrontLights = frontLights.length;
    const numBackLights = backLights.length;

    // Set all front lights to the base colour
    if (numFrontLights > 0){
      const frontBaseLayer = getEffectSingleColor({
        lights: frontLights,
        color: baseColor,
        duration: 0, 
        layer: 0,
      });
      sequencer.setEffect('warm-auto-front-base', frontBaseLayer);
    }
    
    // Set all back lights to the base colour 
    if (numBackLights > 0){
      const backBaseLayer = getEffectSingleColor({
        lights: backLights,
        color: backBaseColor,
        duration: 0, 
        layer: 1,
      });
      sequencer.addEffect('warm-auto-back-base', backBaseLayer);
    }

    // Randomly reverse the lights direction 50% of the time
    const shouldReverse = randomBetween(0, 1) === 1;
    const orderedLights = shouldReverse ? [...frontLights].reverse() : frontLights;

    // Create the cycling lights effect
    const cycleEffect = getEffectCycleLights({
      lights: orderedLights,
      baseColor: baseColor,
      activeColor: alternateColor,
      transitionDuration: 100,
      layer: 2
    });

    sequencer.addEffect('warm-auto-cycle', cycleEffect);
  }
} 