import { CueData } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { ICue, CueStyle } from '../../interfaces/ICue';
import { getColor } from '../../../helpers/dmxHelpers';
import {  getEffectFlashColor } from '../../../effects';
import { YargCue } from '../YargCue';
import { randomBetween } from '../../../helpers/utils';
import { Effect, EffectTransition } from '../../../types';

// Static state to persist light colors between cue calls
let lightStates: { [lightId: string]: 'green' | 'blue' } = {};
let isNewSession = true; // Flag to track if this is we should reset the light states

export class CoolAutomaticCue implements ICue {
  name = YargCue.CoolAutomatic;
  description = 'Automatic cool-toned lighting with intelligent color memory and beat-responsive highlights';
  style = CueStyle.Primary;

  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const allLights = lightManager.getLights(['front', 'back'], 'all');
    
    const green = getColor('green', 'medium');
    const blue = getColor('blue', 'medium');
    const greenHigh = getColor('green', 'high');
    const blueHigh = getColor('blue', 'high');
    
    console.log('[CoolAutomaticCue] Execute called, lightStates has', Object.keys(lightStates).length, 'lights, isNewSession:', isNewSession);
    
    // If this is a new session, randomly set each light either green or blue. If not, use the existing light states.
    if (isNewSession) {
      console.log('[CoolAutomaticCue] New session - initializing random colors for', allLights.length, 'lights');
      
      // Clear any existing state and initialize fresh
      lightStates = {};
      
      // Create a single effect with transitions for all lights on layer 0
      const baseTransitions: EffectTransition[] = [];
      
      allLights.forEach((light) => {
        const randomColor = randomBetween(0, 1) === 0 ? 'green' : 'blue';
        lightStates[light.id] = randomColor;
        
        const color = randomColor === 'green' ? green : blue;
        baseTransitions.push({
          lights: [light],
          layer: 0,
          waitFor: 'none',
          forTime: 0,
          transform: {
            color: color,
            easing: 'linear',
            duration: 100,
          },
          waitUntil: 'none',
          untilTime: 0,
        });
      });
      
      const baseEffect: Effect = {
        id: 'cool-auto-base-colors',
        description: 'Set all lights to random green or blue base colors',
        transitions: baseTransitions,
      };
      
      // Single addEffect call for all base colors on layer 0
      sequencer.addEffect('cool-auto-base-all', baseEffect);
      
      // Mark that we're no longer in fresh start mode
      isNewSession = false;
    } else {
      //console.log('[CoolAutomaticCue] Continuing session - using existing lightStates:', lightStates);
    }
    
    // Pick a random light to invert (flash)
    const randomLight = allLights[randomBetween(0, allLights.length - 1)];
    const currentState = lightStates[randomLight.id];
    
    // Determine the inverted colour for the flash
    const invertedColor = currentState === 'green' ? blueHigh : greenHigh;
    
    // Wait for a beat, then flash the random light with the inverted colour and let it fade
    const flashEffect = getEffectFlashColor({
      color: invertedColor,
      startTrigger: 'beat',
      startWait: 0,
      durationIn: 50,
      holdTime: 80,
      durationOut: 200,
      lights: [randomLight],
      layer: 100, // High layer to show over base layer 0
    });
    
    sequencer.addEffect('cool-auto-flash', flashEffect);
    
    // Cue ends here - next call will repeat the process
  }

  /**
   * Clean up static state when the cue is stopped or replaced
   */
  onStop(): void {
    // Clear the persistent light state when switching away from this cue
    console.log('[CoolAutomaticCue] onStop called - clearing lightStates', Object.keys(lightStates).length, 'lights');
    lightStates = {};
    isNewSession = true;
  }
} 