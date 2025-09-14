import { ICue, CueStyle } from '../../../interfaces/ICue';
import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { getColor } from '../../../../helpers';
import { Effect, EffectTransition } from '../../../../types';

/**
 * StageKit Sweep Cue - Sweeping light patterns around the LED ring
 * Large venue: Red diagonal sweep (6|2) → (5|1) → (4|0) → (3|7)
 * Small venue: Yellow diagonal sweep + Blue sequential + Green delayed reverse
 */
export class StageKitSweepCue implements ICue {
  id = 'stagekit-sweep';
  cueId = CueType.Sweep;
  description = 'Large venue: Red diagonal sweep (6|2) → (5|1) → (4|0) → (3|7). Small venue: Yellow diagonal + Blue sequential + Green delayed reverse. Green and blue only use lights 1-5.';
  style = CueStyle.Primary;

  private isFirstExecution: boolean = true;

  async execute(cueData: CueData, controller: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const allLights = lightManager.getLights(['front', 'back'], 'all');
    const isLargeVenue = cueData.venueSize === 'Large';
    const transparentColor = getColor('transparent', 'medium');
    
    // Beat-based timing: Each step advances on a beat
    const sweepTransitions: EffectTransition[] = [];

    // Start immediately (no initial wait)
    sweepTransitions.push({
      lights: allLights,
      layer: 0,
      waitForCondition: 'none',
      waitForTime: 0,
      transform: { color: transparentColor, easing: 'linear', duration: 0 },
      waitUntilCondition: 'none',
      waitUntilTime: 0
    });

    if (isLargeVenue) {
      this.createLargeVenueSweep(sweepTransitions, allLights);
    } else {
      this.createSmallVenueSweep(sweepTransitions, allLights);
    }

    const sweepEffect: Effect = {
      id: "stagekit-sweep",
      description: `StageKit sweep pattern - ${isLargeVenue ? 'Red diagonal sweep' : 'Yellow diagonal + Blue sequential + Green delayed reverse'}`,
      transitions: sweepTransitions
    };

    if (this.isFirstExecution) {
      await controller.setEffect('stagekit-sweep', sweepEffect);
      this.isFirstExecution = false;
    } else {
      await controller.addEffect('stagekit-sweep', sweepEffect);
    }
  }

  /**
   * Creates sweep transitions for large venue
   * Red LEDs: Diagonal sweep (6|2) → (5|1) → (4|0) → (3|7)
   * Beat-based timing: Each step advances on a beat (4 steps = 4 beats total)
   */
  private createLargeVenueSweep(
    sweepTransitions: EffectTransition[], 
    allLights: any[]
  ): void {
    const redColor = getColor('red', 'medium', 'add');
    const transparentColor = getColor('transparent', 'medium');
    const diagonalPairs = this.createDiagonalPairs(allLights);
    
    for (let pairIndex = 0; pairIndex < diagonalPairs.length; pairIndex++) {
      const pair = diagonalPairs[pairIndex];
      
      // Wait until it's this pair's turn (1 beat per step)
      if (pairIndex > 0) {
        sweepTransitions.push({
          lights: pair,
          layer: 0,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: transparentColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'beat',
          waitUntilTime: 0,
          waitUntilConditionCount: pairIndex
        });
      }
      
      // Turn red for 1 beat
      sweepTransitions.push({
        lights: pair,
        layer: 0,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: { color: redColor, easing: 'linear', duration: 0 },
        waitUntilCondition: 'beat',
        waitUntilTime: 0
      });
      
      // Turn off and wait until cycle completes
      const stepsAfter = diagonalPairs.length - pairIndex - 1;
      if (stepsAfter > 0) {
        sweepTransitions.push({
          lights: pair,
          layer: 0,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: transparentColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'beat',
          waitUntilTime: 0,
          waitUntilConditionCount: stepsAfter
        });
      }
    }
  }

