import { describe, expect, it, jest } from '@jest/globals'

jest.mock('electron', () => ({ ipcMain: {} }))

import type { IpcMain } from 'electron'
import { setupLifecycleHandlers } from '../../ipc/lifecycle-handlers'
import type { ControllerManager } from '../../controllers/ControllerManager'
import type { LifecyclePhase } from '../../../shared/ipcTypes'
import { LIFECYCLE } from '../../../shared/ipcChannels'

function registered(manager: {
  phase?: LifecyclePhase
  initialized?: boolean
  init?: () => Promise<void>
  restart?: () => Promise<void>
}) {
  const init = jest.fn(manager.init ?? (async () => {}))
  const restartControllers = jest.fn(manager.restart ?? (async () => {}))
  const controllerManager = {
    getLifecyclePhase: () => manager.phase ?? 'running',
    getIsInitialized: () => manager.initialized ?? true,
    init,
    restartControllers,
  }
  const handlers = new Map<string, (event: unknown, payload?: unknown) => Promise<unknown>>()
  const ipcMain = {
    handle: (channel: string, fn: (event: unknown, payload?: unknown) => Promise<unknown>) =>
      handlers.set(channel, fn),
  }
  setupLifecycleHandlers(
    ipcMain as unknown as IpcMain,
    controllerManager as unknown as ControllerManager,
  )
  const invoke = (channel: string) => handlers.get(channel)!({}, undefined)
  return { invoke, init, restartControllers }
}

describe('lifecycle IPC', () => {
  it('answers the phase the controllers are in', async () => {
    const { invoke } = registered({ phase: 'failed' })

    await expect(invoke(LIFECYCLE.GET_PHASE)).resolves.toBe('failed')
  })

  it('builds the graph on a retry when it never came up', async () => {
    const { invoke, init, restartControllers } = registered({ initialized: false })

    await expect(invoke(LIFECYCLE.RETRY_INIT)).resolves.toEqual({ success: true })
    expect(init).toHaveBeenCalledTimes(1)
    expect(restartControllers).not.toHaveBeenCalled()
  })

  it('restarts a graph that is up, which rereads the configuration', async () => {
    const { invoke, init, restartControllers } = registered({ initialized: true })

    await expect(invoke(LIFECYCLE.RETRY_INIT)).resolves.toEqual({ success: true })
    expect(restartControllers).toHaveBeenCalledTimes(1)
    expect(init).not.toHaveBeenCalled()
  })

  it.each([
    ['build', { initialized: false, init: () => Promise.reject(new Error('rig file unreadable')) }],
    [
      'restart',
      { initialized: true, restart: () => Promise.reject(new Error('rig file unreadable')) },
    ],
  ])('answers a failed %s with the reason', async (_label, manager) => {
    const { invoke } = registered(manager)

    await expect(invoke(LIFECYCLE.RETRY_INIT)).resolves.toEqual({
      success: false,
      error: 'rig file unreadable',
    })
  })
})
