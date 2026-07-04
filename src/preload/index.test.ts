import { beforeAll, describe, expect, it, jest } from '@jest/globals'

const exposeInMainWorld = jest.fn()
const ipcRenderer = {
  invoke: jest.fn(() => Promise.resolve('ok')),
  send: jest.fn(),
  on: jest.fn(),
  removeListener: jest.fn(),
}
jest.mock('electron', () => ({ contextBridge: { exposeInMainWorld }, ipcRenderer }))

import { CHANNELS, RENDERER_RECEIVE, RENDERER_SEND } from '../shared/ipcChannels'

type PreloadApi = {
  invoke: (channel: string, data?: unknown) => Promise<unknown>
  send: (channel: string, data?: unknown) => void
  sendToMain: (channel: string, data?: unknown) => void
  receive: (channel: string, cb: (p: unknown) => void) => () => void
}

describe('preload IPC channel allowlist (M-11)', () => {
  let api: PreloadApi

  beforeAll(async () => {
    // The preload only exposes when context-isolated (as it always is in production).
    Object.defineProperty(process, 'contextIsolated', { value: true, configurable: true })
    await import('./index')
    api = exposeInMainWorld.mock.calls[0]![1] as PreloadApi
  })

  it('forwards invoke on a known main channel', async () => {
    await expect(api.invoke(CHANNELS.GET_PREFS, undefined)).resolves.toBe('ok')
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(CHANNELS.GET_PREFS, undefined)
  })

  it('rejects invoke on an unknown channel without reaching ipcRenderer', async () => {
    ipcRenderer.invoke.mockClear()
    await expect(api.invoke('evil:channel', {})).rejects.toThrow('Unknown IPC channel')
    expect(ipcRenderer.invoke).not.toHaveBeenCalled()
  })

  it('drops send / sendToMain on unknown channels', () => {
    ipcRenderer.send.mockClear()
    api.send('evil:send', {})
    api.sendToMain('evil:sendToMain', {})
    expect(ipcRenderer.send).not.toHaveBeenCalled()

    api.sendToMain(RENDERER_SEND.AUDIO_DATA, {})
    expect(ipcRenderer.send).toHaveBeenCalledWith(RENDERER_SEND.AUDIO_DATA, {})
  })

  it('subscribes on a known event channel but no-ops (no listener) on an unknown one', () => {
    ipcRenderer.on.mockClear()
    const cleanupBad = api.receive('evil:event', () => {})
    expect(ipcRenderer.on).not.toHaveBeenCalled()
    expect(typeof cleanupBad).toBe('function') // still returns a usable cleanup

    api.receive(RENDERER_RECEIVE.YARG_ERROR, () => {})
    expect(ipcRenderer.on).toHaveBeenCalled()
  })
})
