import { ICue, CueStyle } from '../../../interfaces/ICue';
import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { getColor } from '../../../../helpers/dmxHelpers';
import { Effect, EffectTransition } from '../../../../types';

/**
 * StageKit Cool Auto Cue 
 * 2x blue, 1x green. Blue animating clockwise, green animating counter-clockwise.
 */
export class StageKitCoolAutoCue implements ICue {
  id = 'stagekit-coolAuto';
  cueId = CueType.Cool_Automatic;
  description = 'StageKit Cool Auto - 2x blue, 1x green. Blue animating clockwise, green animating counter-clockwise';
  style = CueStyle.Primary;

  // Track whether this is the first execution or a repeat
  private isFirstExecution: boolean = true;

  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const allLights = lightManager.getLights(['front', 'back'], ['all']);
    const blueColor = getColor('blue', 'medium', 'add');
    const greenColor = getColor('green', 'medium', 'add');
   
    //const blackColor = getColor('black', 'medium');
    const transparentColor = getColor('transparent', 'medium');
    
    // Calculate number of light pairs and steps
    const lightPairs = Math.floor(allLights.length / 2);
    
    // Create transitions for blue light pairs
    const blueTransitions: EffectTransition[] = [];
    
    // For each light pair, create the appropriate number of transparent transitions
    // followed by blue, then more transparent transitions
    for (let pairIndex = 0; pairIndex < lightPairs; pairIndex++) {
        const light1Index = pairIndex;
        const light2Index = (pairIndex + lightPairs) % allLights.length;
        
        const light1 = allLights[light1Index];
        const light2 = allLights[light2Index];
        
        // Calculate when this pair should be active
        const stepsUntilActive = pairIndex;
        
        // Add transparent transitions before blue (to wait for the right beat)
        if (stepsUntilActive > 0) {
            // Light 1 transparent - wait for stepsUntilActive beats
            blueTransitions.push({
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
            blueTransitions.push({
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
        
        // Add the blue transition for both lights
        blueTransitions.push({
            lights: [light1],
            layer: 0,
            waitForCondition: 'none',
            waitForTime: 0,
            transform: {
                color: blueColor,
                easing: 'linear',
                duration: 100,
            },
            waitUntilCondition: 'beat',
            waitUntilTime: 0
        });
        
        blueTransitions.push({
            lights: [light2],
            layer: 0,
            waitForCondition: 'none',
            waitForTime: 0,
            transform: {
                color: blueColor,
                easing: 'linear',
                duration: 100,
            },
            waitUntilCondition: 'beat',
            waitUntilTime: 0
        });
        
        // Add transparent transitions after blue (to wait until the cycle completes)
        const stepsAfterBlue = lightPairs - stepsUntilActive - 1;
        if (stepsAfterBlue > 0) {
            // Light 1 transparent - wait for stepsAfterBlue beats
            blueTransitions.push({
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
                waitUntilConditionCount: stepsAfterBlue
            });
            
            // Light 2 transparent - wait for stepsAfterBlue beats
            blueTransitions.push({
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
                waitUntilConditionCount: stepsAfterBlue
            });
        }
    }
    
    // Handle center light if odd number of lights
    if (allLights.length % 2 !== 0) {
        const centerLight = allLights[lightPairs];
        
        // Center light follows pair 0 timing
        const stepsUntilActive = 0;
        
        // Add transparent transitions before blue (to wait for the right beat)
        if (stepsUntilActive > 0) {
            blueTransitions.push({
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
        
        // Add the blue transition
        blueTransitions.push({
            lights: [centerLight],
            layer: 0,
            waitForCondition: 'none',
            waitForTime: 0,
            transform: {
                color: blueColor,
                easing: 'linear',
                duration: 100,
            },
            waitUntilCondition: 'beat',
            waitUntilTime: 0
        });
        
        // Add transparent transitions after blue (to wait until the cycle completes)
        const stepsAfterBlue = lightPairs - stepsUntilActive - 1;
        if (stepsAfterBlue > 0) {
            blueTransitions.push({
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
                waitUntilConditionCount: stepsAfterBlue
            });
        }
    }
    
    // Create transitions for green light stepping
    const greenTransitions: EffectTransition[] = [];
    
    // For each light, create the appropriate number of transparent transitions
    // followed by green, then more transparent transitions
    for (let lightIndex = 0; lightIndex < allLights.length; lightIndex++) {
        const light = allLights[lightIndex];
        
        // Calculate when this light should be green based on its position
        // Green starts at 90 degrees (1/4 of ring) and steps counter-clockwise
        const greenStartIndex = Math.floor(allLights.length / 4);
        const stepsUntilGreen = (greenStartIndex - lightIndex + allLights.length) % allLights.length;
        
        // Add transparent transitions before green (to wait for the right beat)
        if (stepsUntilGreen > 0) {
            greenTransitions.push({
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
                waitUntilConditionCount: stepsUntilGreen
            });
        }
        
        // Add the green transition
        greenTransitions.push({
            lights: [light],
            layer: 5,
            waitForCondition: 'none',
            waitForTime: 0,
            transform: {
                color: greenColor,
                easing: 'linear',
                duration: 0,
            },
            waitUntilCondition: 'beat',
            waitUntilTime: 0
        });
        
        // Add transparent transitions after green (to wait until the cycle completes)
        const stepsAfterGreen = allLights.length - stepsUntilGreen - 1;
        if (stepsAfterGreen > 0) {
            greenTransitions.push({
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
                waitUntilConditionCount: stepsAfterGreen
            });
        }
    }
    
    // Create the blue effect
    const blueEffect: Effect = {
        id: "cool-auto-blue",
        description: "Cool auto pattern - blue pairs stepping clockwise",
        transitions: blueTransitions
    };
    
    // Create the green effect
    const greenEffect: Effect = {
        id: "cool-auto-green",
        description: "Cool auto pattern - green light stepping counter-clockwise",
        transitions: greenTransitions
    };
    
    // Add both effects to the sequencer
    if (this.isFirstExecution) {
      // First time: use setEffect to clear any existing effects and start fresh
      await sequencer.setEffect('cool-auto-blue', blueEffect);
      await sequencer.addEffect('cool-auto-green', greenEffect);
      this.isFirstExecution = false;
    } else {
      // Repeat call: use addEffect to add to existing effects
      sequencer.addEffect('cool-auto-blue', blueEffect);
      sequencer.addEffect('cool-auto-green', greenEffect);
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