  /**
   * Creates sweep transitions for small venue
   * Yellow LEDs: Diagonal sweep (6|2) → (5|1) → (4|0) → (3|7)
   * Blue LEDs: Sequential single-LED sweep 0 → 1 → 2 → 3 → 4 → None → None → None
   * Green LEDs: Delayed reverse sweep None → None → None → None → 4 → 3 → 2 → 1 → 0
   * Beat-based timing: Each step advances on a beat (8 steps = 8 beats total)
   */
  private createSmallVenueSweep(
    sweepTransitions: EffectTransition[], 
    allLights: any[]
  ): void {
    const yellowColor = getColor('yellow', 'medium', 'add');
    const blueColor = getColor('blue', 'medium', 'add');
    const greenColor = getColor('green', 'medium', 'add');
    const transparentColor = getColor('transparent', 'medium');

    // Start immediately for layers 1 and 2
    sweepTransitions.push({
      lights: allLights,
      layer: 1,
      waitForCondition: 'none',
      waitForTime: 0,
      transform: { color: transparentColor, easing: 'linear', duration: 0 },
      waitUntilCondition: 'none',
      waitUntilTime: 0
    });

    sweepTransitions.push({
      lights: allLights,
      layer: 2,
      waitForCondition: 'none',
      waitForTime: 0,
      transform: { color: transparentColor, easing: 'linear', duration: 0 },
      waitUntilCondition: 'none',
      waitUntilTime: 0
    });

    // Yellow: Diagonal sweep (6|2) → (5|1) → (4|0) → (3|7) - same as large venue
    const diagonalPairs = this.createDiagonalPairs(allLights);
    for (let pairIndex = 0; pairIndex < diagonalPairs.length; pairIndex++) {
      const pair = diagonalPairs[pairIndex];
      
      if (pairIndex > 0) {
        sweepTransitions.push({
          lights: pair,
          layer: 0,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: transparentColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'beat',
          waitUntilTime: 0,
          waitUntilConditionCount: pairIndex
        });
      }
      
      sweepTransitions.push({
        lights: pair,
        layer: 0,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: { color: yellowColor, easing: 'linear', duration: 0 },
        waitUntilCondition: 'beat',
        waitUntilTime: 0
      });
      
      const stepsAfterYellow = diagonalPairs.length - pairIndex - 1;
      if (stepsAfterYellow > 0) {
        sweepTransitions.push({
          lights: pair,
          layer: 0,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: transparentColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'beat',
          waitUntilTime: 0,
          waitUntilConditionCount: stepsAfterYellow
        });
      }
    }
    
    // Blue: Sequential single-LED sweep 0 → 1 → 2 → 3 → 4 → None → None → None (8 steps total)
    for (let stepIndex = 0; stepIndex < 5; stepIndex++) {
      // Steps 0-4: Turn on lights 0-4
      const light = allLights[stepIndex];
      
      if (stepIndex > 0) {
        sweepTransitions.push({
          lights: [light],
          layer: 1,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: transparentColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'beat',
          waitUntilTime: 0,
          waitUntilConditionCount: stepIndex
        });
      }
      
      sweepTransitions.push({
        lights: [light],
        layer: 1,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: { color: blueColor, easing: 'linear', duration: 0 },
        waitUntilCondition: 'beat',
        waitUntilTime: 0
      });
      
      const stepsAfterBlue = 7 - stepIndex;
      if (stepsAfterBlue > 0) {
        sweepTransitions.push({
          lights: [light],
          layer: 1,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: transparentColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'beat',
          waitUntilTime: 0,
          waitUntilConditionCount: stepsAfterBlue
        });
      }
    }

    // Green: Delayed reverse sweep None → None → None → None → 4 → 3 → 2 → 1 → 0 (8 steps total)
    for (let stepIndex = 0; stepIndex < 5; stepIndex++) {
      // Steps 4-7 mapped to lights 4,3,2,1,0
      const lightPosition = 4 - stepIndex; // Maps step 0→light 4, step 1→light 3, etc.
      const light = allLights[lightPosition];
      const actualStepIndex = stepIndex + 4; // Delay by 4 beats
      
      sweepTransitions.push({
        lights: [light],
        layer: 2,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: { color: transparentColor, easing: 'linear', duration: 0 },
        waitUntilCondition: 'beat',
        waitUntilTime: 0,
        waitUntilConditionCount: actualStepIndex
      });
      
      sweepTransitions.push({
        lights: [light],
        layer: 2,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: { color: greenColor, easing: 'linear', duration: 0 },
        waitUntilCondition: 'beat',
        waitUntilTime: 0
      });
      
      const stepsAfterGreen = 7 - actualStepIndex;
      if (stepsAfterGreen > 0) {
        sweepTransitions.push({
          lights: [light],
          layer: 2,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: transparentColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'beat',
          waitUntilTime: 0,
          waitUntilConditionCount: stepsAfterGreen
        });
      }
    }
  }

  /**
   * Creates diagonal pairs for the sweep pattern (6|2) → (5|1) → (4|0) → (3|7)
   * This creates a diagonal movement across the LED array
   */
  private createDiagonalPairs(lights: any[]): any[][] {
    const pairs: any[][] = [];
    
    if (lights.length === 8) {
      // For 8 lights: (6|2) → (5|1) → (4|0) → (3|7)
      pairs.push([lights[6], lights[2]]);
      pairs.push([lights[5], lights[1]]);
      pairs.push([lights[4], lights[0]]);
      pairs.push([lights[3], lights[7]]);
    } else if (lights.length === 4) {
      // For 4 lights, use individual lights in diagonal order
      pairs.push([lights[2]]);
      pairs.push([lights[1]]);
      pairs.push([lights[0]]);
      pairs.push([lights[3]]);
    } else {
      // Fallback for other light counts - adapt the diagonal pattern
      const halfLength = Math.floor(lights.length / 2);
      for (let i = 0; i < halfLength; i++) {
        const first = lights[(lights.length - 2 + i) % lights.length];
        const second = lights[(2 - i + lights.length) % lights.length];
        pairs.push([first, second]);
      }
    }
    
    return pairs;
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