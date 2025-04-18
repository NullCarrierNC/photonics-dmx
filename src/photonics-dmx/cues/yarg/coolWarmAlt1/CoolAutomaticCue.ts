import { CueData } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { ICue } from '../../interfaces/ICue';
import { getColor } from '../../../helpers/dmxHelpers';
import { getEffectSingleColor } from '../../../effects/effectSingleColor';
import { YargCue } from '../YargCue';

export class CoolAutomaticCue implements ICue {
  name = YargCue.CoolAutomatic;
  description = 'Sequential pattern where front lights change one by one on beat, cycling through all positions';

  async execute(parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    // Get front lights in position order
    const frontLights = lightManager.getLights(['front'], 'all');
    const backLights = lightManager.getLights(['back'], 'all');
    
    // If no front lights, exit early
    if (frontLights.length === 0) return;
    
    // Determine base color based on venue size from parameters
    // Small venue uses blue, large venue uses green
    const isLargeVenue = parameters.venueSize === "Large";
    
    const blue = getColor('blue', 'medium');
    const green = getColor('green', 'medium');
    
    // Set base color based on venue size
    const baseColor = isLargeVenue ? green : blue;
    const alternateColor = isLargeVenue ? blue : green;
    
    // Set all front and back lights to the base color initially
    // Use layer 0 for the base
    const frontBaseLayer = getEffectSingleColor({
      lights: frontLights,
      color: baseColor,
      duration: 100,
      layer: 0,
    });
    
    const backBaseLayer = getEffectSingleColor({
      lights: backLights,
      color: baseColor,
      duration: 100,
      layer: 0,
    });
    
    // Set the base layers
    sequencer.setEffect('cool-auto-front-base', frontBaseLayer);
    sequencer.setEffect('cool-auto-back-base', backBaseLayer);
    
    const numFrontLights = frontLights.length;
    
    // For each front light, create two effects:
    // 1. Change to alternate color after waiting for position+1 beats
    // 2. Change back to base color after waiting one additional beat
    for (let i = 0; i < numFrontLights; i++) {
      const currentLight = frontLights[i];
      
      // Effect to change the light to the alternate color
      // Wait for (i+1) beats - first light waits 1 beat, second waits 2 beats, etc.
      const changeToAlternateEffect = getEffectSingleColor({
        lights: [currentLight],
        color: alternateColor,
        duration: 100,
        layer: i + 1,
        waitFor: 'beat',
        forTime: i // Wait for i beats before starting (0 for first light, 1 for second, etc.)
      });
      
      // Effect to change the light back to the base color
      // Wait for one more beat after changing to alternate
      const changeToBaseEffect = getEffectSingleColor({
        lights: [currentLight],
        color: baseColor,
        duration: 100,
        layer: i + numFrontLights + 1,
        waitFor: 'beat',
        forTime: 0 // No additional wait after the beat triggers this effect
      });
      
      // Apply both effects
      sequencer.addEffect(`cool-auto-change-to-alternate-${i}`, changeToAlternateEffect);
      sequencer.addEffect(`cool-auto-change-to-base-${i}`, changeToBaseEffect);
    }
    
    // Create continuous cycling effects to keep the pattern going
    // We need to make sure all lights have a new effect waiting to be triggered
    // after the first cycle completes
    
    // Calculate when the first cycle will be complete - it's when all lights have changed
    // and changed back, which takes 2*numFrontLights beats
    const cycleLength = numFrontLights;
    
    // For each light, add effects for the next cycle
    for (let i = 0; i < numFrontLights; i++) {
      const currentLight = frontLights[i];
      
      // Create effects for multiple cycles to ensure the pattern continues
      for (let cycle = 1; cycle <= 2; cycle++) {
        // Calculate when this light should change to the alternate color in this cycle
        // In cycle 1, light 0 changes on beat cycleLength, light 1 on beat cycleLength+1, etc.
        const cycleChangeToAlternateEffect = getEffectSingleColor({
          lights: [currentLight],
          color: alternateColor,
          duration: 100,
          layer: i + (cycle * 2 * numFrontLights) + 1,
          waitFor: 'beat',
          forTime: cycleLength * cycle + i // Wait for cycleLength*cycle+i beats
        });
        
        // Calculate when this light should change back to the base color in this cycle
        // This happens one beat after changing to the alternate color
        const cycleChangeToBaseEffect = getEffectSingleColor({
          lights: [currentLight],
          color: baseColor,
          duration: 100,
          layer: i + (cycle * 2 * numFrontLights) + numFrontLights + 1,
          waitFor: 'beat',
          forTime: 0 // No additional wait after the beat triggers this effect
        });
        
        // Apply the effects for this cycle
        sequencer.addEffect(`cool-auto-cycle-${cycle}-to-alternate-${i}`, cycleChangeToAlternateEffect);
        sequencer.addEffect(`cool-auto-cycle-${cycle}-to-base-${i}`, cycleChangeToBaseEffect);
      }
    }
  }
} 