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

/** A rig chain on a fake sequencer, with that sequencer. */
function makeChain(rigId: string): { chain: RigChain; sequencer: FakeLightingController } {
  const sequencer = fakeLightingController()
  const chain = {
    rigId,
    isPrimary: rigId === 'primary',
    dmxLightManager: {} as DmxLightManager,
    sequencer,
    cueHandlers: { yarg: null, rb3: null },
    audioCueHandler: null,
    rb3MenuCueHandler: null,
  } as unknown as RigChain
  return { chain, sequencer }
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

interface AudioInternals {
  isAudioEnabled: boolean
  audioDataHandler: (() => void) | null
  audioProcessor: AudioCueProcessor | null
}

/** A controller over `chains` with audio running on a processor whose shutdown is `shutdown`. */
function enabledAudio(
  chains: RigChain[],
  shutdown: () => void,
): { controller: AudioController; internals: AudioInternals } {
  const controller = new AudioController(makeDeps(chains))
  const internals = controller as unknown as AudioInternals
  internals.isAudioEnabled = true
  internals.audioDataHandler = () => {}
  internals.audioProcessor = {
    setOnStrobeStateChange: jest.fn(),
    setOnGameModeCueChange: jest.fn(),
    setOnGameModeScheduleChange: jest.fn(),
    shutdown,
  } as unknown as AudioCueProcessor
  return { controller, internals }
}

describe('AudioController disableAudio ordering', () => {
  it('removes the frame listener and shuts the processor down before clearing every rig', async () => {
    const order: string[] = []
    const rigs = [makeChain('primary'), makeChain('second')]
    for (const { chain, sequencer } of rigs) {
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

    const { controller, internals } = enabledAudio(
      rigs.map((rig) => rig.chain),
      () => order.push('processorShutdown'),
    )

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

  it('clears every rig and turns audio off when the processor fails to stop, then throws', async () => {
    const rigs = [makeChain('primary'), makeChain('second')]
    const failure = new Error('cue failed to stop')
    const { controller, internals } = enabledAudio(
      rigs.map((rig) => rig.chain),
      () => {
        throw failure
      },
    )

    await expect(controller.disableAudio()).rejects.toThrow(failure)

    for (const { sequencer } of rigs) expect(sequencer.blackout).toHaveBeenCalledWith(0)
    expect(internals.audioProcessor).toBeNull()
    expect(internals.isAudioEnabled).toBe(false)
  })
})
