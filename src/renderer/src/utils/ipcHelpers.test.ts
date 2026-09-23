/** @jest-environment jsdom */
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { resetLogConfiguration, setLogSink, type LogEntry } from '../../../shared/logger'
import { addIpcListener, registerIpcListener, removeIpcListener } from './ipcHelpers'
import { emitWindowApi, installWindowApi } from '@renderer/tests/helpers/windowApiStub'

const api = installWindowApi()

/** Sends `payload` as main would, through the native listeners on `channel`. */
const send = emitWindowApi

afterEach(() => {
  resetLogConfiguration()
})

// The module keeps its native listeners for the renderer's lifetime, so each case uses a channel
// no other case touches.
describe('ipcHelpers', () => {
  it('opens one native listener per channel and hands every event to each subscriber', () => {
    const first = jest.fn()
    const second = jest.fn()
    addIpcListener(RENDERER_RECEIVE.CUE_HANDLED, first)
    addIpcListener(RENDERER_RECEIVE.CUE_HANDLED, second)

    send(RENDERER_RECEIVE.CUE_HANDLED, { beat: 'Strong' })

    expect(api.receive.mock.calls.filter(([c]) => c === RENDERER_RECEIVE.CUE_HANDLED)).toHaveLength(
      1,
    )
    expect(first).toHaveBeenCalledWith({ beat: 'Strong' })
    expect(second).toHaveBeenCalledWith({ beat: 'Strong' })
  })

  it('adds a subscriber once however often it is added', () => {
    const handler = jest.fn()
    addIpcListener(RENDERER_RECEIVE.EFFECTS_CHANGED, handler)
    addIpcListener(RENDERER_RECEIVE.EFFECTS_CHANGED, handler)

    send(RENDERER_RECEIVE.EFFECTS_CHANGED, {})

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('removes one subscriber and keeps delivering to the rest', () => {
    const leaving = jest.fn()
    const staying = jest.fn()
    addIpcListener(RENDERER_RECEIVE.NODE_EXECUTION, leaving)
    addIpcListener(RENDERER_RECEIVE.NODE_EXECUTION, staying)

    removeIpcListener(RENDERER_RECEIVE.NODE_EXECUTION, leaving)
    send(RENDERER_RECEIVE.NODE_EXECUTION, {})

    expect(leaving).not.toHaveBeenCalled()
    expect(staying).toHaveBeenCalledTimes(1)
  })

  it('returns a cleanup from registerIpcListener that unsubscribes', () => {
    const handler = jest.fn()
    const cleanup = registerIpcListener(RENDERER_RECEIVE.AUDIO_DISABLE, handler)

    cleanup()
    send(RENDERER_RECEIVE.AUDIO_DISABLE, undefined)

    expect(handler).not.toHaveBeenCalled()
  })

  it('logs a throwing subscriber and still delivers to the next', () => {
    const entries: LogEntry[] = []
    setLogSink((entry) => {
      entries.push(entry)
    })
    const failure = new Error('subscriber failed')
    const next = jest.fn()
    addIpcListener(RENDERER_RECEIVE.AUDIO_CONFIG_UPDATE, () => {
      throw failure
    })
    addIpcListener(RENDERER_RECEIVE.AUDIO_CONFIG_UPDATE, next)

    send(RENDERER_RECEIVE.AUDIO_CONFIG_UPDATE, {})

    expect(next).toHaveBeenCalledTimes(1)
    expect(entries).toContainEqual(expect.objectContaining({ level: 'error', data: [failure] }))
  })
})
