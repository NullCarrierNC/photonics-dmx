import { EffectTransition } from '../../types';
import { IEffectTransformer } from './interfaces';

/**
 * @class EffectTransformer
 * @description Responsible for transforming effect definitions into organized transitions
 */
export class EffectTransformer implements IEffectTransformer {
  /**
   * Helper function to group effect transitions by their layer.
   * This supports multi-layer effects by splitting transitions based on the 'layer' property.
   * 
   * @param {EffectTransition[]} transitions - An array of transitions to group.
   * @returns {Map<number, EffectTransition[]>} A map from layer number to an array of transitions.
   */
  public groupTransitionsByLayer(transitions: EffectTransition[]): Map<number, EffectTransition[]> {
    const map = new Map<number, EffectTransition[]>();
    transitions.forEach((transition) => {
      if (!map.has(transition.layer)) {
        map.set(transition.layer, []);
      }
      map.get(transition.layer)!.push(transition);
    });
    return map;
  }

  /**
   * Converts transitions to one-light-per-transition for per-light sequencing.
   * Each light gets its own transition object, while maintaining the ability to 
   * set one transition for multiple lights.
   * 
   * @param {EffectTransition[]} transitions - An array of transitions to expand.
   * @returns {EffectTransition[]} An array of transitions, one per light per transition.
   */
  public expandTransitionsByLight(transitions: EffectTransition[]): EffectTransition[] {
    const expandedTransitions: EffectTransition[] = [];
    
    transitions.forEach((transition) => {
      transition.lights.forEach((light) => {
        const lightTransition: EffectTransition = {
          ...transition,
          lights: [light], // Single light per transition
        };
        expandedTransitions.push(lightTransition);
      });
    });
    
    return expandedTransitions;
  }

  /**
   * Groups expanded transitions by layer and light ID for per-light sequencing.
   * This creates a structure that maps (layer, lightId) to transitions for that specific light.
   * 
   * @param {EffectTransition[]} transitions - An array of transitions to group.
   * @returns {Map<number, Map<string, EffectTransition[]>>} A map from layer to lightId to transitions.
   */
  public groupTransitionsByLayerAndLight(transitions: EffectTransition[]): Map<number, Map<string, EffectTransition[]>> {
    const expandedTransitions = this.expandTransitionsByLight(transitions);
    const map = new Map<number, Map<string, EffectTransition[]>>();
    
    expandedTransitions.forEach((transition) => {
      if (!map.has(transition.layer)) {
        map.set(transition.layer, new Map<string, EffectTransition[]>());
      }
      
      const layerMap = map.get(transition.layer)!;
      const lightId = transition.lights[0].id;
      
      if (!layerMap.has(lightId)) {
        layerMap.set(lightId, []);
      }
      
      layerMap.get(lightId)!.push(transition);
    });
    
    return map;
  }
}
