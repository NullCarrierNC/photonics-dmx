import { ICue, CueStyle } from '../../../interfaces/ICue';
import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { getColor } from '../../../../helpers/dmxHelpers';
import { Effect, EffectTransition } from '../../../../types';

/**
 * StageKit Intro Cue - All green lights on
 * Simple green lighting for intro sequences
 */
export class StageKitIntroCue implements ICue {
  id = 'stagekit-intro';
  cueId = CueType.Intro;
  description = 'All green lights';
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
    
    const introEffect: Effect = {
      id: 'stagekit-intro',
      description: 'All green lights on',
      transitions: transitions
    };
    
    await controller.setEffect('stagekit-intro', introEffect);
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