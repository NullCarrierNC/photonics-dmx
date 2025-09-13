import { ICue, CueStyle } from '../../../interfaces/ICue';
import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { getColor } from '../../../../helpers';
import { Effect, EffectTransition } from '../../../../types';

/**
 * StageKit Sweep Cue - Sweeping light patterns around the LED ring
 * Large venue: Red sweeps through opposite LED pairs
 * Small venue: Yellow opposite pairs + Blue/Green sequential patterns
 */
export class StageKitSweepCue implements ICue {
  id = 'stagekit-sweep';
  cueId = CueType.Sweep;
  description = 'Large venue: Red sweeps through opposite LED pairs. Small venue: Yellow opposite pairs + Blue/Green sequential patterns.';
  style = CueStyle.Primary;

  private isFirstExecution: boolean = true;

  async execute(cueData: CueData, controller: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const allLights = lightManager.getLights(['front', 'back'], 'all');
    const isLargeVenue = cueData.venueSize === 'Large';
    const transparentColor = getColor('transparent', 'medium');
    
    // Beat-based timing: Each step advances at 1/4 of a beat (4 steps per beat)
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
      description: `StageKit sweep pattern - ${isLargeVenue ? 'Red opposite pairs' : 'Yellow opposite pairs + Blue/Green sequential'}`,
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
   * Red LEDs: Sweep through opposite LED pairs (0|4) → (1|5) → (2|6) → (3|7)
   * Beat-based timing: Each step advances at 1/4 of a beat (4 steps per beat)
   */
  private createLargeVenueSweep(
    sweepTransitions: EffectTransition[], 
    allLights: any[]
  ): void {
    const redColor = getColor('red', 'medium', 'add');
    const transparentColor = getColor('transparent', 'medium');
    const oppositePairs = this.createOppositePairs(allLights);
    
    for (let pairIndex = 0; pairIndex < oppositePairs.length; pairIndex++) {
      const pair = oppositePairs[pairIndex];
      
      // Wait until it's this pair's turn (1/4 beat per step)
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
      
      // Turn red for 1/4 beat
      sweepTransitions.push({
        lights: pair,
        layer: 0,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: { color: redColor, easing: 'linear', duration: 0 },
        waitUntilCondition: 'beat',
        waitUntilTime: 0,
        waitUntilConditionCount: 1
      });
      
      // Turn off and wait until cycle completes
      const stepsAfter = oppositePairs.length - pairIndex - 1;
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
   * Yellow LEDs: Same diagonal sweep as large venue
   * Blue LEDs: Sequential single-LED sweep 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7
   * Green LEDs: Delayed reverse sweep None → None → None → None → 4 → 3 → 2 → 1 → 0
   * Beat-based timing: Each step advances at 1/4 of a beat
   */
  private createSmallVenueSweep(
    sweepTransitions: EffectTransition[], 
    allLights: any[]
  ): void {
    const yellowColor = getColor('yellow', 'medium', 'add');
    const blueColor = getColor('blue', 'medium', 'add');
    const greenColor = getColor('green', 'medium', 'add');
    const transparentColor = getColor('transparent', 'medium', 'add');

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

    // Yellow: Opposite pairs (same pattern as large venue red)
    const oppositePairs = this.createOppositePairs(allLights);
    for (let pairIndex = 0; pairIndex < oppositePairs.length; pairIndex++) {
      const pair = oppositePairs[pairIndex];
      
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
        waitUntilTime: 0,
        waitUntilConditionCount: 1
      });
      
      const stepsAfterYellow = oppositePairs.length - pairIndex - 1;
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
    
    // Blue: Sequential single-LED sweep 0 → 1 → 2 → 3 → 4 → None → None
    for (let lightIndex = 0; lightIndex < 5; lightIndex++) { // Only lights 0-4
      const light = allLights[lightIndex];
      
      if (lightIndex > 0) {
        sweepTransitions.push({
          lights: [light],
          layer: 1,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: transparentColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'beat',
          waitUntilTime: 0,
          waitUntilConditionCount: lightIndex
        });
      }
      
      sweepTransitions.push({
        lights: [light],
        layer: 1,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: { color: blueColor, easing: 'linear', duration: 0 },
        waitUntilCondition: 'beat',
        waitUntilTime: 0,
        waitUntilConditionCount: 1
      });
      
      sweepTransitions.push({
        lights: [light],
        layer: 1,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: { color: transparentColor, easing: 'linear', duration: 0 },
        waitUntilCondition: 'beat',
        waitUntilTime: 0,
        waitUntilConditionCount: 4 - lightIndex
      });
    }

    // Green: Delayed reverse sweep None → None → None → None → 4 → 3 → 2 → 1 → 0
    const delaySteps = 4; // 4 beats of delay before starting
    
    for (let lightIndex = 0; lightIndex < 5; lightIndex++) { // Only lights 4-0
      const light = allLights[4 - lightIndex]; // Reverse order: 4, 3, 2, 1, 0
      
      // Wait for delay period (4 beats)
      sweepTransitions.push({
        lights: [light],
        layer: 2,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: { color: transparentColor, easing: 'linear', duration: 0 },
        waitUntilCondition: 'beat',
        waitUntilTime: 0,
        waitUntilConditionCount: delaySteps
      });
      
      // Turn green for 1 beat
      sweepTransitions.push({
        lights: [light],
        layer: 2,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: { color: greenColor, easing: 'linear', duration: 0 },
        waitUntilCondition: 'beat',
        waitUntilTime: 0,
        waitUntilConditionCount: 1
      });
      
      // Turn off and wait until cycle completes
      const stepsAfterGreen = 4 - lightIndex;
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

  private createOppositePairs(lights: any[]): any[][] {
    const pairs: any[][] = [];
    const halfLength = Math.floor(lights.length / 2);
    
    if (lights.length === 4) {
      // For 4 lights, just use individual lights instead of pairs
      for (let i = 0; i < halfLength; i++) {
        pairs.push([lights[i]]); // Single light, not a pair
      }
    } else {
      // For other counts, create actual opposite pairs
      for (let i = 0; i < halfLength; i++) {
        const first = lights[i];
        const second = lights[i + halfLength];
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