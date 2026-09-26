/**
 * IPC tests for setupConsoleHandlers: enabling the console ties it to the page that asked for it,
 * and a fixture config change is checked before either stored config takes it.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { EventEmitter } from 'node:events'
import { LIGHT } from '../../../shared/ipcChannels'

const mockIpcMain = {
  handle: jest.fn() as jest.MockedFunction<(...args: unknown[]) => void>,
  on: jest.fn() as jest.MockedFunction<(...args: unknown[]) => void>,
}

jest.mock('electron', () => ({
  app: { getPath: jest.fn(() => '/tmp/photonics-test') },
  ipcMain: mockIpcMain,
}))

jest.mock('../../utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
  hasBrowserWindows: () => false,
  mainRuntimeBroadcaster: { emit: jest.fn() },
}))

import { setupConsoleHandlers } from '../../ipc/console-handlers'
import type { ControllerManager } from '../../controllers/ControllerManager'
import { lifecycleBlockedOn, restartGraph, stubbedManager } from '../controllers/lifecycleStub'
import { ConsoleModeController } from '../../controllers/ConsoleModeController'
import {
  rgbMovingHeadFixture,
  rgbMovingHeadLight,
} from '../../../photonics-dmx/tests/helpers/testFixtures'
import {
  ConfigStrobeType,
  type DmxFixture,
  type DmxRig,
  type FixtureConfig,
} from '../../../photonics-dmx/types'

function register(manager: ControllerManager): void {
  setupConsoleHandlers(mockIpcMain as never, manager)
}

function getHandler(channel: string): (e: unknown, d: unknown) => Promise<unknown> {
  const calls = mockIpcMain.handle.mock.calls
  for (let i = calls.length - 1; i >= 0; i--) {
    if (calls[i][0] === channel) {
      return calls[i][1] as (e: unknown, d: unknown) => Promise<unknown>
    }
  }
  throw new Error(`no handler for ${channel}`)
}

function stubManager(enableResult: { success: boolean; error?: string }): {
  manager: ControllerManager
  disableConsoleMode: jest.Mock
} {
  const disableConsoleMode = jest.fn().mockImplementation(() => Promise.resolve({ success: true }))
  const manager = {
    enableConsoleMode: jest.fn().mockImplementation(() => Promise.resolve(enableResult)),
    disableConsoleMode,
  } as unknown as ControllerManager
  return { manager, disableConsoleMode }
}

describe('setupConsoleHandlers', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('leaves console mode when the page that opened it goes away', async () => {
    const { manager, disableConsoleMode } = stubManager({ success: true })
    register(manager)
    const page = new EventEmitter()

    await getHandler(LIGHT.CONSOLE_ENABLE)({ sender: page }, { rigId: 'rig-1' })
    page.emit('destroyed')

    expect(disableConsoleMode).toHaveBeenCalledTimes(1)
  })

  it('does not follow a page whose console never opened', async () => {
    const { manager, disableConsoleMode } = stubManager({ success: false, error: 'Rig not found' })
    register(manager)
    const page = new EventEmitter()

    await getHandler(LIGHT.CONSOLE_ENABLE)({ sender: page }, { rigId: 'missing' })
    page.emit('destroyed')

    expect(disableConsoleMode).not.toHaveBeenCalled()
  })

  it('binds one set of listeners however often the same page enables the console', async () => {
    const { manager, disableConsoleMode } = stubManager({ success: true })
    register(manager)
    const page = new EventEmitter()
    const enable = getHandler(LIGHT.CONSOLE_ENABLE)

    await enable({ sender: page }, { rigId: 'rig-1' })
    await enable({ sender: page }, { rigId: 'rig-1' })

    expect(page.listenerCount('destroyed')).toBe(1)
    expect(disableConsoleMode).not.toHaveBeenCalled()
  })

  it('follows the page again when it reopens the console after a reload', async () => {
    const { manager, disableConsoleMode } = stubManager({ success: true })
    register(manager)
    const page = new EventEmitter()
    const enable = getHandler(LIGHT.CONSOLE_ENABLE)
    const reload = () =>
      page.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })

    await enable({ sender: page }, { rigId: 'rig-1' })
    reload()
    await enable({ sender: page }, { rigId: 'rig-1' })
    expect(page.listenerCount('destroyed')).toBe(1)
    expect(page.listenerCount('render-process-gone')).toBe(1)
    reload()

    expect(disableConsoleMode).toHaveBeenCalledTimes(2)
  })
})

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

function manualPublisher() {
  let manual = false
  return {
    isManual: () => manual,
    publisher: {
      setManualBuffer: () => {
        manual = true
      },
      clearManualBuffer: () => {
        manual = false
      },
    },
  }
}

async function enableWhilePageGoes(goAway: (page: EventEmitter) => void) {
  const pub = manualPublisher()
  let release!: () => void
  const barrier = new Promise<void>((r) => {
    release = r
  })
  const { manager } = stubbedManager({
    ownConsoleMode: true,
    graph: restartGraph(pub.publisher),
    lifecycle: lifecycleBlockedOn(barrier),
  })
  register(manager)

  const page = new EventEmitter()
  const answer = getHandler(LIGHT.CONSOLE_ENABLE)({ sender: page }, { rigId: 'rig-1' })
  await settle()
  goAway(page)
  release()
  const result = await answer
  await settle()
  return { result, manager, pub, page }
}

describe('console entry queued behind another lifecycle op', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('leaves the rig out of console mode when the page closes before the entry runs', async () => {
    const { result, manager, pub, page } = await enableWhilePageGoes((p) => p.emit('destroyed'))

    expect(result).toEqual({ success: false, error: expect.any(String) })
    expect(manager.getConsoleModeController().getConsoleRestore()).toBeNull()
    expect(manager.getLifecyclePhase()).toBe('running')
    expect(pub.isManual()).toBe(false)
    expect(page.listenerCount('destroyed')).toBe(0)
  })

  it('leaves the rig out of console mode when the page crashes before the entry runs', async () => {
    const { manager, pub } = await enableWhilePageGoes((p) => p.emit('render-process-gone'))

    expect(manager.getConsoleModeController().getConsoleRestore()).toBeNull()
    expect(pub.isManual()).toBe(false)
  })

  it('leaves the rig out of console mode when the page reloads before the entry runs', async () => {
    const { manager, pub } = await enableWhilePageGoes((p) =>
      p.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false }),
    )

    expect(manager.getConsoleModeController().getConsoleRestore()).toBeNull()
    expect(pub.isManual()).toBe(false)
  })

  it('opens console mode for a page that stays through the wait', async () => {
    const { result, manager, pub, page } = await enableWhilePageGoes((p) =>
      p.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true }),
    )

    expect(result).toEqual({ success: true })
    expect(manager.getLifecyclePhase()).toBe('consoleMode')
    expect(pub.isManual()).toBe(true)
    expect(page.listenerCount('destroyed')).toBe(1)
  })
})

/** A console whose rig and template store keeps what the fixture-config channel saves. */
function consoleWithStore(): {
  setConfig: (config: unknown) => Promise<unknown>
  lightConfig: () => FixtureConfig | undefined
  templateConfig: () => FixtureConfig | undefined
} {
  let rig: DmxRig = {
    id: 'rig-1',
    name: 'Main',
    active: true,
    config: {
      numLights: 1,
      lightLayout: { id: 'front', label: 'Front' },
      strobeType: ConfigStrobeType.None,
      frontLights: [rgbMovingHeadLight({ id: 'mh-1', fixtureId: 'tpl-mh' })],
      backLights: [],
      strobeLights: [],
    },
  }
  let template: DmxFixture = rgbMovingHeadFixture({ id: 'tpl-mh' })
  const store = {
    getDmxRig: (id: string) => (id === rig.id ? rig : undefined),
    getUserLights: () => [template],
    saveDmxRig: async (next: DmxRig) => {
      rig = next
    },
    updateUserLight: async (_id: string, change: (fixture: DmxFixture) => DmxFixture) => {
      template = change(template)
    },
  }
  const controller = new ConsoleModeController({
    getConfig: () => store as never,
    ensureInitialized: () => Promise.resolve(),
    getDmxPublisher: () => null,
    getListenerSnapshot: () => ({ yarg: false, rb3: false }),
    getIsAudioEnabled: () => false,
    getLifecyclePhase: () => 'running',
    pauseYarg: () => Promise.resolve(),
    pauseRb3: () => Promise.resolve(),
    pauseAudio: () => Promise.resolve(),
    restartControllers: () => Promise.resolve(),
  })
  setupConsoleHandlers(
    mockIpcMain as never,
    {
      getConsoleModeController: () => controller,
    } as never,
  )
  const handler = getHandler(LIGHT.CONSOLE_SET_FIXTURE_CONFIG)
  return {
    setConfig: (config) =>
      handler({}, { rigId: 'rig-1', lightId: 'mh-1', fixtureId: 'tpl-mh', config }),
    lightConfig: () => rig.config.frontLights[0].config,
    templateConfig: () => template.config,
  }
}

describe('console fixture config', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it.each([
    ['a word where a flag belongs', { invertPan: 'yes' }],
    ['a word where a number belongs', { panMin: 'abc' }],
    ['a key no fixture config has', { bogus: 1 }],
    ['a DMX limit below 0', { tiltMax: -999 }],
    ['a home beyond 100 percent', { panHome: 150 }],
  ])('refuses %s and keeps both stored configs', async (_case, config) => {
    const session = consoleWithStore()
    const light = session.lightConfig()
    const template = session.templateConfig()

    const result = await session.setConfig(config)

    expect(result).toMatchObject({ success: false })
    expect(session.lightConfig()).toEqual(light)
    expect(session.templateConfig()).toEqual(template)
  })

  it('saves a config within range to the rig light and its template', async () => {
    const session = consoleWithStore()

    const result = await session.setConfig({ panMin: 10, invertTilt: true })

    expect(result).toEqual({ success: true })
    expect(session.lightConfig()).toMatchObject({ panMin: 10, invertTilt: true })
    expect(session.templateConfig()).toMatchObject({ panMin: 10, invertTilt: true })
  })
})
