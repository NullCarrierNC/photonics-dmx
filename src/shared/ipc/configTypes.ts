/**
 * Stored configuration channels: preferences, light library, lighting layout, rigs and audio config.
 *
 * Part of the IpcInvokeMap contract, recomposed in shared/ipcTypes.ts.
 */

import { CONFIG } from '../ipcChannels'
import type { AudioCueType } from '../../photonics-dmx/cues/types/audioCueTypes'
import type { AppPreferences } from '../../services/configuration/ConfigurationManager'
import type { ConfigCorruptInfo } from '../../services/configuration/configCorruptTypes'
import type { DmxFixture, LightingConfiguration, DmxRig } from '../../photonics-dmx/types'
import type {
  AudioConfig,
  AudioGameModeConfig,
} from '../../photonics-dmx/listeners/Audio/AudioTypes'
import type { IpcErrorResult, IpcSuccessResult } from './common'

export interface ConfigInvokeMap {
  // ---- Config ----
  [CONFIG.GET_LIGHT_LIBRARY]: {
    request: void
    response: DmxFixture[]
  }
  [CONFIG.GET_MY_LIGHTS]: {
    request: void
    response: DmxFixture[]
  }
  [CONFIG.SAVE_MY_LIGHTS]: {
    request: DmxFixture[]
    response: IpcSuccessResult | IpcErrorResult
  }
  [CONFIG.GET_LIGHT_LAYOUT]: {
    request: void
    response: LightingConfiguration
  }
  [CONFIG.SAVE_LIGHT_LAYOUT]: {
    request: LightingConfiguration
    response: IpcSuccessResult | IpcErrorResult
  }
  [CONFIG.GET_DMX_RIGS]: {
    request: void
    response: DmxRig[]
  }
  [CONFIG.GET_DMX_RIG]: {
    request: string
    response: DmxRig | undefined
  }
  [CONFIG.GET_ACTIVE_RIGS]: {
    request: void
    response: DmxRig[]
  }
  [CONFIG.SAVE_DMX_RIG]: {
    request: unknown
    response: IpcSuccessResult | IpcErrorResult
  }
  [CONFIG.DELETE_DMX_RIG]: {
    request: string
    response: IpcSuccessResult | IpcErrorResult
  }
  [CONFIG.GET_APP_VERSION]: {
    request: void
    response: string
  }
  [CONFIG.GET_VALIDATION_ERRORS]: {
    request: void
    response: Array<{ source: 'node-cue' | 'effect'; errors: string[] }>
  }
  [CONFIG.GET_CORRUPT_RECOVERY_EVENTS]: {
    request: void
    response: { files: ConfigCorruptInfo[] }
  }
  [CONFIG.GET_PREFS]: {
    request: void
    response: AppPreferences
  }
  [CONFIG.SAVE_PREFS]: {
    request: Partial<AppPreferences>
    response: IpcSuccessResult | IpcErrorResult
  }
  [CONFIG.GET_ENABLED_CUE_GROUPS]: {
    request: void
    response: string[]
  }
  [CONFIG.SET_ENABLED_CUE_GROUPS]: {
    request: string[]
    response: IpcSuccessResult | IpcErrorResult
  }
  [CONFIG.GET_CLOCK_RATE]: {
    request: void
    response: { success: true; clockRate: number } | IpcErrorResult
  }
  [CONFIG.SET_CLOCK_RATE]: {
    request: number
    response: IpcSuccessResult | IpcErrorResult
  }
  [CONFIG.GET_AUDIO_CONFIG]: {
    request: void
    response: AudioConfig | undefined
  }
  [CONFIG.SAVE_AUDIO_CONFIG]: {
    request: Partial<AudioConfig>
    response: IpcSuccessResult | IpcErrorResult
  }
  [CONFIG.GET_AUDIO_ENABLED]: {
    request: void
    response: boolean
  }
  [CONFIG.SET_AUDIO_ENABLED]: {
    request: boolean
    response: IpcSuccessResult | IpcErrorResult
  }
  [CONFIG.GET_ENABLED_AUDIO_CUE_GROUPS]: {
    request: void
    response: string[]
  }
  [CONFIG.SET_ENABLED_AUDIO_CUE_GROUPS]: {
    request: string[]
    response: IpcSuccessResult | IpcErrorResult
  }
  [CONFIG.GET_DISABLED_YARG_CUES]: {
    request: void
    response: Record<string, string[]>
  }
  [CONFIG.SET_DISABLED_YARG_CUES]: {
    request: Record<string, string[]>
    response: IpcSuccessResult | IpcErrorResult
  }
  [CONFIG.GET_DISABLED_AUDIO_CUES]: {
    request: void
    response: Record<string, string[]>
  }
  [CONFIG.SET_DISABLED_AUDIO_CUES]: {
    request: Record<string, string[]>
    response: IpcSuccessResult | IpcErrorResult
  }
  [CONFIG.GET_ENABLED_YARG_MOTION_CUE_GROUPS]: {
    request: void
    response: string[]
  }
  [CONFIG.SET_ENABLED_YARG_MOTION_CUE_GROUPS]: {
    request: string[]
    response: IpcSuccessResult | IpcErrorResult
  }
  [CONFIG.GET_DISABLED_YARG_MOTION_CUES]: {
    request: void
    response: Record<string, string[]>
  }
  [CONFIG.SET_DISABLED_YARG_MOTION_CUES]: {
    request: Record<string, string[]>
    response: IpcSuccessResult | IpcErrorResult
  }
  [CONFIG.GET_ENABLED_AUDIO_MOTION_CUE_GROUPS]: {
    request: void
    response: string[]
  }
  [CONFIG.SET_ENABLED_AUDIO_MOTION_CUE_GROUPS]: {
    request: string[]
    response: IpcSuccessResult | IpcErrorResult
  }
  [CONFIG.GET_DISABLED_AUDIO_MOTION_CUES]: {
    request: void
    response: Record<string, string[]>
  }
  [CONFIG.SET_DISABLED_AUDIO_MOTION_CUES]: {
    request: Record<string, string[]>
    response: IpcSuccessResult | IpcErrorResult
  }
  [CONFIG.GET_ENABLED_RB3_CUE_GROUPS]: {
    request: void
    response: string[]
  }
  [CONFIG.SET_ENABLED_RB3_CUE_GROUPS]: {
    request: string[]
    response: IpcSuccessResult | IpcErrorResult
  }
  [CONFIG.GET_DISABLED_RB3_CUES]: {
    request: void
    response: Record<string, string[]>
  }
  [CONFIG.SET_DISABLED_RB3_CUES]: {
    request: Record<string, string[]>
    response: IpcSuccessResult | IpcErrorResult
  }
  [CONFIG.GET_ENABLED_RB3_MOTION_CUE_GROUPS]: {
    request: void
    response: string[]
  }
  [CONFIG.SET_ENABLED_RB3_MOTION_CUE_GROUPS]: {
    request: string[]
    response: IpcSuccessResult | IpcErrorResult
  }
  [CONFIG.GET_DISABLED_RB3_MOTION_CUES]: {
    request: void
    response: Record<string, string[]>
  }
  [CONFIG.SET_DISABLED_RB3_MOTION_CUES]: {
    request: Record<string, string[]>
    response: IpcSuccessResult | IpcErrorResult
  }
  [CONFIG.GET_AUDIO_REACTIVE_CUES]: {
    request: void
    response:
      | {
          success: true
          activeCueType: AudioCueType
          secondaryCueType: AudioCueType | null
          cues: Array<{
            id: AudioCueType
            label: string
            description: string
            groupId: string
            groupName: string
            groupDescription: string
          }>
        }
      | (IpcErrorResult & { activeCueType: null; secondaryCueType: null; cues: [] })
  }
  [CONFIG.SET_ACTIVE_AUDIO_CUE]: {
    request: AudioCueType
    response: IpcSuccessResult | IpcErrorResult
  }
  [CONFIG.GET_AUDIO_GAME_MODE]: {
    request: void
    response: AudioGameModeConfig
  }
  [CONFIG.SET_AUDIO_GAME_MODE]: {
    request: Partial<AudioGameModeConfig>
    response: { success: true; config: AudioGameModeConfig } | (IpcErrorResult & { success: false })
  }
  [CONFIG.GET_MOTION_ENABLED]: {
    request: void
    response: boolean
  }
  [CONFIG.SET_MOTION_ENABLED]: {
    request: boolean
    response: IpcSuccessResult | IpcErrorResult
  }
  [CONFIG.GET_ACTIVE_AUDIO_MOTION_CUE]: {
    request: void
    response: { groupId: string; cueId: string } | null
  }
  [CONFIG.SET_ACTIVE_AUDIO_MOTION_CUE]: {
    request: { groupId: string; cueId: string } | null
    response: IpcSuccessResult | IpcErrorResult
  }
  [CONFIG.GET_ACTIVE_YARG_MOTION_CUE]: {
    request: void
    response: { groupId: string; cueId: string } | null
  }
  [CONFIG.SET_ACTIVE_YARG_MOTION_CUE]: {
    request: { groupId: string; cueId: string } | null
    response: IpcSuccessResult | IpcErrorResult
  }
  [CONFIG.GET_ACTIVE_RB3_MOTION_CUE]: {
    request: void
    response: { groupId: string; cueId: string } | null
  }
  [CONFIG.SET_ACTIVE_RB3_MOTION_CUE]: {
    request: { groupId: string; cueId: string } | null
    response: IpcSuccessResult | IpcErrorResult
  }
  [CONFIG.GET_STAGE_KIT_PRIORITY]: {
    request: void
    response: 'prefer-for-tracked' | 'random' | 'never'
  }
  [CONFIG.SET_STAGE_KIT_PRIORITY]: {
    request: 'prefer-for-tracked' | 'random' | 'never'
    response: IpcSuccessResult | IpcErrorResult
  }
}
