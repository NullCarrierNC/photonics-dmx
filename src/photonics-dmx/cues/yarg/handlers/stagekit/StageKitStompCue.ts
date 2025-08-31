import { ICue, CueStyle } from '../../../interfaces/ICue';
import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { getColor } from '../../../../helpers';



/**
 * StageKit Stomp Cue - Keyframe-based toggle with outer yellow and inner green
 * Starts with outer half yellow, inner half green, toggles on/off with each keyframe
 */
export class StageKitStompCue implements ICue {
  id = 'stagekit-stomp';
  cueId = CueType.Stomp;
  description = 'Starts with front outer yellow, back outer red, inner green, toggles on/off with each keyframe.';
  style = CueStyle.Primary;

  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const frontOuterLights = lightManager.getLights(['front'], 'outter-half-major');
    const backOuterLights = lightManager.getLights(['back'], 'outter-half-major');
    const innerLights = lightManager.getLights(['front', 'back'], 'inner-half-minor');
    const yellowColor = getColor('yellow', 'high');
    const redColor = getColor('red', 'high');
    const greenColor = getColor('green', 'high');
    const blackColor = getColor('black', 'medium');

    // Set initial state and create toggle effect
    await sequencer.setEffect('stagekit-stomp-toggle', {
      id: 'stagekit-stomp-toggle',
      description: 'Stomp pattern - front outer yellow, back outer red, inner green, keyframe toggle',
      transitions: [
        // Initial state: front outer yellow, back outer red, inner green
        {
          lights: frontOuterLights,
          layer: 0,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: yellowColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'keyframe',
          waitUntilTime: 0
        },
        {
          lights: backOuterLights,
          layer: 0,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: redColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'keyframe',
          waitUntilTime: 0
        },
        {
          lights: innerLights,
          layer: 1,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: greenColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'keyframe',
          waitUntilTime: 0
        },
        // Turn off front outer lights on keyframe
        {
          lights: frontOuterLights,
          layer: 0,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: blackColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'keyframe',
          waitUntilTime: 0,
          waitUntilConditionCount: 1
        },
        // Turn off back outer lights on keyframe
        {
          lights: backOuterLights,
          layer: 0,
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
          layer: 1,
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