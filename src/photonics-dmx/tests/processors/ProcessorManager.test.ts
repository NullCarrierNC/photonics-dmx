/**
 * ProcessorManager tests: direct/cue mode selection, getCurrentMode, getProcessorStats, destroy.
 */
import { EventEmitter } from 'events'
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { ProcessorManager, DEFAULT_PROCESSOR_CONFIG } from '../../processors/ProcessorManager'
import { DmxLightManager } from '../../controllers/DmxLightManager'
import { ILightingController } from '../../controllers/sequencer/interfaces'
import { ChainFanout } from '../../controllers/ChainFanout'
import type { RigChain } from '../../controllers/RigChain'
import { createMockLightingConfig } from '../helpers/testFixtures'
import { fakeLightingController } from '../helpers/fakeLightingController'
import { normalizeRb3ProcessingMode } from '../../../services/configuration/configurationDefaults'

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
    mockSequencer = fakeLightingController()

    // Single-rig fanout for these tests — they exercise the manager's lifecycle, not the
    // multi-rig render path (that's covered by Rb3StageKitDirectProcessor.multiRig.test).
    chainFanout = new ChainFanout()
    chainFanout.setChains([
      {
        rigId: 'primary',
        isPrimary: true,
        dmxLightManager: mockLightManager,
        sequencer: mockSequencer,
        cueHandlers: {
          yarg: null,
          rb3: null,
        },
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
    expect(stats).toEqual({
      currentMode: 'direct',
      stageKitProcessorActive: false,
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
  })

  it('runs the mode a missing RB3 preference runs when built with none', () => {
    const unset = new ProcessorManager(chainFanout)
    expect(unset.getCurrentMode()).toBe(normalizeRb3ProcessingMode(undefined))
  })

  it('reports cue as the current mode when constructed in cue mode', () => {
    const cueManager = new ProcessorManager(chainFanout, { mode: 'cue' })
    expect(cueManager.getCurrentMode()).toBe('cue')
    expect(cueManager.isModeActive('cue')).toBe(true)
  })

  it('stats report the cue processor as active once cue mode is listening', () => {
    const cueManager = new ProcessorManager(chainFanout, { mode: 'cue' })
    expect(cueManager.getProcessorStats().stageKitProcessorActive).toBe(false)
    cueManager.setNetworkListener(new EventEmitter())
    expect(cueManager.getProcessorStats()).toEqual({
      currentMode: 'cue',
      stageKitProcessorActive: true,
      networkListenerActive: true,
    })
    cueManager.destroy()
  })
})
