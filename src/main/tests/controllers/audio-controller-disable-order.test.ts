/**
 * Disabling audio stops the incoming frames and the cues before it clears the rig, so the blackout
 * is the last word on the lights.
 */
import { describe, expect, it, jest } from '@jest/globals'

const mockIpcMain = {
  on: jest.fn(),
  removeListener: jest.fn(),
  handle: jest.fn(),
}

jest.mock('electron', () => ({
  ipcMain: mockIpcMain,
}))

import { AudioController, type AudioControllerDeps } from '../../controllers/AudioController'
import { ChainFanout } from '../../controllers/ChainFanout'
import { noopRuntimeBroadcaster } from '../../../photonics-dmx/runtime/broadcaster'
import {
  fakeLightingController,
  type FakeLightingController,
} from '../../../photonics-dmx/tests/helpers/fakeLightingController'
import type { RigChain } from '../../../photonics-dmx/controllers/RigChain'
import type { DmxLightManager } from '../../../photonics-dmx/controllers/DmxLightManager'
import type { ConfigurationManager } from '../../../services/configuration/ConfigurationManager'
import type { AudioCueProcessor } from '../../../photonics-dmx/processors/AudioCueProcessor'

function makeChain(rigId: string): RigChain {
  return {
    rigId,
    isPrimary: rigId === 'primary',
    dmxLightManager: {} as DmxLightManager,
    sequencer: fakeLightingController(),
    cueHandlers: { yarg: null, rb3: null },
    audioCueHandler: null,
    rb3MenuCueHandler: null,
  } as unknown as RigChain
}

function makeDeps(chains: RigChain[]): AudioControllerDeps {
  const chainFanout = new ChainFanout()
  chainFanout.setChains(chains)
  return {
    getDmxLightManager: () => chains[0].dmxLightManager,
    getEffectsController: () => chains[0].sequencer,
    getRigChains: () => chains,
    getChainFanout: () => chainFanout,
    config: {} as ConfigurationManager,
    sendToAllWindows: jest.fn(),
    runtimeBroadcaster: noopRuntimeBroadcaster(),
  } as unknown as AudioControllerDeps
}

describe('AudioController disableAudio ordering', () => {
  it('removes the frame listener and shuts the processor down before clearing every rig', async () => {
    const order: string[] = []
    const chains = [makeChain('primary'), makeChain('second')]
    for (const chain of chains) {
      const sequencer = chain.sequencer as unknown as FakeLightingController
      sequencer.removeAllEffects.mockImplementation(() => {
        order.push(`removeAllEffects:${chain.rigId}`)
      })
      sequencer.blackout.mockImplementation(() => {
        order.push(`blackout:${chain.rigId}`)
        return Promise.resolve()
      })
    }
    mockIpcMain.removeListener.mockImplementation(() => {
      order.push('removeFrameListener')
    })

    const deps = makeDeps(chains)
    const controller = new AudioController(deps)
    const internals = controller as unknown as {
      isAudioEnabled: boolean
      audioDataHandler: (() => void) | null
      audioProcessor: AudioCueProcessor | null
    }
    internals.isAudioEnabled = true
    internals.audioDataHandler = () => {}
    internals.audioProcessor = {
      setOnStrobeStateChange: jest.fn(),
      setOnGameModeCueChange: jest.fn(),
      setOnGameModeScheduleChange: jest.fn(),
      shutdown: () => order.push('processorShutdown'),
    } as unknown as AudioCueProcessor

    await controller.disableAudio()

    expect(order).toEqual([
      'removeFrameListener',
      'processorShutdown',
      'removeAllEffects:primary',
      'blackout:primary',
      'removeAllEffects:second',
      'blackout:second',
    ])
    expect(internals.audioProcessor).toBeNull()
    expect(internals.audioDataHandler).toBeNull()
    expect(internals.isAudioEnabled).toBe(false)
  })
})
