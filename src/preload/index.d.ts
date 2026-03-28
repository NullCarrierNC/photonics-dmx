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

export interface PhotonicsAPI {
  invoke: <T extends IpcInvokeChannel>(
    channel: T,
    data: IpcInvokeMap[T]['request'],
  ) => Promise<IpcInvokeMap[T]['response']>

  send: <T extends IpcSendChannel>(channel: T, data: IpcSendMap[T]) => void

  sendToMain: <T extends IpcRendererSendChannel>(channel: T, data: IpcRendererSendMap[T]) => void

  receive: <T extends IpcEventChannel>(
    channel: T,
    callback: (payload: IpcEventMap[T]) => void,
  ) => () => void
}

declare global {
  interface Window {
    api: PhotonicsAPI
  }
}
