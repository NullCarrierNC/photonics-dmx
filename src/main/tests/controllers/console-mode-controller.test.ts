import { describe, expect, it, jest } from '@jest/globals'
import {
  ConsoleModeController,
  type ConsoleModeControllerDeps,
} from '../../controllers/ConsoleModeController'

function baseDeps(
  overrides: Partial<ConsoleModeControllerDeps> & Pick<ConsoleModeControllerDeps, 'getConfig'>,
): ConsoleModeControllerDeps {
  return {
    ensureInitialized: () => Promise.resolve(),
    getDmxPublisher: () => null,
    getListenerSnapshot: () => ({ yarg: false, rb3: false }),
    getIsAudioEnabled: () => false,
    getLifecyclePhase: () => 'consoleMode',
    pauseYarg: () => Promise.resolve(),
    pauseRb3: () => Promise.resolve(),
    pauseAudio: () => Promise.resolve(),
    restartControllers: () => Promise.resolve(),
    ...overrides,
  }
}

describe('ConsoleModeController', () => {
  it('stops active simulation on enter, clears previous listeners, and sets manual buffer', async () => {
    const onConsoleEnter = jest.fn()
    const setManualBuffer = jest.fn()
    const init = jest.fn().mockImplementation(() => Promise.resolve())
    const c = new ConsoleModeController(
      baseDeps({
        getConfig: () =>
          ({
            getDmxRig: jest.fn().mockReturnValue({ id: 'rig-1' }),
          }) as never,
        ensureInitialized: init as () => Promise<void>,
        getDmxPublisher: () => ({ setManualBuffer, clearManualBuffer: jest.fn() }),
      }),
    )
    c.setOnConsoleEnter(onConsoleEnter)

    const result = await c.enableConsoleMode('rig-1')

    expect(result).toEqual({ success: true })
    expect(init).toHaveBeenCalledTimes(1)
    expect(onConsoleEnter).toHaveBeenCalledTimes(1)
    expect(setManualBuffer).toHaveBeenCalledWith({})
  })

  it('fails when rig is unknown', async () => {
    const c = new ConsoleModeController(
      baseDeps({
        getConfig: () =>
          ({
            getDmxRig: jest.fn().mockReturnValue(undefined),
          }) as never,
      }),
    )
    c.setOnConsoleEnter(null)
    const result = await c.enableConsoleMode('missing')
    expect(result).toEqual({ success: false, error: 'Rig not found' })
  })

  it('pauses YARG and RB3 listeners when console opens and snapshot says both are enabled', async () => {
    const pauseYarg = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const pauseRb3 = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const c = new ConsoleModeController(
      baseDeps({
        getConfig: () => ({ getDmxRig: jest.fn().mockReturnValue({ id: 'rig' }) }) as never,
        getDmxPublisher: () => ({
          setManualBuffer: jest.fn(),
          clearManualBuffer: jest.fn(),
        }),
        getListenerSnapshot: () => ({ yarg: true, rb3: true }),
        pauseYarg,
        pauseRb3,
      }),
    )
    c.setOnConsoleEnter(null)

    await c.enableConsoleMode('rig')

    expect(pauseYarg).toHaveBeenCalledTimes(1)
    expect(pauseRb3).toHaveBeenCalledTimes(1)
  })

  it('pauses audio when console opens if audio intake was enabled', async () => {
    const pauseAudio = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)

    const c = new ConsoleModeController(
      baseDeps({
        getConfig: () => ({ getDmxRig: jest.fn().mockReturnValue({ id: 'rig' }) }) as never,
        getDmxPublisher: () => ({
          setManualBuffer: jest.fn(),
          clearManualBuffer: jest.fn(),
        }),
        getIsAudioEnabled: () => true,
        pauseAudio,
      }),
    )
    c.setOnConsoleEnter(null)

    await c.enableConsoleMode('rig')

    expect(pauseAudio).toHaveBeenCalledTimes(1)
  })

  it('clears manual buffer on disable and does not re-enable listeners (no implicit restore hooks)', async () => {
    const clearManualBuffer = jest.fn()

    const c = new ConsoleModeController(
      baseDeps({
        getConfig: () => ({ getDmxRig: jest.fn().mockReturnValue({ id: 'rig' }) }) as never,
        getDmxPublisher: () => ({
          setManualBuffer: jest.fn(),
          clearManualBuffer,
        }),
        getListenerSnapshot: () => ({ yarg: true, rb3: true }),
        pauseYarg: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        pauseRb3: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        pauseAudio: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        getIsAudioEnabled: () => true,
      }),
    )
    c.setOnConsoleEnter(null)

    await c.enableConsoleMode('rig')
    clearManualBuffer.mockClear()
    await c.disableConsoleMode()

    expect(clearManualBuffer).toHaveBeenCalledTimes(1)
    expect(c.getConsoleRestore()).toBeNull()
  })

  it('onControllersReinitializedWhileConsoleOpen reasserts empty manual buffer when console is active', async () => {
    const setManualBuffer = jest.fn()
    const c = new ConsoleModeController(
      baseDeps({
        getConfig: () => ({ getDmxRig: jest.fn().mockReturnValue({ id: 'rig' }) }) as never,
        getDmxPublisher: () => ({ setManualBuffer, clearManualBuffer: jest.fn() }),
      }),
    )
    c.setOnConsoleEnter(null)
    await c.enableConsoleMode('rig')
    expect(c.getConsoleRestore()).not.toBeNull()
    setManualBuffer.mockClear()
    c.onControllersReinitializedWhileConsoleOpen()
    expect(setManualBuffer).toHaveBeenCalledWith({})
  })

  it('ignores console DMX while console mode is closed', () => {
    // setManualBuffer latches the publisher into manual output and only disableConsoleMode lifts
    // it, which returns early with no console state to restore. An ungated send would freeze cue
    // output for the rest of the session.
    const setManualBuffer = jest.fn()
    const c = new ConsoleModeController(
      baseDeps({
        getConfig: () => ({ getDmxRig: jest.fn().mockReturnValue({ id: 'rig' }) }) as never,
        getDmxPublisher: () => ({ setManualBuffer, clearManualBuffer: jest.fn() }),
      }),
    )

    c.sendConsoleDmx({ 1: 255 })

    expect(setManualBuffer).not.toHaveBeenCalled()
  })

  it('passes console DMX through once console mode is open', async () => {
    const setManualBuffer = jest.fn()
    const c = new ConsoleModeController(
      baseDeps({
        getConfig: () => ({ getDmxRig: jest.fn().mockReturnValue({ id: 'rig' }) }) as never,
        getDmxPublisher: () => ({ setManualBuffer, clearManualBuffer: jest.fn() }),
      }),
    )
    c.setOnConsoleEnter(null)
    await c.enableConsoleMode('rig')
    setManualBuffer.mockClear()

    c.sendConsoleDmx({ 1: 255 })

    expect(setManualBuffer).toHaveBeenCalledWith({ 1: 255 })
  })

  it('saves nothing when the fixture template is missing', async () => {
    const saveDmxRig = jest.fn()
    const light = {
      id: 'mh-1',
      fixtureId: 'fixture-1',
      fixture: 'rgb/mh',
      config: {},
    }
    const c = new ConsoleModeController(
      baseDeps({
        getConfig: () =>
          ({
            getDmxRig: () => ({
              id: 'rig-1',
              config: { frontLights: [light], backLights: [], strobeLights: [] },
            }),
            getUserLights: () => [],
            saveDmxRig,
            updateUserLight: jest.fn(),
          }) as never,
      }),
    )

    const result = await c.setConsoleFixtureConfig({
      rigId: 'rig-1',
      lightId: 'mh-1',
      fixtureId: 'fixture-1',
      config: { panHome: 50 },
    })

    expect(result).toEqual({ success: false, error: 'Fixture template not found in My Lights' })
    expect(saveDmxRig).not.toHaveBeenCalled()
  })

  it('answers a saved fixture edit as saved when the restart after it fails', async () => {
    const store = fixtureEditStore()
    const c = new ConsoleModeController(
      baseDeps({
        getConfig: store.getConfig,
        restartControllers: () => Promise.reject(new Error('rig chain would not dispose')),
      }),
    )

    const result = await c.setConsoleFixtureConfig(panHomeEdit)

    expect(result).toEqual({ success: true, restartError: 'rig chain would not dispose' })
    expect(store.rigPanHome()).toBe(50)
    expect(store.templatePanHome()).toBe(50)
  })

  it('puts the rig back when the fixture template write fails', async () => {
    const store = fixtureEditStore({ failTemplateWrites: 1 })
    let restarts = 0
    const c = new ConsoleModeController(
      baseDeps({
        getConfig: store.getConfig,
        restartControllers: async () => {
          restarts++
        },
      }),
    )

    const result = await c.setConsoleFixtureConfig(panHomeEdit)

    expect(result).toEqual({ success: false, error: 'lights.json is read-only' })
    expect(store.rigPanHome()).toBeUndefined()
    expect(store.templatePanHome()).toBeUndefined()
    expect(restarts).toBe(0)
  })

  it('restarts onto the rig on disk when the rig cannot be put back', async () => {
    const store = fixtureEditStore({ failTemplateWrites: 1, failRigWritesAfter: 1 })
    let restarts = 0
    const c = new ConsoleModeController(
      baseDeps({
        getConfig: store.getConfig,
        restartControllers: async () => {
          restarts++
        },
      }),
    )

    const result = await c.setConsoleFixtureConfig(panHomeEdit)

    expect(result).toEqual({ success: false, error: expect.stringContaining('lights.json') })
    expect(store.rigPanHome()).toBe(50)
    expect(restarts).toBe(1)
  })

  it('restarts and names the template when a template that landed cannot be put back', async () => {
    const store = fixtureEditStore({ failTemplateWritesAfter: 1, failRealign: true })
    let restarts = 0
    const c = new ConsoleModeController(
      baseDeps({
        getConfig: store.getConfig,
        restartControllers: async () => {
          restarts++
        },
      }),
    )

    const result = await c.setConsoleFixtureConfig(panHomeEdit)

    expect(result).toEqual({
      success: false,
      error:
        'dmxRigs.json is read-only. The fixture template change could not be undone and is still saved.',
    })
    expect(store.templatePanHome()).toBe(50)
    expect(store.rigPanHome()).toBeUndefined()
    expect(restarts).toBe(1)
  })
})

