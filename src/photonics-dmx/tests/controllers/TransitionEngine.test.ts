/*
 * TransitionEngine Test Suite
 * 
 * This suite tests the functionality of the TransitionEngine.
 * It verifies that the engine correctly handles animations, state transitions, 
 * and timing of effects.
 * 
 * Note: The TransitionEngine should only be accessed through the Sequencer facade.
 * These tests validate the internal implementation that is used by the Sequencer.
 */

import { TransitionEngine } from '../../controllers/sequencer/TransitionEngine';
import { LightTransitionController } from '../../controllers/sequencer/LightTransitionController';
import { LayerManager } from '../../controllers/sequencer/LayerManager';
import { ActiveEffect } from '../../controllers/sequencer/interfaces';
import { createMockRGBIP, createMockTrackedLight } from '../helpers/testFixtures';
import { afterEach, beforeEach, describe, jest, it, expect } from '@jest/globals';
import { EffectTransition } from '../../types';

jest.mock('../../controllers/sequencer/LightTransitionController');
jest.mock('../../controllers/sequencer/LayerManager');

describe('TransitionEngine', () => {
  let lightTransitionController: jest.Mocked<LightTransitionController>;
  let layerManager: jest.Mocked<LayerManager>;
  let transitionEngine: TransitionEngine;
  
  // Helper to create a mock effect transition
  const createMockEffectTransition = (overrides?: Partial<EffectTransition>): EffectTransition => ({
    lights: [createMockTrackedLight()],
    layer: 1,
    waitFor: 'none',
    forTime: 0,
    transform: {
      color: createMockRGBIP({ red: 255 }),
      easing: 'linear',
      duration: 1000
    },
    waitUntil: 'none',
    untilTime: 0,
    ...overrides
  });
  
  // Helper to create a mock active effect
  const createMockActiveEffect = (overrides?: Partial<ActiveEffect>): ActiveEffect => ({
    name: 'test-effect',
    effect: { id: 'test', description: 'Test Effect', transitions: [] },
    transitions: [createMockEffectTransition()],
    trackedLights: [createMockTrackedLight()],
    layer: 1,
    currentTransitionIndex: 0,
    state: 'idle',
    transitionStartTime: 0,
    waitEndTime: 0,
    lastEndStates: new Map(),
    isPersistent: false,
    ...overrides
  });

  beforeEach(() => {
    // Create mock dependencies
    lightTransitionController = {
      setTransition: jest.fn(),
      removeTransitionsByLayer: jest.fn(),
      getFinalLightState: jest.fn(),
      getLightState: jest.fn().mockReturnValue({
        red: 0, rp: 0,
        green: 0, gp: 0,
        blue: 0, bp: 0,
        intensity: 0, ip: 0
      }),
      removeLightLayer: jest.fn()
    } as unknown as jest.Mocked<LightTransitionController>;

    layerManager = {
      getActiveEffects: jest.fn().mockReturnValue(new Map()),
      removeActiveEffect: jest.fn(),
      addActiveEffect: jest.fn(),
      getActiveEffect: jest.fn(),
      cleanupUnusedLayers: jest.fn(),
      getAllLayers: jest.fn().mockReturnValue([]),
      setLayerLastUsed: jest.fn(),
      addQueuedEffect: jest.fn(),
      getEffectQueue: jest.fn().mockReturnValue(new Map()),
      removeQueuedEffect: jest.fn(),
      getQueuedEffect: jest.fn(),
      getLightState: jest.fn(),
      clearLayerStates: jest.fn(),
      captureFinalStates: jest.fn()
    } as unknown as jest.Mocked<LayerManager>;
    
    // Create TransitionEngine instance with mocked dependencies
    transitionEngine = new TransitionEngine(
      lightTransitionController,
      layerManager
    );
    
    // Use fake timers
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('startAnimationLoop', () => {
    it('should set up the animation loop interval', () => {
      // Mock the global setInterval
      const originalSetInterval = global.setInterval;
      global.setInterval = jest.fn().mockReturnValue(123) as any;
      
      // Call startAnimationLoop
      transitionEngine.startAnimationLoop();
      
      // Verify setInterval was called with correct parameters
      expect(global.setInterval).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Number)
      );
      
      // Get the actual value that was passed
      const actualValue = ((global.setInterval as unknown) as jest.Mock).mock.calls[0][1];
      
      // Check that it's approximately 16.67ms (1000/60)
      expect(actualValue).toBeCloseTo(16.67, 1);
      
      // Restore original setInterval
      global.setInterval = originalSetInterval;
    });
  });

  describe('stopAnimationLoop', () => {
    it('should clear the animation loop interval', () => {
      // Mock global clearInterval
      const originalClearInterval = global.clearInterval;
      global.clearInterval = jest.fn() as any;
      
      // Setup the animation loop interval
      const originalSetInterval = global.setInterval;
      global.setInterval = jest.fn().mockReturnValue(123) as any;
      
      // Start the animation loop
      transitionEngine.startAnimationLoop();
      
      // Now stop it
      transitionEngine.stopAnimationLoop();
      
      // Verify clearInterval was called with the interval ID
      expect(global.clearInterval).toHaveBeenCalledWith(123);
      
      // Restore original functions
      global.clearInterval = originalClearInterval;
      global.setInterval = originalSetInterval;
    });
  });

  describe('updateTransitions', () => {
    it('should process active effects through their transitions', () => {
      // Create a mock active effect in idle state
      const mockActiveEffect = createMockActiveEffect();
      
      // Set up the layerManager to return our mock effect
      const activeEffectsMap = new Map<number, ActiveEffect>();
      activeEffectsMap.set(1, mockActiveEffect);
      layerManager.getActiveEffects.mockReturnValue(activeEffectsMap);
      
      // Call updateTransitions
      transitionEngine.updateTransitions();
      
      // The implementation immediately transitions to 'transitioning' state when waitFor is 'none'
      // which is the default in our mock
      expect(mockActiveEffect.state).toBe('transitioning');
      
      // Verify setLayerLastUsed was called
      expect(layerManager.setLayerLastUsed).toHaveBeenCalledWith(1, expect.any(Number));
    });
    
    it('should handle completed effects and move to the next transition', () => {
      // Create a mock active effect at the end of its transitions
      const mockActiveEffect = createMockActiveEffect({
        currentTransitionIndex: 1,  // Last index if there's only one transition
        transitions: [createMockEffectTransition()]
      });
      
      // Set up the layerManager to return our mock effect
      const activeEffectsMap = new Map<number, ActiveEffect>();
      activeEffectsMap.set(1, mockActiveEffect);
      layerManager.getActiveEffects.mockReturnValue(activeEffectsMap);
      layerManager.getActiveEffect.mockReturnValue(mockActiveEffect);
      
      // Call updateTransitions
      transitionEngine.updateTransitions();
      
      // Verify the effect was removed since it completed all transitions
      expect(layerManager.removeActiveEffect).toHaveBeenCalledWith(1);
    });
  });

  describe('transition state management', () => {
    it('should handle the waitingFor state correctly', () => {
      // Create a mock effect in waitingFor state
      const now = Date.now();
      const mockEffect = createMockActiveEffect({
        state: 'waitingFor',
        waitEndTime: now - 100  // Time already passed
      });
      
      const transition = mockEffect.transitions[0];
      
      // Call handleWaitingFor
      transitionEngine.handleWaitingFor(mockEffect, transition, now);
      
      // Verify state changed to transitioning
      expect(mockEffect.state).toBe('transitioning');
    });
    
    it('should handle the transitioning state correctly', () => {
      // Create a mock effect in transitioning state
      const now = Date.now();
      const mockEffect = createMockActiveEffect({
        state: 'transitioning',
        waitEndTime: now - 100,  // Time already passed
        trackedLights: [createMockTrackedLight({ id: 'test-light' })],
        lastEndStates: new Map<string, any>()
      });
      
      const transition = mockEffect.transitions[0];
      
      // Call handleTransitioning
      transitionEngine.handleTransitioning(mockEffect, transition, now);
      
      // Verify state changed to waitingUntil if untilTime > 0
      if (transition.untilTime > 0) {
        expect(mockEffect.state).toBe('waitingUntil');
      } else {
        expect(mockEffect.state).toBe('idle');
        expect(mockEffect.currentTransitionIndex).toBe(1);  // Advanced to next transition
      }
      
      // Verify last end states were updated
      expect(mockEffect.lastEndStates?.has('test-light')).toBeTruthy();
    });
    
    it('should handle the waitingUntil state correctly', () => {
      // Create a mock effect in waitingUntil state
      const now = Date.now();
      const mockEffect = createMockActiveEffect({
        state: 'waitingUntil',
        waitEndTime: now - 100,  // Time already passed
      });
      
      const transition = createMockEffectTransition({
        untilTime: 500
      });
      
      // Call handleWaitingUntil
      transitionEngine.handleWaitingUntil(mockEffect, transition, now);
      
      // Verify advanced to next transition
      expect(mockEffect.state).toBe('idle');
      expect(mockEffect.currentTransitionIndex).toBe(1);
    });
  });

  describe('getFinalState and clearFinalStates', () => {
    it('should get and clear final states for specific layers', () => {
      // Setup test data
      const mockColor = createMockRGBIP({ red: 255 });
      const lightId = 'test-light';
      const layer = 1;
      
      // Mock the layerManager's getLightState method to return our test color
      layerManager.getLightState.mockReturnValue(mockColor);
      
      // Get the final state
      const finalState = transitionEngine.getFinalState(lightId, layer);
      
      // Verify the result matches our mock color
      expect(finalState).toEqual(mockColor);
      
      // Verify getLightState was called with correct parameters
      expect(layerManager.getLightState).toHaveBeenCalledWith(layer, lightId);
      
      // Clear the final states
      transitionEngine.clearFinalStates(layer);
      
      // Verify clearLayerStates was called with the layer
      expect(layerManager.clearLayerStates).toHaveBeenCalledWith(layer);
    });
  });
}); 