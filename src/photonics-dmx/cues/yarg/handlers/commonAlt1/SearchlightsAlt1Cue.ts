import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { ICue, CueStyle } from '../../../interfaces/ICue';
import { getColor } from '../../../../helpers/dmxHelpers';
import { getEffectSingleColor } from '../../../../effects';
import { TrackedLight } from '../../../../types';
import { randomBetween } from '../../../../helpers/utils';

// Static state to persist between cue calls
let currentActiveLight: TrackedLight | null = null;
let isNewSession = true;
let transitionStartTime: number | null = null;
let transitionDuration: number = 0;

export class SearchlightsAlt1Cue implements ICue {
  id = 'common-alt-1-searchlights';
  cueId = CueType.Searchlights;
  description = 'Randomly cross fade brightness between two lights.';
  style = CueStyle.Secondary;

  async execute(parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const frontLights = lightManager.getLights(['front'], 'all');
    const backLights = lightManager.getLights(['back'], 'all');

    const sortedFrontLights = frontLights.sort((a: TrackedLight, b: TrackedLight) => a.position - b.position);
    const sortedBackLights = backLights.sort((a: TrackedLight, b: TrackedLight) => b.position - a.position);

    const allLights = [...sortedFrontLights, ...sortedBackLights];
    
    const blueLow = getColor('blue', 'low');
    
    // Calculate fade duration for two beats
    const twoBeatsDuration = (2 * 60 * 1000) / parameters.beatsPerMinute;
    
    // Check if a transition is currently in progress
    if (transitionStartTime !== null) {
      const timeElapsed = Date.now() - transitionStartTime;
      if (timeElapsed < transitionDuration) {
        console.log(`[SearchlightsCue] Transition in progress (${timeElapsed}/${transitionDuration}ms), skipping execution`);
        return; // Wait for current transition to complete
      }
    }
    
    // First run: set all lights to blue low
    if (isNewSession) {
      console.log('[SearchlightsCue] New session - setting all lights to blue low');
      const baseEffect = getEffectSingleColor({
        lights: allLights,
        color: blueLow,
        duration: 200,
        layer: 0,
      });
      sequencer.setEffect('searchlights-base', baseEffect);
      isNewSession = false;
      return; // Exit early on first run, wait for next measure
    }
    
    // On each measure: select new light and fade
    // Filter out current active light to get available lights
    let availableLights: TrackedLight[];
    if (currentActiveLight) {
      availableLights = allLights.filter(light => light.id !== currentActiveLight!.id);
    } else {
      availableLights = allLights;
    }
    
    if (availableLights.length === 0) {
      console.warn('[SearchlightsCue] No available lights to select');
      return;
    }
    
    // Randomly select new light
    const newLight = availableLights[randomBetween(0, availableLights.length - 1)];
    
    // Randomly select brightness between medium and high
    const brightnesses = ['medium', 'high'] as const;
    const brightness = brightnesses[randomBetween(0, 1)];
    const newColor = getColor('blue', brightness);
    
    console.log(`[SearchlightsCue] Fading in light ${newLight.id} to ${brightness} brightness over ${twoBeatsDuration}ms`);
    
    // Start tracking the new transition
    transitionStartTime = Date.now();
    transitionDuration = twoBeatsDuration;
    
    // Fade in new light
    const fadeInEffect = getEffectSingleColor({
      lights: [newLight],
      color: newColor,
      duration: twoBeatsDuration,
      layer: 100,
    });
    sequencer.addEffect('searchlights-fadein', fadeInEffect);
    
    // Fade out current active light if exists
    if (currentActiveLight) {
      const lightToFadeOut = currentActiveLight;
      console.log(`[SearchlightsCue] Fading out light ${lightToFadeOut.id} to low over ${twoBeatsDuration}ms`);
      const fadeOutEffect = getEffectSingleColor({
        lights: [lightToFadeOut],
        color: blueLow,
        duration: twoBeatsDuration,
        layer: 101,
      });
      sequencer.addEffect('searchlights-fadeout', fadeOutEffect);
    }

    currentActiveLight = newLight;
  }
  
 
  onStop(): void {
    console.log('[SearchlightsCue] onStop called - clearing state');
    currentActiveLight = null;
    isNewSession = true;
    transitionStartTime = null;
    transitionDuration = 0;
  }
} 