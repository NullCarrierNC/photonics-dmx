import { ICue, CueStyle } from '../../../interfaces/ICue';
import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { getColor } from '../../../../helpers/dmxHelpers';
import { Effect } from '../../../../types';



/**
 * StageKit Stomp Cue - Keyframe-based toggle with quarter-based color patterns
 * Front: quarter 1 yellow, quarter 4 red. Back: quarter 1 red, quarter 4 yellow. Inner green.
 * Toggles on/off with each keyframe.
 */
export class StageKitStompCue implements ICue {
  id = 'stagekit-stomp';
  cueId = CueType.Stomp;
  description = 'Front: quarter 1 yellow, quarter 4 red. Back: quarter 1 red, quarter 4 yellow. Inner green. Toggles on/off with each keyframe.';
  style = CueStyle.Primary;
  
  // Track whether this is the first execution or a repeat
  private isFirstExecution: boolean = true;

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

    // Create separate effects for each light group
    const frontQuarter1Effect: Effect = {
      id: 'stagekit-stomp-front-q1',
      description: 'Front quarter 1 yellow toggle on keyframe',
      transitions: [
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
          lights: frontQuarter1Lights,
          layer: 0,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: blackColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'keyframe',
          waitUntilTime: 0,
          waitUntilConditionCount: 1
        }
      ]
    };

    const frontQuarter4Effect: Effect = {
      id: 'stagekit-stomp-front-q4',
      description: 'Front quarter 4 red toggle on keyframe',
      transitions: [
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
          lights: frontQuarter4Lights,
          layer: 1,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: blackColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'keyframe',
          waitUntilTime: 0,
          waitUntilConditionCount: 1
        }
      ]
    };

    const backQuarter1Effect: Effect = {
      id: 'stagekit-stomp-back-q1',
      description: 'Back quarter 1 red toggle on keyframe',
      transitions: [
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
          lights: backQuarter1Lights,
          layer: 2,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: blackColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'keyframe',
          waitUntilTime: 0,
          waitUntilConditionCount: 1
        }
      ]
    };

    const backQuarter4Effect: Effect = {
      id: 'stagekit-stomp-back-q4',
      description: 'Back quarter 4 yellow toggle on keyframe',
      transitions: [
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
          lights: backQuarter4Lights,
          layer: 3,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: blackColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'keyframe',
          waitUntilTime: 0,
          waitUntilConditionCount: 1
        }
      ]
    };

    const innerEffect: Effect = {
      id: 'stagekit-stomp-inner',
      description: 'Inner lights green toggle on keyframe',
      transitions: [
        {
          lights: innerLights,
          layer: 4,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: greenColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'keyframe',
          waitUntilTime: 0
        },
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
    };

    // Apply the effects using the set/add pattern
    if (this.isFirstExecution) {
      sequencer.setEffect('stagekit-stomp-front-q1', frontQuarter1Effect);
      this.isFirstExecution = false;
    } else {
      sequencer.addEffect('stagekit-stomp-front-q1', frontQuarter1Effect);
    }
    sequencer.addEffect('stagekit-stomp-front-q4', frontQuarter4Effect);
    sequencer.addEffect('stagekit-stomp-back-q1', backQuarter1Effect);
    sequencer.addEffect('stagekit-stomp-back-q4', backQuarter4Effect);
    sequencer.addEffect('stagekit-stomp-inner', innerEffect);
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