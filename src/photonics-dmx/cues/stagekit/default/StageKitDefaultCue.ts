import { ICue, CueStyle } from '../../interfaces/ICue';
import { CueData, CueType } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { getColor } from '../../../helpers/dmxHelpers';
import { Effect, EffectTransition } from '../../../types';

/**
 * StageKit Default Cue - Event-driven patterns based on venue size
 * Large venue: Blue/red alternating on keyframes
 * Small venue: Yellow flash on drums, red/blue alternating on keyframes
 */
export class StageKitDefaultCue implements ICue {
  id = 'stagekit-default';
  cueId = CueType.Default;
  description = 'StageKit default pattern - event-driven effects';
  style = CueStyle.Primary;

  async execute(cueData: CueData, controller: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const venueSize = cueData.venueSize;
    
    if (venueSize === 'Large') {
      await this.executeLargeVenueDefault(controller, lightManager);
    } else {
      await this.executeSmallVenueDefault(controller, lightManager);
    }
  }

  private async executeLargeVenueDefault(controller: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const allLights = lightManager.getLights(['front', 'back'], ['all']);
    const blueColor = getColor('blue', 'medium');
    const redColor = getColor('red', 'medium');
     const transitions: EffectTransition[] = [
      // Blue on keyframe
      {
        lights: allLights,
        layer: 0,
        waitFor: 'keyframe',
        forTime: 0,
        waitUntil: 'none',
        untilTime: 0,
        transform: {
          color: blueColor,
          easing: 'linear',
          duration: 100
        }
      },
      // Red on next keyframe
      {
        lights: allLights,
        layer: 0,
        waitFor: 'keyframe',
        forTime: 0,
        waitUntil: 'none',
        untilTime: 0,
        transform: {
          color: redColor,
          easing: 'linear',
          duration: 100
        }
      }
    ];
    
    const defaultEffect: Effect = {
      id: 'stagekit-default-large',
      description: 'Blue and red alternating on keyframes',
      transitions: transitions
    };
    
    await controller.setEffect('stagekit-default-large', defaultEffect, 0, true);
  }

  private async executeSmallVenueDefault(controller: ILightingController, lightManager: DmxLightManager): Promise<void> {

    
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