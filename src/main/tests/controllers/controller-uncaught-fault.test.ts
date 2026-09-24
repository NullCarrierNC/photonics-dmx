import { describe, expect, it, jest } from '@jest/globals'

jest.mock('electron', () => ({
  app: { getPath: jest.fn(() => '/tmp/photonics-test') },
}))

jest.mock('../../utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
  hasBrowserWindows: () => false,
  mainRuntimeBroadcaster: { emit: jest.fn() },
}))

import { stubbedManager } from './lifecycleStub'

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

function faultedManager() {
  const stubbed = stubbedManager()
  const blackout = jest.spyOn(stubbed.manager.getChainFanout(), 'blackout')
  return { ...stubbed, blackout }
}

describe('ControllerManager on an uncaught exception', () => {
  it('holds the graph failed and dark, with every input stopped', async () => {
    const { manager, listeners, blackout } = faultedManager()

    expect(manager.handleUncaughtException(new Error('frame path threw'))).toBe(false)
    await settle()

    expect(manager.getLifecyclePhase()).toBe('failed')
    expect(blackout).toHaveBeenCalledWith(0)
    expect(listeners.yargRb3.disableYarg).toHaveBeenCalled()
    expect(listeners.yargRb3.disableRb3).toHaveBeenCalled()
    expect(listeners.audio.disableAudio).toHaveBeenCalled()
  })

  it.each(['enableYarg', 'enableRb3', 'enableAudio'] as const)(
    'refuses %s until a restart',
    async (enable) => {
      const { manager, listeners } = faultedManager()
      manager.handleUncaughtException(new Error('frame path threw'))
      await settle()

      await expect(manager[enable]()).rejects.toThrow(/restart/i)
      expect(listeners.yargRb3.enableYarg).not.toHaveBeenCalled()
      expect(listeners.yargRb3.enableRb3).not.toHaveBeenCalled()
      expect(listeners.audio.enableAudio).not.toHaveBeenCalled()

      await manager.restartControllers()
      await manager[enable]()

      expect(manager.getLifecyclePhase()).toBe('running')
    },
  )

  it('leaves a sender error with the senders', async () => {
    const { manager, senders, blackout } = faultedManager()
    senders.handleUncaughtException.mockReturnValue(true)

    expect(manager.handleUncaughtException(new Error('send EHOSTUNREACH'))).toBe(true)
    await settle()

    expect(manager.getLifecyclePhase()).toBe('running')
    expect(blackout).not.toHaveBeenCalled()
  })

  it('leaves a network send error the senders could not place with them', async () => {
    const { manager, blackout } = faultedManager()
    const error = Object.assign(new Error('send EHOSTUNREACH'), {
      code: 'EHOSTUNREACH',
      syscall: 'send',
    })

    expect(manager.handleUncaughtException(error)).toBe(false)
    await settle()

    expect(manager.getLifecyclePhase()).toBe('running')
    expect(blackout).not.toHaveBeenCalled()
  })

  it('leaves a shutdown in charge of the phase', async () => {
    const { manager, blackout } = faultedManager()
    await manager.shutdown()

    manager.handleUncaughtException(new Error('late throw'))
    await settle()

    expect(manager.getLifecyclePhase()).toBe('stopped')
    expect(blackout).not.toHaveBeenCalled()
  })
})
