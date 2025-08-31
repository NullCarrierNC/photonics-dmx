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
  description = 'Small venue: Green/blue clockwise chase on beat (blue offset -1). Large venue: Yellow/red clockwise chase on beat (red offset -1). Doesn\'t colour blend like RB3E Stage Kit Mode.';
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
      color1 = getColor('yellow', 'medium', 'add');
      color2 = getColor('red', 'medium', 'add');
    } else {
      // Small venue: Green and Blue
      color1 = getColor('green', 'medium', 'add');
      color2 = getColor('blue', 'medium', 'add');
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
    
    // Layer 1: Color2 (Blue/Red) clockwise chase with -1 offset
    for (let lightIndex = 0; lightIndex < allLights.length; lightIndex++) {
        const light = allLights[lightIndex];
        
        // Calculate when this light should be color2 based on its position
        // Color2 starts at position -1 (offset) and steps clockwise
        const stepsUntilColor2 = (lightIndex - 1 + allLights.length) % allLights.length;
        
        // Add transparent transitions before color2 (to wait for the right beat)
        if (stepsUntilColor2 > 0) {
            harmonyTransitions.push({
                lights: [light],
                layer: 1,
                waitForCondition: 'none',
                waitForTime: 0,
                transform: {
                    color: transparentColor,
                    easing: 'linear',
                    duration: 0,
                },
                waitUntilCondition: 'beat',
                waitUntilTime: 0,
                waitUntilConditionCount: stepsUntilColor2
            });
        }
        
        // Add the color2 transition
        harmonyTransitions.push({
            lights: [light],
            layer: 1,
            waitForCondition: 'none',
            waitForTime: 0,
            transform: {
                color: color2,
                easing: 'linear',
                duration: 0,
            },
            waitUntilCondition: 'beat',
            waitUntilTime: 0
        });
        
        // Add transparent transitions after color2 (to wait until the cycle completes)
        const stepsAfterColor2 = allLights.length - stepsUntilColor2 - 1;
        if (stepsAfterColor2 > 0) {
            harmonyTransitions.push({
                lights: [light],
                layer: 1,
                waitForCondition: 'none',
                waitForTime: 0,
                transform: {
                    color: transparentColor,
                    easing: 'linear',
                    duration: 0,
                },
                waitUntilCondition: 'beat',
                waitUntilTime: 0,
                waitUntilConditionCount: stepsAfterColor2
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