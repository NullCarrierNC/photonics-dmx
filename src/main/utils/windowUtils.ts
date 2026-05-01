import { BrowserWindow } from 'electron'
import type { RuntimeBroadcaster } from '../../photonics-dmx/runtime/broadcaster'

export const sendToAllWindows = (channel: string, payload: unknown): void => {
  const windows = BrowserWindow.getAllWindows()
  if (windows.length === 0) {
    return
  }

  for (const window of windows) {
    window.webContents.send(channel, payload)
  }
}

export const mainRuntimeBroadcaster: RuntimeBroadcaster = {
  emit(channel: string, payload: unknown): void {
    sendToAllWindows(channel, payload)
  },
}

/** True when at least one BrowserWindow exists (for IPC preview send validation). */
export function hasBrowserWindows(): boolean {
  return BrowserWindow.getAllWindows().length > 0
}
