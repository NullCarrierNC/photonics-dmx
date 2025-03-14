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
}
