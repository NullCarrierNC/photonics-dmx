import { ICue, CueStyle } from '../../../interfaces/ICue';
import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { getColor } from '../../../../helpers/dmxHelpers';
import { Effect, EffectTransition } from '../../../../types';

/**
 * StageKit Silhouettes Cue - All green lights for silhouette effect
 * Creates silhouette lighting effect with green lights
 */
export class StageKitSilhouettesCue implements ICue {
  id = 'stagekit-silhouettes';
  cueId = CueType.Silhouettes;
  description = 'StageKit silhouettes pattern - green silhouette lighting';
  style = CueStyle.Primary;

  async execute(_cueData: CueData, controller: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const allLights = lightManager.getLights(['front', 'back'], ['all']);
    const greenColor = getColor('green', 'medium');
    
    const transitions: EffectTransition[] = [
      {
        lights: allLights,
        layer: 0,
        waitForCondition: 'none',
        waitForTime: 0,
        waitUntilCondition: 'none',
        waitUntilTime: 0,
        transform: {
          color: greenColor,
          easing: 'linear',
          duration: 0 // Instant
        }
      }
    ];
    
    const silhouettesEffect: Effect = {
      id: 'stagekit-silhouettes',
      description: 'Green silhouette lighting effect',
      transitions: transitions
    };
    
    await controller.setEffect('stagekit-silhouettes', silhouettesEffect);
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