import { describe, it, expect, jest } from '@jest/globals'

jest.mock('../../utils/windowUtils', () => ({ sendToAllWindows: jest.fn() }))

import { setupCueHandlers } from '../../ipc/cue-handlers'
import { CUE } from '../../../shared/ipcChannels'

type OnHandler = (event: unknown, ...args: unknown[]) => void

describe('setupCueHandlers listener-toggle rejection handling', () => {
  it('attaches a catch to every fire-and-forget toggle so an init failure cannot go unhandled', () => {
    const onHandlers = new Map<string, OnHandler>()
    const ipcMain = {
      on: (channel: string, fn: OnHandler) => onHandlers.set(channel, fn),
      handle: jest.fn(),
    }

    // Return a fake thenable per toggle so we can assert a rejection handler was attached without
    // relying on process-level unhandledRejection timing.
    const catches = {
      [CUE.YARG_LISTENER_ENABLED]: jest.fn(),
      [CUE.YARG_LISTENER_DISABLED]: jest.fn(),
      [CUE.RB3E_LISTENER_ENABLED]: jest.fn(),
      [CUE.RB3E_LISTENER_DISABLED]: jest.fn(),
    }
    const controllerManager = {
      enableYarg: jest.fn(() => ({ catch: catches[CUE.YARG_LISTENER_ENABLED] })),
      disableYarg: jest.fn(() => ({ catch: catches[CUE.YARG_LISTENER_DISABLED] })),
      enableRb3: jest.fn(() => ({ catch: catches[CUE.RB3E_LISTENER_ENABLED] })),
      disableRb3: jest.fn(() => ({ catch: catches[CUE.RB3E_LISTENER_DISABLED] })),
    }

    setupCueHandlers(ipcMain as never, controllerManager as never)

    for (const channel of [
      CUE.YARG_LISTENER_ENABLED,
      CUE.YARG_LISTENER_DISABLED,
      CUE.RB3E_LISTENER_ENABLED,
      CUE.RB3E_LISTENER_DISABLED,
    ]) {
      onHandlers.get(channel)!({})
      expect(catches[channel]).toHaveBeenCalledTimes(1)
    }
  })
})
