/**
 * Response shapes and payload types shared by more than one IPC domain module.
 *
 * Invoke (ipcMain.handle) conventions:
 * - Read-only / query channels may return a plain DTO, null, or a typed union.
 * - State-changing and validation-gated channels should return IpcSuccessResult, { success: true, ... }
 *   with a payload, or IpcErrorResult, so the renderer can branch on result.success without
 *   treating thrown errors as a second control path.
 * - Use ipcError() / ipcSuccess() from main/ipc/ipcResult in handlers. Throw only for unexpected
 *   failures, and document channels that still reject.
 */

export interface IpcErrorResult {
  success: false
  error: string
}

export type IpcSuccessResult = { success: true }

/**
 * Runtime lifecycle phases for the main-process controller graph.
 * Owned by `ControllerManager`, mirrored here so the renderer can disable actions outside `running`.
 */
export type LifecyclePhase =
  | 'initializing'
  | 'running'
  | 'restarting'
  | 'consoleMode'
  | 'failed'
  | 'shuttingDown'
  | 'stopped'

/**
 * Payload sent from the publisher to the renderer over `RENDERER_RECEIVE.DMX_VALUES`.
 *
 * Tagged union mirroring the publisher's two modes:
 *  - `kind: 'rigs'`, normal cue-driven output. One channel buffer per currently-active rig,
 *    keyed by rig id. Each rig's buffer is independent (matches what would go on its routed
 *    wire sender), so previewing a single rig is always correct even when rigs share channel
 *    numbers across separate physical universes.
 *  - `kind: 'manual'`, DMX Console manual takeover (or shutdown blackout). A flat universe
 *    buffer, which the renderer treats as a loopback of what was just sent on every wire slot.
 *
 * Consumers select between modes via discriminated narrowing on `kind`.
 */
export type DmxValuesPayload =
  | { kind: 'rigs'; rigBuffers: Record<string, Record<number, number>> }
  | { kind: 'manual'; buffer: Record<number, number> }
