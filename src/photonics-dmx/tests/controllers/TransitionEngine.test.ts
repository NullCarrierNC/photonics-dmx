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

import { TransitionEngine } from '../../controllers/sequencer/TransitionEngine'
import { LightTransitionController } from '../../controllers/sequencer/LightTransitionController'
import { LayerManager } from '../../controllers/sequencer/LayerManager'
import {
  FrameContext,
  IEffectManager,
  LightEffectState,
} from '../../controllers/sequencer/interfaces'
import { createMockRGBIP, createMockTrackedLight } from '../helpers/testFixtures'
import { afterEach, beforeEach, describe, jest, it, expect } from '@jest/globals'
import { EffectTransition } from '../../types'

jest.mock('../../controllers/sequencer/LightTransitionController')
jest.mock('../../controllers/sequencer/LayerManager')

describe('TransitionEngine', () => {
  let lightTransitionController: jest.Mocked<LightTransitionController>
  let layerManager: jest.Mocked<LayerManager>
  let transitionEngine: TransitionEngine

  // Helper to create a mock effect transition
  const createMockEffectTransition = (overrides?: Partial<EffectTransition>): EffectTransition => ({
    lights: [createMockTrackedLight()],
    layer: 1,
    waitForCondition: 'none',
    waitForTime: 0,
    transform: {
      color: createMockRGBIP({ red: 255 }),
      easing: 'linear',
      duration: 1000,
    },
    waitUntilCondition: 'none',
    waitUntilTime: 0,
    ...overrides,
  })

  // Helper to create a mock active effect
  const createMockActiveEffect = (overrides?: Partial<LightEffectState>): LightEffectState => ({
    name: 'test-effect',
    effect: { id: 'test', description: 'Test Effect', transitions: [] },
    transitions: [createMockEffectTransition()],
    layer: 1,
    lightId: 'test-light-1',
    currentTransitionIndex: 0,
    state: 'idle',
    transitionStartTime: 0,
    waitEndTime: 0,
    lastEndState: undefined,
    isPersistent: false,
    ...overrides,
  })

  beforeEach(() => {
    // Create mock dependencies
    lightTransitionController = {
      setTransition: jest.fn(),
      removeTransitionsByLayer: jest.fn(),
      getFinalLightState: jest.fn(),
      getLightState: jest.fn().mockReturnValue({
        red: 0,
        green: 0,
        blue: 0,
        intensity: 0,
        opacity: 1.0,
        blendMode: 'replace',
      }),
      removeLightLayer: jest.fn(),
    } as unknown as jest.Mocked<LightTransitionController>

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
      captureFinalStates: jest.fn(),
    } as unknown as jest.Mocked<LayerManager>

    // Create TransitionEngine instance with mocked dependencies
    transitionEngine = new TransitionEngine(lightTransitionController, layerManager)

    // Use fake timers
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
    jest.clearAllMocks()
  })

  describe('updateTransitions', () => {
    it('should process active effects through their transitions', () => {
      // Create a mock active effect in idle state
      const mockActiveEffect = createMockActiveEffect()

      // Set up the layerManager to return our mock effect
      const activeEffectsMap = new Map<number, Map<string, LightEffectState>>()
      const lightMap = new Map<string, LightEffectState>()
      lightMap.set('test-light-1', mockActiveEffect)
      activeEffectsMap.set(1, lightMap)
      layerManager.getActiveEffects.mockReturnValue(activeEffectsMap)

      // Call updateTransitions
      transitionEngine.updateTransitions()

      // The implementation immediately transitions to 'transitioning' state when waitFor is 'none'
      // which is the default in our mock
      expect(mockActiveEffect.state).toBe('transitioning')

      // Verify setLayerLastUsed was called
      expect(layerManager.setLayerLastUsed).toHaveBeenCalledWith(1, expect.any(Number))
    })

    it('should handle completed effects and move to the next transition', () => {
      // Create a mock active effect at the end of its transitions
      const mockActiveEffect = createMockActiveEffect({
        currentTransitionIndex: 1, // Last index if there's only one transition
        transitions: [createMockEffectTransition()],
      })

      // Set up the layerManager to return our mock effect
      const activeEffectsMap = new Map<number, Map<string, LightEffectState>>()
      const lightMap = new Map<string, LightEffectState>()
      lightMap.set('test-light-1', mockActiveEffect)
      activeEffectsMap.set(1, lightMap)
      layerManager.getActiveEffects.mockReturnValue(activeEffectsMap)
      layerManager.getActiveEffect.mockReturnValue(mockActiveEffect)

      // Call updateTransitions
      transitionEngine.updateTransitions()

      // Verify the effect was removed since it completed all transitions
      expect(layerManager.removeActiveEffect).toHaveBeenCalledWith(1, 'test-light-1')
    })

    it('should not remove layer for last light when completion callback synchronously starts a new effect', () => {
      // Simulates the JSON strobe cue: multiple lights complete on the same tick;
      // the completion callback (for the last-processed light) synchronously adds
      // a new effect for that light. Cleanup must not destroy the just-started effect.
      const layer = 255
      const light1Effect = createMockActiveEffect({
        lightId: 'light1',
        layer,
        currentTransitionIndex: 1,
        transitions: [createMockEffectTransition()],
      })
      const light2Effect = createMockActiveEffect({
        lightId: 'light2',
        layer,
        currentTransitionIndex: 1,
        transitions: [createMockEffectTransition()],
      })
      const light3Effect = createMockActiveEffect({
        lightId: 'light3',
        layer,
        currentTransitionIndex: 1,
        transitions: [createMockEffectTransition()],
      })
      const newEffectForLight3 = createMockActiveEffect({
        name: 'follow-up-effect',
        lightId: 'light3',
        layer,
        currentTransitionIndex: 0,
        state: 'idle',
        transitions: [createMockEffectTransition()],
      })

      const activeEffectsMap = new Map<number, Map<string, LightEffectState>>()
      const layer255Map = new Map<string, LightEffectState>()
      layer255Map.set('light1', light1Effect)
      layer255Map.set('light2', light2Effect)
      layer255Map.set('light3', light3Effect)
      activeEffectsMap.set(layer, layer255Map)

      layerManager.getActiveEffects.mockReturnValue(activeEffectsMap)
      layerManager.getActiveEffect.mockImplementation((l: number, lightId: string) =>
        activeEffectsMap.get(l)?.get(lightId),
      )
      layerManager.removeActiveEffect.mockImplementation((l: number, lightId: string) => {
        activeEffectsMap.get(l)?.delete(lightId)
      })
      layerManager.getQueuedEffect.mockReturnValue(undefined)

      const mockEffectManager = {
        onLightEffectComplete: jest.fn((effect: LightEffectState) => {
          if (effect.lightId === 'light3') {
            layer255Map.set('light3', newEffectForLight3)
          }
        }),
        startNextEffectInQueue: jest.fn().mockReturnValue(false),
      } as unknown as IEffectManager

      transitionEngine.setEffectManager(mockEffectManager)
      transitionEngine.updateTransitions()

      // Deferred removal: first frame only queues; second frame applies removals for lights with no successor.
      expect(lightTransitionController.removeLightLayer).not.toHaveBeenCalled()
      transitionEngine.updateTransitions()

      expect(lightTransitionController.removeLightLayer).toHaveBeenCalledWith('light1', layer)
      expect(lightTransitionController.removeLightLayer).toHaveBeenCalledWith('light2', layer)
      expect(lightTransitionController.removeLightLayer).not.toHaveBeenCalledWith('light3', layer)
    })

    it('defers removeLightLayer for layer > 0 until the next frame', () => {
      const mockActiveEffect = createMockActiveEffect({
        currentTransitionIndex: 1,
        transitions: [createMockEffectTransition()],
        layer: 1,
      })
      const activeEffectsMap = new Map<number, Map<string, LightEffectState>>()
      const lightMap = new Map<string, LightEffectState>()
      lightMap.set('test-light-1', mockActiveEffect)
      activeEffectsMap.set(1, lightMap)
      layerManager.getActiveEffects.mockReturnValue(activeEffectsMap)
      layerManager.getActiveEffect.mockImplementation((l: number, lightId: string) =>
        activeEffectsMap.get(l)?.get(lightId),
      )
      layerManager.removeActiveEffect.mockImplementation((l: number, lightId: string) => {
        activeEffectsMap.get(l)?.delete(lightId)
      })
      layerManager.getQueuedEffect.mockReturnValue(undefined)

      transitionEngine.updateTransitions()

      expect(layerManager.removeActiveEffect).toHaveBeenCalledWith(1, 'test-light-1')
      expect(lightTransitionController.removeLightLayer).not.toHaveBeenCalled()

      transitionEngine.updateTransitions()

      expect(lightTransitionController.removeLightLayer).toHaveBeenCalledWith('test-light-1', 1)
      expect(layerManager.clearLayerStates).toHaveBeenCalledWith(1)
    })

    it('skips deferred removeLightLayer when a new effect is active on the next frame', () => {
      const layer = 5
      const completedEffect = createMockActiveEffect({
        lightId: 'l1',
        layer,
        currentTransitionIndex: 1,
        transitions: [createMockEffectTransition({ layer })],
      })
      const replacementEffect = createMockActiveEffect({
        name: 'replacement',
        lightId: 'l1',
        layer,
        currentTransitionIndex: 0,
        state: 'idle',
        transitions: [createMockEffectTransition({ layer })],
      })

      const activeEffectsMap = new Map<number, Map<string, LightEffectState>>()
      const layerMap = new Map<string, LightEffectState>()
      layerMap.set('l1', completedEffect)
      activeEffectsMap.set(layer, layerMap)

      let simulateReplacementOnNextFrame = false
      layerManager.getActiveEffects.mockReturnValue(activeEffectsMap)
      layerManager.getActiveEffect.mockImplementation((l: number, lightId: string) => {
        if (simulateReplacementOnNextFrame && l === layer && lightId === 'l1') {
          return replacementEffect
        }
        return activeEffectsMap.get(l)?.get(lightId)
      })
      layerManager.removeActiveEffect.mockImplementation((l: number, lightId: string) => {
        activeEffectsMap.get(l)?.delete(lightId)
      })
      layerManager.getQueuedEffect.mockReturnValue(undefined)

      const mockEffectManager = {
        onLightEffectComplete: jest.fn(),
        startNextEffectInQueue: jest.fn().mockReturnValue(false),
      } as unknown as IEffectManager

      transitionEngine.setEffectManager(mockEffectManager)
      transitionEngine.updateTransitions()

      expect(lightTransitionController.removeLightLayer).not.toHaveBeenCalled()

      simulateReplacementOnNextFrame = true
      transitionEngine.updateTransitions()

      expect(lightTransitionController.removeLightLayer).not.toHaveBeenCalled()
    })
  })

  describe('frame advancement', () => {
    it('delegates advanceFrame to updateTransitions', () => {
      const frame: FrameContext = { frameStartTime: 100, deltaTime: 5, frameIndex: 1 }
      const spy = jest.spyOn(transitionEngine as any, 'updateTransitions')
      transitionEngine.advanceFrame(frame)
      expect(spy).toHaveBeenCalledWith(frame)
    })
  })

  describe('transition state management', () => {
    it('should handle the waitingFor state correctly', () => {
      // Create a mock effect in waitingFor state
      const now = Date.now()
      const mockEffect = createMockActiveEffect({
        state: 'waitingFor',
        waitEndTime: now - 100, // Time already passed
      })

      const transition = mockEffect.transitions[0]

      // Call handleWaitingFor
      transitionEngine.handleWaitingFor(mockEffect, transition, now)

      // Verify state changed to transitioning
      expect(mockEffect.state).toBe('transitioning')
    })

    it('should handle the transitioning state correctly', () => {
      // Create a mock effect in transitioning state
      const mockEffect = createMockActiveEffect({
        state: 'transitioning',
        waitEndTime: 100, // Set a reasonable wait time
        lightId: 'test-light',
      })

      const transition = mockEffect.transitions[0]

      // Set up the layer manager to return our test effect
      const activeEffectsMap = new Map()
      activeEffectsMap.set(1, new Map([[mockEffect.lightId, mockEffect]]))
      layerManager.getActiveEffects.mockReturnValue(activeEffectsMap)

      // Advance time by calling updateTransitions with a frame context
      const frame: FrameContext = {
        frameStartTime: mockEffect.waitEndTime + 150,
        deltaTime: 150,
        frameIndex: 1,
      }
      transitionEngine.updateTransitions(frame)

      // Verify state changed to waitingUntil if untilTime > 0
      if (transition.waitUntilTime > 0) {
        expect(mockEffect.state).toBe('waitingUntil')
      } else {
        expect(mockEffect.state).toBe('idle')
        expect(mockEffect.currentTransitionIndex).toBe(1) // Advanced to next transition
      }

      // Verify last end state was updated (now single state instead of map)
      expect(mockEffect.lastEndState).toBeDefined()
    })

    it('should handle the waitingUntil state correctly', () => {
      // Create a mock effect in waitingUntil state
      const now = Date.now()
      const mockEffect = createMockActiveEffect({
        state: 'waitingUntil',
        waitEndTime: now - 100, // Time already passed
      })

      const transition = createMockEffectTransition({
        waitUntilTime: 500,
      })

      // Call handleWaitingUntil
      transitionEngine.handleWaitingUntil(mockEffect, transition, now)

      // Verify advanced to next transition
      expect(mockEffect.state).toBe('idle')
      expect(mockEffect.currentTransitionIndex).toBe(1)
    })
  })

  describe('delay with waitUntilConditionCount', () => {
    it('should set waitEndTime to currentTime + (count * waitUntilTime) when delay and count > 0', () => {
      const currentTime = 1000
      const transition = createMockEffectTransition({
        waitForCondition: 'none',
        waitUntilCondition: 'delay',
        waitUntilTime: 500,
        waitUntilConditionCount: 3,
        transform: { color: createMockRGBIP(), easing: 'linear', duration: 0 },
      })
      const mockEffect = createMockActiveEffect({
        state: 'idle',
        transitions: [transition],
        lastEndState: createMockRGBIP({ red: 0, green: 0, blue: 0, intensity: 0, opacity: 0 }),
      })

      transitionEngine.prepareTransition(mockEffect, transition, currentTime)
      // prepareTransition calls startTransition when waitForCondition is 'none'
      expect(mockEffect.state).toBe('waitingUntil')
      expect(mockEffect.waitEndTime).toBe(currentTime + 3 * 500) // 1000 + 1500 = 2500
    })

    it('should set waitEndTime to currentTime + 0 when delay and count is 0', () => {
      const currentTime = 1000
      const transition = createMockEffectTransition({
        waitForCondition: 'none',
        waitUntilCondition: 'delay',
        waitUntilTime: 500,
        waitUntilConditionCount: 0,
        transform: { color: createMockRGBIP(), easing: 'linear', duration: 0 },
      })
      const mockEffect = createMockActiveEffect({
        state: 'idle',
        transitions: [transition],
        lastEndState: createMockRGBIP({ red: 0, green: 0, blue: 0, intensity: 0, opacity: 0 }),
      })

      transitionEngine.prepareTransition(mockEffect, transition, currentTime)
      expect(mockEffect.state).toBe('waitingUntil')
      expect(mockEffect.waitEndTime).toBe(currentTime) // advance immediately
    })

    it('should set waitEndTime to currentTime + waitUntilTime when delay and count undefined', () => {
      const currentTime = 1000
      const transition = createMockEffectTransition({
        waitForCondition: 'none',
        waitUntilCondition: 'delay',
        waitUntilTime: 500,
        waitUntilConditionCount: undefined,
        transform: { color: createMockRGBIP(), easing: 'linear', duration: 0 },
      })
      const mockEffect = createMockActiveEffect({
        state: 'idle',
        transitions: [transition],
        lastEndState: createMockRGBIP({ red: 0, green: 0, blue: 0, intensity: 0, opacity: 0 }),
      })

      transitionEngine.prepareTransition(mockEffect, transition, currentTime)
      expect(mockEffect.state).toBe('waitingUntil')
      expect(mockEffect.waitEndTime).toBe(currentTime + 500) // treat as 1 step
    })
  })

  describe('getFinalState and clearFinalStates', () => {
    it('should get and clear final states for specific layers', () => {
      // Setup test data
      const mockColor = createMockRGBIP({ red: 255 })
      const lightId = 'test-light'
      const layer = 1

      // Mock the layerManager's getLightState method to return our test color
      layerManager.getLightState.mockReturnValue(mockColor)

      // Get the final state
      const finalState = transitionEngine.getFinalState(lightId, layer)

      // Verify the result matches our mock color
      expect(finalState).toEqual(mockColor)

      // Verify getLightState was called with correct parameters
      expect(layerManager.getLightState).toHaveBeenCalledWith(layer, lightId)

      // Clear the final states
      transitionEngine.clearFinalStates(layer)

      // Verify clearLayerStates was called with the layer
      expect(layerManager.clearLayerStates).toHaveBeenCalledWith(layer)
    })
  })
})
