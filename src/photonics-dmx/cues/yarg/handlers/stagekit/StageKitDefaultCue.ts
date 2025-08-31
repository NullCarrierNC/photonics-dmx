import { ICue, CueStyle } from '../../../interfaces/ICue';
import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { getColor } from '../../../../helpers/dmxHelpers';
import { Effect, EffectTransition } from '../../../../types';
import { getEffectFlashColor } from '../../../../effects';
import { EasingType } from '../../../../easing';

/**
 * StageKit Default Cue
 * Large venue: Blue/red alternating on keyframes
 * Small venue: Yellow flash on drums, red/blue alternating on keyframes
 */
export class StageKitDefaultCue implements ICue {
  id = 'stagekit-default';
  cueId = CueType.Default;
  description = 'Large venue: Blue/red alternating on keyframes, small venue: Red/blue alternating on keyframes and yellow flash on beat.';
  style = CueStyle.Primary;
  private isFirstRun = true;
  
  async execute(cueData: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const venueSize = cueData.venueSize;
    
    if (venueSize === 'Large') {
      await this.executeLargeVenueDefault(sequencer, lightManager);
    } else {
      await this.executeSmallVenueDefault(sequencer, lightManager);
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
    // Small uses the same based effect as large, so re-use large:
    this.executeLargeVenueDefault(controller, lightManager);

    // Add the yellow flash on beat:
    const yellowColor = getColor('yellow', 'high');
    const lights = lightManager.getLights(['front', 'back'], 'all');

    const flashYellowOnBeat = getEffectFlashColor({
      color: yellowColor,
      startTrigger: 'beat',
      durationIn: 0,
      holdTime: 120,
      durationOut: 200,
      lights: lights,
      easing: EasingType.SIN_OUT,
      layer: 101,
    });
    controller.addEffect('stagekit-default-small-yellow', flashYellowOnBeat);
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