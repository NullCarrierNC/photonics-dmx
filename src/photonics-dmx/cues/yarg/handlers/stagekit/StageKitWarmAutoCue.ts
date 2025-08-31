import { ICue, CueStyle } from '../../../interfaces/ICue';
import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { getColor } from '../../../../helpers/dmxHelpers';
import { Effect, EffectTransition } from '../../../../types';

/**
 * StageKit Warm Auto Cue 
 * 2x red, 1x yellow. Red animating clockwise, yellow animating counter-clockwise.
 */
export class StageKitWarmAutoCue implements ICue {
  id = 'stagekit-warmAuto';
  cueId = CueType.Warm_Automatic;
  description = '2x red, 1x yellow. Red animating clockwise, yellow animating counter-clockwise, on beat.';
  style = CueStyle.Primary;

  // Track whether this is the first execution or a repeat
  private isFirstExecution: boolean = true;

  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const allLights = lightManager.getLights(['front', 'back'], ['all']);
    const red = getColor('red', 'medium', 'add');
    const yellow = getColor('yellow', 'medium', 'add');
    
    //const blackColor = getColor('black', 'medium');
    const transparentColor = getColor('transparent', 'medium');
    
    // Calculate number of light pairs and steps
    const lightPairs = Math.floor(allLights.length / 2);
    
    // Create transitions for red light pairs
    const redTransitions: EffectTransition[] = [];
    
    // For each light pair, create the appropriate number of transparent transitions
    // followed by red, then more transparent transitions
    for (let pairIndex = 0; pairIndex < lightPairs; pairIndex++) {
        const light1Index = pairIndex;
        const light2Index = (pairIndex + lightPairs) % allLights.length;
        
        const light1 = allLights[light1Index];
        const light2 = allLights[light2Index];
        
        // Calculate when this pair should be active
        const stepsUntilActive = pairIndex;
        
        // Add transparent transitions before red (to wait for the right beat)
        if (stepsUntilActive > 0) {
            // Light 1 transparent - wait for stepsUntilActive beats
            redTransitions.push({
                lights: [light1],
                layer: 0,
                waitForCondition: 'none',
                waitForTime: 0,
                transform: {
                    color: transparentColor,
                    easing: 'linear',
                    duration: 100,
                },
                waitUntilCondition: 'beat',
                waitUntilTime: 0,
                waitUntilConditionCount: stepsUntilActive
            });
            
            // Light 2 transparent - wait for stepsUntilActive beats
            redTransitions.push({
                lights: [light2],
                layer: 0,
                waitForCondition: 'none',
                waitForTime: 0,
                transform: {
                    color: transparentColor,
                    easing: 'linear',
                    duration: 100,
                },
                waitUntilCondition: 'beat',
                waitUntilTime: 0,
                waitUntilConditionCount: stepsUntilActive
            });
        }
        
        // Add the red transition for both lights
        redTransitions.push({
            lights: [light1],
            layer: 0,
            waitForCondition: 'none',
            waitForTime: 0,
            transform: {
                color: red,
                easing: 'linear',
                duration: 100,
            },
            waitUntilCondition: 'beat',
            waitUntilTime: 0
        });
        
        redTransitions.push({
            lights: [light2],
            layer: 0,
            waitForCondition: 'none',
            waitForTime: 0,
            transform: {
                color: red,
                easing: 'linear',
                duration: 100,
            },
            waitUntilCondition: 'beat',
            waitUntilTime: 0
        });
        
        // Add transparent transitions after red (to wait until the cycle completes)
        const stepsAfterRed = lightPairs - stepsUntilActive - 1;
        if (stepsAfterRed > 0) {
            // Light 1 transparent - wait for stepsAfterRed beats
            redTransitions.push({
                lights: [light1],
                layer: 0,
                waitForCondition: 'none',
                waitForTime: 0,
                transform: {
                    color: transparentColor,
                    easing: 'linear',
                    duration: 100,
                },
                waitUntilCondition: 'beat',
                waitUntilTime: 0,
                waitUntilConditionCount: stepsAfterRed
            });
            
            // Light 2 transparent - wait for stepsAfterRed beats
            redTransitions.push({
                lights: [light2],
                layer: 0,
                waitForCondition: 'none',
                waitForTime: 0,
                transform: {
                    color: transparentColor,
                    easing: 'linear',
                    duration: 100,
                },
                waitUntilCondition: 'beat',
                waitUntilTime: 0,
                waitUntilConditionCount: stepsAfterRed
            });
        }
    }
    
