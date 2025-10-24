import { ICue, CueStyle } from '../../../interfaces/ICue';
import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { getColor } from '../../../../helpers/dmxHelpers';
import { getBeatDuration } from '../../../../helpers/bpmUtils';
import { Effect, EffectTransition } from '../../../../types';

/**
 * StageKit Frenzy Cue - Fast, chaotic lighting patterns
 * Venue-dependent frenzy patterns
 */
export class StageKitFrenzyCue implements ICue {
  id = 'stagekit-frenzy';
  cueId = CueType.Frenzy;
  description = 'Large venue: Red->Blue->Yellow cycle with 25% beat delays. Small venue: Red->Green->Blue cycle with 25% beat delays. NOTE: Differs from StageKit/YALCY as they change LEDs at different times, but this doesn\'t map well to a lower number of lights.';
  style = CueStyle.Primary;
  
  private isFirstExecution: boolean = true;

  async execute(cueData: CueData, controller: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const allLights = lightManager.getLights(['front', 'back'], 'all');
    
    // Calculate delay timing - 25% of beat duration
    const beatDuration = getBeatDuration(cueData.beatsPerMinute);
    const delayTime = beatDuration * 0.25;
    
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
    
    // Create frenzy effect with delay-based timing
    const frenzyTransitions: EffectTransition[] = [];
    
    // First color (Red) - immediate
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
        waitUntilCondition: 'delay',
        waitUntilTime: delayTime
    });
    
    // Second color (Blue for large, Green for small) - after delay
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
        waitUntilCondition: 'delay',
        waitUntilTime: delayTime
    });
    
    // Third color (Yellow for large, Blue for small) - after another delay
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
        waitUntilCondition: 'delay',
        waitUntilTime: delayTime
    });
    
    // Create the frenzy effect
    const frenzyEffect: Effect = {
        id: "stagekit-frenzy",
        description: `StageKit frenzy pattern - ${isLargeVenue ? 'Red->Blue->Yellow' : 'Red->Green->Blue'} cycle with ${delayTime.toFixed(0)}ms delays`,
        transitions: frenzyTransitions
    };
    
    if (this.isFirstExecution) {
      controller.setEffect('stagekit-frenzy', frenzyEffect);
      this.isFirstExecution = false;
    } else {
      controller.addEffect('stagekit-frenzy', frenzyEffect);
    }
  }

  onStop(): void {
    this.isFirstExecution = true;
  }

  onPause(): void {
    // Pause handled by effect system
  }

  onDestroy(): void {
    // Cleanup handled by effect system
  }
} 