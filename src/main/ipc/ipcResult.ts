/**
 * Shared IPC response helpers for consistent error handling across handlers.
 *
 * Conventions (state-changing invoke handlers):
 * - On success, return IpcSuccessResult, or a discriminated object with { success: true, ... } plus payload.
 * - On expected failure, return IpcErrorResult (never throw for user-facing validation).
 * - Use throw only for truly unexpected / programmer errors the renderer cannot recover (invoke rejects).
 * Typed channel results live in IpcInvokeMap in shared/ipcTypes.ts.
 */

import type { IpcErrorResult, IpcSuccessResult } from '../../shared/ipcTypes'

export type { IpcErrorResult, IpcSuccessResult }

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

/** Standard no-payload success for invoke channels that only need a boolean outcome. */
export function ipcSuccess(): IpcSuccessResult {
  return { success: true }
}
