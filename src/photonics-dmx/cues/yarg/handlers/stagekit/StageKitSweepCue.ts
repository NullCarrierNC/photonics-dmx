import { ICue, CueStyle } from '../../../interfaces/ICue';
import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { getColor } from '../../../../helpers';
import { Effect, EffectTransition } from '../../../../types';

/**
 * StageKit Sweep Cue - Sweeping light patterns around the LED ring
 * Large venue: Red sweeps through opposite LED pairs
 * Small venue: Yellow opposite pairs + Blue/Green sequential patterns
 */
export class StageKitSweepCue implements ICue {
  id = 'stagekit-sweep';
  cueId = CueType.Sweep;
  description = 'Large venue: Red sweeps through opposite LED pairs. Small venue: Yellow opposite pairs + Blue/Green sequential patterns. Green current disabled.';
  style = CueStyle.Primary;

  private isFirstExecution: boolean = true;

  async execute(cueData: CueData, controller: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const allLights = lightManager.getLights(['front', 'back'], 'all');
    const isLargeVenue = cueData.venueSize === 'Large';
    const transparentColor = getColor('transparent', 'medium');
    
    // Calculate timing: 0.25 cycles per beat (4 steps per beat)
    const bpm = cueData.beatsPerMinute || 120;
    const beatDuration = (60 / bpm) * 1000; // Convert to milliseconds
    const stepDuration = beatDuration / 4; // 4 steps per beat
    
    const sweepTransitions: EffectTransition[] = [];

    // Wait for a beat to start the sequence
    sweepTransitions.push({
      lights: allLights,
      layer: 0,
      waitForCondition: 'none',
      waitForTime: 0,
      transform: { color: transparentColor, easing: 'linear', duration: 0 },
      waitUntilCondition: 'beat',
      waitUntilTime: 0
    });

    if (isLargeVenue) {
      // Large venue: Red sweeps through opposite LED pairs
      const redColor = getColor('red', 'medium', 'add');
      const oppositePairs = this.createOppositePairs(allLights);
      
      for (let pairIndex = 0; pairIndex < oppositePairs.length; pairIndex++) {
        const pair = oppositePairs[pairIndex];
        
        // Wait until it's this pair's turn
        if (pairIndex > 0) {
          sweepTransitions.push({
            lights: pair,
            layer: 0,
            waitForCondition: 'none',
            waitForTime: 0,
            transform: { color: transparentColor, easing: 'linear', duration: 0 },
            waitUntilCondition: 'delay',
            waitUntilTime: pairIndex * stepDuration
          });
        }
        
        // Turn red
        sweepTransitions.push({
          lights: pair,
          layer: 0,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: redColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'delay',
          waitUntilTime: stepDuration
        });
        
        // Turn off after step duration
        sweepTransitions.push({
          lights: pair,
          layer: 0,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: transparentColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'delay',
          waitUntilTime: (oppositePairs.length - pairIndex - 1) * stepDuration
        });
      }
    } else {
      // Small venue: Yellow opposite pairs + Blue/Green sequential patterns
      const yellowColor = getColor('yellow', 'medium', 'add');
      const blueColor = getColor('blue', 'medium', 'add');
   //   const greenColor = getColor('green', 'medium', 'add');

          // Wait for a beat to start the sequence
        sweepTransitions.push({
          lights: allLights,
          layer: 1,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: transparentColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'beat',
          waitUntilTime: 0
        });

        sweepTransitions.push({
          lights: allLights,
          layer: 2,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: transparentColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'beat',
          waitUntilTime: 0
        });

        
      
      // Yellow: Opposite pairs (same pattern as large venue red)
      const oppositePairs = this.createOppositePairs(allLights);
      for (let pairIndex = 0; pairIndex < oppositePairs.length; pairIndex++) {
        const pair = oppositePairs[pairIndex];
        
        if (pairIndex > 0) {
          sweepTransitions.push({
            lights: pair,
            layer: 0,
            waitForCondition: 'none',
            waitForTime: 0,
            transform: { color: transparentColor, easing: 'linear', duration: 0 },
            waitUntilCondition: 'delay',
            waitUntilTime: pairIndex * stepDuration
          });
        }
        
        sweepTransitions.push({
          lights: pair,
          layer: 0,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: yellowColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'delay',
          waitUntilTime: stepDuration
        });
        
        sweepTransitions.push({
          lights: pair,
          layer: 0,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: transparentColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'delay',
          waitUntilTime: (oppositePairs.length - pairIndex - 1) * stepDuration
        });
      }
      
      // Blue: Sequential activation from one side (scales with light count)
      const blueStepDuration = beatDuration / allLights.length;
      for (let lightIndex = 0; lightIndex < allLights.length; lightIndex++) {
        const light = allLights[lightIndex];
        
        if (lightIndex > 0) {
          sweepTransitions.push({
            lights: [light],
            layer: 1,
            waitForCondition: 'none',
            waitForTime: 0,
            transform: { color: transparentColor, easing: 'linear', duration: 0 },
            waitUntilCondition: 'delay',
            waitUntilTime: lightIndex * blueStepDuration
          });
        }
        
        sweepTransitions.push({
          lights: [light],
          layer: 1,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: blueColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'delay',
          waitUntilTime: blueStepDuration
        });
        
        sweepTransitions.push({
          lights: [light],
          layer: 1,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: transparentColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'delay',
          waitUntilTime: (allLights.length - lightIndex - 1) * blueStepDuration
        });
      }
      /*
      // Green: Sequential activation from opposite side with delay (scales with light count)
      const greenStepDuration = beatDuration / allLights.length;
      const delaySteps = Math.floor(allLights.length / 2); // Delay scales with light count
      
      for (let lightIndex = 0; lightIndex < allLights.length; lightIndex++) {
        const light = allLights[allLights.length - 1 - lightIndex]; // Reverse order
        
        // Wait for delay period
        sweepTransitions.push({
          lights: [light],
          layer: 2,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: transparentColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'delay',
          waitUntilTime: delaySteps * greenStepDuration
        });
        
        // Turn green
        sweepTransitions.push({
          lights: [light],
          layer: 2,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: greenColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'delay',
          waitUntilTime: greenStepDuration
        });
        
        // Turn off
        sweepTransitions.push({
          lights: [light],
          layer: 2,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: transparentColor, easing: 'linear', duration: 0 },
          waitUntilCondition: 'delay',
          waitUntilTime: (allLights.length - delaySteps - lightIndex - 1) * greenStepDuration
        });
      }*/
    }

    const sweepEffect: Effect = {
      id: "stagekit-sweep",
      description: `StageKit sweep pattern - ${isLargeVenue ? 'Red opposite pairs' : 'Yellow opposite pairs + Blue/Green sequential'}`,
      transitions: sweepTransitions
    };

    if (this.isFirstExecution) {
      await controller.setEffect('stagekit-sweep', sweepEffect);
      this.isFirstExecution = false;
    } else {
      await controller.addEffect('stagekit-sweep', sweepEffect);
    }
  }

  private createOppositePairs(lights: any[]): any[][] {
    const pairs: any[][] = [];
    const halfLength = Math.floor(lights.length / 2);
    
    if (lights.length === 4) {
      // For 4 lights, just use individual lights instead of pairs
      for (let i = 0; i < halfLength; i++) {
        pairs.push([lights[i]]); // Single light, not a pair
      }
    } else {
      // For other counts, create actual opposite pairs
      for (let i = 0; i < halfLength; i++) {
        const first = lights[i];
        const second = lights[i + halfLength];
        pairs.push([first, second]);
      }
    }
    
    return pairs;
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