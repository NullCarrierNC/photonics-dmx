/**
 * Game listener channels: enabling and disabling the YARG and RB3E network listeners.
 *
 * Part of the IpcInvokeMap contract, recomposed in shared/ipcTypes.ts.
 */

import { CUE } from '../ipcChannels'
import type { IpcErrorResult, IpcSuccessResult } from './common'
import type { ProcessingMode } from '../../photonics-dmx/processors/ProcessorManager'

/** The processing mode of the running RB3 session, or 'none' while RB3 is off. */
export type Rb3RunningMode = ProcessingMode | 'none'

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
    response: Rb3RunningMode | IpcErrorResult
  }
  [CUE.RB3E_GET_STATS]: {
    request: void
    response: Record<string, unknown> | null | IpcErrorResult
  }
}
