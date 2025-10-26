import { ICue, CueStyle } from '../../../interfaces/ICue';
import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { getColor } from '../../../../helpers/dmxHelpers';
import { Effect, EffectTransition } from '../../../../types';
import { getEffectSingleColor } from '../../../../effects/effectSingleColor';

/**
 * StageKit Searchlights Cue - Searchlight effect with rotating patterns
 * Large venue: Yellow and blue rotate in opposite directions
 * Small venue: Yellow and red rotate together in same direction
 * Fast rotation: Entire sequence completes within one beat
 */
export class StageKitSearchlightsCue implements ICue {
  id = 'stagekit-searchlights';
  cueId = CueType.Searchlights;
  description = 'Dual counter-clockwise patterns: Yellow (0→7→6→5→4→3→2→1) and Red offset by 1 position. 0.5 cycles per beat timing. For <8 lights: Yellow only.';
  style = CueStyle.Primary;

  private isFirstExecution: boolean = true;

  execute(cueData: CueData, controller: ILightingController, lightManager: DmxLightManager): void {
    const allLights = lightManager.getLights(['front', 'back'], 'all');
    const transparentColor = getColor('transparent', 'medium');
    
    // BPM-based timing: 0.5 cycles per beat
    // For 8 lights: 0.5 cycles per beat = 2 beats per full cycle = 0.25 beats per light
    const beatDuration = 60000 / cueData.beatsPerMinute; // ms per beat
    const lightDuration = (beatDuration * 0.25) + 10; // Normally 0.25 beats per light, adding a bit of padding for the loop
    
    const singleColor = getEffectSingleColor({
      color: transparentColor,
      duration: 100,
      lights: allLights,
      layer: 0,
    });

    if (allLights.length >= 8) {
      // Create separate effects for yellow and red to avoid state collisions
      const yellowEffect = this.createYellowCounterClockwiseEffect(allLights, lightDuration);
      const redEffect = this.createRedCounterClockwiseEffect(allLights, lightDuration);

      if (this.isFirstExecution) {
        controller.setEffect('stagekit-clear-0', singleColor);
        controller.addEffect('stagekit-searchlights-yellow', yellowEffect);
        controller.addEffect('stagekit-searchlights-red', redEffect);
        this.isFirstExecution = false;
      } else {
       controller.addEffect('stagekit-clear-0', singleColor);
        controller.addEffectUnblockedName('stagekit-searchlights-yellow', yellowEffect);
        controller.addEffectUnblockedName('stagekit-searchlights-red', redEffect);
      }
    } else {
      // Single yellow pattern for <8 lights
      const yellowEffect = this.createYellowCounterClockwiseEffect(allLights, lightDuration);

      if (this.isFirstExecution) {
        controller.setEffect('stagekit-searchlights-yellow', yellowEffect);
        this.isFirstExecution = false;
      } else {
        controller.addEffect('stagekit-searchlights-yellow', yellowEffect);
      }
    }
  }

