import { ICue, CueStyle } from '../../../interfaces/ICue';
import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { getColor } from '../../../../helpers/dmxHelpers';
import { Effect, EffectTransition } from '../../../../types';

/**
 * StageKit Score Cue - Yellow clockwise rotation + Blue counter-clockwise rotation
 */
export class StageKitScoreCue implements ICue {
  id = 'stagekit-score';
  cueId = CueType.Score;
  description = 'Yellow clockwise rotation (1000ms) + Blue counter-clockwise rotation (200ms)';
  style = CueStyle.Primary;

  private isFirstExecution: boolean = true;

  async execute(_cueData: CueData, controller: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const allLights = lightManager.getLights(['front', 'back'], 'all');
    const yellowColor = getColor('yellow', 'medium', 'add');
    const blueColor = getColor('blue', 'medium', 'add');
    const transparentColor = getColor('transparent', 'medium');

    // Yellow: Clockwise rotation every 1000ms
    const yellowTransitions: EffectTransition[] = [];
    
    if (allLights.length >= 6) {
      // 6+ lights: Use opposite positions rotating clockwise
      const oppositePairs = this.createOppositePairs(allLights);
      
      for (let pairIndex = 0; pairIndex < oppositePairs.length; pairIndex++) {
        const pair = oppositePairs[pairIndex];
        
        // Wait until it's this pair's turn
        if (pairIndex > 0) {
          yellowTransitions.push({
            lights: pair,
            layer: 0,
            waitForCondition: 'none',
            waitForTime: 0,
            transform: { color: transparentColor, easing: 'linear', duration: 0 },
            waitUntilCondition: 'delay',
            waitUntilTime: pairIndex * 1000
          });
        }
        
        // Turn yellow
        yellowTransitions.push({
          lights: pair,
          layer: 0,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: yellowColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'delay',
          waitUntilTime: 1000
        });
        
        // Turn off after hold time
        yellowTransitions.push({
          lights: pair,
          layer: 0,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: transparentColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'delay',
          waitUntilTime: (oppositePairs.length - pairIndex - 1) * 1000
        });
      }
    } else {
      // <6 lights: Single light rotating clockwise
      for (let lightIndex = 0; lightIndex < allLights.length; lightIndex++) {
        const light = allLights[lightIndex];
        
        // Wait until it's this light's turn
        if (lightIndex > 0) {
          yellowTransitions.push({
            lights: [light],
            layer: 0,
            waitForCondition: 'none',
            waitForTime: 0,
            transform: { color: transparentColor, easing: 'linear', duration: 0 },
            waitUntilCondition: 'delay',
            waitUntilTime: lightIndex * 1000
          });
        }
        
        // Turn yellow
        yellowTransitions.push({
          lights: [light],
          layer: 0,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: yellowColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'delay',
          waitUntilTime: 1000
        });
        
        // Turn off after hold time
        yellowTransitions.push({
          lights: [light],
          layer: 0,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: transparentColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'delay',
          waitUntilTime: (allLights.length - lightIndex - 1) * 1000
        });
      }
    }

    // Blue: Counter-clockwise rotation every 200ms
    const blueTransitions: EffectTransition[] = [];
    
    for (let lightIndex = 0; lightIndex < allLights.length; lightIndex++) {
      const light = allLights[lightIndex];
      
      // Calculate counter-clockwise position (reverse order)
      const counterClockwiseIndex = allLights.length - 1 - lightIndex;
      
      // Wait until it's this light's turn
      if (counterClockwiseIndex > 0) {
        blueTransitions.push({
          lights: [light],
          layer: 1,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: transparentColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'delay',
          waitUntilTime: counterClockwiseIndex * 200
        });
      }
      
      // Turn blue
      blueTransitions.push({
        lights: [light],
        layer: 1,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: { color: blueColor, easing: 'linear', duration: 0 },
        waitUntilCondition: 'delay',
        waitUntilTime: 200
      });
      
      // Turn off after hold time
      blueTransitions.push({
        lights: [light],
        layer: 1,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: { color: transparentColor, easing: 'linear', duration: 0 },
        waitUntilCondition: 'delay',
        waitUntilTime: (allLights.length - counterClockwiseIndex - 1) * 200
      });
    }

    const yellowEffect: Effect = {
      id: 'stagekit-score-yellow',
      description: 'Yellow clockwise rotation every 1000ms',
      transitions: yellowTransitions
    };

    const blueEffect: Effect = {
      id: 'stagekit-score-blue',
      description: 'Blue counter-clockwise rotation every 200ms',
      transitions: blueTransitions
    };

    if (this.isFirstExecution) {
      await controller.setEffect('stagekit-score-yellow', yellowEffect);
      await controller.addEffect('stagekit-score-blue', blueEffect);
      this.isFirstExecution = false;
    } else {
      await controller.addEffect('stagekit-score-yellow', yellowEffect);
      await controller.addEffect('stagekit-score-blue', blueEffect);
    }
  }

  private createOppositePairs(lights: any[]): any[][] {
    const pairs: any[][] = [];
    const halfLength = Math.floor(lights.length / 2);
    
    for (let i = 0; i < halfLength; i++) {
      const first = lights[i];
      const second = lights[i + halfLength];
      pairs.push([first, second]);
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