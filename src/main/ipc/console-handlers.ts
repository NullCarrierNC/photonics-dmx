import { IpcMain } from 'electron'
import { ControllerManager } from '../controllers/ControllerManager'
import { LIGHT } from '../../shared/ipcChannels'
import { ipcError } from './ipcResult'

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/**
 * DMX Console: exclusive manual buffer mode and channel configuration updates.
 */
export function setupConsoleHandlers(ipcMain: IpcMain, controllerManager: ControllerManager): void {
  ipcMain.handle(LIGHT.CONSOLE_ENABLE, async (_, data: unknown) => {
    if (!isPlainObject(data) || typeof data.rigId !== 'string' || data.rigId.trim() === '') {
      return { success: false as const, error: 'Invalid console enable payload' }
    }
    try {
      return await controllerManager.enableConsoleMode(data.rigId)
    } catch (error) {
      return ipcError(error)
    }
  })

  ipcMain.handle(LIGHT.CONSOLE_DISABLE, async () => {
    try {
      return await controllerManager.disableConsoleMode()
    } catch (error) {
      return ipcError(error)
    }
  })

  ipcMain.on(LIGHT.CONSOLE_SEND_DMX, (_, data: unknown) => {
    if (!isPlainObject(data)) {
      return
    }
    const buffer: Record<number, number> = {}
    for (const [k, v] of Object.entries(data)) {
      const ch = Number(k)
      if (Number.isFinite(ch) && typeof v === 'number' && Number.isFinite(v)) {
        buffer[ch] = v
      }
    }
    controllerManager.sendConsoleDmx(buffer)
  })

  ipcMain.handle(LIGHT.CONSOLE_UPDATE_CHANNEL, async (_, data: unknown) => {
    if (
      !isPlainObject(data) ||
      typeof data.rigId !== 'string' ||
      typeof data.lightId !== 'string' ||
      typeof data.fixtureId !== 'string' ||
      typeof data.channelName !== 'string' ||
      typeof data.channelNumber !== 'number'
    ) {
      return { success: false as const, error: 'Invalid console channel update payload' }
    }
    try {
      return await controllerManager.updateConsoleChannel({
        rigId: data.rigId,
        lightId: data.lightId,
        fixtureId: data.fixtureId,
        channelName: data.channelName,
        channelNumber: data.channelNumber,
      })
    } catch (error) {
      return ipcError(error)
    }
  })

  ipcMain.handle(LIGHT.CONSOLE_SET_HOME, async (_, data: unknown) => {
    if (
      !isPlainObject(data) ||
      typeof data.rigId !== 'string' ||
      typeof data.lightId !== 'string' ||
      typeof data.fixtureId !== 'string' ||
      typeof data.panHome !== 'number' ||
      typeof data.tiltHome !== 'number'
    ) {
      return { success: false as const, error: 'Invalid console set home payload' }
    }
    try {
      return await controllerManager.setConsoleHome({
        rigId: data.rigId,
        lightId: data.lightId,
        fixtureId: data.fixtureId,
        panHome: data.panHome,
        tiltHome: data.tiltHome,
      })
    } catch (error) {
      return ipcError(error)
    }
  })
}
