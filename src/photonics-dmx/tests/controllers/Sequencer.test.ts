/*
 * Sequencer Test Suite
 * 
 * This suite tests the functionality of the Sequencer class, which serves
 * as a facade for the lighting system components.
 * 
 * Tests verify that the Sequencer correctly:
 * - Delegates to appropriate controllers
 * - Manages effects through the proper channels
 * - Handles events and system operations as expected
 */

import '@jest/globals';
import { Sequencer } from '../../controllers/sequencer/Sequencer';
import { LightTransitionController } from '../../controllers/sequencer/LightTransitionController';
import { Effect, RGBIP, TrackedLight } from '../../types';
import { createMockTrackedLight, createMockRGBIP } from '../helpers/testFixtures';
import { afterEach, beforeEach, describe, jest, it, expect } from '@jest/globals';

// Mock all dependencies that Sequencer relies on
jest.mock('../../controllers/sequencer/LightTransitionController');
jest.mock('../../controllers/sequencer/EffectTransformer');
jest.mock('../../controllers/sequencer/TimeoutManager');
jest.mock('../../controllers/sequencer/LayerManager');
jest.mock('../../controllers/sequencer/TransitionEngine');
jest.mock('../../controllers/sequencer/SystemEffectsController');
jest.mock('../../controllers/sequencer/EffectManager');
jest.mock('../../controllers/sequencer/SongEventHandler');
jest.mock('../../controllers/sequencer/DebugMonitor');

describe('Sequencer', () => {
  let lightTransitionController: jest.Mocked<LightTransitionController>;
  let sequencer: Sequencer;

  beforeEach(() => {
    jest.useFakeTimers();

    // Create mock for LightTransitionController
    lightTransitionController = {
      setTransition: jest.fn(),
      removeTransitionsByLayer: jest.fn(),
      removeLightLayer: jest.fn(),
      getFinalLightState: jest.fn()
    } as unknown as jest.Mocked<LightTransitionController>;

    // Create Sequencer with mocked LightTransitionController
    sequencer = new Sequencer(lightTransitionController);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('addEffect', () => {
    it('should delegate to EffectManager.addEffect', () => {
      // Setup spy on internal EffectManager
      const addEffectSpy = jest.spyOn((sequencer as any).effectManager, 'addEffect');
      
      // Create test data
      const effectName = 'test-effect';
      const effect: Effect = {
        id: 'test-id',
        description: 'Test effect',
        transitions: [
          {
            lights: [createMockTrackedLight()],
            layer: 1,
            waitFor: 'none',
            forTime: 0,
            transform: {
              color: createMockRGBIP(),
              easing: 'linear',
              duration: 1000
            },
            waitUntil: 'none',
            untilTime: 0
          }
        ]
      };
      const offset = 500;
      const isPersistent = true;

      // Call the method
      sequencer.addEffect(effectName, effect, offset, isPersistent);

      // Verify the delegation
      expect(addEffectSpy).toHaveBeenCalledWith(effectName, effect, offset, isPersistent);
    });
  });

  describe('setEffect', () => {
    it('should delegate to EffectManager.setEffect', async () => {
      // Setup spy on internal EffectManager
      const setEffectSpy = jest.spyOn((sequencer as any).effectManager, 'setEffect').mockResolvedValue(undefined);
      
      // Create test data
      const effectName = 'test-effect';
      const effect: Effect = {
        id: 'test-id',
        description: 'Test effect',
        transitions: []
      };
      const offset = 500;
      const isPersistent = true;

      // Call the method
      await sequencer.setEffect(effectName, effect, offset, isPersistent);

      // Verify the delegation
      expect(setEffectSpy).toHaveBeenCalledWith(effectName, effect, offset, isPersistent);
    });
  });

  describe('setState', () => {
    it('should delegate to EffectManager.setState', () => {
      // Setup spy on internal EffectManager
      const setStateSpy = jest.spyOn((sequencer as any).effectManager, 'setState');
      
      // Create test data
      const lights: TrackedLight[] = [createMockTrackedLight()];
      const color: RGBIP = createMockRGBIP();
      const time = 1000;

      // Call the method
      sequencer.setState(lights, color, time);

      // Verify the delegation
      expect(setStateSpy).toHaveBeenCalledWith(lights, color, time);
    });
  });

  describe('blackout', () => {
    it('should delegate to SystemEffectsController.blackout', async () => {
      // Setup spy on internal SystemEffectsController
      const blackoutSpy = jest.spyOn((sequencer as any).systemEffectsController, 'blackout').mockResolvedValue(undefined);
      
      // Create test data
      const duration = 1000;

      // Call the method
      await sequencer.blackout(duration);

      // Verify the delegation
      expect(blackoutSpy).toHaveBeenCalledWith(duration);
    });
  });

  describe('cancelBlackout', () => {
    it('should delegate to SystemEffectsController.cancelBlackout', () => {
      // Setup spy on internal SystemEffectsController
      const cancelBlackoutSpy = jest.spyOn((sequencer as any).systemEffectsController, 'cancelBlackout');
      
      // Call the method
      sequencer.cancelBlackout();

      // Verify the delegation
      expect(cancelBlackoutSpy).toHaveBeenCalled();
    });
  });

  describe('onBeat', () => {
    it('should delegate to SongEventHandler.onBeat', () => {
      // Setup spy on internal SongEventHandler
      const onBeatSpy = jest.spyOn((sequencer as any).eventHandler, 'onBeat');
      
      // Call the method
      sequencer.onBeat();

      // Verify the delegation
      expect(onBeatSpy).toHaveBeenCalled();
    });
  });

  describe('onMeasure', () => {
    it('should delegate to SongEventHandler.onMeasure', () => {
      // Setup spy on internal SongEventHandler
      const onMeasureSpy = jest.spyOn((sequencer as any).eventHandler, 'onMeasure');
      
      // Call the method
      sequencer.onMeasure();

      // Verify the delegation
      expect(onMeasureSpy).toHaveBeenCalled();
    });
  });

  describe('onKeyframe', () => {
    it('should delegate to SongEventHandler.onKeyframe', () => {
      // Setup spy on internal SongEventHandler
      const onKeyframeSpy = jest.spyOn((sequencer as any).eventHandler, 'onKeyframe');
      
      // Call the method
      sequencer.onKeyframe();

      // Verify the delegation
      expect(onKeyframeSpy).toHaveBeenCalled();
    });
  });

  describe('shutdown', () => {
    it('should stop the animation loop and perform cleanup', () => {
      // Setup spy on TransitionEngine
      const stopAnimationLoopSpy = jest.spyOn((sequencer as any).transitionEngine, 'stopAnimationLoop');
      
      // Call the method
      sequencer.shutdown();

      // Verify transition engine was stopped
      expect(stopAnimationLoopSpy).toHaveBeenCalled();
    });
  });
}); 