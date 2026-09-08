import { LightTransitionController } from '../../controllers/sequencer/LightTransitionController'
import { createMockRGBIP } from '../helpers/testFixtures'
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { LightStateManager } from '../../controllers/sequencer/LightStateManager'

describe('LightTransitionController', () => {
  let lightTransitionController: LightTransitionController

  beforeEach(() => {
    lightTransitionController = new LightTransitionController(new LightStateManager())
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('orphaned-transition reaper', () => {
    it('does not reap a long fade before duration * 1.5', () => {
      let mockNow = 1000
      jest.spyOn(performance, 'now').mockImplementation(() => mockNow)

      // startTime is stamped from performance.now() at 1000.
      lightTransitionController.setTransition(
        'l',
        1,
        createMockRGBIP({ red: 0 }),
        createMockRGBIP({ red: 255 }),
        8000,
        'linear',
      )
      expect(lightTransitionController.getAllLightIds()).toContain('l')

      // Age 6000ms: past the absolute floor, but under 8000 * 1.5 = 12000.
      mockNow = 1000 + 6000
      lightTransitionController.advanceFrame({
        frameStartTime: mockNow,
        deltaTime: 16,
        frameIndex: 1,
      })
      expect(lightTransitionController.getAllLightIds()).toContain('l')

      // Age 13000ms: past duration * 1.5, so now genuinely orphaned and reaped.
      mockNow = 1000 + 13000
      lightTransitionController.advanceFrame({
        frameStartTime: mockNow,
        deltaTime: 16,
        frameIndex: 2,
      })
      expect(lightTransitionController.getAllLightIds()).not.toContain('l')
    })
  })

  describe('setTransition', () => {
    it('should add a new transition', () => {
      const lightId = 'test-light'
      const layer = 1
      const startState = createMockRGBIP({ red: 0, green: 0, blue: 0 })
      const endState = createMockRGBIP({ red: 255, green: 255, blue: 255 })

      lightTransitionController.setTransition(lightId, layer, startState, endState, 1000, 'linear')

      const result = lightTransitionController.getLightState(lightId, layer)
      expect(result).toEqual(startState) // Initially, should be the start state
    })

    it('should update the transition if one already exists for the same light and layer', () => {
      const lightId = 'test-light'
      const layer = 1
      const startState1 = createMockRGBIP({ red: 0, green: 0, blue: 0 })
      const endState1 = createMockRGBIP({ red: 255, green: 0, blue: 0 })
      const startState2 = createMockRGBIP({ red: 255, green: 0, blue: 0 })
      const endState2 = createMockRGBIP({ red: 0, green: 255, blue: 0 })

      lightTransitionController.setTransition(
        lightId,
        layer,
        startState1,
        endState1,
        1000,
        'linear',
      )
      lightTransitionController.setTransition(
        lightId,
        layer,
        startState2,
        endState2,
        1000,
        'linear',
      )

      const result = lightTransitionController.getLightState(lightId, layer)
      expect(result).toEqual(startState2)
    })

    it('starts from the layer state already held when no start state is given', () => {
      const lightId = 'test-light'
      const layer = 1
      const held = createMockRGBIP({ red: 90, green: 30 })

      lightTransitionController.setGeneratorLayerState(lightId, layer, held)
      lightTransitionController.setTransition(
        lightId,
        layer,
        undefined,
        createMockRGBIP({ red: 255 }),
        1000,
        'linear',
      )

      expect(lightTransitionController.getLightState(lightId, layer)).toEqual(held)
    })

    it('prefers an initial state override over the given start state', () => {
      const lightId = 'test-light'
      const layer = 1
      const override = createMockRGBIP({ blue: 200 })

      lightTransitionController.setTransition(
        lightId,
        layer,
        createMockRGBIP({ red: 10 }),
        createMockRGBIP({ red: 255 }),
        1000,
        'linear',
        override,
      )

      expect(lightTransitionController.getLightState(lightId, layer)).toEqual(override)
    })

    it('starts from black when nothing supplies a start state', () => {
      lightTransitionController.setTransition(
        'test-light',
        1,
        undefined,
        createMockRGBIP({ red: 255 }),
        1000,
        'linear',
      )

      expect(lightTransitionController.getLightState('test-light', 1)).toEqual({
        red: 0,
        green: 0,
        blue: 0,
        intensity: 0,
        opacity: 0.0,
        blendMode: 'replace',
      })
    })
  })

  describe('getLightState', () => {
    it('should return the current state of a light if transitions exist', () => {
      const mockState = createMockRGBIP({ red: 100, green: 150, blue: 200 })

      lightTransitionController.setTransition('test-light', 1, mockState, mockState, 0, 'linear')

      expect(lightTransitionController.getLightState('test-light', 1)).toEqual(mockState)
    })

    it('should return a transparent color for a light with no transitions', () => {
      expect(lightTransitionController.getLightState('nonexistent-light', 1)).toEqual({
        red: 0,
        green: 0,
        blue: 0,
        intensity: 0,
        opacity: 0.0,
        blendMode: 'replace',
      })
    })

    it('returns a transparent color for a layer the light does not hold', () => {
      lightTransitionController.setGeneratorLayerState('test-light', 1, createMockRGBIP())

      expect(lightTransitionController.getLightState('test-light', 2).opacity).toBe(0.0)
    })
  })

  describe('removeTransitionsByLayer', () => {
    it('should remove all transitions for a specific layer', () => {
      const startState = createMockRGBIP({ red: 0, green: 0, blue: 0 })
      const endState = createMockRGBIP({ red: 255, green: 255, blue: 255 })

      lightTransitionController.setTransition('light-1', 1, startState, endState, 1000, 'linear')
      lightTransitionController.setTransition('light-2', 1, startState, endState, 1000, 'linear')
      lightTransitionController.setTransition('light-1', 2, startState, endState, 1000, 'linear')

      lightTransitionController.removeTransitionsByLayer(1)

      expect(lightTransitionController.getLightState('light-1', 1).opacity).toBe(0.0)
      expect(lightTransitionController.getLightState('light-2', 1).opacity).toBe(0.0)
      expect(lightTransitionController.getLightState('light-1', 2)).toEqual(startState)
    })
  })

  describe('shutdown', () => {
    it('drops every transition it holds', () => {
      lightTransitionController.setTransition(
        'l',
        1,
        createMockRGBIP(),
        createMockRGBIP({ red: 255 }),
        1000,
        'linear',
      )

      lightTransitionController.shutdown()

      expect(lightTransitionController.getAllLightIds()).toEqual([])
      expect(lightTransitionController.getLightState('l', 1).opacity).toBe(0.0)
    })
  })
})
