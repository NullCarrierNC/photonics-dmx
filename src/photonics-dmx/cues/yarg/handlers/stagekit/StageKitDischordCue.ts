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
  description = 'Yellow clockwise on beat, green dual-mode (spinning/solid) on measure, blue alternating patterns on keyframe, red flash on red drum.';
  style = CueStyle.Primary;

  // Track whether this is the first execution or a repeat
  private isFirstExecution: boolean = true;

  async execute(cueData: CueData, controller: ILightingController, lightManager: DmxLightManager): Promise<void> {
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
    
    // Green: Dual behavior - spinning counter-clockwise OR solid on, toggles on measure (large venues only)
    const greenTransitions: EffectTransition[] = [];
    const isLargeVenue = cueData.venueSize === 'Large';
    
    if (isLargeVenue) {
        // Large venue: Alternating between spinning and solid modes on measure beats
        // Mode 1: Counter-clockwise spinning (0.5 cycles per beat = 2 beats per full cycle)
        for (let lightIndex = 0; lightIndex < allLights.length; lightIndex++) {
            const light = allLights[lightIndex];
            const stepsUntilGreen = (allLights.length - 1 - lightIndex) % allLights.length;
            const beatsPerCycle = 2; // 0.5 cycles per beat = 2 beats per cycle
            
            if (stepsUntilGreen > 0) {
                greenTransitions.push({
                    lights: [light],
                    layer: 1,
                    waitForCondition: 'none',
                    waitForTime: 0,
                    transform: { color: transparentColor, easing: 'linear', duration: 0 },
                    waitUntilCondition: 'beat',
                    waitUntilTime: 0,
                    waitUntilConditionCount: Math.floor(stepsUntilGreen * beatsPerCycle / allLights.length)
                });
            }
            
            greenTransitions.push({
                lights: [light],
                layer: 1,
                waitForCondition: 'none',
                waitForTime: 0,
                transform: { color: greenColor, easing: 'linear', duration: 0 },
                waitUntilCondition: 'beat',
                waitUntilTime: 0,
                waitUntilConditionCount: Math.floor(beatsPerCycle / allLights.length) || 1
            });
            
            const stepsAfterGreen = allLights.length - stepsUntilGreen - 1;
            if (stepsAfterGreen > 0) {
                greenTransitions.push({
                    lights: [light],
                    layer: 1,
                    waitForCondition: 'none',
                    waitForTime: 0,
                    transform: { color: transparentColor, easing: 'linear', duration: 0 },
                    waitUntilCondition: 'beat',
                    waitUntilTime: 0,
                    waitUntilConditionCount: Math.floor(stepsAfterGreen * beatsPerCycle / allLights.length)
                });
            }
        }
        
        // Mode 2: Solid green (triggered on measure to switch modes)
        greenTransitions.push({
            lights: allLights,
            layer: 1,
            waitForCondition: 'none',
            waitForTime: 0,
            transform: { color: greenColor, easing: 'linear', duration: 0 },
            waitUntilCondition: 'measure',
            waitUntilTime: 0
        });
        
        greenTransitions.push({
            lights: allLights,
            layer: 1,
            waitForCondition: 'none',
            waitForTime: 0,
            transform: { color: transparentColor, easing: 'linear', duration: 0 },
            waitUntilCondition: 'measure',
            waitUntilTime: 0
        });
    } else {
        // Small venue: Only counter-clockwise spinning at 0.5 cycles per beat
        for (let lightIndex = 0; lightIndex < allLights.length; lightIndex++) {
            const light = allLights[lightIndex];
            const stepsUntilGreen = (allLights.length - 1 - lightIndex) % allLights.length;
            const beatsPerCycle = 2; // 0.5 cycles per beat
            
            if (stepsUntilGreen > 0) {
                greenTransitions.push({
                    lights: [light],
                    layer: 1,
                    waitForCondition: 'none',
                    waitForTime: 0,
                    transform: { color: transparentColor, easing: 'linear', duration: 0 },
                    waitUntilCondition: 'beat',
                    waitUntilTime: 0,
                    waitUntilConditionCount: Math.floor(stepsUntilGreen * beatsPerCycle / allLights.length)
                });
            }
            
            greenTransitions.push({
                lights: [light],
                layer: 1,
                waitForCondition: 'none',
                waitForTime: 0,
                transform: { color: greenColor, easing: 'linear', duration: 0 },
                waitUntilCondition: 'beat',
                waitUntilTime: 0,
                waitUntilConditionCount: Math.floor(beatsPerCycle / allLights.length) || 1
            });
            
            const stepsAfterGreen = allLights.length - stepsUntilGreen - 1;
            if (stepsAfterGreen > 0) {
                greenTransitions.push({
                    lights: [light],
                    layer: 1,
                    waitForCondition: 'none',
                    waitForTime: 0,
                    transform: { color: transparentColor, easing: 'linear', duration: 0 },
                    waitUntilCondition: 'beat',
                    waitUntilTime: 0,
                    waitUntilConditionCount: Math.floor(stepsAfterGreen * beatsPerCycle / allLights.length)
                });
            }
        }
    }
    
    // Blue: Two alternating patterns on keyframe events
    // Pattern A (Blue Two): third-2 lights (scalable version of side positions)
    // Pattern B (Blue Four): even lights (scalable version of even positions)
    const bluePatternA = lightManager.getLights(['front', 'back'], 'third-2');  
    const bluePatternB = lightManager.getLights(['front', 'back'], 'even');

    const blueTransitions: EffectTransition[] = [];
    
    // Pattern A: Blue Two - flash on first keyframe, then off
    blueTransitions.push({
        lights: bluePatternA,
        layer: 0,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: { color: blueColor, easing: 'linear', duration: 0 },
        waitUntilCondition: 'keyframe',
        waitUntilTime: 0
    });
    
    blueTransitions.push({
        lights: bluePatternA,
        layer: 0,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: { color: transparentColor, easing: 'linear', duration: 0 },
        waitUntilCondition: 'beat',
        waitUntilTime: 0
    });
    
    // Pattern B: Blue Four - flash on second keyframe, then off
    blueTransitions.push({
        lights: bluePatternB,
        layer: 0,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: { color: transparentColor, easing: 'linear', duration: 0 },
        waitUntilCondition: 'keyframe',
        waitUntilTime: 0
    });
    
    blueTransitions.push({
        lights: bluePatternB,
        layer: 0,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: { color: blueColor, easing: 'linear', duration: 0 },
        waitUntilCondition: 'keyframe',
        waitUntilTime: 0
    });
    
    blueTransitions.push({
        lights: bluePatternB,
        layer: 0,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: { color: transparentColor, easing: 'linear', duration: 0 },
        waitUntilCondition: 'beat',
        waitUntilTime: 0
    });
    
    
    // Create the effects
    const yellowEffect: Effect = {
        id: "dischord-yellow",
        description: "Dischord pattern - yellow clockwise cycle on beat",
        transitions: yellowTransitions
    };
    
    const greenEffect: Effect = {
        id: "dischord-green",
        description: `Dischord pattern - green ${isLargeVenue ? 'dual-mode (spinning/solid toggle)' : 'counter-clockwise spinning'} on measure`,
        transitions: greenTransitions
    };
    
    const blueEffect: Effect = {
        id: "dischord-blue",
        description: "Dischord pattern - blue alternating patterns (A: third-2, B: even) on keyframe",
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