const panHomeEdit = {
  rigId: 'rig-1',
  lightId: 'mh-1',
  fixtureId: 'fixture-1',
  config: { panHome: 50 },
}

type StoredLight = { id: string; fixtureId: string; fixture: string; config: { panHome?: number } }
type StoredRig = {
  id: string
  config: { frontLights: StoredLight[]; backLights: []; strobeLights: [] }
}
type StoredTemplate = { id: string; fixture: string; config: { panHome?: number } }

/**
 * One moving head in one rig and its template, kept in memory. Template writes fail for the first
 * `failTemplateWrites` calls and once `failTemplateWritesAfter` of them have landed, and rig writes
 * fail once `failRigWritesAfter` of them have landed. With `failRealign`, a template write that
 * lands then throws, as the rig realign behind it does.
 */
function fixtureEditStore(
  options: {
    failTemplateWrites?: number
    failTemplateWritesAfter?: number
    failRigWritesAfter?: number
    failRealign?: boolean
  } = {},
) {
  let rig: StoredRig = {
    id: 'rig-1',
    config: {
      frontLights: [{ id: 'mh-1', fixtureId: 'fixture-1', fixture: 'rgb/mh', config: {} }],
      backLights: [],
      strobeLights: [],
    },
  }
  let template: StoredTemplate = { id: 'fixture-1', fixture: 'rgb/mh', config: {} }
  let templateFailures = options.failTemplateWrites ?? 0
  let rigWrites = 0
  let templateWrites = 0
  const config = {
    getDmxRig: () => rig,
    getUserLights: () => [template],
    saveDmxRig: async (next: StoredRig) => {
      if (options.failRigWritesAfter !== undefined && rigWrites >= options.failRigWritesAfter) {
        throw new Error('rigs.json is read-only')
      }
      rigWrites++
      rig = next
    },
    updateUserLight: async (_id: string, change: (t: StoredTemplate) => StoredTemplate) => {
      if (templateFailures > 0) {
        templateFailures--
        throw new Error('lights.json is read-only')
      }
      if (
        options.failTemplateWritesAfter !== undefined &&
        templateWrites >= options.failTemplateWritesAfter
      ) {
        throw new Error('lights.json is read-only')
      }
      templateWrites++
      template = change(template)
      if (options.failRealign) {
        throw new Error('dmxRigs.json is read-only')
      }
    },
  }
  return {
    getConfig: () => config as never,
    rigPanHome: () => rig.config.frontLights[0].config.panHome,
    templatePanHome: () => template.config.panHome,
  }
}
