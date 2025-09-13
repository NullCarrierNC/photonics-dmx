import { ICue, CueStyle } from '../../../interfaces/ICue';
import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { getColor } from '../../../../helpers/dmxHelpers';
import { Effect, EffectTransition } from '../../../../types';

/**
 * StageKit Frenzy Cue - Fast, chaotic lighting patterns
 * Venue-dependent frenzy patterns
 */
export class StageKitFrenzyCue implements ICue {
  id = 'stagekit-frenzy';
  cueId = CueType.Frenzy;
  description = 'Large venue: Red->Blue->Yellow cycle on beat. Small venue: Red->Green->Blue cycle on beat. NOTE: Differs from StageKit/YALCY which flashes each colour very quickly - this turns our lower number of lights into colourful strobes instead.';
  style = CueStyle.Primary;

  async execute(cueData: CueData, controller: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const allLights = lightManager.getLights(['front', 'back'], 'all');
    
    // Determine venue size and set colors accordingly
    const isLargeVenue = cueData.venueSize === 'Large';
    
    let color1, color2, color3;
    if (isLargeVenue) {
      // Large venue: Red -> Blue -> Yellow
      color1 = getColor('red', 'medium', 'add');
      color2 = getColor('blue', 'medium', 'add');
      color3 = getColor('yellow', 'medium', 'add');
    } else {
      // Small venue: Red -> Green -> Blue
      color1 = getColor('red', 'medium', 'add');
      color2 = getColor('green', 'medium', 'add');
      color3 = getColor('blue', 'medium', 'add');
    }
    
    // Create frenzy effect with 3-beat cycle
    const frenzyTransitions: EffectTransition[] = [];
    
    // beat 1: First color (Red)
    frenzyTransitions.push({
        lights: allLights,
        layer: 0,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: {
            color: color1,
            easing: 'linear',
            duration: 0,
        },
        waitUntilCondition: 'beat',
        waitUntilTime: 0
    });
    
    // beat 2: Second color (Blue for large, Green for small)
    frenzyTransitions.push({
        lights: allLights,
        layer: 0,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: {
            color: color2,
            easing: 'linear',
            duration: 0,
        },
        waitUntilCondition: 'beat',
        waitUntilTime: 0,
        waitUntilConditionCount: 1
    });
    
    // beat 3: Third color (Yellow for large, Blue for small)
    frenzyTransitions.push({
        lights: allLights,
        layer: 0,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: {
            color: color3,
            easing: 'linear',
            duration: 0,
        },
        waitUntilCondition: 'beat',
        waitUntilTime: 0,
        waitUntilConditionCount: 1
    });
    
    // Create the frenzy effect
    const frenzyEffect: Effect = {
        id: "stagekit-frenzy",
        description: `StageKit frenzy pattern - ${isLargeVenue ? 'Red->Blue->Yellow' : 'Red->Green->Blue'} cycle on beat`,
        transitions: frenzyTransitions
    };
    
    // Apply the effect
    await controller.setEffect('stagekit-frenzy', frenzyEffect);
  }

  onStop(): void {
    // Cleanup handled by effect system
  }

  onPause(): void {
    // Pause handled by effect system
  }

  onDestroy(): void {
    // Cleanup handled by effect system
  }
} 