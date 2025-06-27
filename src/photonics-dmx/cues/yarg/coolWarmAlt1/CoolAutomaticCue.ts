import { CueData } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { ICue, CueStyle } from '../../interfaces/ICue';
import { getColor } from '../../../helpers/dmxHelpers';
import { getEffectSingleColor, getEffectCycleLights } from '../../../effects';
import { YargCue } from '../YargCue';
import { randomBetween } from '../../../helpers/utils';

export class CoolAutomaticCue implements ICue {
  name = YargCue.CoolAutomatic;
  description = 'Sequential pattern where front lights change one by one on beat, cycling through all positions';
  style = CueStyle.Primary;

  async execute(parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const frontLights = lightManager.getLights(['front'], 'all');
    const backLights = lightManager.getLights(['back'], 'all');
    
    // Determine base color based on venue size from parameters
    const isLargeVenue = parameters.venueSize === "Large";
    const blue = getColor('blue', 'medium');
    const green = getColor('green', 'medium');
    const blueLow = getColor('blue', 'low');
    const greenLow = getColor('green', 'low');
    const baseColor = isLargeVenue ? greenLow : blueLow;
    const alternateColor = isLargeVenue ? blue : green;
   
   
    const backBaseLayer = getEffectSingleColor({
      lights: backLights,
      color: baseColor,
      duration: 100, 
      layer: 0,
    });
    sequencer.setEffect('cool-auto-back-base', backBaseLayer);
  

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