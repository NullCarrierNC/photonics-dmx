/**
 * Application shell channels: rig transfer, lifecycle phase, editor windows and OS shell handoff.
 *
 * Part of the IpcInvokeMap contract, recomposed in shared/ipcTypes.ts.
 */

import { RIGS, WINDOW, SHELL, LIFECYCLE } from '../ipcChannels'
import type { DmxFixture, DmxRig } from '../../photonics-dmx/types'
import type { IpcErrorResult, IpcSuccessResult, LifecyclePhase } from './common'

export interface AppShellInvokeMap {
  // ---- Rigs (import / export) ----
  [RIGS.EXPORT]: {
    request: string // rigId
    response: { success: true; path: string } | IpcErrorResult
  }
  [RIGS.IMPORT_PICK]: {
    request: void
    response:
      | { success: true; sourceBasename: string; rig: DmxRig; templates: DmxFixture[] }
      | IpcErrorResult
  }

  // ---- Lifecycle ----
  [LIFECYCLE.GET_PHASE]: {
    request: void
    response: LifecyclePhase
  }

  // ---- Window ----
  [WINDOW.OPEN_CUE_EDITOR]: {
    request: void
    response: IpcSuccessResult | IpcErrorResult
  }
  [WINDOW.OPEN_AUDIO_PREVIEW]: {
    request: void
    response: IpcSuccessResult | IpcErrorResult
  }

  // ---- Shell ----
  [SHELL.SHOW_ITEM_IN_FOLDER]: {
    request: string
    response: IpcSuccessResult | IpcErrorResult
  }
  [SHELL.OPEN_PATH]: {
    request: string
    response: IpcSuccessResult | IpcErrorResult
  }
}
