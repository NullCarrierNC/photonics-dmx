import { afterEach, describe, expect, it, jest } from '@jest/globals'

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
import { fakeLightingController } from '../../../photonics-dmx/tests/helpers/fakeLightingController'
import type { RigChain } from '../../../photonics-dmx/controllers/RigChain'
import type { DmxLightManager } from '../../../photonics-dmx/controllers/DmxLightManager'
import type { ConfigurationManager } from '../../../services/configuration/ConfigurationManager'
import { DEFAULT_AUDIO_CONFIG } from '../../../photonics-dmx/listeners/Audio/AudioConfig'
import { createDefaultCueDomains } from '../../../services/configuration/cueDomainTypes'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'

function makeController(setPreference: () => Promise<void>): {
  controller: AudioController
  sendToAllWindows: jest.Mock
} {
  const chains = [
    {
      rigId: 'primary',
      isPrimary: true,
      dmxLightManager: {} as DmxLightManager,
      sequencer: fakeLightingController(),
      cueHandlers: { yarg: null, rb3: null },
      audioCueHandler: null,
      rb3MenuCueHandler: null,
    } as unknown as RigChain,
  ]
  const chainFanout = new ChainFanout()
  chainFanout.setChains(chains)
  const prefs: Record<string, unknown> = {
    motionEnabled: false,
    cueDomains: createDefaultCueDomains(),
  }
  const config = {
    getAudioConfig: () => DEFAULT_AUDIO_CONFIG,
    getAudioGameModeConfig: () => ({ enabled: false, cueDurationMin: 5, cueDurationMax: 20 }),
    getPreference: (key: string) => prefs[key],
    setPreference,
  } as unknown as ConfigurationManager
  const sendToAllWindows = jest.fn()
  const deps = {
    getDmxLightManager: () => chains[0].dmxLightManager,
    getEffectsController: () => chains[0].sequencer,
    getRigChains: () => chains,
    getChainFanout: () => chainFanout,
    config,
    sendToAllWindows,
    runtimeBroadcaster: noopRuntimeBroadcaster(),
  } as unknown as AudioControllerDeps
  return { controller: new AudioController(deps), sendToAllWindows }
}

describe('AudioController enable and disable', () => {
  let controller: AudioController | null = null

  afterEach(async () => {
    await controller?.disableAudio()
    controller = null
    jest.clearAllMocks()
  })

  it('turns audio off when the disable arrives while an enable is still under way', async () => {
    let storePreference!: () => void
    const made = makeController(
      () =>
        new Promise<void>((resolve) => {
          storePreference = resolve
        }),
    )
    controller = made.controller

    const enabling = controller.enableAudioInternal()
    const disabling = controller.disableAudio()
    await Promise.resolve()
    storePreference()
    await Promise.all([enabling, disabling])

    expect(controller.getIsAudioEnabled()).toBe(false)
    expect(made.sendToAllWindows).toHaveBeenLastCalledWith(RENDERER_RECEIVE.AUDIO_ENABLED_CHANGED, {
      enabled: false,
    })
  })

  it('tells every window when audio starts and when it stops', async () => {
    const made = makeController(() => Promise.resolve())
    controller = made.controller
    const announced = () =>
      made.sendToAllWindows.mock.calls
        .filter(([channel]) => channel === RENDERER_RECEIVE.AUDIO_ENABLED_CHANGED)
        .map(([, payload]) => payload)

    await controller.enableAudioInternal()
    await controller.enableAudioInternal()
    await controller.disableAudio()

    expect(announced()).toEqual([{ enabled: true }, { enabled: false }])
  })

  it('keeps audio running when the active cue type cannot be stored', async () => {
    controller = makeController(() => Promise.reject(new Error('read only'))).controller

    await controller.enableAudioInternal()

    expect(controller.getIsAudioEnabled()).toBe(true)
  })

  it('leaves no frame listener or processor behind when an enable fails', async () => {
    const made = makeController(() => Promise.resolve())
    controller = made.controller
    made.sendToAllWindows.mockImplementation((channel: unknown) => {
      if (channel === RENDERER_RECEIVE.AUDIO_ENABLE) throw new Error('window gone')
    })

    await expect(controller.enableAudioInternal()).rejects.toThrow('window gone')

    expect(controller.getIsAudioEnabled()).toBe(false)
    expect(mockIpcMain.removeListener).toHaveBeenCalled()
    expect((controller as unknown as { audioProcessor: unknown }).audioProcessor).toBeNull()
  })
})
