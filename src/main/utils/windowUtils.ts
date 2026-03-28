import { BrowserWindow } from 'electron'

export const sendToAllWindows = (channel: string, payload: unknown): void => {
  const windows = BrowserWindow.getAllWindows()
  if (windows.length === 0) {
    return
  }

  for (const window of windows) {
    window.webContents.send(channel, payload)
  }
}
