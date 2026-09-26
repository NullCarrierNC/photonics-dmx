import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { Logger } from '../../shared/logger'
import { ipcError } from './ipcResult'

/**
 * Registers an invoke handler that reports an unexpected throw as an IPC failure.
 *
 * Every invoke channel registers through here, so answering rather than rejecting is a property of
 * the registration rather than a convention each body has to remember. A rejected invoke reaches
 * the renderer as an unhandled rejection with nothing to show the user.
 *
 * Expected failures still return `{ success: false, error }` from the body. This covers the
 * unexpected ones.
 *
 * The arguments come from the page, so a handler receives them as `unknown` and validates them.
 */
export function handleInvoke(
  ipcMain: IpcMain,
  channel: string,
  log: Logger,
  handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args)
    } catch (error) {
      log.error(`${channel} failed:`, error)
      return ipcError(error)
    }
  })
}
