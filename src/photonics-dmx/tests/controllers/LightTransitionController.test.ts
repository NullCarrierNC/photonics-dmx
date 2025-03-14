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
import { RGBIP } from '../../types';
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
        red: 0, rp: 0,
        green: 0, gp: 0,
        blue: 0, bp: 0,
        intensity: 0, ip: 0
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
      const startState: RGBIP = {
        red: 10, green: 20, blue: 30, intensity: 255,
        rp: 255, gp: 255, bp: 255, ip: 255
      };
      const endState: RGBIP = {
        red: 50, green: 100, blue: 150, intensity: 255,
        rp: 255, gp: 255, bp: 255, ip: 255
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
    it('should prioritize higher layer states', () => {
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
      
      const state1 = createMockRGBIP({ red: 100, green: 0, blue: 0, rp: 255, gp: 255, bp: 255, ip: 255 });
      const state2 = createMockRGBIP({ red: 0, green: 100, blue: 0, rp: 255, gp: 255, bp: 255, ip: 255 });
      const state3 = createMockRGBIP({ red: 0, green: 0, blue: 100, rp: 255, gp: 255, bp: 255, ip: 255 });
      
      // Directly set light states for different layers
      const layerStates = new Map<number, RGBIP>();
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
      
      const state1 = createMockRGBIP({ red: 100, green: 0, blue: 0, rp: 255, gp: 255, bp: 255, ip: 255 });
      const state3 = createMockRGBIP({ red: 0, green: 0, blue: 100, rp: 255, gp: 255, bp: 255, ip: 255 });
      
      // Directly set light states for different layers
      const layerStates = new Map<number, RGBIP>();
      layerStates.set(layer1, state1);
      layerStates.set(layer3, state3);
      (lightTransitionController as any)._currentLayerStates.set(lightId, layerStates);
      
      // Manually call the calculateFinalColorForLight method
      (lightTransitionController as any).calculateFinalColorForLight(lightId);
      
      // Get the final state from the light state manager
      expect(mockLightStateManager.setLightState).toHaveBeenCalledWith(lightId, state3);
    });

    it('should override base colour when higher layer has full priority', () => {
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
      const layer1 = 1; // Higher layer with full priority
      
      // Red on base layer
      const baseState = createMockRGBIP({ red: 255, green: 0, blue: 0, rp: 255, gp: 255, bp: 255, ip: 255 });
      // Blue on higher layer with full priority
      const higherState = createMockRGBIP({ red: 0, green: 0, blue: 255, rp: 255, gp: 255, bp: 255, ip: 255 });
      
      // Directly set light states for different layers
      const layerStates = new Map<number, RGBIP>();
      layerStates.set(layer0, baseState);
      layerStates.set(layer1, higherState);
      (lightTransitionController as any)._currentLayerStates.set(lightId, layerStates);
      
      // Manually call the calculateFinalColorForLight method
      (lightTransitionController as any).calculateFinalColorForLight(lightId);
      
      // Higher layer state should completely override base layer
      expect(mockLightStateManager.setLightState).toHaveBeenCalledWith(lightId, higherState);
    });

    it('should blend colours correctly when higher layer has partial (128) priority', () => {
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
      const layer1 = 1; // Higher layer with partial priority
      
      // Red on base layer with full priority
      const baseState = createMockRGBIP({ 
        red: 200, green: 0, blue: 0, intensity: 200, 
        rp: 255, gp: 255, bp: 255, ip: 255 
      });
      
      // Green on higher layer with channel-specific priorities
      const higherState = createMockRGBIP({ 
        red: 0, green: 200, blue: 0, intensity: 100, 
        rp: 128, gp: 255, bp: 64, ip: 128 
      });
      
      // Expected result: Each channel is blended according to its own priority
      // red: baseRed * (1 - 128/255) + higherRed * (128/255) = 200 * 0.5 + 0 * 0.5 = 100
      // green: higher layer has gp=255, so green = higherGreen = 200
      // blue: baseBlue * (1 - 64/255) + higherBlue * (64/255) = 0 * 0.75 + 0 * 0.25 = 0
      // intensity: baseIntensity * (1 - 128/255) + higherIntensity * (128/255) = 200 * 0.5 + 100 * 0.5 = 150
      const expectedState = createMockRGBIP({ 
        red: 100, green: 200, blue: 0, intensity: 150,
        rp: 128, gp: 255, bp: 64, ip: 128 
      });
      
      // Directly set light states for different layers
      const layerStates = new Map<number, RGBIP>();
      layerStates.set(layer0, baseState);
      layerStates.set(layer1, higherState);
      (lightTransitionController as any)._currentLayerStates.set(lightId, layerStates);
      
      // Manually call the calculateFinalColorForLight method
      (lightTransitionController as any).calculateFinalColorForLight(lightId);
      
      // Should blend each channel according to its individual priority
      expect(mockLightStateManager.setLightState).toHaveBeenCalledWith(lightId, expectedState);
    });

    it('should blend each RGB channel based on its individual priority', () => {
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
      const layer1 = 1; // Higher layer with varying channel priorities
      
      // White on base layer with full priority
      const baseState = createMockRGBIP({ 
        red: 200, green: 200, blue: 200, intensity: 200,
        rp: 255, gp: 255, bp: 255, ip: 255 
      });
      
      // RGB on higher layer with different channel priorities
      const higherState = createMockRGBIP({ 
        red: 255, green: 255, blue: 255, intensity: 255,
        rp: 255, gp: 128, bp: 64, ip: 192 
      });
      
      // Directly set light states for different layers
      const layerStates = new Map<number, RGBIP>();
      layerStates.set(layer0, baseState);
      layerStates.set(layer1, higherState);
      (lightTransitionController as any)._currentLayerStates.set(lightId, layerStates);
      
      // Call the calculateFinalColorForLight method
      (lightTransitionController as any).calculateFinalColorForLight(lightId);
      
      // Verify that the setLightState method was called
      expect(mockLightStateManager.setLightState).toHaveBeenCalled();
      
      // Get what the actual blending result is
      const actualBlendedResult = mockLightStateManager.setLightState.mock.calls[0][1] as RGBIP;
      
      // Verify that the result exists and has the proper channel priorities
      expect(actualBlendedResult).toBeDefined();
      
      // Verify each channel priority is preserved
      expect(actualBlendedResult.rp).toBe(255);
      expect(actualBlendedResult.gp).toBe(128);
      expect(actualBlendedResult.bp).toBe(64);
      expect(actualBlendedResult.ip).toBe(192);
      
      // Verify red is fully set to the higher layer value due to rp=255
      expect(actualBlendedResult.red).toBe(255);
      
      // Verify green is partially blended due to gp=128
      // green = baseGreen * (1 - 128/255) + higherGreen * (128/255) = 200 * 0.5 + 255 * 0.5 = 228 (rounded)
      expect(actualBlendedResult.green).toBe(228);
      
      // Verify blue is slightly blended due to bp=64
      // blue = baseBlue * (1 - 64/255) + higherBlue * (64/255) = 200 * 0.75 + 255 * 0.25 = 214 (rounded)
      expect(actualBlendedResult.blue).toBe(214);
      
      // Verify intensity is mostly set to the higher layer due to ip=192
      // intensity = baseIntensity * (1 - 192/255) + higherIntensity * (192/255) = 200 * 0.25 + 255 * 0.75 = 241 (rounded)
      expect(actualBlendedResult.intensity).toBe(241);
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
      const layer1 = 1; // Higher layer with different intensity priority
      
      // Full red with high intensity
      const baseState = createMockRGBIP({ 
        red: 255, green: 0, blue: 0, intensity: 200,
        rp: 255, gp: 255, bp: 255, ip: 255 
      });
      
      // Same color but with lower intensity at 50% priority
      const higherState = createMockRGBIP({ 
        red: 255, green: 0, blue: 0, intensity: 100,
        rp: 255, gp: 255, bp: 255, ip: 128 
      });
      
      // Directly set light states for different layers
      const layerStates = new Map<number, RGBIP>();
      layerStates.set(layer0, baseState);
      layerStates.set(layer1, higherState);
      (lightTransitionController as any)._currentLayerStates.set(lightId, layerStates);
      
      // Manually call the calculateFinalColorForLight method
      (lightTransitionController as any).calculateFinalColorForLight(lightId);
      
      // Get the actual blended result
      const actualBlendedResult = mockLightStateManager.setLightState.mock.calls[0][1] as RGBIP;
      
      // Verify that the result exists and has the proper properties
      expect(actualBlendedResult).toBeDefined();
      expect(actualBlendedResult.ip).toBe(128);
      
      // RGB values should be completely from higher layer due to rp/gp/bp = 255
      expect(actualBlendedResult.red).toBe(255);
      expect(actualBlendedResult.green).toBe(0);
      expect(actualBlendedResult.blue).toBe(0);
      
      // Intensity should be blended based on ip=128 (50%)
      const expectedIntensity = Math.round(200 * (1 - 128/255) + 100 * (128/255));
      expect(actualBlendedResult.intensity).toBe(expectedIntensity);
    });

    it('should respect intensity priority independently of RGB priorities', () => {
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
      const layer1 = 1; // Higher layer with different RGB and Intensity priorities
      
      // Base state with full red
      const baseState = createMockRGBIP({ 
        red: 200, green: 0, blue: 0, intensity: 200,
        rp: 255, gp: 255, bp: 255, ip: 255 
      });
      
      // Higher state with varying RGB priorities and partial intensity priority
      const higherState = createMockRGBIP({ 
        red: 100, green: 100, blue: 100, intensity: 100,
        rp: 255, gp: 128, bp: 64, ip: 64 // Varying priorities
      });
      
      // Directly set light states for different layers
      const layerStates = new Map<number, RGBIP>();
      layerStates.set(layer0, baseState);
      layerStates.set(layer1, higherState);
      (lightTransitionController as any)._currentLayerStates.set(lightId, layerStates);
      
      // Manually call the calculateFinalColorForLight method
      (lightTransitionController as any).calculateFinalColorForLight(lightId);
      
      // Get the actual blended result
      const actualBlendedResult = mockLightStateManager.setLightState.mock.calls[0][1] as RGBIP;
      
      // Verify that the result exists and has the proper properties
      expect(actualBlendedResult).toBeDefined();
      expect(actualBlendedResult.ip).toBe(64);
      
      // Verify each RGB channel is blended according to its own priority
      
      // Red should be completely from higher layer (rp=255)
      expect(actualBlendedResult.red).toBe(100);
      
      // Green should be partially blended (gp=128)
      const expectedGreen = Math.round(0 * (1 - 128/255) + 100 * (128/255));
      expect(actualBlendedResult.green).toBe(expectedGreen);
      
      // Blue should be slightly blended (bp=64)
      const expectedBlue = Math.round(0 * (1 - 64/255) + 100 * (64/255));
      expect(actualBlendedResult.blue).toBe(expectedBlue);
      
      // Intensity should be blended based on ip=64 (25%)
      const expectedIntensity = Math.round(200 * (1 - 64/255) + 100 * (64/255));
      expect(actualBlendedResult.intensity).toBeCloseTo(expectedIntensity, 0);
    });

    it('should correctly blend multiple layers with varying priorities', () => {
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
      const layer1 = 1; // Green layer with varying priorities
      const layer2 = 2; // Blue layer with varying priorities
      const layer3 = 3; // Yellow layer with varying priorities
      
      // Base layer: Red
      const state0 = createMockRGBIP({ 
        red: 255, green: 0, blue: 0, intensity: 255,
        rp: 255, gp: 255, bp: 255, ip: 255 
      });
      
      // Layer 1: Green with channel-specific priorities
      const state1 = createMockRGBIP({ 
        red: 0, green: 255, blue: 0, intensity: 200,
        rp: 128, gp: 255, bp: 64, ip: 128 
      });
      
      // Layer 2: Blue with channel-specific priorities
      const state2 = createMockRGBIP({ 
        red: 0, green: 0, blue: 255, intensity: 150,
        rp: 64, gp: 128, bp: 255, ip: 192 
      });
      
      // Layer 3: Yellow with channel-specific priorities
      const state3 = createMockRGBIP({ 
        red: 255, green: 255, blue: 0, intensity: 100,
        rp: 32, gp: 48, bp: 96, ip: 64 
      });
      
      // Directly set light states for different layers
      const layerStates = new Map<number, RGBIP>();
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
      const finalState = setStateCall[1] as RGBIP;
      expect(finalState).toBeDefined();
      expect(typeof finalState.red).toBe('number');
      expect(typeof finalState.green).toBe('number');
      expect(typeof finalState.blue).toBe('number');
      expect(typeof finalState.intensity).toBe('number');
      
      // The top layer's priority values should be preserved
      expect(finalState.rp).toBe(32);
      expect(finalState.gp).toBe(48);
      expect(finalState.bp).toBe(96);
      expect(finalState.ip).toBe(64);
    });

    it('should explicitly demonstrate independent channel priority blending', () => {
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
        rp: 255, gp: 255, bp: 255, ip: 255 
      });
      
      // Upper layer: Each channel has a different value AND a different priority
      // This test specifically emphasizes that each channel's priority affects only that channel
      const upperState = createMockRGBIP({ 
        red: 100,     // Red value is half of base
        green: 250,   // Green value is higher than base
        blue: 50,     // Blue value is much lower than base
        intensity: 150, // Intensity is lower than base
        
        // Different priority for each channel:
        rp: 255,     // 100% priority - completely overrides base red
        gp: 128,     // 50% priority - partial blend with base green
        bp: 64,      // 25% priority - minimal blend with base blue
        ip: 192      // 75% priority - stronger blend with base intensity
      });
      
      // Directly set light states for different layers
      const layerStates = new Map<number, RGBIP>();
      layerStates.set(baseLayer, baseState);
      layerStates.set(upperLayer, upperState);
      (lightTransitionController as any)._currentLayerStates.set(lightId, layerStates);
      
      // Manually call the calculateFinalColorForLight method
      (lightTransitionController as any).calculateFinalColorForLight(lightId);
      
      // Verify the result
      expect(mockLightStateManager.setLightState).toHaveBeenCalled();
      const finalState = mockLightStateManager.setLightState.mock.calls[0][1] as RGBIP;
      
      // Calculate expected values for each channel based on its own priority
      
      // Red channel - fully overridden (rp=255)
      expect(finalState.red).toBe(100);
      
      // Green channel - 50% blend (gp=128)
      // 200 * (1 - 128/255) + 250 * (128/255) = 200 * 0.5 + 250 * 0.5 = 100 + 125 = 225
      const expectedGreen = Math.round(200 * (1 - 128/255) + 250 * (128/255));
      expect(finalState.green).toBe(expectedGreen);
      
      // Blue channel - 25% blend (bp=64)
      // 200 * (1 - 64/255) + 50 * (64/255) = 200 * 0.75 + 50 * 0.25 = 150 + 12.5 = 163 (rounded)
      const expectedBlue = Math.round(200 * (1 - 64/255) + 50 * (64/255));
      expect(finalState.blue).toBe(expectedBlue);
      
      // Intensity channel - 75% blend (ip=192)
      // 200 * (1 - 192/255) + 150 * (192/255) = 200 * 0.25 + 150 * 0.75 = 50 + 112.5 = 163 (rounded)
      const expectedIntensity = Math.round(200 * (1 - 192/255) + 150 * (192/255));
      expect(finalState.intensity).toBe(expectedIntensity);
      
      // Verify that all priorities from the upper layer are preserved
      expect(finalState.rp).toBe(255);
      expect(finalState.gp).toBe(128);
      expect(finalState.bp).toBe(64);
      expect(finalState.ip).toBe(192);
    });

    it('should completely override lower layer when all priorities are 255', () => {
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
        rp: 255, gp: 255, bp: 255, ip: 255 
      });
      
      // Upper layer: Completely different values with all priorities at 255
      const upperState = createMockRGBIP({ 
        red: 42, green: 180, blue: 220, intensity: 150,
        rp: 255, gp: 255, bp: 255, ip: 255 
      });
      
      // Directly set light states for different layers
      const layerStates = new Map<number, RGBIP>();
      layerStates.set(lowerLayer, lowerState);
      layerStates.set(upperLayer, upperState);
      (lightTransitionController as any)._currentLayerStates.set(lightId, layerStates);
      
      // Call the calculateFinalColorForLight method
      (lightTransitionController as any).calculateFinalColorForLight(lightId);
      
      // Verify the result
      expect(mockLightStateManager.setLightState).toHaveBeenCalled();
      const finalState = mockLightStateManager.setLightState.mock.calls[0][1] as RGBIP;
      
      // Expect the higher layer's values to completely override the lower layer
      expect(finalState.red).toBe(42);
      expect(finalState.green).toBe(180);
      expect(finalState.blue).toBe(220);
      expect(finalState.intensity).toBe(150);
      
      // All priorities should also be preserved
      expect(finalState.rp).toBe(255);
      expect(finalState.gp).toBe(255);
      expect(finalState.bp).toBe(255);
      expect(finalState.ip).toBe(255);
      
      // Verify we get a direct object reference match - optimization in the code
      // directly returns the higher layer's state object without any blending
      expect(mockLightStateManager.setLightState).toHaveBeenCalledWith(lightId, upperState);
    });
  });
}); 