  /**
   * Creates yellow counter-clockwise effect
   * Yellow LEDs: Rotate counter-clockwise through positions 0→7→6→5→4→3→2→1
   * BPM-based timing: Each step advances based on calculated duration for 0.5 cycles per beat
   */
  private createYellowCounterClockwiseEffect(
    allLights: any[],
    lightDuration: number
  ): Effect {
    const yellowColor = getColor('yellow', 'medium', 'add');
    const transparentColor = getColor('transparent', 'medium', 'add');
    const yellowTransitions: EffectTransition[] = [];
    
    // Yellow counter-clockwise chase (starts at position 0)
    for (let lightIndex = 0; lightIndex < allLights.length; lightIndex++) {
      const light = allLights[lightIndex];
      
      // Yellow pattern: 0→7→6→5→4→3→2→1 (counter-clockwise)
      // For counter-clockwise starting at 0: light 0 at beat 0, light 7 at beat 1, etc.
      // Position in sequence: (allLights.length - lightIndex) % allLights.length
      const yellowSequencePosition = (allLights.length - lightIndex) % allLights.length;
      const stepsUntilYellow = yellowSequencePosition;
      
      // Phase 1: Wait until it's this light's turn
      if (stepsUntilYellow > 0) {
        yellowTransitions.push({
          lights: [light],
          layer: 1,
          waitForCondition: 'delay',
          waitForTime: stepsUntilYellow * lightDuration,
          transform: { color: transparentColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'none',
          waitUntilTime: 0
        });
      } else {
        // Start immediately for lights that begin the pattern
        yellowTransitions.push({
          lights: [light],
          layer: 1,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: transparentColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'none',
          waitUntilTime: 0
        });
      }
      
      // Phase 2: Turn on yellow for lightDuration
      yellowTransitions.push({
        lights: [light],
        layer: 1,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: { color: yellowColor, easing: 'linear', duration: 0 },
        waitUntilCondition: 'delay',
        waitUntilTime: lightDuration
      });
      
      // Phase 3: Turn off and wait until cycle completes
      const stepsAfterYellow = allLights.length - stepsUntilYellow - 1;
      if (stepsAfterYellow > 0) {
        yellowTransitions.push({
          lights: [light],
          layer: 1,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: transparentColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'delay',
          waitUntilTime: stepsAfterYellow * lightDuration
        });
      }
    }

    return {
      id: 'stagekit-searchlights-yellow',
      description: 'Yellow counter-clockwise searchlight pattern',
      transitions: yellowTransitions
    };
  }

  /**
   * Creates red counter-clockwise effect (offset by 1 position from yellow)
   * Red LEDs: Rotate counter-clockwise through positions, offset by 1 position
   * BPM-based timing: Each step advances based on calculated duration for 0.5 cycles per beat
   */
  private createRedCounterClockwiseEffect(
    allLights: any[],
    lightDuration: number
  ): Effect {
    const redColor = getColor('red', 'medium', 'add');
    const transparentColor = getColor('transparent', 'medium', 'add');
    const redTransitions: EffectTransition[] = [];
    
    // Red counter-clockwise chase (offset by 1 position from yellow)
    for (let lightIndex = 0; lightIndex < allLights.length; lightIndex++) {
      const light = allLights[lightIndex];
      
      // Red pattern: Same counter-clockwise as yellow, but offset by 1 position (yellow index - 1)
      // If yellow starts at beat 0, red starts at beat 1
      const redSequencePosition = (allLights.length - lightIndex + 1) % allLights.length;
      const stepsUntilRed = redSequencePosition;
      
      // Phase 1: Wait until it's this light's turn  
      if (stepsUntilRed > 0) {
        redTransitions.push({
          lights: [light],
          layer: 20,
          waitForCondition: 'delay',
          waitForTime: stepsUntilRed * lightDuration,
          transform: { color: transparentColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'none',
          waitUntilTime: 0
        });
      } else {
        // Start immediately for lights that begin the pattern
        redTransitions.push({
          lights: [light],
          layer: 20,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: transparentColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'none',
          waitUntilTime: 0
        });
      }
      
      // Phase 2: Turn on red for lightDuration
      redTransitions.push({
        lights: [light],
        layer: 20,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: { color: redColor, easing: 'linear', duration: 0 },
        waitUntilCondition: 'delay',
        waitUntilTime: lightDuration
      });
      
      // Phase 3: Turn off and wait until cycle completes
      const stepsAfterRed = allLights.length - stepsUntilRed - 1;
      if (stepsAfterRed > 0) {
        redTransitions.push({
          lights: [light],
          layer: 20,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: transparentColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'delay',
          waitUntilTime: stepsAfterRed * lightDuration
        });
      }
    }

    return {
      id: 'stagekit-searchlights-red',
      description: 'Red counter-clockwise searchlight pattern (offset)',
      transitions: redTransitions
    };
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