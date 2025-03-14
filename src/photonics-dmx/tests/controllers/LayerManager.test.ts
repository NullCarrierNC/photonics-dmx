/*
 * LayerManager Test Suite
 * 
 * This suite tests the functionality of the LayerManager class.
 * It verifies that the manager correctly handles active effects, queued effects,
 * layer tracking, and cleanup operations.
 * 
 * Note: The LayerManager should be accessed through the Sequencer facade.
 * These tests validate the internal implementation that is used by the Sequencer.
 */

import { LayerManager } from '../../controllers/sequencer/LayerManager';
import { LightTransitionController } from '../../controllers/sequencer/LightTransitionController';
import { ActiveEffect, QueuedEffect } from '../../controllers/sequencer/interfaces';
import { afterEach, beforeEach, describe, jest, it, expect } from '@jest/globals';
import { createMockTrackedLight } from '../helpers/testFixtures';

jest.mock('../../controllers/sequencer/LightTransitionController');

describe('LayerManager', () => {
  let lightTransitionController: jest.Mocked<LightTransitionController>;
  let layerManager: LayerManager;

  beforeEach(() => {
    // Setup mocks
    lightTransitionController = {
      setTransition: jest.fn(),
      removeTransitionsByLayer: jest.fn(),
      removeLightLayer: jest.fn(),
      getLightState: jest.fn().mockReturnValue({
        red: 0, rp: 0,
        green: 0, gp: 0,
        blue: 0, bp: 0,
        intensity: 0, ip: 0
      })
    } as unknown as jest.Mocked<LightTransitionController>;
    
    // Create a new LayerManager instance
    layerManager = new LayerManager(lightTransitionController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Active Effects Management', () => {
    it('should add and retrieve active effects', () => {
      // Create a mock active effect
      const mockEffect: ActiveEffect = {
        name: 'test-effect',
        effect: { id: 'test', description: 'Test Effect', transitions: [] },
        transitions: [],
        trackedLights: [createMockTrackedLight()],
        layer: 1,
        currentTransitionIndex: 0,
        state: 'idle',
        transitionStartTime: 0,
        waitEndTime: 0,
        lastEndStates: new Map(),
        isPersistent: false
      };

      // Add the effect to layer 1
      layerManager.addActiveEffect(1, mockEffect);

      // Retrieve all active effects
      const activeEffects = layerManager.getActiveEffects();
      expect(activeEffects.size).toBe(1);
      expect(activeEffects.get(1)).toBe(mockEffect);

      // Get a specific effect
      const retrievedEffect = layerManager.getActiveEffect(1);
      expect(retrievedEffect).toBe(mockEffect);
    });

    it('should remove active effects', () => {
      // Create and add a mock active effect
      const mockEffect: ActiveEffect = {
        name: 'test-effect',
        effect: { id: 'test', description: 'Test Effect', transitions: [] },
        transitions: [],
        trackedLights: [createMockTrackedLight()],
        layer: 1,
        currentTransitionIndex: 0,
        state: 'idle',
        transitionStartTime: 0,
        waitEndTime: 0,
        lastEndStates: new Map(),
        isPersistent: false
      };

      layerManager.addActiveEffect(1, mockEffect);
      expect(layerManager.getActiveEffect(1)).toBe(mockEffect);

      // Remove the effect
      layerManager.removeActiveEffect(1);
      expect(layerManager.getActiveEffect(1)).toBeUndefined();
    });

    it('should track layer usage time', () => {
      const currentTime = Date.now();
      
      // Set the last used time for a layer
      layerManager.setLayerLastUsed(1, currentTime);
      
      // Add an effect to verify the layer is active
      const mockEffect: ActiveEffect = {
        name: 'test-effect',
        effect: { id: 'test', description: 'Test Effect', transitions: [] },
        transitions: [],
        trackedLights: [createMockTrackedLight()],
        layer: 1,
        currentTransitionIndex: 0,
        state: 'idle',
        transitionStartTime: 0,
        waitEndTime: 0,
        lastEndStates: new Map(),
        isPersistent: false
      };
      
      layerManager.addActiveEffect(1, mockEffect);
      
      // Get all layers
      const layers = layerManager.getAllLayers();
      expect(layers).toContain(1);
    });
  });

  describe('Queued Effects Management', () => {
    it('should add and retrieve queued effects', () => {
      // Create a mock queued effect
      const mockQueuedEffect: QueuedEffect = {
        name: 'test-effect-queued',
        effect: { id: 'test', description: 'Test Effect', transitions: [] },
        isPersistent: true
      };

      // Add the queued effect to layer 1
      layerManager.addQueuedEffect(1, mockQueuedEffect);

      // Retrieve the queued effect
      const queuedEffect = layerManager.getQueuedEffect(1);
      expect(queuedEffect).toBe(mockQueuedEffect);
      
      // Get all queued effects
      const queuedEffects = layerManager.getEffectQueue();
      expect(queuedEffects.size).toBe(1);
      expect(queuedEffects.get(1)).toBe(mockQueuedEffect);
    });

    it('should remove queued effects', () => {
      // Create and add a mock queued effect
      const mockQueuedEffect: QueuedEffect = {
        name: 'test-effect-queued',
        effect: { id: 'test', description: 'Test Effect', transitions: [] },
        isPersistent: true
      };

      layerManager.addQueuedEffect(1, mockQueuedEffect);
      expect(layerManager.getQueuedEffect(1)).toBe(mockQueuedEffect);

      // Remove the queued effect
      layerManager.removeQueuedEffect(1);
      expect(layerManager.getQueuedEffect(1)).toBeUndefined();
    });
  });

  describe('Layer Cleanup', () => {
    it('should clean up unused layers after grace period', () => {
      const currentTime = Date.now();
      
      // Set up an active layer but with an old timestamp
      layerManager.setLayerLastUsed(1, currentTime - 4000); // Older than 3000ms grace period
      
      // Clean up unused layers
      layerManager.cleanupUnusedLayers(currentTime);
      
      // Verify removeTransitionsByLayer was called for the stale layer
      expect(lightTransitionController.removeTransitionsByLayer).toHaveBeenCalledWith(1);
    });

    it('should not clean up layer 0', () => {
      const currentTime = Date.now();
      
      // Set up layer 0 with an old timestamp
      layerManager.setLayerLastUsed(0, currentTime - 5000);
      
      // Clean up unused layers
      layerManager.cleanupUnusedLayers(currentTime);
      
      // Verify removeTransitionsByLayer was NOT called for layer 0
      expect(lightTransitionController.removeTransitionsByLayer).not.toHaveBeenCalledWith(0);
    });

    it('should not clean up recently used layers', () => {
      const currentTime = Date.now();
      
      // Set up a layer with a recent timestamp
      layerManager.setLayerLastUsed(1, currentTime - 1000); // Less than 3000ms grace period
      
      // Clean up unused layers
      layerManager.cleanupUnusedLayers(currentTime);
      
      // Verify removeTransitionsByLayer was NOT called for the recent layer
      expect(lightTransitionController.removeTransitionsByLayer).not.toHaveBeenCalledWith(1);
    });

    it('should not clean up layers with active effects', () => {
      const currentTime = Date.now();
      
      // Set up an old timestamp for a layer
      layerManager.setLayerLastUsed(1, currentTime - 5000);
      
      // Add an active effect to the layer
      const mockEffect: ActiveEffect = {
        name: 'test-effect',
        effect: { id: 'test', description: 'Test Effect', transitions: [] },
        transitions: [],
        trackedLights: [createMockTrackedLight()],
        layer: 1,
        currentTransitionIndex: 0,
        state: 'idle',
        transitionStartTime: 0,
        waitEndTime: 0,
        lastEndStates: new Map(),
        isPersistent: false
      };
      
      layerManager.addActiveEffect(1, mockEffect);
      
      // Clean up unused layers
      layerManager.cleanupUnusedLayers(currentTime);
      
      // Verify removeTransitionsByLayer was NOT called for the layer with active effect
      expect(lightTransitionController.removeTransitionsByLayer).not.toHaveBeenCalledWith(1);
    });

    it('should not clean up layers with queued effects', () => {
      const currentTime = Date.now();
      
      // Set up an old timestamp for a layer
      layerManager.setLayerLastUsed(1, currentTime - 5000);
      
      // Add a queued effect to the layer
      const mockQueuedEffect: QueuedEffect = {
        name: 'test-queued-effect',
        effect: { id: 'test', description: 'Test Effect', transitions: [] },
        isPersistent: true
      };
      
      layerManager.addQueuedEffect(1, mockQueuedEffect);
      
      // Clean up unused layers
      layerManager.cleanupUnusedLayers(currentTime);
      
      // Verify removeTransitionsByLayer was NOT called for the layer with queued effect
      expect(lightTransitionController.removeTransitionsByLayer).not.toHaveBeenCalledWith(1);
    });
  });

  describe('Blackout Layer Management', () => {
    it('should return the correct blackout layer threshold', () => {
      // Get the blackout layer threshold
      const threshold = layerManager.getBlackoutLayersUnder();
      
      // Verify it matches the expected value
      expect(threshold).toBe(200);
    });
  });
}); 