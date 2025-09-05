import { ICue, CueStyle } from '../../../interfaces/ICue';
import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { getColor } from '../../../../helpers/dmxHelpers';
import { Effect, EffectTransition } from '../../../../types';

/**
 * StageKit Harmony Cue - Venue-dependent clockwise chase patterns
 */
export class StageKitHarmonyCue implements ICue {
  id = 'stagekit-harmony';
  cueId = CueType.Harmony;
  description = 'Small venue: Green/blue clockwise chase on beat (= high cyan). Large venue: Yellow/red clockwise chase on beat (= high yellow). Stage Kit sets both colours to the same light number, so we blend them together.';
  style = CueStyle.Primary;

  // Track whether this is the first execution or a repeat
  private isFirstExecution: boolean = true;

  async execute(cueData: CueData, controller: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const allLights = lightManager.getLights(['front', 'back'], 'all');
    const transparentColor = getColor('transparent', 'medium');
    
    // Determine venue size and set colors accordingly
    const isLargeVenue = cueData.venueSize === 'Large';
    
    let color1, color2;
    if (isLargeVenue) {
      // Large venue: Yellow and Red
      color1 = getColor('yellow', 'high', 'add');
    } else {
      // Small venue: Green and Blue
      color1 = getColor('cyan', 'high', 'add');
    }
    
    // Create harmony effect with clockwise chase patterns
    const harmonyTransitions: EffectTransition[] = [];
    
    // Layer 0: Color1 (Green/Yellow) clockwise chase
    for (let lightIndex = 0; lightIndex < allLights.length; lightIndex++) {
        const light = allLights[lightIndex];
        
        // Calculate when this light should be color1 based on its position
        // Color1 starts at position 0 and steps clockwise
        const stepsUntilColor1 = lightIndex;
        
        // Add transparent transitions before color1 (to wait for the right beat)
        if (stepsUntilColor1 > 0) {
            harmonyTransitions.push({
                lights: [light],
                layer: 0,
                waitForCondition: 'none',
                waitForTime: 0,
                transform: {
                    color: transparentColor,
                    easing: 'linear',
                    duration: 0,
                },
                waitUntilCondition: 'beat',
                waitUntilTime: 0,
                waitUntilConditionCount: stepsUntilColor1
            });
        }
        
        // Add the color1 transition
        harmonyTransitions.push({
            lights: [light],
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
        
        // Add transparent transitions after color1 (to wait until the cycle completes)
        const stepsAfterColor1 = allLights.length - stepsUntilColor1 - 1;
        if (stepsAfterColor1 > 0) {
            harmonyTransitions.push({
                lights: [light],
                layer: 0,
                waitForCondition: 'none',
                waitForTime: 0,
                transform: {
                    color: transparentColor,
                    easing: 'linear',
                    duration: 0,
                },
                waitUntilCondition: 'beat',
                waitUntilTime: 0,
                waitUntilConditionCount: stepsAfterColor1
            });
        }
    }
    
   
    // Create the harmony effect
    const harmonyEffect: Effect = {
        id: "stagekit-harmony",
        description: `StageKit harmony pattern - ${isLargeVenue ? 'Yellow/Red' : 'Green/Blue'} clockwise chase on beat`,
        transitions: harmonyTransitions
    };
    
    // Apply the effect
    if (this.isFirstExecution) {
        // First time: use setEffect to clear any existing effects and start fresh
        await controller.setEffect('stagekit-harmony', harmonyEffect);
        this.isFirstExecution = false;
    } else {
        // Repeat call: use addEffect to add to existing effects
        await controller.addEffect('stagekit-harmony', harmonyEffect);
    }
  }

  onStop(): void {
    // Reset the first execution flag so next time this cue runs it will use setEffect
    this.isFirstExecution = true;
    // Cleanup handled by effect system
  }

  onPause(): void {
    // Pause handled by effect system
  }

  onDestroy(): void {
    // Cleanup handled by effect system
  }
} 