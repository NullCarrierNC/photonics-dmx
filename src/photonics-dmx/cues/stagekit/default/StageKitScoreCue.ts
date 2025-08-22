import { ICue, CueStyle } from '../../interfaces/ICue';
import { CueData, CueType } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { getColor } from '../../../helpers/dmxHelpers';
import { getEffectCycleLights } from '../../../effects/effectCycleLights';
import { Effect, EffectTransition } from '../../../types';

/**
 * StageKit Score Cue - Different patterns for large vs small venues
 */
export class StageKitScoreCue implements ICue {
  id = 'stagekit-score';
  cueId = CueType.Score;
  description = 'StageKit score pattern - venue-dependent effects';
  style = CueStyle.Primary;

  async execute(cueData: CueData, controller: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const venueSize = cueData.venueSize;
    
    if (venueSize === 'Large') {
      await this.executeLargeVenueScore(controller, lightManager);
    } else {
      await this.executeSmallVenueScore(controller, lightManager);
    }
  }

  private async executeLargeVenueScore(controller: ILightingController, lightManager: DmxLightManager): Promise<void> {
    // Large venue: Red opposite pairs pattern
    const allLights = lightManager.getLights(['front', 'back'], ['all']);
    const redColor = getColor('red', 'medium');
    const blackColor = getColor('black', 'medium');
    
    // Create opposite pairs: (6,2), (1,5), (0,4), (7,3)
    // Map to ring positions: [1,2,3,4,5,6,7,8]
    const oppositePairs = [
      [allLights[5], allLights[1]], // (6,2) -> positions 6,2 in ring
      [allLights[0], allLights[4]], // (1,5) -> positions 1,5 in ring  
      [allLights[3], allLights[7]], // (0,4) -> positions 0,4 in ring
      [allLights[6], allLights[2]]  // (7,3) -> positions 7,3 in ring
    ];
    
    const transitions: EffectTransition[] = [];
    
    oppositePairs.forEach((pair, index) => {
      transitions.push({
        lights: pair,
        layer: 0,
        waitFor: 'delay',
        forTime: index * 250, // 1 second cycle, 4 steps = 250ms each
        waitUntil: 'none',
        untilTime: 0,
        transform: {
          color: redColor,
          easing: 'linear',
          duration: 200
        }
      });
      
      // Turn off previous pair
      if (index > 0) {
        transitions.push({
          lights: oppositePairs[index - 1],
          layer: 0,
          waitFor: 'delay',
          forTime: index * 250,
          waitUntil: 'none',
          untilTime: 0,
          transform: {
            color: blackColor,
            easing: 'linear',
            duration: 200
          }
        });
      }
    });
    
    const scoreEffect: Effect = {
      id: 'stagekit-score-large',
      description: 'Red opposite pairs alternating pattern',
      transitions: transitions
    };
    
    await controller.setEffect('stagekit-score-large', scoreEffect, 0, true);
  }

  private async executeSmallVenueScore(controller: ILightingController, lightManager: DmxLightManager): Promise<void> {
    // Small venue: Blue counter-clockwise rotation
    const frontLights = lightManager.getLights(['front'], ['all']);
    const backLights = lightManager.getLights(['back'], ['all']); 
    const ringLights = [...frontLights, ...backLights];
    
    const blueColor = getColor('blue', 'medium');
    const blackColor = getColor('black', 'medium');
    
    const scoreEffect = getEffectCycleLights({
      lights: ringLights,
      baseColor: blackColor,
      activeColor: blueColor,
      transitionDuration: 125, // 1 second cycle, 8 lights = 125ms each
      waitFor: 'delay',
      layer: 0
    });
    
    await controller.setEffect('stagekit-score-small', scoreEffect, 0, true);
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