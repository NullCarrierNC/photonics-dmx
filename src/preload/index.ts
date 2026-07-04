import { contextBridge, ipcRenderer } from 'electron'
import type {
  IpcInvokeChannel,
  IpcInvokeMap,
  IpcSendChannel,
  IpcSendMap,
  IpcEventChannel,
  IpcEventMap,
  IpcRendererSendChannel,
  IpcRendererSendMap,
} from '../shared/ipcTypes'
import { CHANNELS, RENDERER_RECEIVE, RENDERER_SEND } from '../shared/ipcChannels'
import { createLogger } from '../shared/logger'

const log = createLogger('preload')

// Runtime channel allowlists derived from the same constants the type maps are built on. The generic
// signatures are compile-time only; these Sets reject any channel string a compromised or buggy
// renderer might pass at runtime, per direction.
const MAIN_CHANNELS = new Set<string>(Object.values(CHANNELS))
const EVENT_CHANNELS = new Set<string>(Object.values(RENDERER_RECEIVE))
const RENDERER_SEND_CHANNELS = new Set<string>(Object.values(RENDERER_SEND))

const api = {
  /**
   * Request/response IPC — renderer asks main for a result.
   * Typed via IpcInvokeMap: channel → { request, response }.
   */
  invoke: <T extends IpcInvokeChannel>(
    channel: T,
    data: IpcInvokeMap[T]['request'],
  ): Promise<IpcInvokeMap[T]['response']> => {
    if (!MAIN_CHANNELS.has(channel as string)) {
      log.error(`Blocked invoke on unknown channel: ${String(channel)}`)
      return Promise.reject(new Error(`Unknown IPC channel: ${String(channel)}`))
    }
    return ipcRenderer.invoke(channel as string, data)
  },

  /**
   * Fire-and-forget IPC — renderer sends to main with no reply.
   * Typed via IpcSendMap: channel → payload.
   */
  send: <T extends IpcSendChannel>(channel: T, data: IpcSendMap[T]): void => {
    if (!MAIN_CHANNELS.has(channel as string)) {
      log.error(`Blocked send on unknown channel: ${String(channel)}`)
      return
    }
    ipcRenderer.send(channel as string, data)
  },

  /**
   * Renderer → main one-way push (audio data streaming).
   * Separate from IpcSendMap because these channels are not part of the
   * CHANNELS aggregate (they use RENDERER_SEND constants).
   */
  sendToMain: <T extends IpcRendererSendChannel>(channel: T, data: IpcRendererSendMap[T]): void => {
    if (!RENDERER_SEND_CHANNELS.has(channel as string)) {
      log.error(`Blocked sendToMain on unknown channel: ${String(channel)}`)
      return
    }
    ipcRenderer.send(channel as string, data)
  },

  /**
   * Subscribe to a main → renderer event channel.
   * Returns a cleanup function suitable for useEffect return values.
   * Typed via IpcEventMap: channel → payload.
   */
  receive: <T extends IpcEventChannel>(
    channel: T,
    callback: (payload: IpcEventMap[T]) => void,
  ): (() => void) => {
    if (!EVENT_CHANNELS.has(channel as string)) {
      log.error(`Blocked receive on unknown channel: ${String(channel)}`)
      return () => {}
    }
    const listener = (_event: Electron.IpcRendererEvent, payload: IpcEventMap[T]): void => {
      callback(payload)
    }
    ipcRenderer.on(channel as string, listener)
    return () => ipcRenderer.removeListener(channel as string, listener)
  },
}

// The app always runs context-isolated (WindowManager sets contextIsolation + sandbox). Expose via the
// bridge only; a non-isolated fallback that assigns window.api directly is a security downgrade and is
// intentionally absent.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    log.error('Failed to expose preload API', error)
  }
} else {
  log.error(
    'Preload is not context-isolated; refusing to expose the API on window (misconfiguration)',
  )
}
