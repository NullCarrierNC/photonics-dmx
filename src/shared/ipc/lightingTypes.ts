/**
 * Lighting runtime channels: system status, cue groups, network interfaces, test effects and cue simulation.
 *
 * Part of the IpcInvokeMap contract, recomposed in shared/ipcTypes.ts.
 */

import { LIGHT } from '../ipcChannels'
import type { CueType } from '../../photonics-dmx/cues/types/cueTypes'
import type { IpcErrorResult, IpcSuccessResult } from './common'

export interface LightingInvokeMap {
  // ---- Light / senders / simulation ----
  [LIGHT.GET_SYSTEM_STATUS]: {
    request: void
    response:
      | {
          success: true
          isYargEnabled: boolean
          isRb3Enabled: boolean
          senderStatus: { sacn: boolean; artnet: boolean; enttecpro: boolean; ipc: boolean }
        }
      | IpcErrorResult
  }
  [LIGHT.GET_CUE_GROUPS]: {
    request: void
    response: Array<{ id: string; name: string; description: string; cueTypes: CueType[] }>
  }
  [LIGHT.ENABLE_CUE_GROUP]: {
    request: string
    response: IpcSuccessResult | IpcErrorResult
  }
  [LIGHT.DISABLE_CUE_GROUP]: {
    request: string
    response: IpcSuccessResult | IpcErrorResult
  }
  [LIGHT.GET_NETWORK_INTERFACES]: {
    request: void
    response:
      | { success: true; interfaces: Array<{ name: string; value: string; family: string }> }
      | (IpcErrorResult & { interfaces: [] })
  }
  [LIGHT.START_TEST_EFFECT]: {
    request: {
      effectId: string
      venueSize?: 'NoVenue' | 'Small' | 'Large'
      bpm?: number
      cueGroup?: string
    }
    response: IpcSuccessResult | IpcErrorResult
  }
  [LIGHT.START_RB3_TEST_EFFECT]: {
    request: {
      effectId: string
      venueSize?: 'NoVenue' | 'Small' | 'Large'
      bpm?: number
      cueGroup?: string
    }
    response: IpcSuccessResult | IpcErrorResult
  }
  [LIGHT.SET_RB3_SIM_LED_STATE]: {
    request: { red: number; green: number; blue: number; yellow: number; fog: boolean }
    response: IpcSuccessResult | IpcErrorResult
  }
  [LIGHT.STOP_TEST_EFFECT]: {
    request: void
    response: boolean
  }
  [LIGHT.SIMULATE_BEAT]: {
    request:
      | {
          venueSize?: 'NoVenue' | 'Small' | 'Large'
          bpm?: number
          cueGroup?: string
          effectId?: string | null
        }
      | undefined
    response: boolean
  }
  [LIGHT.SIMULATE_KEYFRAME]: {
    request:
      | {
          venueSize?: 'NoVenue' | 'Small' | 'Large'
          bpm?: number
          cueGroup?: string
          effectId?: string | null
        }
      | undefined
    response: boolean
  }
  [LIGHT.SIMULATE_MEASURE]: {
    request:
      | {
          venueSize?: 'NoVenue' | 'Small' | 'Large'
          bpm?: number
          cueGroup?: string
          effectId?: string | null
        }
      | undefined
    response: boolean
  }
  [LIGHT.SIMULATE_POST_PROCESSING]: {
    request: { state: string }
    response: boolean
  }
  [LIGHT.SIMULATE_INSTRUMENT_NOTE]: {
    request: {
      instrument: string
      noteType: string
      venueSize?: 'NoVenue' | 'Small' | 'Large'
      bpm?: number
      cueGroup?: string
      effectId?: string | null
    }
    response: IpcSuccessResult | IpcErrorResult
  }
  [LIGHT.GET_AVAILABLE_CUES]: {
    request: string | undefined
    response: Array<{
      id: string
      yargDescription: string
      rb3Description: string
      groupName: string
    }>
  }
  [LIGHT.GET_AVAILABLE_AUDIO_CUES]: {
    request: string | undefined
    response: Array<{ id: string; description: string }>
  }
  [LIGHT.GET_AVAILABLE_RB3_CUES]: {
    request: string | undefined
    response: Array<{
      id: string
      yargDescription: string
      rb3Description: string
      groupName: string
    }>
  }
  [LIGHT.GET_AUDIO_CUE_GROUPS]: {
    request: void
    response: Array<{ id: string; name: string; description: string }>
  }
  [LIGHT.GET_CUE_SOURCE_GROUP]: {
    request: CueType
    response:
      | {
          success: true
          cueType: CueType
          groupId: string
          cueStyle: string
          isFallback: boolean
          counter: number
          limit: number
        }
      | IpcErrorResult
  }
}
