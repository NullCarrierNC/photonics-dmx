import { ICue, CueStyle } from '../../../interfaces/ICue';
import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { getColor } from '../../../../helpers/dmxHelpers';
import { Effect, EffectTransition } from '../../../../types';

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
  private isFirstRun = true;
  
  async execute(cueData: CueData, controller: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const venueSize = cueData.venueSize;
    
    if (venueSize === 'Large') {
      await this.executeLargeVenueDefault(controller, lightManager);
    } else {
      await this.executeSmallVenueDefault(controller, lightManager);
    }
  }

  private async executeLargeVenueDefault(controller: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const blueColor = getColor('blue', 'medium');
    const redColor = getColor('red', 'medium');
    const blackColor = getColor('black', 'medium');

    const blueLightsFront = lightManager.getLights(['front'], ['inner-half-major']);
    const blueLightsBack = lightManager.getLights(['back'], ['inner-half-major']);
    const redLightsFront = lightManager.getLights(['front'], ['outter-half-minor']);
    const redLightsBack = lightManager.getLights(['back'], ['outter-half-minor']);
    
    const blueLights = [...blueLightsFront, ...blueLightsBack];
    const redLights = [...redLightsFront, ...redLightsBack];

    const blueTransitions: EffectTransition[] = [
      // Blue, wait for keyframe
      {
        lights: blueLights,
        layer: 0,
        waitForCondition: 'none',
        waitForTime: 0,
        waitUntilCondition: 'keyframe',
        waitUntilTime: 0,
        transform: {
          color: blueColor,
          easing: 'linear',
          duration: 100
        }
      },
      // Turn off, wait for keyframe
      {
        lights: blueLights,
        layer: 0,
        waitForCondition: 'none',
        waitForTime: 0,
        waitUntilCondition: 'keyframe',
        waitUntilTime: 0,
        transform: {
          color: blackColor,
          easing: 'linear',
          duration: 100
        }
      }
    ];

    const redTransitions: EffectTransition[] = [
      // Blue, wait for keyframe
      {
        lights: redLights,
        layer: 0,
        waitForCondition: 'none',
        waitForTime: 0,
        waitUntilCondition: 'keyframe',
        waitUntilTime: 0,
        transform: {
          color: blackColor,
          easing: 'linear',
          duration: 100
        }
      },
      // Turn off, wait for keyframe
      {
        lights: redLights,
        layer: 0,
        waitForCondition: 'none',
        waitForTime: 0,
        waitUntilCondition: 'keyframe',
        waitUntilTime: 0,
        transform: {
          color: redColor,
          easing: 'linear',
          duration: 100
        }
      }
    ];
    
    const blueEffect: Effect = {
      id: 'stagekit-default-large-blue',
      description: 'Blue alternating on keyframes',
      transitions: blueTransitions
    };

    const redEffect: Effect = {
      id: 'stagekit-default-large-red',
      description: 'Red alternating on keyframes',
      transitions: redTransitions
    };
    
    // Use firstRun to determine if we should set or add the effect
    if (this.isFirstRun) {
      await controller.setEffect('stagekit-default-large-blue', blueEffect, 0);
      this.isFirstRun = false;
    } else {
      await controller.addEffect('stagekit-default-large-blue', blueEffect, 0);
    }

    await controller.addEffect('stagekit-default-large-red', redEffect, 0);
  }

  // Inverts ted/blue order
  private async executeSmallVenueDefault(controller: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const blueColor = getColor('blue', 'medium');
    const redColor = getColor('red', 'medium');
    const blackColor = getColor('black', 'medium');

    const blueLightsFront = lightManager.getLights(['front'], ['inner-half-major']);
    const blueLightsBack = lightManager.getLights(['back'], ['inner-half-major']);
    const redLightsFront = lightManager.getLights(['front'], ['outter-half-minor']);
    const redLightsBack = lightManager.getLights(['back'], ['outter-half-minor']);
    
    const blueLights = [...blueLightsFront, ...blueLightsBack];
    const redLights = [...redLightsFront, ...redLightsBack];

    const blueTransitions: EffectTransition[] = [
      // Red, wait for keyframe
      {
        lights: redLights,
        layer: 0,
        waitForCondition: 'none',
        waitForTime: 0,
        waitUntilCondition: 'keyframe',
        waitUntilTime: 0,
        transform: {
          color: redColor,
          easing: 'linear',
          duration: 100
        }
      },
      // Turn off, wait for keyframe
      {
        lights: redLights,
        layer: 0,
        waitForCondition: 'none',
        waitForTime: 0,
        waitUntilCondition: 'keyframe',
        waitUntilTime: 0,
        transform: {
          color: blackColor,
          easing: 'linear',
          duration: 100
        }
      }
    ];

    const redTransitions: EffectTransition[] = [
      // wait for keyframe
      {
        lights: blueLights,
        layer: 0,
        waitForCondition: 'none',
        waitForTime: 0,
        waitUntilCondition: 'keyframe',
        waitUntilTime: 0,
        transform: {
          color: blackColor,
          easing: 'linear',
          duration: 100
        }
      },
      // Turn on
      {
        lights: blueLights,
        layer: 0,
        waitForCondition: 'none',
        waitForTime: 0,
        waitUntilCondition: 'keyframe',
        waitUntilTime: 0,
        transform: {
          color: blueColor,
          easing: 'linear',
          duration: 100
        }
      }
    ];
    
    const blueEffect: Effect = {
      id: 'stagekit-default-large-blue',
      description: 'Blue alternating on keyframes',
      transitions: blueTransitions
    };

    const redEffect: Effect = {
      id: 'stagekit-default-large-red',
      description: 'Red alternating on keyframes',
      transitions: redTransitions
    };
    
    // Use firstRun to determine if we should set or add the effect
    if (this.isFirstRun) {
      await controller.setEffect('stagekit-default-large-blue', blueEffect, 0);
      this.isFirstRun = false;
    } else {
      await controller.addEffect('stagekit-default-large-blue', blueEffect, 0);
    }

    await controller.addEffect('stagekit-default-large-red', redEffect, 0);
  }

  onStop(): void {
    this.isFirstRun = true;
  }

  onPause(): void {
    // Pause handled by effect system
  }

  onDestroy(): void {
    // Cleanup handled by effect system
  }
} 