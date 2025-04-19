import { CueData } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { ICue } from '../../interfaces/ICue';
import { getColor } from '../../../helpers/dmxHelpers';
import { getEffectSingleColor, getEffectCycleLights } from '../../../effects';
import { YargCue } from '../YargCue';
import { randomBetween } from '../../../helpers/utils';

export class CoolAutomaticCue implements ICue {
  name = YargCue.CoolAutomatic;
  description = 'Sequential pattern where front lights change one by one on beat, cycling through all positions';

  async execute(parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const frontLights = lightManager.getLights(['front'], 'all');
    //const backLights = lightManager.getLights(['back'], 'all');
    
    // Determine base color based on venue size from parameters
    const isLargeVenue = parameters.venueSize === "Large";
    const blue = getColor('blue', 'medium');
    const green = getColor('green', 'medium');
    //const blueLow = getColor('blue', 'low');
    //const greenLow = getColor('green', 'low');
    const baseColor = isLargeVenue ? green : blue;
  //  const backBaseColor = isLargeVenue ? greenLow : blueLow;
    const alternateColor = isLargeVenue ? blue : green;
    const numFrontLights = frontLights.length;
  //  const numBackLights = backLights.length;

    // Set all front lights to the base colour
    if (numFrontLights > 0){
      const frontBaseLayer = getEffectSingleColor({
        lights: frontLights,
        color: baseColor,
        duration: 100, 
        layer: 0,
      });
      sequencer.setEffect('cool-auto-front-base', frontBaseLayer);
    }
    
    // Set all back lights to the base colour 
    /* Back lights are flickering, need to investigate: 
    if (numBackLights > 0){
      const backBaseLayer = getEffectSingleColor({
        lights: backLights,
        color: backBaseColor,
        duration: 100, 
        layer: 1,
      });
      sequencer.addEffect('cool-auto-back-base', backBaseLayer);
    }
*/

    // Randomly reverse the lights direction 50% of the time
    const shouldReverse = randomBetween(0, 1) === 1;
    const orderedLights = shouldReverse ? [...frontLights].reverse() : frontLights;

    // Create the cycling lights effect
    const cycleEffect = getEffectCycleLights({
      lights: orderedLights,
      baseColor: baseColor,
      activeColor: alternateColor,
      transitionDuration: 100,
      layer: 5
    });

    sequencer.addEffect('cool-auto-cycle', cycleEffect);
  }
} 