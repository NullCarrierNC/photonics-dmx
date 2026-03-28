/**
 * Shared IPC response helpers for consistent error handling across handlers.
 */

export type IpcErrorResult = {
  success: false
  error: string
}

/**
 * Build a standard failure payload for IPC responses.
 * Use in catch blocks: return ipcError(error) or return { ...ipcError(error), extra: value }.
 */
export function ipcError(error: unknown): IpcErrorResult {
  return {
    success: false,
    error: error instanceof Error ? error.message : String(error),
  }
}