    // Handle center light if odd number of lights
    if (allLights.length % 2 !== 0) {
        const centerLight = allLights[lightPairs];
        
        // Center light follows pair 0 timing
        const stepsUntilActive = 0;
        
        // Add transparent transitions before red (to wait for the right beat)
        if (stepsUntilActive > 0) {
            redTransitions.push({
                lights: [centerLight],
                layer: 0,
                waitForCondition: 'none',
                waitForTime: 0,
                transform: {
                    color: transparentColor,
                    easing: 'linear',
                    duration: 100,
                },
                waitUntilCondition: 'beat',
                waitUntilTime: 0,
                waitUntilConditionCount: stepsUntilActive
            });
        }
        
        // Add the red transition
        redTransitions.push({
            lights: [centerLight],
            layer: 0,
            waitForCondition: 'none',
            waitForTime: 0,
            transform: {
                color: red,
                easing: 'linear',
                duration: 100,
            },
            waitUntilCondition: 'beat',
            waitUntilTime: 0
        });
        
        // Add transparent transitions after red (to wait until the cycle completes)
        const stepsAfterRed = lightPairs - stepsUntilActive - 1;
        if (stepsAfterRed > 0) {
            redTransitions.push({
                lights: [centerLight],
                layer: 0,
                waitForCondition: 'none',
                waitForTime: 0,
                transform: {
                    color: transparentColor,
                    easing: 'linear',
                    duration: 100,
                },
                waitUntilCondition: 'beat',
                waitUntilTime: 0,
                waitUntilConditionCount: stepsAfterRed
            });
        }
    }
    
    // Create transitions for yellow light stepping
    const yellowTransitions: EffectTransition[] = [];
    
    // For each light, create the appropriate number of transparent transitions
    // followed by yellow, then more transparent transitions
    for (let lightIndex = 0; lightIndex < allLights.length; lightIndex++) {
        const light = allLights[lightIndex];
        
        // Calculate when this light should be yellow based on its position
        // Yellow starts at 90 degrees (1/4 of ring) and steps counter-clockwise
        const yellowStartIndex = Math.floor(allLights.length / 4);
        const stepsUntilYellow = (yellowStartIndex - lightIndex + allLights.length) % allLights.length;
        
        // Add transparent transitions before yellow (to wait for the right beat)
        if (stepsUntilYellow > 0) {
            yellowTransitions.push({
                lights: [light],
                layer: 5,
                waitForCondition: 'none',
                waitForTime: 0,
                transform: {
                    color: transparentColor,
                    easing: 'linear',
                    duration: 0,
                },
                waitUntilCondition: 'beat',
                waitUntilTime: 0,
                waitUntilConditionCount: stepsUntilYellow
            });
        }
        
        // Add the yellow transition
        yellowTransitions.push({
            lights: [light],
            layer: 5,
            waitForCondition: 'none',
            waitForTime: 0,
            transform: {
                color: yellow,
                easing: 'linear',
                duration: 0,
            },
            waitUntilCondition: 'beat',
            waitUntilTime: 0
        });
        
        // Add transparent transitions after yellow (to wait until the cycle completes)
        const stepsAfterYellow = allLights.length - stepsUntilYellow - 1;
        if (stepsAfterYellow > 0) {
            yellowTransitions.push({
                lights: [light],
                layer: 5,
                waitForCondition: 'none',
                waitForTime: 0,
                transform: {
                    color: transparentColor,
                    easing: 'linear',
                    duration: 0,
                },
                waitUntilCondition: 'beat',
                waitUntilTime: 0,
                waitUntilConditionCount: stepsAfterYellow
            });
        }
    }
    
    // Create the red effect
    const redEffect: Effect = {
        id: "warm-auto-red",
        description: "Warm auto pattern - red pairs stepping clockwise",
        transitions: redTransitions
    };
    
    // Create the yellow effect
    const yellowEffect: Effect = {
        id: "warm-auto-yellow",
        description: "Warm auto pattern - yellow light stepping counter-clockwise",
        transitions: yellowTransitions
    };
    
    // Add both effects to the sequencer
    if (this.isFirstExecution) {
      // First time: use setEffect to clear any existing effects and start fresh
      await sequencer.setEffect('warm-auto-red', redEffect);
      await sequencer.addEffect('warm-auto-yellow', yellowEffect);
      this.isFirstExecution = false;
    } else {
      // Repeat call: use addEffect to add to existing effects
      sequencer.addEffect('warm-auto-red', redEffect);
      sequencer.addEffect('warm-auto-yellow', yellowEffect);
    }
  }

  onStop(): void {
    // Reset the first execution flag so next time this cue runs it will use setEffect
    this.isFirstExecution = true;
    // Cleanup handled by effect system
  }

  onPause(): void {
    // Pause handled by effect system
  }

  onDestroy(): void {
    // Cleanup handled by effect system
  }
} 