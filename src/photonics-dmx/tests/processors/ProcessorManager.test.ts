/**
 * ProcessorManager tests: mode switching, getCurrentMode, getProcessorStats, destroy.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ProcessorManager, ProcessingMode, DEFAULT_PROCESSOR_CONFIG } from '../../processors/ProcessorManager';
import { DmxLightManager } from '../../controllers/DmxLightManager';
import { ILightingController } from '../../controllers/sequencer/interfaces';
import { createMockLightingConfig } from '../helpers/testFixtures';
import { EventEmitter } from 'events';
import type { AbstractCueHandler } from '../../cueHandlers/AbstractCueHandler';

describe('ProcessorManager', () => {
  let mockLightManager: DmxLightManager;
  let mockSequencer: ILightingController;
  let manager: ProcessorManager;

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const config = createMockLightingConfig();
    mockLightManager = new DmxLightManager(config);
    mockSequencer = {
      addEffect: jest.fn(),
      addEffectWithCallback: jest.fn(),
      removeEffectCallback: jest.fn(),
      setEffect: jest.fn(),
      removeEffect: jest.fn(),
      removeAllEffects: jest.fn(),
      removeEffectByLayer: jest.fn(),
      addEffectUnblockedName: jest.fn(),
      setEffectUnblockedName: jest.fn(),
      getActiveEffectsForLight: jest.fn(),
      isLayerFreeForLight: jest.fn(),
      setState: jest.fn(),
      onBeat: jest.fn(),
      onMeasure: jest.fn(),
      onKeyframe: jest.fn(),
      onDrumNote: jest.fn(),
      onGuitarNote: jest.fn(),
      onBassNote: jest.fn(),
      onKeysNote: jest.fn(),
      blackout: jest.fn(),
      cancelBlackout: jest.fn(),
      enableDebug: jest.fn(),
      debugLightLayers: jest.fn(),
      shutdown: jest.fn()
    } as unknown as ILightingController;

    manager = new ProcessorManager(mockLightManager, mockSequencer, { mode: 'direct' });
  });

  it('constructs with default config when mode is direct', () => {
    expect(manager.getCurrentMode()).toBe('direct');
    const stats = manager.getProcessorStats();
    expect(stats.currentMode).toBe('direct');
    expect(stats.networkListenerActive).toBe(false);
  });

  it('switchMode toggles from direct to cueBased when cue handler is set', () => {
    const mockCueHandler = { handleCue: jest.fn() } as unknown as AbstractCueHandler;
    manager.setCueHandler(mockCueHandler);
    manager.setNetworkListener(new EventEmitter());

    manager.switchMode('cueBased');
    expect(manager.getCurrentMode()).toBe('cueBased');

    manager.switchMode('direct');
    expect(manager.getCurrentMode()).toBe('direct');
  });

  it('getCurrentMode returns initial mode', () => {
    expect(manager.getCurrentMode()).toBe('direct');
  });

  it('getProcessorStats returns expected shape', () => {
    const stats = manager.getProcessorStats();
    expect(stats).toMatchObject({
      currentMode: 'direct',
      stageKitProcessorActive: false,
      traditionalProcessorActive: false,
      networkListenerActive: false
    });
  });

  it('getConfig returns config with default values', () => {
    const config = manager.getConfig();
    expect(config.mode).toBe('direct');
    expect(config.debug).toBe(DEFAULT_PROCESSOR_CONFIG.debug);
  });

  it('isModeActive returns true for current mode', () => {
    expect(manager.isModeActive('direct')).toBe(true);
    expect(manager.isModeActive('cueBased')).toBe(false);
  });

  it('destroy cleans up and getProcessorStats reflects no active processors', () => {
    manager.destroy();
    const stats = manager.getProcessorStats();
    expect(stats.stageKitProcessorActive).toBe(false);
    expect(stats.traditionalProcessorActive).toBe(false);
  });

  it('throws on invalid mode in constructor', () => {
    expect(() => {
      new ProcessorManager(mockLightManager, mockSequencer, { mode: 'invalid' as ProcessingMode });
    }).toThrow(/Invalid mode/);
  });
});
