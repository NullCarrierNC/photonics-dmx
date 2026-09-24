import { createLogger } from '../../shared/logger'
import { handleInvoke } from './handleInvoke'
import { IpcMain, type WebContents } from 'electron'
import { ControllerManager } from '../controllers/ControllerManager'
import { LIGHT } from '../../shared/ipcChannels'
import { isPlainObject } from './inputValidation'
import { bindConsoleModeToRenderer } from '../controllers/consoleRendererBinding'
import type { FixtureConfig } from '../../photonics-dmx/types'

const log = createLogger('console-handlers')

/**
 * DMX Console: exclusive manual buffer mode and moving-head configuration updates.
 */
export function setupConsoleHandlers(ipcMain: IpcMain, controllerManager: ControllerManager): void {
  // The page each console session is bound to, so re-enabling from the same page does not stack
  // another set of listeners on it. Cleared when that binding releases, so a page that reloads and
  // opens the console again is followed again.
  let boundSender: WebContents | null = null

  handleInvoke(ipcMain, LIGHT.CONSOLE_ENABLE, log, async (event, data: unknown) => {
    if (!isPlainObject(data) || typeof data.rigId !== 'string' || data.rigId.trim() === '') {
      return { success: false as const, error: 'Invalid console enable payload' }
    }
    const result = await controllerManager.enableConsoleMode(data.rigId)
    if (result.success && boundSender !== event.sender) {
      const sender = event.sender
      boundSender = sender
      bindConsoleModeToRenderer(sender, () => {
        if (boundSender === sender) {
          boundSender = null
        }
        return controllerManager.disableConsoleMode()
      })
    }
    return result
  })

  handleInvoke(ipcMain, LIGHT.CONSOLE_DISABLE, log, async () => {
    return await controllerManager.disableConsoleMode()
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
    controllerManager.getConsoleModeController().sendConsoleDmx(buffer)
  })

  handleInvoke(ipcMain, LIGHT.CONSOLE_SET_FIXTURE_CONFIG, log, async (_, data: unknown) => {
    if (
      !isPlainObject(data) ||
      typeof data.rigId !== 'string' ||
      typeof data.lightId !== 'string' ||
      typeof data.fixtureId !== 'string' ||
      !isPlainObject(data.config)
    ) {
      return { success: false as const, error: 'Invalid console set fixture config payload' }
    }
    // setConsoleFixtureConfig restarts controllers internally; the CONTROLLERS_RESTARTED broadcast
    // is fired centrally by restartControllers().
    const result = await controllerManager.getConsoleModeController().setConsoleFixtureConfig({
      rigId: data.rigId,
      lightId: data.lightId,
      fixtureId: data.fixtureId,
      config: data.config as Partial<FixtureConfig>,
    })
    return result
  })
}
