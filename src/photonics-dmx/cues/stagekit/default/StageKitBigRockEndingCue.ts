import { ICue, CueStyle } from '../../interfaces/ICue';
import { CueData, CueType } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { getColor } from '../../../helpers/dmxHelpers';
import { Effect, EffectTransition } from '../../../types';

/**
 * TODO: StageKit Big Rock Ending Cue 
 */
export class StageKitBigRockEndingCue implements ICue {
  id = 'stagekit-big-rock-ending';
  cueId = CueType.BigRockEnding;
  description = 'StageKit big rock ending pattern - sequential color activation';
  style = CueStyle.Primary;

  async execute(cueData: CueData, controller: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const allLights = lightManager.getLights(['front', 'back'], ['all']);
    const redColor = getColor('red', 'medium');
    const greenColor = getColor('green', 'medium');
    const yellowColor = getColor('yellow', 'medium');
    const blueColor = getColor('blue', 'medium');
    const blackColor = getColor('black', 'medium');
    
    const colors = [redColor, greenColor, yellowColor, blueColor];
    const transitions: EffectTransition[] = [];
    
    // Create sequential color activation pattern
    // Each color gets one step per 2-beat cycle
    colors.forEach((color, colorIndex) => {
      transitions.push({
        lights: allLights,
        layer: 0,
        waitFor: 'beat',
        forTime: colorIndex * 2, // 2 beats per color
        waitUntil: 'none',
        untilTime: 0,
        transform: {
          color: color,
          easing: 'linear',
          duration: 100
        }
      });
      
      // Turn off previous color
      if (colorIndex > 0) {
        transitions.push({
          lights: allLights,
          layer: 0,
          waitFor: 'beat',
          forTime: colorIndex * 2,
          waitUntil: 'none',
          untilTime: 0,
          transform: {
            color: blackColor,
            easing: 'linear',
            duration: 100
          }
        });
      }
    });
    
    const bigRockEndingEffect: Effect = {
      id: 'stagekit-big-rock-ending',
      description: 'Sequential color activation for dramatic ending',
      transitions: transitions
    };
    
    await controller.setEffect('stagekit-big-rock-ending', bigRockEndingEffect, 0, true);
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