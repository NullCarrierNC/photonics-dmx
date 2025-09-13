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
  description = 'Large venue: Yellow clockwise (2→3→4→5→6→7→0→1) and blue counter-clockwise (0→7→6→5→4→3→2→1). Small venue: Yellow counter-clockwise (0→7→6→5→4→3→2→1). 2 rotations per beat.';
  style = CueStyle.Primary;

  private isFirstExecution: boolean = true;

  async execute(cueData: CueData, controller: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const allLights = lightManager.getLights(['front', 'back'], 'all');
    const transparentColor = getColor('transparent', 'medium');
    const isLargeVenue = cueData.venueSize === 'Large';
    
    // Beat-based timing: Each step advances on a beat
    // 8 steps = 8 beats for one full rotation
    // 2 rotations = 16 beats total

    const searchlightTransitions: EffectTransition[] = [];

    // Wait for a beat to start the sequence
    searchlightTransitions.push({
      lights: allLights,
      layer: 0,
      waitForCondition: 'none',
      waitForTime: 0,
      transform: { color: transparentColor, easing: 'linear', duration: 0 },
      waitUntilCondition: 'beat',
      waitUntilTime: 0
    });

    // Wait for a beat to start Color 2 sequence
    searchlightTransitions.push({
      lights: allLights,
      layer: 1,
      waitForCondition: 'none',
      waitForTime: 0,
      transform: { color: transparentColor, easing: 'linear', duration: 0 },
      waitUntilCondition: 'beat',
      waitUntilTime: 0
    });

    if (isLargeVenue) {
      this.createLargeVenueSearchlights(searchlightTransitions, allLights);
    } else {
      this.createSmallVenueSearchlights(searchlightTransitions, allLights);
    }

    const searchlightEffect: Effect = {
      id: "stagekit-searchlights",
      description: `StageKit searchlights pattern - ${isLargeVenue ? 'Yellow clockwise + Blue counter-clockwise' : 'Yellow counter-clockwise'} (beat-based timing)`,
      transitions: searchlightTransitions
    };

    if (this.isFirstExecution) {
      await controller.setEffect('stagekit-searchlights', searchlightEffect);
      this.isFirstExecution = false;
    } else {
      await controller.addEffect('stagekit-searchlights', searchlightEffect);
    }
  }

  /**
   * Creates searchlight transitions for large venue
   * Yellow LEDs: Rotate clockwise through positions 2→3→4→5→6→7→0→1
   * Blue LEDs: Rotate counter-clockwise through positions 0→7→6→5→4→3→2→1
   * Beat-based timing: Each step advances on a beat
   */
  private createLargeVenueSearchlights(
    searchlightTransitions: EffectTransition[], 
    allLights: any[]
  ): void {
    const yellowColor = getColor('yellow', 'medium', 'add');
    const blueColor = getColor('blue', 'medium', 'add');
    const transparentColor = getColor('transparent', 'medium');

    // Layer 0: Yellow clockwise chase (starts at position 2)
    for (let lightIndex = 0; lightIndex < allLights.length; lightIndex++) {
      const light = allLights[lightIndex];
      // Yellow starts at position 2: (lightIndex + 2) % allLights.length
      const yellowStartPosition = (lightIndex + 2) % allLights.length;
      const stepsUntilYellow = yellowStartPosition;
      
      if (stepsUntilYellow > 0) {
        searchlightTransitions.push({
          lights: [light],
          layer: 0,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: transparentColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'beat',
          waitUntilTime: 0,
          waitUntilConditionCount: stepsUntilYellow
        });
      }
      
      searchlightTransitions.push({
        lights: [light],
        layer: 0,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: { color: yellowColor, easing: 'linear', duration: 0 },
        waitUntilCondition: 'beat',
        waitUntilTime: 0
      });
      
      const stepsAfterYellow = allLights.length - stepsUntilYellow - 1;
      if (stepsAfterYellow > 0) {
        searchlightTransitions.push({
          lights: [light],
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

    // Layer 1: Blue counter-clockwise chase (starts at position 0)
    for (let lightIndex = 0; lightIndex < allLights.length; lightIndex++) {
      const light = allLights[lightIndex];
      // Blue starts at position 0 and goes counter-clockwise
      const blueStartPosition = lightIndex; // Position 0 for first light
      const stepsUntilBlue = blueStartPosition;
      
      if (stepsUntilBlue > 0) {
        searchlightTransitions.push({
          lights: [light],
          layer: 1,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: transparentColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'beat',
          waitUntilTime: 0,
          waitUntilConditionCount: stepsUntilBlue
        });
      }
      
      searchlightTransitions.push({
        lights: [light],
        layer: 1,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: { color: blueColor, easing: 'linear', duration: 0 },
        waitUntilCondition: 'beat',
        waitUntilTime: 0
      });
      
      const stepsAfterBlue = allLights.length - stepsUntilBlue - 1;
      if (stepsAfterBlue > 0) {
        searchlightTransitions.push({
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
  }

  /**
   * Creates searchlight transitions for small venue
   * Yellow LEDs: Rotate counter-clockwise through positions 0→7→6→5→4→3→2→1
   * Uses yellow high (equivalent to red medium + yellow medium blending)
   * Beat-based timing: Each step advances on a beat
   */
  private createSmallVenueSearchlights(
    searchlightTransitions: EffectTransition[], 
    allLights: any[]
  ): void {
    const yellowColor = getColor('yellow', 'high', 'add');
    const transparentColor = getColor('transparent', 'medium');

    // Layer 0: Yellow counter-clockwise chase (starts at position 0)
    for (let lightIndex = 0; lightIndex < allLights.length; lightIndex++) {
      const light = allLights[lightIndex];
      // Yellow starts at position 0 and goes counter-clockwise
      const yellowStartPosition = lightIndex; // Position 0 for first light
      const stepsUntilYellow = yellowStartPosition;
      
      if (stepsUntilYellow > 0) {
        searchlightTransitions.push({
          lights: [light],
          layer: 0,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: transparentColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'beat',
          waitUntilTime: 0,
          waitUntilConditionCount: stepsUntilYellow
        });
      }
      
      searchlightTransitions.push({
        lights: [light],
        layer: 0,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: { color: yellowColor, easing: 'linear', duration: 0 },
        waitUntilCondition: 'beat',
        waitUntilTime: 0
      });
      
      const stepsAfterYellow = allLights.length - stepsUntilYellow - 1;
      if (stepsAfterYellow > 0) {
        searchlightTransitions.push({
          lights: [light],
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