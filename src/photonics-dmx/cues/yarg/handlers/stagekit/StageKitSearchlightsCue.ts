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
  description = 'Large venue: Yellow and blue rotate in opposite directions. Small venue: Yellow and red rotate together in same direction offset by 1.';
  style = CueStyle.Primary;

  private isFirstExecution: boolean = true;

  async execute(cueData: CueData, controller: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const allLights = lightManager.getLights(['front', 'back'], 'all');
    const transparentColor = getColor('transparent', 'medium');
    const isLargeVenue = cueData.venueSize === 'Large';
    
    // Calculate timing: entire sequence completes within one beat
    // Each light gets a fraction of the beat duration
    const bpm = cueData.beatsPerMinute || 120;
    const beatDuration = (60 / bpm) * 1000; // Convert to milliseconds
    const timePerStep = beatDuration / allLights.length;
    
    let color1, color2;
    if (isLargeVenue) {
      color1 = getColor('yellow', 'medium', 'add');
      color2 = getColor('blue', 'medium', 'add');
    } else {
      color1 = getColor('yellow', 'high', 'add');
    }

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
      // Large venue: Yellow and blue rotate in opposite directions (crossing beams)
      
      // Layer 0: Yellow clockwise chase
      for (let lightIndex = 0; lightIndex < allLights.length; lightIndex++) {
        const light = allLights[lightIndex];
        const stepsUntilYellow = lightIndex;
        
        if (stepsUntilYellow > 0) {
          searchlightTransitions.push({
            lights: [light],
            layer: 0,
            waitForCondition: 'none',
            waitForTime: 0,
            transform: { color: transparentColor, easing: 'linear', duration: 0 },
            waitUntilCondition: 'delay',
            waitUntilTime: stepsUntilYellow * timePerStep
          });
        }
        
        searchlightTransitions.push({
          lights: [light],
          layer: 0,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: color1, easing: 'linear', duration: 0 },
          waitUntilCondition: 'delay',
          waitUntilTime: timePerStep
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
            waitUntilTime: stepsAfterYellow * timePerStep
          });
        }
      }

      // Layer 1: Blue counter-clockwise chase
      for (let lightIndex = 0; lightIndex < allLights.length; lightIndex++) {
        const light = allLights[lightIndex];
        const stepsUntilBlue = (allLights.length - 1 - lightIndex + allLights.length) % allLights.length;
        
        if (stepsUntilBlue > 0) {
          searchlightTransitions.push({
            lights: [light],
            layer: 1,
            waitForCondition: 'none',
            waitForTime: 0,
            transform: { color: transparentColor, easing: 'linear', duration: 0 },
            waitUntilCondition: 'delay',
            waitUntilTime: stepsUntilBlue * timePerStep
          });
        }
        
        searchlightTransitions.push({
          lights: [light],
          layer: 1,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: color2, easing: 'linear', duration: 0 },
          waitUntilCondition: 'delay',
          waitUntilTime: timePerStep
        });
        
        const stepsAfterBlue = allLights.length - stepsUntilBlue - 1;
        if (stepsAfterBlue > 0) {
          searchlightTransitions.push({
            lights: [light],
            layer: 1,
            waitForCondition: 'none',
            waitForTime: 0,
            transform: { color: transparentColor, easing: 'linear', duration: 0 },
            waitUntilCondition: 'delay',
            waitUntilTime: stepsAfterBlue * timePerStep
          });
        }
      }
    } else {
      // Small venue: Yellow and red rotate together in same direction
      // Yellow offset by -1 (leads red)
      
      // Layer 0: Yellow clockwise chase
      for (let lightIndex = 0; lightIndex < allLights.length; lightIndex++) {
        const light = allLights[lightIndex];
        const stepsUntilYellow = lightIndex;
        
        if (stepsUntilYellow > 0) {
          searchlightTransitions.push({
            lights: [light],
            layer: 0,
            waitForCondition: 'none',
            waitForTime: 0,
            transform: { color: transparentColor, easing: 'linear', duration: 0 },
            waitUntilCondition: 'delay',
            waitUntilTime: stepsUntilYellow * timePerStep
          });
        }
        
        searchlightTransitions.push({
          lights: [light],
          layer: 0,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: color1, easing: 'linear', duration: 0 },
          waitUntilCondition: 'delay',
          waitUntilTime: timePerStep
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
            waitUntilTime: stepsAfterYellow * timePerStep
          });
        }
      }

     
    }

    const searchlightEffect: Effect = {
      id: "stagekit-searchlights",
      description: `StageKit searchlights pattern - ${isLargeVenue ? 'Yellow/Blue opposing rotations' : 'Yellow/Red synchronized rotations (= high yellow blended)' }`,
      transitions: searchlightTransitions
    };

    if (this.isFirstExecution) {
      await controller.setEffect('stagekit-searchlights', searchlightEffect);
      this.isFirstExecution = false;
    } else {
      await controller.addEffect('stagekit-searchlights', searchlightEffect);
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