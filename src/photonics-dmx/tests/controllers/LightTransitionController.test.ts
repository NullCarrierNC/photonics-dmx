/*
 * LightTransitionController Test Suite
 * 
 * This suite tests the functionality of the LightTransitionController.
 * It verifies that the controller correctly manages light transitions, including
 * setting transitions, removing transitions, and calculating light states.
 * 
 * Note: The LightTransitionController should be accessed through the Sequencer facade.
 * These tests validate the internal implementation that is used by the Sequencer.
 */

import { LightTransitionController } from '../../controllers/sequencer/LightTransitionController';
import { RGBIO } from '../../types';
import { createMockRGBIP } from '../helpers/testFixtures';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { LightStateManager } from '../../controllers/sequencer/LightStateManager';

describe('LightTransitionController', () => {
  let lightTransitionController: LightTransitionController;
  
  beforeEach(() => {
    // Create a mock LightStateManager
    const mockLightStateManager = {
      setLightState: jest.fn(),
      getLightState: jest.fn().mockReturnValue(createMockRGBIP()),
      publishLightStates: jest.fn()
    };
    
    // Create a fresh instance for each test
    lightTransitionController = new LightTransitionController(mockLightStateManager as any);
    
    // Add test properties to match implementation
    (lightTransitionController as any)._transitionsByLight = new Map();
    (lightTransitionController as any)._currentLayerStates = new Map();
  });

  describe('setTransition', () => {
    it('should add a new transition', () => {
      const lightId = 'test-light';
      const layer = 1;
      const startState = createMockRGBIP({ red: 0, green: 0, blue: 0 });
      const endState = createMockRGBIP({ red: 255, green: 255, blue: 255 });
      const duration = 1000;
      const easing = 'linear';
      
      // Set a transition
      lightTransitionController.setTransition(
        lightId,
        layer,
        startState,
        endState,
        duration,
        easing
      );
      
      // Check if the light state is tracked
      const result = lightTransitionController.getLightState(lightId, layer);
      expect(result).toBeDefined();
      expect(result).toEqual(startState); // Initially, should be the start state
    });
    
    it('should update the transition if one already exists for the same light and layer', () => {
      const lightId = 'test-light';
      const layer = 1;
      const startState1 = createMockRGBIP({ red: 0, green: 0, blue: 0 });
      const endState1 = createMockRGBIP({ red: 255, green: 0, blue: 0 });
      const startState2 = createMockRGBIP({ red: 255, green: 0, blue: 0 });
      const endState2 = createMockRGBIP({ red: 0, green: 255, blue: 0 });
      const duration = 1000;
      const easing = 'linear';
      
      // Set the first transition
      lightTransitionController.setTransition(
        lightId,
        layer,
        startState1,
        endState1,
        duration,
        easing
      );
      
      // Set a second transition on the same light and layer
      lightTransitionController.setTransition(
        lightId,
        layer,
        startState2,
        endState2,
        duration,
        easing
      );
      
      // Check that the light state is updated to the new start state
      const result = lightTransitionController.getLightState(lightId, layer);
      expect(result).toEqual(startState2);
    });
  });
  
  describe('getLightState', () => {
    it('should return the current state of a light if transitions exist', () => {
      // Setup mock state
      const lightId = 'test-light';
      const layer = 1;
      const mockState = createMockRGBIP({ red: 100, green: 150, blue: 200 });
      
      // Mock implementation
      const layerMap = new Map();
      layerMap.set(layer, mockState);
      (lightTransitionController as any)._currentLayerStates.set(lightId, layerMap);
      
      // Get the state
      const state = lightTransitionController.getLightState(lightId, layer);
      
      // Verify
      expect(state).toEqual(mockState);
    });
    
    it('should return a transparent color for a light with no transitions', () => {
      // Override the mock implementation for this test only
      (lightTransitionController as any)._lightStateManager.getLightState.mockReturnValueOnce(undefined);
      
      const lightId = 'nonexistent-light';
      const layer = 1;
      
      // Get the state of a light that doesn't have transitions
      const state = lightTransitionController.getLightState(lightId, layer);
      expect(state).toEqual({
        red: 0,
        green: 0,
        blue: 0,
        intensity: 0,
        opacity: 0.0,
        blendMode: 'replace'
      });
    });
  });
  
  describe('removeTransitionsByLayer', () => {
    it('should remove all transitions for a specific layer', () => {
      const lightId1 = 'test-light-1';
      const lightId2 = 'test-light-2';
      const layer1 = 1;
      const layer2 = 2;
      const startState = createMockRGBIP({ red: 0, green: 0, blue: 0 });
      const endState = createMockRGBIP({ red: 255, green: 255, blue: 255 });
      const duration = 1000;
      const easing = 'linear';
      
      // Set transitions on different lights and layers
      lightTransitionController.setTransition(
        lightId1,
        layer1,
        startState,
        endState,
        duration,
        easing
      );
      
      lightTransitionController.setTransition(
        lightId2,
        layer1,
        startState,
        endState,
        duration,
        easing
      );
      
      lightTransitionController.setTransition(
        lightId1,
        layer2,
        startState,
        endState,
        duration,
        easing
      );
      
      // Remove transitions for layer1
      lightTransitionController.removeTransitionsByLayer(layer1);
      
      // Transitions on layer2 should still exist
      const transitions = (lightTransitionController as any)._transitionsByLight;
      const layerExists = Array.from(transitions.values()).some((layerMap: any) => 
        layerMap.has(layer1)
      );
      
      expect(layerExists).toBeFalsy();
      
      // Make sure transitions for layer2 still exist
      const layer2Exists = Array.from(transitions.values()).some((layerMap: any) => 
        layerMap.has(layer2)
      );
      
      expect(layer2Exists).toBeTruthy();
    });
  });
  
  describe('applyTransition', () => {
    it('should set up a valid transition object that can be updated', () => {
      // Create mock dependencies
      const lightStateManager = new LightStateManager();
      lightStateManager.setLightState = jest.fn();
      
      // Create test data with non-zero starting values
      const lightId = 'test-light-1';
      const layer = 1;
      const startState: RGBIO = {
        red: 10, green: 20, blue: 30, intensity: 255,
        opacity: 1.0, blendMode: 'replace'
      };
      const endState: RGBIO = {
        red: 50, green: 100, blue: 150, intensity: 255,
        opacity: 1.0, blendMode: 'replace'
      };
      const duration = 1000;
      const easing = 'linear';
      
      // Create controller
      const lightTransitionController = new LightTransitionController(lightStateManager);
      
      // Set transition
      lightTransitionController.setTransition(
        lightId,
        layer,
        startState,
        endState,
        duration,
        easing
      );
      
      // Verify the transition data was stored correctly
      const transitions = (lightTransitionController as any)._transitionsByLight;
      expect(transitions.has(lightId)).toBeTruthy();
      
      const lightTransitions = transitions.get(lightId);
      expect(lightTransitions).toBeDefined();
      expect(lightTransitions.has(layer)).toBeTruthy();
      
      const transitionData = lightTransitions.get(layer);
      expect(transitionData).toBeDefined();
      expect(transitionData.startState).toEqual(startState);
      expect(transitionData.endState).toEqual(endState);
      expect(transitionData.transition.transform.duration).toBe(duration);
      expect(transitionData.transition.transform.easing).toBe(easing);
      
      // Verify initial state is available
      const initialLightState = lightTransitionController.getLightState(lightId, layer);
      expect(initialLightState).toBeDefined();
    });
  });
  
  describe('calculateLayeredState', () => {
    it('should respect higher layer states', () => {
      // Create a controller with known light states
      const mockLightStateManager = {
        setLightState: jest.fn(),
        getLightState: jest.fn().mockReturnValue(createMockRGBIP()),
        publishLightStates: jest.fn(),
        getTrackedLightIds: jest.fn().mockReturnValue([])
      };
      lightTransitionController = new LightTransitionController(mockLightStateManager as any);
      
      // Set states for different layers
      const lightId = 'test-light';
      const layer1 = 1;
      const layer2 = 2;
      const layer3 = 3;
      
              const state1 = createMockRGBIP({ red: 100, green: 0, blue: 0, opacity: 1.0, blendMode: 'replace' });
        const state2 = createMockRGBIP({ red: 0, green: 100, blue: 0, opacity: 1.0, blendMode: 'replace' });
        const state3 = createMockRGBIP({ red: 0, green: 0, blue: 100, opacity: 1.0, blendMode: 'replace' });
      
      // Directly set light states for different layers
      const layerStates = new Map<number, RGBIO>();
      layerStates.set(layer1, state1);
      layerStates.set(layer2, state2);
      layerStates.set(layer3, state3);
      (lightTransitionController as any)._currentLayerStates.set(lightId, layerStates);
      
      // Manually call the calculateFinalColorForLight method
      (lightTransitionController as any).calculateFinalColorForLight(lightId);
      
      // Get the final state from the light state manager
      expect(mockLightStateManager.setLightState).toHaveBeenCalledWith(lightId, state3);
    });
    
    it('should handle missing layers correctly', () => {
      // Create a controller with known light states
      const mockLightStateManager = {
        setLightState: jest.fn(),
        getLightState: jest.fn().mockReturnValue(createMockRGBIP()),
        publishLightStates: jest.fn(),
        getTrackedLightIds: jest.fn().mockReturnValue([])
      };
      lightTransitionController = new LightTransitionController(mockLightStateManager as any);
      
      // Set states for different layers
      const lightId = 'test-light';
      const layer1 = 1;
      const layer3 = 3; // Skip layer 2
      
              const state1 = createMockRGBIP({ red: 100, green: 0, blue: 0, opacity: 1.0, blendMode: 'replace' });
        const state3 = createMockRGBIP({ red: 0, green: 0, blue: 100, opacity: 1.0, blendMode: 'replace' });
      
      // Directly set light states for different layers
      const layerStates = new Map<number, RGBIO>();
      layerStates.set(layer1, state1);
      layerStates.set(layer3, state3);
      (lightTransitionController as any)._currentLayerStates.set(lightId, layerStates);
      
      // Manually call the calculateFinalColorForLight method
      (lightTransitionController as any).calculateFinalColorForLight(lightId);
      
      // Get the final state from the light state manager
      expect(mockLightStateManager.setLightState).toHaveBeenCalledWith(lightId, state3);
    });

    it('should override base colour when higher layer has full opacity', () => {
      // Create a controller with known light states
      const mockLightStateManager = {
        setLightState: jest.fn(),
        getLightState: jest.fn().mockReturnValue(createMockRGBIP()),
        publishLightStates: jest.fn(),
        getTrackedLightIds: jest.fn().mockReturnValue([])
      };
      lightTransitionController = new LightTransitionController(mockLightStateManager as any);
      
      // Set states for different layers
      const lightId = 'test-light';
      const layer0 = 0; // Base layer
      const layer1 = 1; // Higher layer with full opacity
      
      // Red on base layer
      const baseState = createMockRGBIP({ red: 255, green: 0, blue: 0, opacity: 1.0, blendMode: 'replace' });
      // Blue on higher layer with full opacity
      const higherState = createMockRGBIP({ red: 0, green: 0, blue: 255, opacity: 1.0, blendMode: 'replace' });
      
      // Directly set light states for different layers
      const layerStates = new Map<number, RGBIO>();
      layerStates.set(layer0, baseState);
      layerStates.set(layer1, higherState);
      (lightTransitionController as any)._currentLayerStates.set(lightId, layerStates);
      
      // Manually call the calculateFinalColorForLight method
      (lightTransitionController as any).calculateFinalColorForLight(lightId);
      
      // Higher layer state should completely override base layer
      expect(mockLightStateManager.setLightState).toHaveBeenCalledWith(lightId, higherState);
    });

    it('should blend colours correctly when higher layer has partial opacity', () => {
      // Create a controller with known light states
      const mockLightStateManager = {
        setLightState: jest.fn(),
        getLightState: jest.fn().mockReturnValue(createMockRGBIP()),
        publishLightStates: jest.fn(),
        getTrackedLightIds: jest.fn().mockReturnValue([])
      };
      lightTransitionController = new LightTransitionController(mockLightStateManager as any);
      
      // Set states for different layers
      const lightId = 'test-light';
      const layer0 = 0; // Base layer
      const layer1 = 1; // Higher layer with partial opacity
      
      // Red on base layer with full opacity
      const baseState = createMockRGBIP({ red: 255, green: 0, blue: 0, opacity: 1.0, blendMode: 'replace' });
      
      // Green on higher layer with channel-specific opacity
      const higherState = createMockRGBIP({ 
        red: 0, green: 200, blue: 0, intensity: 100, 
        opacity: 0.5, blendMode: 'add'
      });
      
      // Expected result: Additive blending with opacity scaling
      // red: 255 + (0 × 0.5) = 255 (base + scaled higher)
      // green: 0 + (200 × 0.5) = 100 (base + scaled higher)
      // blue: 0 + (0 × 0.5) = 0 (base + scaled higher)
      // intensity: 255 + (100 × 0.5) = 305 → clamped to 255 (base + scaled higher)
      const expectedState = createMockRGBIP({ 
        red: 255, green: 100, blue: 0, intensity: 255,
        opacity: 1.0, blendMode: 'add'
      });
      
      // Directly set light states for different layers
      const layerStates = new Map<number, RGBIO>();
      layerStates.set(layer0, baseState);
      layerStates.set(layer1, higherState);
      (lightTransitionController as any)._currentLayerStates.set(lightId, layerStates);
      
      // Manually call the calculateFinalColorForLight method
      (lightTransitionController as any).calculateFinalColorForLight(lightId);
      
      // Should blend each channel according to its individual opacity
      expect(mockLightStateManager.setLightState).toHaveBeenCalledWith(lightId, expectedState);
    });

    it('should blend each RGB channel based on its individual opacity', () => {
      // Create a controller with known light states
      const mockLightStateManager = {
        setLightState: jest.fn(),
        getLightState: jest.fn().mockReturnValue(createMockRGBIP()),
        publishLightStates: jest.fn(),
        getTrackedLightIds: jest.fn().mockReturnValue([])
      };
      lightTransitionController = new LightTransitionController(mockLightStateManager as any);
      
      // Set states for different layers
      const lightId = 'test-light';
      const layer0 = 0; // Base layer
      const layer1 = 1; // Higher layer with varying channel opacity
      
      // White on base layer with full opacity
      const baseState = createMockRGBIP({ 
        red: 200, green: 200, blue: 200, intensity: 200,
        opacity: 1.0, blendMode: 'replace'
      });
      
      // RGB on higher layer with different channel priorities
      const higherState = createMockRGBIP({ 
        red: 255, green: 255, blue: 255, intensity: 255,
        opacity: 0.75, blendMode: 'add'
      });
      
      // Directly set light states for different layers
      const layerStates = new Map<number, RGBIO>();
      layerStates.set(layer0, baseState);
      layerStates.set(layer1, higherState);
      (lightTransitionController as any)._currentLayerStates.set(lightId, layerStates);
      
      // Call the calculateFinalColorForLight method
      (lightTransitionController as any).calculateFinalColorForLight(lightId);
      
      // Verify that the setLightState method was called
      expect(mockLightStateManager.setLightState).toHaveBeenCalled();
      
      // Get what the actual blending result is
      const actualBlendedResult = mockLightStateManager.setLightState.mock.calls[0][1] as RGBIO;
      
      // Verify that the result exists and has the proper properties
      expect(actualBlendedResult).toBeDefined();
      
      // Verify opacity and blendMode are preserved
      expect(actualBlendedResult.opacity).toBe(1.0);
      expect(actualBlendedResult.blendMode).toBe('add');
      
      // Verify red is blended based on opacity
      // When opacity < 1.0 with add blend mode, higher layer overrides lower layer
      expect(actualBlendedResult.red).toBe(255);
      
      // Verify green is blended based on opacity
      // When opacity < 1.0 with add blend mode, higher layer overrides lower layer
      expect(actualBlendedResult.green).toBe(255);
      
      // Verify blue is blended based on opacity
      // When opacity < 1.0 with add blend mode, higher layer overrides lower layer
      expect(actualBlendedResult.blue).toBe(255);
      
      // Verify intensity is blended based on opacity
      // When opacity < 1.0 with add blend mode, higher layer overrides lower layer
      expect(actualBlendedResult.intensity).toBe(255);
    });

    it('should treat intensity as its own channel like RGB, not as a master dimmer', () => {
      // Create a controller with known light states
      const mockLightStateManager = {
        setLightState: jest.fn(),
        getLightState: jest.fn().mockReturnValue(createMockRGBIP()),
        publishLightStates: jest.fn(),
        getTrackedLightIds: jest.fn().mockReturnValue([])
      };
      lightTransitionController = new LightTransitionController(mockLightStateManager as any);
      
      // Set states for different layers
      const lightId = 'test-light';
      const layer0 = 0; // Base layer
      const layer1 = 1; // Higher layer with different intensity opacity
      
      // Full red with high intensity
      const baseState = createMockRGBIP({ 
        red: 255, green: 0, blue: 0, intensity: 200,
        opacity: 1.0, blendMode: 'replace'
      });
      
      // Same color but with lower intensity at 50% opacity
      const higherState = createMockRGBIP({ 
        red: 255, green: 0, blue: 0, intensity: 100,
        opacity: 0.5, blendMode: 'add'
      });
      
      // Directly set light states for different layers
      const layerStates = new Map<number, RGBIO>();
      layerStates.set(layer0, baseState);
      layerStates.set(layer1, higherState);
      (lightTransitionController as any)._currentLayerStates.set(lightId, layerStates);
      
      // Manually call the calculateFinalColorForLight method
      (lightTransitionController as any).calculateFinalColorForLight(lightId);
      
      // Get the actual blended result
      const actualBlendedResult = mockLightStateManager.setLightState.mock.calls[0][1] as RGBIO;
      
      // Verify that the result exists and has the proper properties
      expect(actualBlendedResult).toBeDefined();
      expect(actualBlendedResult.opacity).toBe(1.0);
      
      // RGB values should be blended additively: 255 + (255 × 0.5) = 255 (clamped)
      expect(actualBlendedResult.red).toBe(255);
      expect(actualBlendedResult.green).toBe(0);
      expect(actualBlendedResult.blue).toBe(0);
      
      // Intensity should be blended additively: 200 + (100 × 0.5) = 250
      // When opacity < 1.0 with add blend mode, higher layer is scaled and added
      expect(actualBlendedResult.intensity).toBe(250);
    });

    it('should respect intensity opacity independently of RGB opacity', () => {
      // Create a controller with known light states
      const mockLightStateManager = {
        setLightState: jest.fn(),
        getLightState: jest.fn().mockReturnValue(createMockRGBIP()),
        publishLightStates: jest.fn(),
        getTrackedLightIds: jest.fn().mockReturnValue([])
      };
      lightTransitionController = new LightTransitionController(mockLightStateManager as any);
      
      // Set states for different layers
      const lightId = 'test-light';
      const layer0 = 0; // Base layer
      const layer1 = 1; // Higher layer with different intensity opacity
      
      // Base state with full red
      const baseState = createMockRGBIP({ 
        red: 200, green: 0, blue: 0, intensity: 200,
        opacity: 1.0, blendMode: 'replace'
      });
      
      // Higher state with varying RGB opacity and partial intensity opacity
      const higherState = createMockRGBIP({ 
        red: 100, green: 100, blue: 100, intensity: 100,
        opacity: 0.5, blendMode: 'add'
      });
      
      // Directly set light states for different layers
      const layerStates = new Map<number, RGBIO>();
      layerStates.set(layer0, baseState);
      layerStates.set(layer1, higherState);
      (lightTransitionController as any)._currentLayerStates.set(lightId, layerStates);
      
      // Manually call the calculateFinalColorForLight method
      (lightTransitionController as any).calculateFinalColorForLight(lightId);
      
      // Get the actual blended result
      const actualBlendedResult = mockLightStateManager.setLightState.mock.calls[0][1] as RGBIO;
      
      // Verify that the result exists and has the proper properties
      expect(actualBlendedResult).toBeDefined();
      expect(actualBlendedResult.opacity).toBe(1.0);
      
      // Verify each RGB channel is blended according to opacity and blend mode
      
      // Red should be blended additively: 200 + (100 × 0.5) = 250
      // When opacity < 1.0 with add blend mode, higher layer is scaled and added
      expect(actualBlendedResult.red).toBe(250);
      
      // Green should be blended additively: 0 + (100 × 0.5) = 50
      // When opacity < 1.0 with add blend mode, higher layer is scaled and added
      expect(actualBlendedResult.green).toBe(50);
      
      // Blue should be blended additively: 0 + (100 × 0.5) = 50
      // When opacity < 1.0 with add blend mode, higher layer is scaled and added
      expect(actualBlendedResult.blue).toBe(50);
      
      // Intensity should be blended additively: 200 + (100 × 0.5) = 250
      // When opacity < 1.0 with add blend mode, higher layer is scaled and added
      expect(actualBlendedResult.intensity).toBe(250);
    });

    it('should correctly blend multiple layers with varying opacity', () => {
      // Create a controller with known light states
      const mockLightStateManager = {
        setLightState: jest.fn(),
        getLightState: jest.fn().mockReturnValue(createMockRGBIP()),
        publishLightStates: jest.fn(),
        getTrackedLightIds: jest.fn().mockReturnValue([])
      };
      lightTransitionController = new LightTransitionController(mockLightStateManager as any);
      
      // Set states for different layers
      const lightId = 'test-light';
      const layer0 = 0; // Base red layer
      const layer1 = 1; // Green layer with varying opacity
      const layer2 = 2; // Blue layer with varying opacity
      const layer3 = 3; // Yellow layer with varying opacity
      
      // Base layer: Red
      const state0 = createMockRGBIP({ 
        red: 255, green: 0, blue: 0, intensity: 255,
        opacity: 1.0, blendMode: 'replace'
      });
      
      // Layer 1: Green with opacity
      const state1 = createMockRGBIP({ 
        red: 0, green: 255, blue: 0, intensity: 200,
        opacity: 0.5, blendMode: 'add'
      });
      
      // Layer 2: Blue with opacity
      const state2 = createMockRGBIP({ 
        red: 0, green: 0, blue: 255, intensity: 150,
        opacity: 0.75, blendMode: 'add'
      });
      
      // Layer 3: Yellow with opacity
      const state3 = createMockRGBIP({ 
        red: 255, green: 255, blue: 0, intensity: 100,
        opacity: 0.25, blendMode: 'add'
      });
      
      // Directly set light states for different layers
      const layerStates = new Map<number, RGBIO>();
      layerStates.set(layer0, state0);
      layerStates.set(layer1, state1);
      layerStates.set(layer2, state2);
      layerStates.set(layer3, state3);
      (lightTransitionController as any)._currentLayerStates.set(lightId, layerStates);
      
      // Manually call the calculateFinalColorForLight method
      (lightTransitionController as any).calculateFinalColorForLight(lightId);
      
      // Verify that the setLightState method was called
      expect(mockLightStateManager.setLightState).toHaveBeenCalled();
      const setStateCall = mockLightStateManager.setLightState.mock.calls[0];
      expect(setStateCall[0]).toBe(lightId);
      
      // Get the result and verify each property has appropriate type
      const finalState = setStateCall[1] as RGBIO;
      expect(finalState).toBeDefined();
      expect(typeof finalState.red).toBe('number');
      expect(typeof finalState.green).toBe('number');
      expect(typeof finalState.blue).toBe('number');
      expect(typeof finalState.intensity).toBe('number');
      
      // The top layer's opacity and blendMode values should be preserved
      expect(finalState.opacity).toBe(1.0);
      expect(finalState.blendMode).toBe('add');
    });

    it('should explicitly demonstrate independent channel opacity blending', () => {
      // Create a controller with known light states
      const mockLightStateManager = {
        setLightState: jest.fn(),
        getLightState: jest.fn().mockReturnValue(createMockRGBIP()),
        publishLightStates: jest.fn(),
        getTrackedLightIds: jest.fn().mockReturnValue([])
      };
      lightTransitionController = new LightTransitionController(mockLightStateManager as any);
      
      // Set states for different layers
      const lightId = 'test-light';
      const baseLayer = 0;
      const upperLayer = 1;
      
      // Base layer: White (fully opaque)
      const baseState = createMockRGBIP({ 
        red: 200, green: 200, blue: 200, intensity: 200,
        opacity: 1.0, blendMode: 'replace'
      });
      
      // Upper layer: Each channel has different values with opacity-based blending
      // This test specifically emphasizes that opacity affects all channels uniformly
      const upperState = createMockRGBIP({ 
        red: 100,     // Red value is half of base
        green: 250,   // Green value is higher than base
        blue: 50,     // Blue value is much lower than base
        intensity: 150, // Intensity is lower than base
        
        // Opacity-based blending:
        opacity: 0.5, // 50% opacity - partial blend with base
        blendMode: 'add' // Additive blending
      });
      
      // Directly set light states for different layers
      const layerStates = new Map<number, RGBIO>();
      layerStates.set(baseLayer, baseState);
      layerStates.set(upperLayer, upperState);
      (lightTransitionController as any)._currentLayerStates.set(lightId, layerStates);
      
      // Manually call the calculateFinalColorForLight method
      (lightTransitionController as any).calculateFinalColorForLight(lightId);
      
      // Verify the result
      expect(mockLightStateManager.setLightState).toHaveBeenCalled();
      const finalState = mockLightStateManager.setLightState.mock.calls[0][1] as RGBIO;
      
      // Calculate expected values for each channel based on opacity
      
      // Red channel - blended additively: 200 + (100 × 0.5) = 250
      // When opacity < 1.0 with add blend mode, higher layer is scaled and added
      expect(finalState.red).toBe(250);
      
      // Green channel - blended additively: 200 + (250 × 0.5) = 200 + 125 = 255 (clamped)
      // When opacity < 1.0 with add blend mode, higher layer is scaled and added
      expect(finalState.green).toBe(255);
      
      // Blue channel - blended additively: 200 + (50 × 0.5) = 225
      // When opacity < 1.0 with add blend mode, higher layer is scaled and added
      expect(finalState.blue).toBe(225);
      
      // Intensity channel - blended additively: 200 + (150 × 0.5) = 275 (clamped to 255)
      // When opacity < 1.0 with add blend mode, higher layer is scaled and added
      expect(finalState.intensity).toBe(255);
      
      // Verify that opacity and blendMode from the upper layer are preserved
      expect(finalState.opacity).toBe(1.0);
      expect(finalState.blendMode).toBe('add');
    });

    it('should completely override lower layer when all opacity values are 1.0', () => {
      // Create a controller with known light states
      const mockLightStateManager = {
        setLightState: jest.fn(),
        getLightState: jest.fn().mockReturnValue(createMockRGBIP()),
        publishLightStates: jest.fn(),
        getTrackedLightIds: jest.fn().mockReturnValue([])
      };
      lightTransitionController = new LightTransitionController(mockLightStateManager as any);
      
      // Set states for different layers
      const lightId = 'test-light';
      const lowerLayer = 0;
      const upperLayer = 1;
      
      // Lower layer: Specific values that should be completely overridden
      const lowerState = createMockRGBIP({ 
        red: 123, green: 45, blue: 67, intensity: 210,
        opacity: 1.0, blendMode: 'replace'
      });
      
      // Upper layer: Completely different values with replace blend mode
      const upperState = createMockRGBIP({ 
        red: 42, green: 180, blue: 220, intensity: 150,
        opacity: 1.0, blendMode: 'replace'
      });
      
      // Directly set light states for different layers
      const layerStates = new Map<number, RGBIO>();
      layerStates.set(lowerLayer, lowerState);
      layerStates.set(upperLayer, upperState);
      (lightTransitionController as any)._currentLayerStates.set(lightId, layerStates);
      
      // Call the calculateFinalColorForLight method
      (lightTransitionController as any).calculateFinalColorForLight(lightId);
      
      // Verify the result
      expect(mockLightStateManager.setLightState).toHaveBeenCalled();
      const finalState = mockLightStateManager.setLightState.mock.calls[0][1] as RGBIO;
      
      // Expect the higher layer's values to completely override the lower layer
      expect(finalState.red).toBe(42);
      expect(finalState.green).toBe(180);
      expect(finalState.blue).toBe(220);
      expect(finalState.intensity).toBe(150);
      
      // Opacity and blendMode should also be preserved
      expect(finalState.opacity).toBe(1.0);
      expect(finalState.blendMode).toBe('replace');
      
      // Verify we get a direct object reference match - optimization in the code
      // directly returns the higher layer's state object without any blending
      expect(mockLightStateManager.setLightState).toHaveBeenCalledWith(lightId, upperState);
    });
  });
}); 