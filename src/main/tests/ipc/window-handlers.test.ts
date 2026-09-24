import { describe, expect, it, jest } from '@jest/globals'

jest.mock('electron', () => ({
  ipcMain: {},
  BrowserWindow: jest.fn(),
  shell: { openExternal: jest.fn() },
  screen: { getAllDisplays: jest.fn(() => []), getPrimaryDisplay: jest.fn() },
}))
jest.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))

import type { IpcMain } from 'electron'
import { setupWindowHandlers } from '../../ipc/window-handlers'
import type { WindowManager } from '../../WindowManager'
import { RENDERER_SEND, WINDOW } from '../../../shared/ipcChannels'

function registered() {
  const windowManager = {
    openCueEditorWindow: jest.fn(),
    openAudioPreviewWindow: jest.fn(),
    setUnsavedChanges: jest.fn(),
  }
  const handlers = new Map<string, (event: unknown, payload?: unknown) => Promise<unknown>>()
  const listeners = new Map<string, (event: unknown, payload?: unknown) => void>()
  const ipcMain = {
    handle: (channel: string, fn: (event: unknown, payload?: unknown) => Promise<unknown>) =>
      handlers.set(channel, fn),
    on: (channel: string, fn: (event: unknown, payload?: unknown) => void) =>
      listeners.set(channel, fn),
  }
  setupWindowHandlers(ipcMain as unknown as IpcMain, windowManager as unknown as WindowManager)
  const invoke = (channel: string) => handlers.get(channel)!({}, undefined)
  const send = (channel: string, sender: unknown, payload: unknown) =>
    listeners.get(channel)!({ sender }, payload)
  return { invoke, send, windowManager }
}

describe('window IPC', () => {
  it.each([
    [WINDOW.OPEN_CUE_EDITOR, 'openCueEditorWindow'],
    [WINDOW.OPEN_AUDIO_PREVIEW, 'openAudioPreviewWindow'],
  ] as const)('%s opens its window', async (channel, open) => {
    const { invoke, windowManager } = registered()

    await expect(invoke(channel)).resolves.toEqual({ success: true })
    expect(windowManager[open]).toHaveBeenCalledTimes(1)
  })

  it.each([
    [WINDOW.OPEN_CUE_EDITOR, 'openCueEditorWindow'],
    [WINDOW.OPEN_AUDIO_PREVIEW, 'openAudioPreviewWindow'],
  ] as const)('%s answers with the reason when the window cannot open', async (channel, open) => {
    const { invoke, windowManager } = registered()
    windowManager[open].mockImplementation(() => {
      throw new Error('display gone')
    })

    await expect(invoke(channel)).resolves.toEqual({ success: false, error: 'display gone' })
  })

  it('records what a page reports about its unsaved changes', () => {
    const { send, windowManager } = registered()
    const page = { id: 7 }

    send(RENDERER_SEND.UNSAVED_CHANGES, page, true)
    send(RENDERER_SEND.UNSAVED_CHANGES, page, false)

    expect(windowManager.setUnsavedChanges.mock.calls).toEqual([
      [page, true],
      [page, false],
    ])
  })

  it('ignores an unsaved-changes report that is not a boolean', () => {
    const { send, windowManager } = registered()

    send(RENDERER_SEND.UNSAVED_CHANGES, { id: 7 }, 'yes')

    expect(windowManager.setUnsavedChanges).not.toHaveBeenCalled()
  })
})
