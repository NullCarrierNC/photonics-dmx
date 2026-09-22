/**
 * Shared IPC response helpers for consistent error handling across handlers.
 *
 * Conventions (state-changing invoke handlers):
 * - On success, return IpcSuccessResult, or a discriminated object with { success: true, ... } plus payload.
 * - On expected failure, return IpcErrorResult (never throw for user-facing validation).
 * - Use throw only for truly unexpected / programmer errors. handleInvoke answers those with
 *   IpcErrorResult too, and the renderer wrapper for a channel that answers with a bare value turns
 *   that answer into a throw.
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

/**
 * The verdict a validate channel answers with when it could not validate, carrying the reason.
 * Those channels answer with a verdict every time, because the editor reads one off every answer.
 */
export function validationRefusal(error: unknown): { valid: false; errors: string[] } {
  return { valid: false, errors: [ipcError(error).error] }
}

/** Standard no-payload success for invoke channels that only need a boolean outcome. */
export function ipcSuccess(): IpcSuccessResult {
  return { success: true }
}
