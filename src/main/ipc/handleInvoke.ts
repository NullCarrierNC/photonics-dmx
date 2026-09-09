import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { Logger } from '../../shared/logger'
import { ipcError } from './ipcResult'

/**
 * Registers an invoke handler that reports an unexpected throw as an IPC failure.
 *
 * Nearly every handler wrapped its body in the same try, logged, and returned `ipcError`, which
 * made the error contract a convention rather than something the registration enforced: a handler
 * that forgot the try rejected the renderer's invoke instead of answering it.
 *
 * Expected failures still return `{ success: false, error }` from the body. This only covers the
 * unexpected ones.
 */
export function handleInvoke(
  ipcMain: IpcMain,
  channel: string,
  log: Logger,
  handler: (event: IpcMainInvokeEvent, ...args: never[]) => unknown,
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...(args as never[]))
    } catch (error) {
      log.error(`${channel} failed:`, error)
      return ipcError(error)
    }
  })
}
