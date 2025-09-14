import { ICue, CueStyle } from '../../../interfaces/ICue';
import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { getColor } from '../../../../helpers/dmxHelpers';
import { Effect, EffectTransition } from '../../../../types';

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

  async execute(cueData: CueData, controller: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const allLights = lightManager.getLights(['front', 'back'], 'all');
    const transparentColor = getColor('transparent', 'medium');
    
    // BPM-based timing: 0.5 cycles per beat
    // For 8 lights: 0.5 cycles per beat = 2 beats per full cycle = 0.25 beats per light
    const beatDuration = 60000 / cueData.beatsPerMinute; // ms per beat
    const lightDuration = beatDuration * 0.25; // 0.25 beats per light
    
    const searchlightTransitions: EffectTransition[] = [];

    // Start immediately (no initial wait)
    searchlightTransitions.push({
      lights: allLights,
      layer: 0,
      waitForCondition: 'none',
      waitForTime: 0,
      transform: { color: transparentColor, easing: 'linear', duration: 0 },
      waitUntilCondition: 'none',
      waitUntilTime: 0
    });

    // Start immediately (no initial wait)
    searchlightTransitions.push({
      lights: allLights,
      layer: 20,
      waitForCondition: 'none',
      waitForTime: 0,
      transform: { color: transparentColor, easing: 'linear', duration: 0 },
      waitUntilCondition: 'none',
      waitUntilTime: 0
    });

    if (allLights.length >= 8) {
      this.createDualCounterClockwisePattern(searchlightTransitions, allLights, lightDuration);
    } else {
      this.createSingleYellowPattern(searchlightTransitions, allLights, lightDuration);
    }

    const searchlightEffect: Effect = {
      id: "stagekit-searchlights",
      description: `StageKit searchlights pattern - ${allLights.length >= 8 ? 'Yellow + Red counter-clockwise (offset)' : 'Yellow counter-clockwise'} (BPM-based timing)`,
      transitions: searchlightTransitions
    };

    if (this.isFirstExecution) {
      await controller.setEffectUnblockedName('stagekit-searchlights', searchlightEffect);
      this.isFirstExecution = false;
    } else {
      await controller.addEffectUnblockedName('stagekit-searchlights', searchlightEffect);
    }
  }

  /**
   * Creates dual counter-clockwise patterns for 8+ lights
   * Yellow LEDs: Rotate counter-clockwise through positions 0→7→6→5→4→3→2→1
   * Red LEDs: Rotate counter-clockwise through positions, offset by 1 position (yellow index - 1)
   * BPM-based timing: Each step advances based on calculated duration for 0.5 cycles per beat
   */
  private createDualCounterClockwisePattern(
    searchlightTransitions: EffectTransition[], 
    allLights: any[],
    lightDuration: number
  ): void {
    const yellowColor = getColor('yellow', 'medium', 'add');
    const redColor = getColor('red', 'medium', 'add');
    const transparentColor = getColor('transparent', 'medium');
    
    // Layer 0: Yellow counter-clockwise chase (starts at position 0)
    for (let lightIndex = 0; lightIndex < allLights.length; lightIndex++) {
      const light = allLights[lightIndex];
      
      // Yellow pattern: 0→7→6→5→4→3→2→1 (counter-clockwise)
      // For counter-clockwise starting at 0: light 0 at beat 0, light 7 at beat 1, etc.
      // Position in sequence: (allLights.length - lightIndex) % allLights.length
      const yellowSequencePosition = (allLights.length - lightIndex) % allLights.length;
      const stepsUntilYellow = yellowSequencePosition;
      
      // Phase 1: Wait until it's this light's turn
      if (stepsUntilYellow > 0) {
        searchlightTransitions.push({
          lights: [light],
          layer: 0,
          waitForCondition: 'delay',
          waitForTime: stepsUntilYellow * lightDuration,
          transform: { color: transparentColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'none',
          waitUntilTime: 0
        });
      } else {
        // Start immediately for lights that begin the pattern
        searchlightTransitions.push({
          lights: [light],
          layer: 0,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: transparentColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'none',
          waitUntilTime: 0
        });
      }
      
      // Phase 2: Turn on yellow for lightDuration
      searchlightTransitions.push({
        lights: [light],
        layer: 0,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: { color: yellowColor, easing: 'linear', duration: 0 },
        waitUntilCondition: 'delay',
        waitUntilTime: lightDuration
      });
      
      // Phase 3: Turn off and wait until cycle completes
      const stepsAfterYellow = allLights.length - stepsUntilYellow - 1;
      if (stepsAfterYellow > 0) {
        searchlightTransitions.push({
          lights: [light],
          layer: 0,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: transparentColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'delay',
          waitUntilTime: stepsAfterYellow * lightDuration
        });
      }
    }

    // Layer 1: Red counter-clockwise chase (offset by 1 position from yellow)
    for (let lightIndex = 0; lightIndex < allLights.length; lightIndex++) {
      const light = allLights[lightIndex];
      
      // Red pattern: Same counter-clockwise as yellow, but offset by 1 position (yellow index - 1)
      // If yellow starts at beat 0, red starts at beat 1
      const redSequencePosition = (allLights.length - lightIndex + 1) % allLights.length;
      const stepsUntilRed = redSequencePosition;
      
      // Phase 1: Wait until it's this light's turn  
      if (stepsUntilRed > 0) {
        searchlightTransitions.push({
          lights: [light],
          layer: 1,
          waitForCondition: 'delay',
          waitForTime: stepsUntilRed * lightDuration,
          transform: { color: transparentColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'none',
          waitUntilTime: 0
        });
      } else {
        // Start immediately for lights that begin the pattern
        searchlightTransitions.push({
          lights: [light],
          layer: 1,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: transparentColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'none',
          waitUntilTime: 0
        });
      }
      
      // Phase 2: Turn on red for lightDuration
      searchlightTransitions.push({
        lights: [light],
        layer: 1,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: { color: redColor, easing: 'linear', duration: 0 },
        waitUntilCondition: 'delay',
        waitUntilTime: lightDuration
      });
      
      // Phase 3: Turn off and wait until cycle completes
      const stepsAfterRed = allLights.length - stepsUntilRed - 1;
      if (stepsAfterRed > 0) {
        searchlightTransitions.push({
          lights: [light],
          layer: 1,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: transparentColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'delay',
          waitUntilTime: stepsAfterRed * lightDuration
        });
      }
    }
  }

  /**
   * Creates single yellow pattern for <8 lights
   * Yellow LEDs: Rotate counter-clockwise through positions 0→7→6→5→4→3→2→1
   * BPM-based timing: Each step advances based on calculated duration for 0.5 cycles per beat
   */
  private createSingleYellowPattern(
    searchlightTransitions: EffectTransition[], 
    allLights: any[],
    lightDuration: number
  ): void {
    const yellowColor = getColor('yellow', 'medium', 'add');
    const transparentColor = getColor('transparent', 'medium');

    // Layer 0: Yellow counter-clockwise chase (starts at position 0)
    for (let lightIndex = 0; lightIndex < allLights.length; lightIndex++) {
      const light = allLights[lightIndex];
      
      // Yellow pattern: 0→7→6→5→4→3→2→1 (counter-clockwise)
      // Same logic as the dual pattern
      const yellowSequencePosition = (allLights.length - lightIndex) % allLights.length;
      const stepsUntilYellow = yellowSequencePosition;
      
      if (stepsUntilYellow > 0) {
        searchlightTransitions.push({
          lights: [light],
          layer: 0,
          waitForCondition: 'delay',
          waitForTime: stepsUntilYellow * lightDuration,
          transform: { color: transparentColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'none',
          waitUntilTime: 0
        });
      }
      
      searchlightTransitions.push({
        lights: [light],
        layer: 0,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: { color: yellowColor, easing: 'linear', duration: 0 },
        waitUntilCondition: 'delay',
        waitUntilTime: lightDuration
      });
      
      const stepsAfterYellow = allLights.length - stepsUntilYellow - 1;
      if (stepsAfterYellow > 0) {
        searchlightTransitions.push({
          lights: [light],
          layer: 0,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: transparentColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'delay',
          waitUntilTime: stepsAfterYellow * lightDuration
        });
      }
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