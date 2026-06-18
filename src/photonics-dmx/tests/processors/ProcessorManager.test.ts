/**
 * ProcessorManager tests: direct mode lifecycle, getCurrentMode, getProcessorStats, destroy.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import {
  ProcessorManager,
  ProcessingMode,
  DEFAULT_PROCESSOR_CONFIG,
} from '../../processors/ProcessorManager'
import { DmxLightManager } from '../../controllers/DmxLightManager'
import { ILightingController } from '../../controllers/sequencer/interfaces'
import { ChainFanout } from '../../controllers/ChainFanout'
import type { RigChain } from '../../controllers/RigChain'
import { createMockLightingConfig } from '../helpers/testFixtures'

describe('ProcessorManager', () => {
  let mockLightManager: DmxLightManager
  let mockSequencer: ILightingController
  let manager: ProcessorManager
  let chainFanout: ChainFanout

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})

    const config = createMockLightingConfig()
    mockLightManager = new DmxLightManager(config)
    mockSequencer = {
      addEffect: jest.fn(),
      setEffect: jest.fn(),
      addEffectWithCallback: jest.fn(),
      setEffectWithCallback: jest.fn(),
      addEffectUnblockedNameWithCallback: jest.fn(),
      setEffectUnblockedNameWithCallback: jest.fn(),
      removeEffectCallback: jest.fn(),
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
      shutdown: jest.fn(),
    } as unknown as ILightingController

    // Single-rig fanout for these tests — they exercise the manager's lifecycle, not the
    // multi-rig render path (that's covered by Rb3StageKitDirectProcessor.multiRig.test).
    chainFanout = new ChainFanout()
    chainFanout.setChains([
      {
        rigId: 'primary',
        isPrimary: true,
        dmxLightManager: mockLightManager,
        sequencer: mockSequencer,
        yargCueHandler: null,
        audioCueHandler: null,
        rb3MenuCueHandler: null,
      } as unknown as RigChain,
    ])

    manager = new ProcessorManager(chainFanout, { mode: 'direct' })
  })

  it('constructs with default config when mode is direct', () => {
    expect(manager.getCurrentMode()).toBe('direct')
    const stats = manager.getProcessorStats()
    expect(stats.currentMode).toBe('direct')
    expect(stats.networkListenerActive).toBe(false)
  })

  it('getCurrentMode returns initial mode', () => {
    expect(manager.getCurrentMode()).toBe('direct')
  })

  it('getProcessorStats returns expected shape', () => {
    const stats = manager.getProcessorStats()
    expect(stats).toMatchObject({
      currentMode: 'direct',
      stageKitProcessorActive: false,
      traditionalProcessorActive: false,
      networkListenerActive: false,
    })
  })

  it('getConfig returns config with default values', () => {
    const config = manager.getConfig()
    expect(config.mode).toBe('direct')
    expect(config.debug).toBe(DEFAULT_PROCESSOR_CONFIG.debug)
  })

  it('isModeActive returns true for current mode', () => {
    expect(manager.isModeActive('direct')).toBe(true)
  })

  it('destroy cleans up and getProcessorStats reflects no active processors', () => {
    manager.destroy()
    const stats = manager.getProcessorStats()
    expect(stats.stageKitProcessorActive).toBe(false)
    expect(stats.traditionalProcessorActive).toBe(false)
  })

  it('throws on invalid mode in constructor', () => {
    expect(() => {
      new ProcessorManager(chainFanout, { mode: 'invalid' as ProcessingMode })
    }).toThrow(/Invalid mode/)
  })
})
