import { describe, expect, it, jest } from '@jest/globals'
import {
  ConsoleModeController,
  type ConsoleModeControllerDeps,
} from '../../controllers/ConsoleModeController'

describe('ConsoleModeController', () => {
  it('stops active simulation on enter, clears previous listeners, and sets manual buffer', async () => {
    const onConsoleEnter = jest.fn()
    const setManualBuffer = jest.fn()
    const init = jest.fn().mockImplementation(() => Promise.resolve())
    const c = new ConsoleModeController({
      getConfig: () =>
        ({
          getDmxRig: jest.fn().mockReturnValue({ id: 'rig-1' }),
        }) as never,
      ensureInitialized: init as () => Promise<void>,
      getDmxPublisher: () => ({ setManualBuffer, clearManualBuffer: jest.fn() }),
      getListenerSnapshot: () => ({ yarg: false, rb3: false }),
      getIsAudioEnabled: () => false,
      pauseYarg: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      pauseRb3: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      pauseAudio: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      restoreYarg: () => {
        // noop
      },
      restoreRb3: () => Promise.resolve(),
      restoreAudio: () => Promise.resolve(),
      refreshActiveRigs: () => {
        // noop
      },
      restartControllers: () => Promise.resolve(),
    } satisfies ConsoleModeControllerDeps)
    c.setOnConsoleEnter(onConsoleEnter)

    const result = await c.enableConsoleMode('rig-1')

    expect(result).toEqual({ success: true })
    expect(init).toHaveBeenCalledTimes(1)
    expect(onConsoleEnter).toHaveBeenCalledTimes(1)
    expect(setManualBuffer).toHaveBeenCalledWith({})
  })

  it('fails when rig is unknown', async () => {
    const c = new ConsoleModeController({
      getConfig: () =>
        ({
          getDmxRig: jest.fn().mockReturnValue(undefined),
        }) as never,
      ensureInitialized: () => Promise.resolve(),
      getDmxPublisher: () => null,
      getListenerSnapshot: () => ({ yarg: false, rb3: false }),
      getIsAudioEnabled: () => false,
      pauseYarg: () => Promise.resolve(),
      pauseRb3: () => Promise.resolve(),
      pauseAudio: () => Promise.resolve(),
      restoreYarg: () => {},
      restoreRb3: () => Promise.resolve(),
      restoreAudio: () => Promise.resolve(),
      refreshActiveRigs: () => {},
      restartControllers: () => Promise.resolve(),
    })
    c.setOnConsoleEnter(null)
    const result = await c.enableConsoleMode('missing')
    expect(result).toEqual({ success: false, error: 'Rig not found' })
  })

  it('onControllersReinitializedWhileConsoleOpen reasserts empty manual buffer when console is active', async () => {
    const setManualBuffer = jest.fn()
    const c = new ConsoleModeController({
      getConfig: () => ({ getDmxRig: jest.fn().mockReturnValue({ id: 'rig' }) }) as never,
      ensureInitialized: () => Promise.resolve(),
      getDmxPublisher: () => ({ setManualBuffer, clearManualBuffer: jest.fn() }),
      getListenerSnapshot: () => ({ yarg: false, rb3: false }),
      getIsAudioEnabled: () => false,
      pauseYarg: () => Promise.resolve(),
      pauseRb3: () => Promise.resolve(),
      pauseAudio: () => Promise.resolve(),
      restoreYarg: () => {},
      restoreRb3: () => Promise.resolve(),
      restoreAudio: () => Promise.resolve(),
      refreshActiveRigs: () => {},
      restartControllers: () => Promise.resolve(),
    })
    c.setOnConsoleEnter(null)
    await c.enableConsoleMode('rig')
    expect(c.getConsoleRestore()).not.toBeNull()
    setManualBuffer.mockClear()
    c.onControllersReinitializedWhileConsoleOpen()
    expect(setManualBuffer).toHaveBeenCalledWith({})
  })
})
