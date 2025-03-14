/*
 * EffectTransformer Test Suite
 * 
 * This suite tests the functionality of the EffectTransformer.
 * It verifies that the transformer correctly processes and groups transitions.
 * 
 * Note: The EffectTransformer should be accessed through the Sequencer facade.
 * These tests validate the internal implementation that is used by the Sequencer.
 */

import { EffectTransformer } from '../../controllers/sequencer/EffectTransformer';
import { createMockRGBIP, createMockTrackedLight } from '../helpers/testFixtures';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { EffectTransition, TrackedLight } from '../../types';

describe('EffectTransformer', () => {
  let transformer: EffectTransformer;
  let lights: TrackedLight[];
  
  beforeEach(() => {
    transformer = new EffectTransformer();
    
    // Create some test lights
    lights = [
      createMockTrackedLight({ 
        id: 'light1',
        position: 1
      }),
      createMockTrackedLight({ 
        id: 'light2',
        position: 2
      }),
      createMockTrackedLight({ 
        id: 'light3',
        position: 3
      })
    ];
  });
  
  describe('groupTransitionsByLayer', () => {
    it('should group transitions by their layer property', () => {
      // Create test transitions with different layers
      const transitions: EffectTransition[] = [
        {
          lights: [lights[0]],
          layer: 1,
          waitFor: 'none',
          forTime: 0,
          transform: {
            color: createMockRGBIP({ red: 255 }),
            easing: 'linear',
            duration: 1000
          },
          waitUntil: 'none',
          untilTime: 0
        },
        {
          lights: [lights[1]],
          layer: 2,
          waitFor: 'none',
          forTime: 0,
          transform: {
            color: createMockRGBIP({ green: 255 }),
            easing: 'linear',
            duration: 1000
          },
          waitUntil: 'none',
          untilTime: 0
        },
        {
          lights: [lights[2]],
          layer: 1, // Same layer as first transition
          waitFor: 'none',
          forTime: 0,
          transform: {
            color: createMockRGBIP({ blue: 255 }),
            easing: 'linear',
            duration: 1000
          },
          waitUntil: 'none',
          untilTime: 0
        }
      ];
      
      // Call the method
      const result = transformer.groupTransitionsByLayer(transitions);
      
      // Verify the result
      expect(result.size).toBe(2); // Two layers: 1 and 2
      expect(result.has(1)).toBeTruthy();
      expect(result.has(2)).toBeTruthy();
      
      // Layer 1 should have two transitions
      const layer1Transitions = result.get(1);
      expect(layer1Transitions).toBeDefined();
      expect(layer1Transitions!.length).toBe(2);
      expect(layer1Transitions![0].transform.color.red).toBe(255);
      expect(layer1Transitions![1].transform.color.blue).toBe(255);
      
      // Layer 2 should have one transition
      const layer2Transitions = result.get(2);
      expect(layer2Transitions).toBeDefined();
      expect(layer2Transitions!.length).toBe(1);
      expect(layer2Transitions![0].transform.color.green).toBe(255);
    });
    
    it('should handle empty transitions array', () => {
      const result = transformer.groupTransitionsByLayer([]);
      expect(result.size).toBe(0);
    });
    
    it('should handle transitions with the same layer', () => {
      const transitions: EffectTransition[] = [
        {
          lights: [lights[0]],
          layer: 1,
          waitFor: 'none',
          forTime: 0,
          transform: {
            color: createMockRGBIP({ red: 255 }),
            easing: 'linear',
            duration: 1000
          },
          waitUntil: 'none',
          untilTime: 0
        },
        {
          lights: [lights[1]],
          layer: 1,
          waitFor: 'none',
          forTime: 0,
          transform: {
            color: createMockRGBIP({ green: 255 }),
            easing: 'linear',
            duration: 1000
          },
          waitUntil: 'none',
          untilTime: 0
        }
      ];
      
      const result = transformer.groupTransitionsByLayer(transitions);
      
      expect(result.size).toBe(1); // One layer: 1
      expect(result.has(1)).toBeTruthy();
      
      // Layer 1 should have two transitions
      const layer1Transitions = result.get(1);
      expect(layer1Transitions).toBeDefined();
      expect(layer1Transitions!.length).toBe(2);
    });
  });
}); 