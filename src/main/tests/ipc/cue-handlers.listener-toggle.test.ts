import { describe, it, expect, jest } from '@jest/globals'
import { EventEmitter } from 'events'

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

describe('setupCueHandlers cue-data mirror', () => {
  function setup() {
    const onHandlers = new Map<string, OnHandler>()
    const ipcMain = {
      on: (channel: string, fn: OnHandler) => onHandlers.set(channel, fn),
      handle: jest.fn(),
    }
    const cueEvents = new EventEmitter()
    const controllerManager = {
      getListenerLifecycle: () => ({
        yargRb3: {
          onCueHandled: (fn: () => void) => {
            cueEvents.on('cueHandled', fn)
            return () => cueEvents.off('cueHandled', fn)
          },
        },
      }),
    }
    setupCueHandlers(ipcMain as never, controllerManager as never)
    const setListen = onHandlers.get(CUE.SET_LISTEN_CUE_DATA)!
    const windowEvent = (id: number) => ({ sender: Object.assign(new EventEmitter(), { id }) })
    return { setListen, cueEvents, windowEvent }
  }

  it('keeps one subscription however often a window asks, and one request stops it', () => {
    const { setListen, cueEvents, windowEvent } = setup()
    const window = windowEvent(1)

    setListen(window, true)
    setListen(window, true)
    expect(cueEvents.listenerCount('cueHandled')).toBe(1)

    setListen(window, false)
    expect(cueEvents.listenerCount('cueHandled')).toBe(0)
  })

  it('keeps mirroring for one window after another stops', () => {
    const { setListen, cueEvents, windowEvent } = setup()
    const first = windowEvent(1)
    const second = windowEvent(2)

    setListen(first, true)
    setListen(second, true)
    setListen(first, false)
    expect(cueEvents.listenerCount('cueHandled')).toBe(1)

    setListen(second, false)
    expect(cueEvents.listenerCount('cueHandled')).toBe(0)
  })

  it('stops mirroring for a window that closes', () => {
    const { setListen, cueEvents, windowEvent } = setup()
    const window = windowEvent(1)

    setListen(window, true)
    window.sender.emit('destroyed')

    expect(cueEvents.listenerCount('cueHandled')).toBe(0)
  })
})
