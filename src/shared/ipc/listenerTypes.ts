/**
 * Game listener channels: enabling and disabling the YARG and RB3E network listeners.
 *
 * Part of the IpcInvokeMap contract, recomposed in shared/ipcTypes.ts.
 */

import { CUE } from '../ipcChannels'
import type { IpcErrorResult, IpcSuccessResult } from './common'

export interface ListenerInvokeMap {
  // ---- Cue / listeners ----
  [CUE.DISABLE_YARG]: {
    request: void
    response: IpcSuccessResult | IpcErrorResult
  }
  [CUE.DISABLE_RB3]: {
    request: void
    response: IpcSuccessResult | IpcErrorResult
  }
  [CUE.RB3E_GET_MODE]: {
    request: void
    response: 'direct' | 'cue' | 'none' | IpcErrorResult
  }
  [CUE.RB3E_GET_STATS]: {
    request: void
    response: Record<string, unknown> | null | IpcErrorResult
  }
}
