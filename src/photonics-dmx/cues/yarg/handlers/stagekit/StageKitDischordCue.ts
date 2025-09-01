import { ICue, CueStyle } from '../../../interfaces/ICue';
import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { getColor } from '../../../../helpers/dmxHelpers';
import { Effect, EffectTransition } from '../../../../types';
import { getEffectFlashColor } from '../../../../effects';

/**
 * StageKit Dischord Cue
 */
export class StageKitDischordCue implements ICue {
  id = 'stagekit-dischord';
  cueId = CueType.Dischord;
  description = 'Yellow clockwise on beat, green counter clock on measure, blue alternating center on keyframe, red flash on red drum.';
  style = CueStyle.Primary;

  // Track whether this is the first execution or a repeat
  private isFirstExecution: boolean = true;

  async execute(_cueData: CueData, controller: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const allLights = lightManager.getLights(['front', 'back'], 'all');
    const yellowColor = getColor('yellow', 'medium','add');
    const greenColor = getColor('green', 'medium','add');
    const blueColor = getColor('blue', 'medium');
    const transparentColor = getColor('transparent', 'medium');
    const redColor = getColor('red', 'medium', 'replace');
    
    // Yellow: Clockwise cycle on beat
    const yellowTransitions: EffectTransition[] = [];
    for (let lightIndex = 0; lightIndex < allLights.length; lightIndex++) {
        const light = allLights[lightIndex];
        
        // Calculate when this light should be yellow based on its position
        // Yellow starts at position 0 and steps clockwise
        const stepsUntilYellow = lightIndex;
        
        // Add transparent transitions before yellow (to wait for the right beat)
        if (stepsUntilYellow > 0) {
            yellowTransitions.push({
                lights: [light],
                layer: 2,
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
            layer: 2,
            waitForCondition: 'none',
            waitForTime: 0,
            transform: {
                color: yellowColor,
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
                layer: 2,
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
    
    // Green: Counter-clockwise chase on measure
    const greenTransitions: EffectTransition[] = [];
    
    // Create counter-clockwise chase pattern on measure
    for (let lightIndex = 0; lightIndex < allLights.length; lightIndex++) {
        const light = allLights[lightIndex];
        
        // Calculate when this light should be green based on its position
        // Green starts at the end and steps counter-clockwise
        const stepsUntilGreen = (allLights.length - 1 - lightIndex + allLights.length) % allLights.length;
        
        // Add transparent transitions before green (to wait for the right measure)
        if (stepsUntilGreen > 0) {
            greenTransitions.push({
                lights: [light],
                layer: 1,
                waitForCondition: 'none',
                waitForTime: 0,
                transform: {
                    color: transparentColor,
                    easing: 'linear',
                    duration: 0,
                },
                waitUntilCondition: 'measure',
                waitUntilTime: 0,
                waitUntilConditionCount: stepsUntilGreen
            });
        }
        
        // Add the green transition
        greenTransitions.push({
            lights: [light],
            layer: 1,
            waitForCondition: 'none',
            waitForTime: 0,
            transform: {
                color: greenColor,
                easing: 'linear',
                duration: 0,
            },
            waitUntilCondition: 'measure',
            waitUntilTime: 0
        });
        
        // Add transparent transitions after green (to wait until the cycle completes)
        const stepsAfterGreen = allLights.length - stepsUntilGreen - 1;
        if (stepsAfterGreen > 0) {
            greenTransitions.push({
                lights: [light],
                layer: 1,
                waitForCondition: 'none',
                waitForTime: 0,
                transform: {
                    color: transparentColor,
                    easing: 'linear',
                    duration: 0,
                },
                waitUntilCondition: 'measure',
                waitUntilTime: 0,
                waitUntilConditionCount: stepsAfterGreen
            });
        }
    }
    
    // Blue: Bottom lights always on, top lights toggle on/off on keyframe
    const topLights = lightManager.getLights(['front', ], 'third-2');  
    const bottomLights = lightManager.getLights([ 'back'], 'third-2'); 
    const topBottomLights = [...topLights, ...bottomLights];

    const blueTransitions: EffectTransition[] = [];
    
    // Bottom lights: Always blue (no transitions needed, just set once)
    /*
    for (let lightIndex = 0; lightIndex < bottomLights.length; lightIndex++) {
        const light = bottomLights[lightIndex];
        
        blueTransitions.push({
            lights: [light],
            layer: 0,
            waitForCondition: 'none',
            waitForTime: 0,
            transform: {
                color: blueColor,
                easing: 'linear',
                duration: 0,
            },
            waitUntilCondition: 'none',
            waitUntilTime: 0
        });
    }*/
    
    // All middle lights: Toggle between blue and transparent on each keyframe
    // Start with blue
    blueTransitions.push({
        lights: topBottomLights,
        layer: 0,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: {
            color: blueColor,
            easing: 'linear',
            duration: 0,
        },
        waitUntilCondition: 'keyframe',
        waitUntilTime: 0
    });
    
    // Toggle to transparent on next keyframe
    blueTransitions.push({
        lights: topBottomLights,
        layer: 0,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: {
            color: transparentColor,
            easing: 'linear',
            duration: 0,
        },
        waitUntilCondition: 'keyframe',
        waitUntilTime: 0,
        waitUntilConditionCount: 1
    });
    
    
    // Create the effects
    const yellowEffect: Effect = {
        id: "dischord-yellow",
        description: "Dischord pattern - yellow clockwise cycle on beat",
        transitions: yellowTransitions
    };
    
    const greenEffect: Effect = {
        id: "dischord-green",
        description: "Dischord pattern - green counter-clockwise chase on measure",
        transitions: greenTransitions
    };
    
    const blueEffect: Effect = {
        id: "dischord-blue",
        description: "Dischord pattern - blue bottom always on, top toggle on keyframe",
        transitions: blueTransitions
    };
    
    // Red: Flash all lights on drum-red
   const redFlash = getEffectFlashColor({
    lights: allLights,
    color: redColor,
    startTrigger: 'drum-red',
    durationIn: 0,
    holdTime: 120,
    durationOut: 150,
    layer: 101,
   });
    
    // Apply the effects
    if (this.isFirstExecution) {
        // First time: use setEffect to clear any existing effects and start fresh
        await controller.setEffect('dischord-blue', blueEffect);
        await controller.addEffect('dischord-yellow', yellowEffect);
        await controller.addEffect('dischord-green', greenEffect);
        await controller.addEffect('dischord-red', redFlash);
        this.isFirstExecution = false;
    } else {
        // Repeat call: use addEffect to add to existing effects
        controller.addEffect('dischord-blue', blueEffect);
        controller.addEffect('dischord-yellow', yellowEffect);
        controller.addEffect('dischord-green', greenEffect);
        controller.addEffect('dischord-red', redFlash);
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