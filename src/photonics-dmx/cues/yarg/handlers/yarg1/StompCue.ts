import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { ICue, CueStyle } from '../../../interfaces/ICue';
import { getColor } from '../../../../helpers/dmxHelpers';
import { Effect } from '../../../../types';

export class StompCue implements ICue {
  id = 'default-stomp';
  cueId = CueType.Stomp;
  description = 'White flash effect on front lights triggered by keyframe';
  style = CueStyle.Secondary;

  
  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const white = getColor('white', 'high', 'add');
    const transparent = getColor('transparent', 'medium', 'add');
    const lights = lightManager.getLights(['front'], 'all');

    const stompEffect: Effect = {
      id: "stomp-flash",
      description: "White flash on keyframe with slower fade out.",
      transitions: [
        {
          lights: lights,
          layer: 101,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: {
            color: transparent,
            easing: 'linear',
            duration: 0,
          },
          waitUntilCondition: 'keyframe',
          waitUntilTime: 0
        },
        {
          lights: lights,
          layer: 101,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: {
            color: white,
            easing: 'linear',
            duration: 10,
          },
          waitUntilCondition: 'delay',
          waitUntilTime: 0
        },
        {
          lights: lights,
          layer: 101,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: {
            color: white,
            easing: 'linear',
            duration: 10,
          },
          waitUntilCondition: 'delay',
          waitUntilTime: 160
        },
        {
          lights: lights,
          layer: 101,
          waitForCondition: 'delay',
          waitForTime: 0,
          transform: {
            color: transparent,
            easing: 'linear',
            duration: 200,
          },
          waitUntilCondition: 'none',
          waitUntilTime: 0
        }
      ]
    };

    sequencer.addEffect('stomp', stompEffect);
  }

  onStop(): void {
  }

  onPause(): void {
    // Pause handled by effect system
  }

  onDestroy(): void {
    // Cleanup handled by effect system
  }
} 