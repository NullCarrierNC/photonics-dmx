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

const api = {
  /**
   * Request/response IPC — renderer asks main for a result.
   * Typed via IpcInvokeMap: channel → { request, response }.
   */
  invoke: <T extends IpcInvokeChannel>(
    channel: T,
    data: IpcInvokeMap[T]['request'],
  ): Promise<IpcInvokeMap[T]['response']> => {
    return ipcRenderer.invoke(channel as string, data)
  },

  /**
   * Fire-and-forget IPC — renderer sends to main with no reply.
   * Typed via IpcSendMap: channel → payload.
   */
  send: <T extends IpcSendChannel>(channel: T, data: IpcSendMap[T]): void => {
    ipcRenderer.send(channel as string, data)
  },

  /**
   * Renderer → main one-way push (audio data streaming).
   * Separate from IpcSendMap because these channels are not part of the
   * CHANNELS aggregate (they use RENDERER_SEND constants).
   */
  sendToMain: <T extends IpcRendererSendChannel>(channel: T, data: IpcRendererSendMap[T]): void => {
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
    const listener = (_event: Electron.IpcRendererEvent, payload: IpcEventMap[T]): void => {
      callback(payload)
    }
    ipcRenderer.on(channel as string, listener)
    return () => ipcRenderer.removeListener(channel as string, listener)
  },
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api
}
