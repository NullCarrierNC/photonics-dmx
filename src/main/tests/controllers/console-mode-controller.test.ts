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
    pauseYarg: () => Promise.resolve(),
    pauseRb3: () => Promise.resolve(),
    pauseAudio: () => Promise.resolve(),
    refreshActiveRigs: () => {},
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
})
