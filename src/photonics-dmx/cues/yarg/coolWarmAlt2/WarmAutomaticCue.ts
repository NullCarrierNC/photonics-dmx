import { CueData, CueType } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { ICue, CueStyle } from '../../interfaces/ICue';
import { getColor } from '../../../helpers/dmxHelpers';
import {  getEffectFlashColor } from '../../../effects';
import { randomBetween } from '../../../helpers/utils';
import { Effect, EffectTransition } from '../../../types';

// Static state to persist light colors between cue calls
let lightStates: { [lightId: string]: 'red' | 'yellow' } = {};
let isNewSession = true; // Flag to track if this is we should reset the light states

export class WarmAutomaticCue implements ICue {
  id = 'alt-warm-auto-2';
  cueId = CueType.Warm_Automatic;
  description = 'Lights get set red or yellow, then flash one light in the opposite color.';
  style = CueStyle.Primary;

  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const allLights = lightManager.getLights(['front', 'back'], 'all');
    
    const red = getColor('red', 'medium');
    const yellow = getColor('yellow', 'medium');
    const redHigh = getColor('red', 'high');
    const yellowHigh = getColor('yellow', 'high');
    
    // If this is a new session, randomly set each light either red or yellow. If not, use the existing light states.
    if (isNewSession) {
      console.log('[CoolAutomaticCue] New session - initializing random colors for', allLights.length, 'lights');
      
      // Clear any existing state and initialize fresh
      lightStates = {};
      
      // Create a single effect with transitions for all lights on layer 0
      const baseTransitions: EffectTransition[] = [];
      
      allLights.forEach((light) => {
        const randomColor = randomBetween(0, 1) === 0 ? 'red' : 'yellow';
        lightStates[light.id] = randomColor;
        
        const color = randomColor === 'red' ? red : yellow;
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
        description: 'Set all lights to random red or yellow base colors',
        transitions: baseTransitions,
      };
      
      // Single addEffect call for all base colors on layer 0
      sequencer.addEffect('cool-auto-base-all', baseEffect);

      isNewSession = false;
    }
    
    // Pick a random light to invert (flash)
    const randomLight = allLights[randomBetween(0, allLights.length - 1)];
    const currentState = lightStates[randomLight.id];
    
    // Determine the inverted colour for the flash
    const invertedColor = currentState === 'red' ? yellowHigh : redHigh;
    
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