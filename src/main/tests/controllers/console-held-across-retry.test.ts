import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'

jest.mock('electron', () => ({
  app: { getPath: jest.fn(() => '/tmp/photonics-test') },
  ipcMain: { handle: jest.fn() },
}))

jest.mock('../../utils/copyDefaultData', () => ({ copyDefaultData: jest.fn(async () => {}) }))

jest.mock('../../utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
  hasBrowserWindows: () => false,
  mainRuntimeBroadcaster: { emit: jest.fn() },
}))

jest.mock('../../controllers/cueDomainBindings', () => ({
  CUE_DOMAIN_BINDINGS: [{ domain: 'yarg' }],
  applyAllEnabledGroupsFromConfig: jest.fn(async () => {}),
}))

import { ipcMain } from 'electron'
import { ControllerManager } from '../../controllers/ControllerManager'
import { ControllerLifecycle } from '../../controllers/ControllerLifecycle'
import { setupLifecycleHandlers } from '../../ipc/lifecycle-handlers'
import { LIFECYCLE, RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import type { LifecyclePhase } from '../../../shared/ipcTypes'
import type { DmxRig } from '../../../photonics-dmx/types'
import { createDefaultCueDomainPrefs } from '../../../services/configuration/cueDomainTypes'
import {
  createMockLightingConfig,
  rgbLight,
} from '../../../photonics-dmx/tests/helpers/testFixtures'
import { sendToAllWindows } from '../../utils/windowUtils'
import { listenerStub, senderLifecycleStub, stubConfig } from './lifecycleStub'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Long enough for the clock and the publisher to put several frames on the wire. */
const FRAMES_MS = 120

describe('a Retry after a restart fails with the DMX console open', () => {
  let manager: ControllerManager
  let universe: Record<number, number>
  let phases: LifecyclePhase[]
  let failRebuild: boolean
  let retry: () => Promise<unknown>

  const showRedCue = (): void => {
    const lights = manager.getDmxLightManager()!.getLights(['front'], ['all'])
    manager
      .getLightingController()!
      .setState(
        lights,
        { red: 255, green: 0, blue: 0, intensity: 255, opacity: 1, blendMode: 'replace' },
        0,
      )
  }

  beforeEach(async () => {
    const light = rgbLight({
      id: 'front-1',
      group: 'front',
      position: 1,
      channels: { red: 1, green: 2, blue: 3, masterDimmer: 4 } as never,
    })
    const rigConfig = createMockLightingConfig({
      numLights: 1,
      frontLights: [light],
      backLights: [],
      strobeLights: [],
    })
    const rig = { id: 'A', name: 'A', active: true, config: rigConfig } as DmxRig
    const config = Object.assign(
      stubConfig({
        clockRate: 10,
        cueDomains: { yargMotion: createDefaultCueDomainPrefs('yargMotion') },
      }),
      { getActiveRigs: () => [rig], getDmxRig: () => rig },
    )

    universe = {}
    const wire = {
      getEnabledWireSenders: () => ['artnet'],
      isIpcEnabled: () => false,
      sendIpc: () => {},
      send: (_wireId: string, buffer: Record<number, number>) => {
        for (const [channel, value] of Object.entries(buffer)) universe[Number(channel)] = value
        return Promise.resolve(true)
      },
    }
    const senders = senderLifecycleStub()
    senders.getSenderManager.mockReturnValue(wire)

    failRebuild = false
    const registryInit = {
      initializeCueRegistry: jest.fn(async () => {
        if (failRebuild) throw new Error('cue registry unreadable')
      }),
      initializeEffectLoader: jest.fn(async () => {}),
      initializeNodeCueLoader: jest.fn(async () => {}),
    }

    phases = []
    const lifecycle = new ControllerLifecycle((phase) => {
      phases.push(phase)
    })
    manager = new ControllerManager({
      config,
      lifecycle,
      collaborators: {
        registryInit,
        senderLifecycle: senders,
        listenerLifecycle: listenerStub(),
      } as never,
    })

    jest.mocked(ipcMain.handle).mockClear()
    setupLifecycleHandlers(ipcMain, manager)
    const [, onRetry] = jest
      .mocked(ipcMain.handle)
      .mock.calls.find(([channel]) => channel === LIFECYCLE.RETRY_INIT)!
    retry = async () => onRetry({} as never)

    await manager.init()
    expect(await manager.enableConsoleMode('A')).toEqual({ success: true })
    manager.getConsoleModeController().sendConsoleDmx({ 1: 200, 4: 255 })
    await sleep(FRAMES_MS)
    expect(universe[1]).toBe(200)

    failRebuild = true
    await expect(manager.restartControllers()).rejects.toThrow('cue registry unreadable')
    expect(manager.getLifecyclePhase()).toBe('failed')
    expect(manager.getIsInitialized()).toBe(false)
    failRebuild = false
  })

  afterEach(async () => {
    await manager.shutdown()
  })

  it('comes back in console mode with the console still holding the wire', async () => {
    expect(await retry()).toEqual({ success: true })

    expect(manager.getLifecyclePhase()).toBe('consoleMode')
    expect(phases.at(-1)).toBe('consoleMode')
    expect(manager.getConsoleModeController().getConsoleRestore()).not.toBeNull()
    expect(sendToAllWindows).not.toHaveBeenCalledWith(
      RENDERER_RECEIVE.CONSOLE_LEFT,
      expect.anything(),
    )
  })

  it('keeps cue frames off the wire and puts the console page frames on it', async () => {
    await retry()

    showRedCue()
    await sleep(FRAMES_MS)
    expect(universe[1]).toBe(0)

    manager.getConsoleModeController().sendConsoleDmx({ 1: 120, 4: 255 })
    await sleep(FRAMES_MS)
    expect(universe[1]).toBe(120)
  })

  it('runs cues on the wire once the console page leaves', async () => {
    await retry()

    expect(await manager.disableConsoleMode()).toEqual({ success: true })
    showRedCue()
    await sleep(FRAMES_MS)

    expect(manager.getLifecyclePhase()).toBe('running')
    expect(universe[1]).toBe(255)
  })
})
