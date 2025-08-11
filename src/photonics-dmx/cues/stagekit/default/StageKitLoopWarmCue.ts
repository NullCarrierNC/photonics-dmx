import { ICue, CueStyle } from '../../interfaces/ICue';
import { CueData, CueType } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { getColor } from '../../../helpers/dmxHelpers';
import { Effect, EffectTransition, RGBIP } from '../../../types';

/**
 * StageKit Loop Warm Cue - Beat-based red and yellow patterns
 * Red cycles at 0.25 cycles per beat, yellow at 0.125 cycles per beat
 * Colors are blended when both red and yellow should be active on the same light
 */
export class StageKitLoopWarmCue implements ICue {
  id = 'stagekit-loopwarm';
  cueId = CueType.Warm_Manual;
  description = 'StageKit loopwarm pattern - beat-synchronized red/yellow patterns with color blending';
  style = CueStyle.Primary;

  async execute(cueData: CueData, controller: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const allLights = lightManager.getLights(['front', 'back'], ['all']);
    const redColor = getColor('red', 'medium');
    const yellowColor = getColor('yellow', 'medium');
    const orangeColor = this.blendColors(redColor, yellowColor); // Red + Yellow = Orange
    const blackColor = getColor('black', 'medium');
    
    // Red pattern: opposite pairs (0,4), (1,5), (2,6), (3,7)
    const redPairs = [
      [allLights[0], allLights[4]], // (0,4) - lights 1,5
      [allLights[1], allLights[5]], // (1,5) - lights 2,6
      [allLights[2], allLights[6]], // (2,6) - lights 3,7
      [allLights[3], allLights[7]]  // (3,7) - lights 4,8
    ];
    
    // Yellow pattern: counter-clockwise rotation starting from light 3
    // This maps to lights: 3,2,1,5,6,7,8,4 (counter-clockwise from light 3)
    const yellowSequence = [2, 1, 0, 4, 5, 6, 7, 3]; // lights 3,2,1,5,6,7,8,4
    
    const transitions: EffectTransition[] = [];
    
    // Create transitions for each step in the 8-step cycle
    for (let step = 0; step < 8; step++) {
      const redPairIndex = Math.floor(step / 2) % 4; // 0.25 cycles per beat = 4 steps per beat
      const yellowLightIndex = yellowSequence[step % 8];
      
      // Get current red pair
      const currentRedPair = redPairs[redPairIndex];
      const currentYellowLight = allLights[yellowLightIndex];
      
      // Create transitions for this step
      const stepTransitions: EffectTransition[] = [];
      
      // Turn on current red pair
      currentRedPair.forEach(light => {
        stepTransitions.push({
          lights: [light],
          layer: 0,
          waitFor: 'beat',
          forTime: 0,
          waitUntil: 'none',
          untilTime: 0,
          transform: {
            color: redColor,
            easing: 'linear',
            duration: 50
          }
        });
      });
      
      // Turn on current yellow light (may blend with red)
      const isYellowLightAlsoRed = currentRedPair.includes(currentYellowLight);
      
      stepTransitions.push({
        lights: [currentYellowLight],
        layer: 0,
        waitFor: 'beat',
        forTime: 0,
        waitUntil: 'none',
        untilTime: 0,
        transform: {
          color: isYellowLightAlsoRed ? orangeColor : yellowColor,
          easing: 'linear',
          duration: 50
        }
      });
      
      // Turn off lights that are no longer active
      const previousStep = (step - 1 + 8) % 8;
      const previousRedPairIndex = Math.floor(previousStep / 2) % 4;
      const previousYellowLightIndex = yellowSequence[previousStep % 8];
      
      const previousRedPair = redPairs[previousRedPairIndex];
      const previousYellowLight = allLights[previousYellowLightIndex];
      
      // Turn off previous red pair (if different from current)
      if (previousRedPairIndex !== redPairIndex) {
        previousRedPair.forEach(light => {
          if (!currentRedPair.includes(light)) {
            stepTransitions.push({
              lights: [light],
              layer: 0,
              waitFor: 'beat',
              forTime: 0,
              waitUntil: 'none',
              untilTime: 0,
              transform: {
                color: blackColor,
                easing: 'linear',
                duration: 50
              }
            });
          }
        });
      }
      
      // Turn off previous yellow light (if different from current)
      if (previousYellowLightIndex !== yellowLightIndex) {
        stepTransitions.push({
          lights: [previousYellowLight],
          layer: 0,
          waitFor: 'beat',
          forTime: 0,
          waitUntil: 'none',
          untilTime: 0,
          transform: {
            color: blackColor,
            easing: 'linear',
            duration: 50
          }
        });
      }
      
      transitions.push(...stepTransitions);
    }
    
    const loopWarmEffect: Effect = {
      id: 'stagekit-loopwarm',
      description: 'Beat-synchronized red and yellow patterns with color blending',
      transitions: transitions
    };
    
    await controller.setEffect('stagekit-loopwarm', loopWarmEffect, 0, true);
  }

  private blendColors(color1: RGBIP, color2: RGBIP): RGBIP {
    return {
      red: Math.min(255, color1.red + color2.red),
      green: Math.min(255, color1.green + color2.green),
      blue: Math.min(255, color1.blue + color2.blue),
      intensity: Math.max(color1.intensity, color2.intensity),
      rp: 255, gp: 255, bp: 255, ip: 255
    };
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