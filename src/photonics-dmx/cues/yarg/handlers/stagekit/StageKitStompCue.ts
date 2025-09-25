import { ICue, CueStyle } from '../../../interfaces/ICue';
import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { getColor } from '../../../../helpers';



/**
 * StageKit Stomp Cue - Keyframe-based toggle with quarter-based color patterns
 * Front: quarter 1 yellow, quarter 4 red. Back: quarter 1 red, quarter 4 yellow. Inner green.
 * Toggles on/off with each keyframe
 */
export class StageKitStompCue implements ICue {
  id = 'stagekit-stomp';
  cueId = CueType.Stomp;
  description = 'Front: quarter 1 yellow, quarter 4 red. Back: quarter 1 red, quarter 4 yellow. Inner green. Toggles on/off with each keyframe.';
  style = CueStyle.Primary;

  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    // Front: quarter 1 flashes yellow, quarter 4 flashes red
    const frontQuarter1Lights = lightManager.getLights(['front'], 'quarter-1');
    const frontQuarter4Lights = lightManager.getLights(['front'], 'quarter-4');
    
    // Back: quarter 1 flashes red, quarter 4 flashes yellow
    const backQuarter1Lights = lightManager.getLights(['back'], 'quarter-1');
    const backQuarter4Lights = lightManager.getLights(['back'], 'quarter-4');
    
    const innerLights = lightManager.getLights(['front', 'back'], 'inner-half-minor');
    const yellowColor = getColor('yellow', 'high');
    const redColor = getColor('red', 'high');
    const greenColor = getColor('green', 'high');
    const blackColor = getColor('black', 'medium');

    // Set initial state and create toggle effect
    await sequencer.setEffect('stagekit-stomp-toggle', {
      id: 'stagekit-stomp-toggle',
      description: 'Stomp pattern - front q1 yellow/q4 red, back q1 red/q4 yellow, inner green, keyframe toggle',
      transitions: [
        // Initial state: front q1 yellow, front q4 red, back q1 red, back q4 yellow, inner green
        {
          lights: frontQuarter1Lights,
          layer: 0,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: yellowColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'keyframe',
          waitUntilTime: 0
        },
        {
          lights: frontQuarter4Lights,
          layer: 1,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: redColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'keyframe',
          waitUntilTime: 0
        },
        {
          lights: backQuarter1Lights,
          layer: 2,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: redColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'keyframe',
          waitUntilTime: 0
        },
        {
          lights: backQuarter4Lights,
          layer: 3,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: yellowColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'keyframe',
          waitUntilTime: 0
        },
        {
          lights: innerLights,
          layer: 4,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: greenColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'keyframe',
          waitUntilTime: 0
        },
        // Turn off front quarter 1 lights on keyframe
        {
          lights: frontQuarter1Lights,
          layer: 0,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: blackColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'keyframe',
          waitUntilTime: 0,
          waitUntilConditionCount: 1
        },
        // Turn off front quarter 4 lights on keyframe
        {
          lights: frontQuarter4Lights,
          layer: 1,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: blackColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'keyframe',
          waitUntilTime: 0,
          waitUntilConditionCount: 1
        },
        // Turn off back quarter 1 lights on keyframe
        {
          lights: backQuarter1Lights,
          layer: 2,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: blackColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'keyframe',
          waitUntilTime: 0,
          waitUntilConditionCount: 1
        },
        // Turn off back quarter 4 lights on keyframe
        {
          lights: backQuarter4Lights,
          layer: 3,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: blackColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'keyframe',
          waitUntilTime: 0,
          waitUntilConditionCount: 1
        },
        // Turn off inner lights on keyframe
        {
          lights: innerLights,
          layer: 4,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: blackColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'keyframe',
          waitUntilTime: 0,
          waitUntilConditionCount: 1
        }
      ]
    });
  }

  onStop(): void {
    // Cleanup handled by effect system
  }

  onPause(): void {
    // Pause handled by effect system
  }

  onDestroy(): void {
    // Cleanup handled by effect system
  }
} 