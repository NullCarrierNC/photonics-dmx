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
  description = 'Small venue: Green/blue clockwise chase on beat (= high cyan). Large venue: Yellow/red dual rotation patterns with 3-step and 4-step offsets (= additive blending).';
  style = CueStyle.Primary;

  // Track whether this is the first execution or a repeat
  private isFirstExecution: boolean = true;

  async execute(cueData: CueData, controller: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const allLights = lightManager.getLights(['front', 'back'], 'all');
    const isLargeVenue = cueData.venueSize === 'Large';
    
    const harmonyTransitions: EffectTransition[] = [];
    
    if (isLargeVenue) {
      this.createLargeVenueHarmony(harmonyTransitions, allLights);
    } else {
      this.createSmallVenueHarmony(harmonyTransitions, allLights);
    }
    
    // Create the harmony effect
    const harmonyEffect: Effect = {
        id: "stagekit-harmony",
        description: `StageKit harmony pattern - ${isLargeVenue ? 'Yellow/Red dual rotation' : 'Green/Blue clockwise chase'} on beat`,
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

  /**
   * Creates harmony transitions for large venue (Yellow and Red dual rotation)
   * Yellow LEDs: Rotate clockwise through positions 3→2→1→0→7→6→5→4
   * Red LEDs: Rotate clockwise through positions 4→3→2→1→0→7→6→5
   */
  private createLargeVenueHarmony(
    harmonyTransitions: EffectTransition[], 
    allLights: any[]
  ): void {
    const yellowColor = getColor('yellow', 'medium', 'add');
    const redColor = getColor('red', 'medium', 'add');
    const transparentColor = getColor('transparent', 'medium');

    // Layer 0: Yellow clockwise chase (offset by 3)
    for (let lightIndex = 0; lightIndex < allLights.length; lightIndex++) {
      const light = allLights[lightIndex];
      
      // Calculate when this light should be yellow based on its position
      // Yellow starts at position 3 and steps clockwise
      const yellowStartPosition = (lightIndex + 3) % allLights.length;
      const stepsUntilYellow = yellowStartPosition;
      
      // Add transparent transitions before yellow (to wait for the right beat)
      if (stepsUntilYellow > 0) {
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
          waitUntilConditionCount: stepsUntilYellow
        });
      }
      
      // Add the yellow transition
      harmonyTransitions.push({
        lights: [light],
        layer: 0,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: {
          color: yellowColor,
          easing: 'linear',
          duration: 0,
        },
        waitUntilCondition: 'beat',
        waitUntilTime: 0
      });
      
      // Add transparent transitions after yellow (to wait until the cycle completes)
      const stepsAfterYellow = allLights.length - stepsUntilYellow - 1;
      if (stepsAfterYellow > 0) {
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
          waitUntilConditionCount: stepsAfterYellow
        });
      }
    }

    // Layer 1: Red clockwise chase (offset by 4)
    for (let lightIndex = 0; lightIndex < allLights.length; lightIndex++) {
      const light = allLights[lightIndex];
      
      // Calculate when this light should be red based on its position
      // Red starts at position 4 and steps clockwise
      const redStartPosition = (lightIndex + 4) % allLights.length;
      const stepsUntilRed = redStartPosition;
      
      // Add transparent transitions before red (to wait for the right beat)
      if (stepsUntilRed > 0) {
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
          waitUntilConditionCount: stepsUntilRed
        });
      }
      
      // Add the red transition
      harmonyTransitions.push({
        lights: [light],
        layer: 1,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: {
          color: redColor,
          easing: 'linear',
          duration: 0,
        },
        waitUntilCondition: 'beat',
        waitUntilTime: 0
      });
      
      // Add transparent transitions after red (to wait until the cycle completes)
      const stepsAfterRed = allLights.length - stepsUntilRed - 1;
      if (stepsAfterRed > 0) {
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
          waitUntilConditionCount: stepsAfterRed
        });
      }
    }
  }

  /**
   * Creates harmony transitions for small venue (Green/Blue clockwise chase)
   */
  private createSmallVenueHarmony(
    harmonyTransitions: EffectTransition[], 
    allLights: any[]
  ): void {
    const color1 = getColor('cyan', 'high', 'add');
    const transparentColor = getColor('transparent', 'medium');
    
    // Layer 0: Color1 (Green/Blue) clockwise chase
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