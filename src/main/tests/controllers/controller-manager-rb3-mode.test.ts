import { describe, expect, it, jest } from '@jest/globals'

jest.mock('electron', () => ({
  app: { getPath: jest.fn(() => '/tmp/photonics-test') },
}))

jest.mock('../../utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
  hasBrowserWindows: () => false,
  mainRuntimeBroadcaster: { emit: jest.fn() },
}))

import {
  LifecycleAbortedError,
  type ControllerLifecycle,
} from '../../controllers/ControllerLifecycle'
import {
  lifecycleAt,
  lifecycleBlockedOn,
  lifecycleShuttingDownOn,
  listenerStub,
  stubbedManager,
  stubConfig,
} from './lifecycleStub'

function rb3Manager(
  running: 'direct' | 'cue' | 'none',
  saved: 'direct' | 'cue',
  lifecycle?: ControllerLifecycle,
) {
  const listeners = listenerStub()
  listeners.yargRb3.getIsRb3Enabled.mockReturnValue(running !== 'none')
  listeners.yargRb3.getRb3Mode.mockReturnValue(running)
  return stubbedManager({
    listeners,
    lifecycle,
    config: stubConfig({ rb3Prefs: { processingMode: saved } }),
  })
}

describe('ControllerManager.applyRb3ProcessingMode', () => {
  it('cycles a running session onto a different saved mode', async () => {
    const { manager, listeners } = rb3Manager('direct', 'cue')

    await manager.applyRb3ProcessingMode()

    const { disableRb3, enableRb3 } = listeners.yargRb3
    expect(disableRb3).toHaveBeenCalledTimes(1)
    expect(enableRb3).toHaveBeenCalledTimes(1)
    expect(disableRb3.mock.invocationCallOrder[0]).toBeLessThan(
      enableRb3.mock.invocationCallOrder[0],
    )
    expect(enableRb3).toHaveBeenCalledWith(true, expect.any(Function))
    expect(listeners.audio.disableAudio).not.toHaveBeenCalled()
  })

  it('leaves a session already on the saved mode alone', async () => {
    const { manager, listeners } = rb3Manager('cue', 'cue')

    await manager.applyRb3ProcessingMode()

    expect(listeners.yargRb3.disableRb3).not.toHaveBeenCalled()
    expect(listeners.yargRb3.enableRb3).not.toHaveBeenCalled()
  })

  it('does nothing while RB3 is off', async () => {
    const { manager, listeners } = rb3Manager('none', 'cue')

    await manager.applyRb3ProcessingMode()

    expect(listeners.yargRb3.getRb3Mode).not.toHaveBeenCalled()
    expect(listeners.yargRb3.disableRb3).not.toHaveBeenCalled()
    expect(listeners.yargRb3.enableRb3).not.toHaveBeenCalled()
  })

  it('does nothing while a fault is held', async () => {
    const lifecycle = lifecycleAt('running')
    lifecycle.markFaulted()
    const { manager, listeners } = rb3Manager('direct', 'cue', lifecycle)

    await expect(manager.applyRb3ProcessingMode()).resolves.toBeUndefined()

    expect(listeners.yargRb3.disableRb3).not.toHaveBeenCalled()
    expect(listeners.yargRb3.enableRb3).not.toHaveBeenCalled()
  })

  it('waits for the lifecycle queue', async () => {
    let release!: () => void
    const barrier = new Promise<void>((resolve) => {
      release = resolve
    })
    const { manager, listeners } = rb3Manager('direct', 'cue', lifecycleBlockedOn(barrier))

    const applied = manager.applyRb3ProcessingMode()
    await new Promise((resolve) => setImmediate(resolve))
    expect(listeners.yargRb3.disableRb3).not.toHaveBeenCalled()

    release()
    await applied

    expect(listeners.yargRb3.disableRb3).toHaveBeenCalledTimes(1)
    expect(listeners.yargRb3.enableRb3).toHaveBeenCalledTimes(1)
  })

  it('refuses a mode change queued behind a shutdown that failed', async () => {
    let fail!: (error: Error) => void
    const teardown = new Promise<void>((_resolve, reject) => {
      fail = reject
    })
    const { manager, listeners } = rb3Manager('direct', 'cue', lifecycleShuttingDownOn(teardown))
    const rb3 = { on: true, mode: 'direct' }
    listeners.yargRb3.getIsRb3Enabled.mockImplementation(() => rb3.on)
    listeners.yargRb3.getRb3Mode.mockImplementation(() => (rb3.on ? rb3.mode : 'none'))
    listeners.yargRb3.disableRb3.mockImplementation(async () => {
      rb3.on = false
    })
    listeners.yargRb3.enableRb3.mockImplementation(async () => {
      rb3.on = true
      rb3.mode = 'cue'
    })

    const applied = manager.applyRb3ProcessingMode()
    fail(new Error('loader dispose failed'))

    const refusal = await applied.then(
      () => null,
      (error: unknown) => error,
    )

    expect(rb3).toEqual({ on: true, mode: 'direct' })
    expect(refusal).toBeInstanceOf(LifecycleAbortedError)
  })
})
