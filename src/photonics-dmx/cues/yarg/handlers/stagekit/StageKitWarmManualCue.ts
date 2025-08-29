import { ICue, CueStyle } from '../../../interfaces/ICue';
import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { getColor } from '../../../../helpers/dmxHelpers';
import { Effect, EffectTransition } from '../../../../types';

/**
 * StageKit Warm Manual Cue 
 * 2x red, 1x yellow. Red animating clockwise, yellow animating counter-clockwise.
 */
export class StageKitWarmManualCue implements ICue {
  id = 'stagekit-warmManual';
  cueId = CueType.Warm_Manual;
  description = 'StageKit Warm Manual - 2x red, 1x yellow. Red animating clockwise, yellow animating counter-clockwise';
  style = CueStyle.Primary;

  // Track whether this is the first execution or a repeat
  private isFirstExecution: boolean = true;

  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const allLights = lightManager.getLights(['front', 'back'], ['all']);
    const redColor = getColor('red', 'medium', 'add');
    const yellowColor = getColor('yellow', 'medium', 'add');

    const blackColor = getColor('black', 'medium');
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
        
        // Add transparent transitions before red (to wait for the right keyframe)
        for (let i = 0; i < stepsUntilActive; i++) {
            // Light 1 transparent
            redTransitions.push({
                lights: [light1],
                layer: 0,
                waitForCondition: 'none',
                waitForTime: 0,
                transform: {
                    color: blackColor,
                    easing: 'linear',
                    duration: 100,
                },
                waitUntilCondition: 'keyframe',
                waitUntilTime: 0
            });
            
            // Light 2 transparent
            redTransitions.push({
                lights: [light2],
                layer: 0,
                waitForCondition: 'none',
                waitForTime: 0,
                transform: {
                    color: blackColor,
                    easing: 'linear',
                    duration: 100,
                },
                waitUntilCondition: 'keyframe',
                waitUntilTime: 0
            });
        }
        
        // Add the red transition for both lights
        redTransitions.push({
            lights: [light1],
            layer: 0,
            waitForCondition: 'none',
            waitForTime: 0,
            transform: {
                color: redColor,
                easing: 'linear',
                duration: 100,
            },
            waitUntilCondition: 'keyframe',
            waitUntilTime: 0
        });
        
        redTransitions.push({
            lights: [light2],
            layer: 0,
            waitForCondition: 'none',
            waitForTime: 0,
            transform: {
                color: redColor,
                easing: 'linear',
                duration: 100,
            },
            waitUntilCondition: 'keyframe',
            waitUntilTime: 0
        });
        
        // Add transparent transitions after red (to wait until the cycle completes)
        const stepsAfterRed = lightPairs - stepsUntilActive - 1;
        for (let i = 0; i < stepsAfterRed; i++) {
            // Light 1 transparent
            redTransitions.push({
                lights: [light1],
                layer: 0,
                waitForCondition: 'none',
                waitForTime: 0,
                transform: {
                    color: blackColor,
                    easing: 'linear',
                    duration: 100,
                },
                waitUntilCondition: 'keyframe',
                waitUntilTime: 0
            });
            
            // Light 2 transparent
            redTransitions.push({
                lights: [light2],
                layer: 0,
                waitForCondition: 'none',
                waitForTime: 0,
                transform: {
                    color: blackColor,
                    easing: 'linear',
                    duration: 100,
                },
                waitUntilCondition: 'keyframe',
                waitUntilTime: 0
            });
        }
    }
    
    // Handle center light if odd number of lights
    if (allLights.length % 2 !== 0) {
        const centerLight = allLights[lightPairs];
        
        // Center light follows pair 0 timing
        const stepsUntilActive = 0;
        
        // Add transparent transitions before red (to wait for the right keyframe)
        for (let i = 0; i < stepsUntilActive; i++) {
            redTransitions.push({
                lights: [centerLight],
                layer: 0,
                waitForCondition: 'none',
                waitForTime: 0,
                transform: {
                    color: blackColor,
                    easing: 'linear',
                    duration: 100,
                },
                waitUntilCondition: 'keyframe',
                waitUntilTime: 0
            });
        }
        
        // Add the red transition
        redTransitions.push({
            lights: [centerLight],
            layer: 0,
            waitForCondition: 'none',
            waitForTime: 0,
            transform: {
                color: redColor,
                easing: 'linear',
                duration: 100,
            },
            waitUntilCondition: 'keyframe',
            waitUntilTime: 0
        });
        
        // Add transparent transitions after red (to wait until the cycle completes)
        const stepsAfterRed = lightPairs - stepsUntilActive - 1;
        for (let i = 0; i < stepsAfterRed; i++) {
            redTransitions.push({
                lights: [centerLight],
                layer: 0,
                waitForCondition: 'none',
                waitForTime: 0,
                transform: {
                    color: blackColor,
                    easing: 'linear',
                    duration: 100,
                },
                waitUntilCondition: 'keyframe',
                waitUntilTime: 0
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
        
        // Add transparent transitions before yellow (to wait for the right keyframe)
        for (let i = 0; i < stepsUntilYellow; i++) {
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
                waitUntilCondition: 'keyframe',
                waitUntilTime: 0
            });
        }
        
        // Add the yellow transition
        yellowTransitions.push({
            lights: [light],
            layer: 5,
            waitForCondition: 'none',
            waitForTime: 0,
            transform: {
                color: yellowColor,
                easing: 'linear',
                duration: 0,
            },
            waitUntilCondition: 'keyframe',
            waitUntilTime: 0
        });
        
        // Add transparent transitions after yellow (to wait until the cycle completes)
        const stepsAfterYellow = allLights.length - stepsUntilYellow - 1;
        for (let i = 0; i < stepsAfterYellow; i++) {
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
                waitUntilCondition: 'keyframe',
                waitUntilTime: 0
            });
        }
    }
    
    // Create the red effect
    const redEffect: Effect = {
        id: "warm-manual-red",
        description: "Warm manual pattern - red pairs stepping clockwise",
        transitions: redTransitions
    };
    
    // Create the yellow effect
    const yellowEffect: Effect = {
        id: "warm-manual-yellow",
        description: "Warm manual pattern - yellow light stepping counter-clockwise",
        transitions: yellowTransitions
    };
    
    // Add both effects to the sequencer
    if (this.isFirstExecution) {
      // First time: use setEffect to clear any existing effects and start fresh
      await sequencer.setEffect('warm-manual-red', redEffect);
      await sequencer.addEffect('warm-manual-yellow', yellowEffect);
      this.isFirstExecution = false;
    } else {
      // Repeat call: use addEffect to add to existing effects
      sequencer.addEffect('warm-manual-red', redEffect);
      sequencer.addEffect('warm-manual-yellow', yellowEffect);
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