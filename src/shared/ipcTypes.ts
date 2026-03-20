/**
 * Central IPC type contracts.
 *
 * Three maps tie every channel to its payload type:
 *   IpcInvokeMap      - channels using ipcMain.handle / ipcRenderer.invoke (request → response)
 *   IpcSendMap        - channels using ipcMain.on / ipcRenderer.send (fire-and-forget)
 *   IpcEventMap       - channels using webContents.send / ipcRenderer.on (main → renderer push)
 *   IpcRendererSendMap - renderer → main one-way push (not request/response)
 *
 * Keys reference channel constants from ipcChannels.ts.
 * TypeScript resolves the correct types when those constants are passed to the typed bridge.
 */

import {
  NODE_CUES,
  EFFECTS,
  WINDOW,
  SHELL,
  CUE,
  LIGHT,
  CONFIG,
  RENDERER_RECEIVE,
  RENDERER_SEND,
} from './ipcChannels'

// ---------------------------------------------------------------------------
// Re-used domain types (re-exported so consumers can import from one place)
// ---------------------------------------------------------------------------

export type {
  NodeCueFile,
  NodeCueMode,
  EffectFile,
  EffectMode,
} from '../photonics-dmx/cues/types/nodeCueTypes'
export type {
  NodeCueFileSummary,
  NodeCueListSummary,
  NodeCueLoadResult,
} from '../photonics-dmx/cues/node/loader/NodeCueLoader'
export type {
  EffectFileSummary,
  EffectListSummary,
  EffectLoadResult,
} from '../photonics-dmx/cues/node/loader/EffectLoader'
export type { CueData, CueType } from '../photonics-dmx/cues/types/cueTypes'
export type { AudioCueType } from '../photonics-dmx/cues/types/audioCueTypes'
export type { AppPreferences } from '../services/configuration/ConfigurationManager'
export type {
  DmxFixture,
  LightingConfiguration,
  DmxRig,
  SenderConfig,
} from '../photonics-dmx/types'
export type { AudioConfig, AudioLightingData } from '../photonics-dmx/listeners/Audio/AudioTypes'

import type {
  NodeCueFile,
  NodeCueMode,
  EffectFile,
  EffectMode,
} from '../photonics-dmx/cues/types/nodeCueTypes'
import type {
  NodeCueListSummary,
  NodeCueLoadResult,
} from '../photonics-dmx/cues/node/loader/NodeCueLoader'
import type {
  EffectListSummary,
  EffectLoadResult,
} from '../photonics-dmx/cues/node/loader/EffectLoader'
import type { CueData, CueType } from '../photonics-dmx/cues/types/cueTypes'
import type { AudioCueType } from '../photonics-dmx/cues/types/audioCueTypes'
import type { AppPreferences } from '../services/configuration/ConfigurationManager'
import type {
  DmxFixture,
  LightingConfiguration,
  DmxRig,
  SenderConfig,
} from '../photonics-dmx/types'
import type { AudioConfig, AudioLightingData } from '../photonics-dmx/listeners/Audio/AudioTypes'

// ---------------------------------------------------------------------------
// Shared response shapes
// ---------------------------------------------------------------------------

export interface IpcErrorResult {
  success: false
  error: string
}

export type IpcSuccessResult = { success: true }

// ---------------------------------------------------------------------------
// IpcInvokeMap — request/response channels (ipcMain.handle / ipcRenderer.invoke)
// ---------------------------------------------------------------------------

export interface IpcInvokeMap {
  // ---- Node cues ----
  [NODE_CUES.SET_DEBUG]: {
    request: boolean
    response: { success: true; enabled: boolean }
  }
  [NODE_CUES.LIST]: {
    request: void
    response: NodeCueListSummary
  }
  [NODE_CUES.RELOAD]: {
    request: void
    response: NodeCueLoadResult
  }
  [NODE_CUES.READ]: {
    request: string
    response: NodeCueFile
  }
  [NODE_CUES.SAVE]: {
    request: { mode: NodeCueMode; filename: string; content: NodeCueFile }
    response: { success: true; path: string } | IpcErrorResult
  }
  [NODE_CUES.DELETE]: {
    request: string
    response: { success: true; path: string } | IpcErrorResult
  }
  [NODE_CUES.VALIDATE]: {
    request: { path?: string; content?: NodeCueFile }
    response:
      | { valid: true; data: NodeCueFile; errors: string[]; mode: NodeCueMode }
      | { valid: false; errors: string[] }
  }
  [NODE_CUES.GET_CUE_TYPES]: {
    request: NodeCueMode
    response: string[]
  }
  [NODE_CUES.IMPORT]: {
    request: NodeCueMode | undefined
    response: { success: true; path: string } | IpcErrorResult
  }
  [NODE_CUES.EXPORT]: {
    request: string
    response: { success: true; path: string } | IpcErrorResult
  }

  // ---- Effects ----
  [EFFECTS.LIST]: {
    request: void
    response: EffectListSummary
  }
  [EFFECTS.RELOAD]: {
    request: void
    response: EffectLoadResult
  }
  [EFFECTS.READ]: {
    request: string
    response: EffectFile
  }
  [EFFECTS.SAVE]: {
    request: { mode: EffectMode; filename: string; content: EffectFile }
    response: { success: true; path: string } | IpcErrorResult
  }
  [EFFECTS.DELETE]: {
    request: string
    response: { success: true; path: string } | IpcErrorResult
  }
  [EFFECTS.VALIDATE]: {
    request: { path?: string; content?: EffectFile }
    response:
      | { valid: true; data: EffectFile; errors: string[]; mode: EffectMode }
      | { valid: false; errors: string[] }
  }
  [EFFECTS.IMPORT]: {
    request: EffectMode | undefined
    response: { success: true; path: string } | IpcErrorResult
  }
  [EFFECTS.EXPORT]: {
    request: string
    response: { success: true; path: string } | IpcErrorResult
  }

  // ---- Window ----
  [WINDOW.OPEN_CUE_EDITOR]: {
    request: void
    response: IpcSuccessResult | IpcErrorResult
  }

  // ---- Shell ----
  [SHELL.SHOW_ITEM_IN_FOLDER]: {
    request: string
    response: string
  }
  [SHELL.OPEN_PATH]: {
    request: string
    response: string
  }
  [SHELL.RUN_NODE_SCRIPT]: {
    request: { scriptName: string; args: string[] }
    response: { stdout: string; stderr: string }
  }

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
    response: 'direct' | 'cueBased' | 'none'
  }
  [CUE.RB3E_GET_STATS]: {
    request: void
    response: Record<string, unknown> | null
  }
  [CUE.GET_YARG_ENABLED]: {
    request: void
    response: boolean
  }
  [CUE.GET_RB3_ENABLED]: {
    request: void
    response: boolean
  }
  [CUE.GET_EFFECT_DEBOUNCE]: {
    request: void
    response: number
  }

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
  [LIGHT.GET_ACTIVE_CUE_GROUPS]: {
    request: void
    response: Array<{ id: string; name: string; description: string; cueTypes: CueType[] }>
  }
  [LIGHT.ACTIVATE_CUE_GROUP]: {
    request: string
    response: IpcSuccessResult | IpcErrorResult
  }
  [LIGHT.DEACTIVATE_CUE_GROUP]: {
    request: string
    response: IpcSuccessResult | IpcErrorResult
  }
  [LIGHT.ENABLE_CUE_GROUP]: {
    request: string
    response: IpcSuccessResult | IpcErrorResult
  }
  [LIGHT.DISABLE_CUE_GROUP]: {
    request: string
    response: IpcSuccessResult | IpcErrorResult
  }
  [LIGHT.SET_ACTIVE_CUE_GROUPS]: {
    request: string[]
    response:
      | {
          success: true
          activeGroups: string[]
          invalidGroups?: string[]
          disabledGroups?: string[]
        }
      | IpcErrorResult
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
  [LIGHT.GET_AUDIO_CUE_GROUPS]: {
    request: void
    response: Array<{ id: string; name: string; description: string }>
  }
  [LIGHT.GET_CUE_SOURCE_GROUP]: {
    request: string
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
  [LIGHT.SET_CUE_CONSISTENCY_WINDOW]: {
    request: number
    response: { success: true; windowMs: number } | IpcErrorResult
  }
  [LIGHT.GET_CUE_CONSISTENCY_WINDOW]: {
    request: void
    response: { success: true; windowMs: number } | IpcErrorResult
  }
  [LIGHT.SET_CUE_GROUP_SELECTION_MODE]: {
    request: 'oncePerSong' | 'withinSong'
    response: { success: true; mode: 'oncePerSong' | 'withinSong' } | IpcErrorResult
  }
  [LIGHT.GET_CUE_GROUP_SELECTION_MODE]: {
    request: void
    response: { success: true; mode: 'oncePerSong' | 'withinSong' } | IpcErrorResult
  }
  [LIGHT.GET_CONSISTENCY_STATUS]: {
    request: void
    response: { success: true; status: unknown } | IpcErrorResult
  }
  [LIGHT.UPDATE_SACN_CONFIG]: {
    request: {
      universe?: number
      networkInterface?: string
      useUnicast?: boolean
      unicastDestination?: string
    }
    response: IpcSuccessResult | IpcErrorResult
  }

  // ---- Config ----
  [CONFIG.GET_LIGHT_LIBRARY]: {
    request: void
    response: DmxFixture[]
  }
  [CONFIG.GET_MY_LIGHTS]: {
    request: void
    response: DmxFixture[]
  }
  [CONFIG.GET_LIGHT_LAYOUT]: {
    request: string
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
    request: DmxRig
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
  [CONFIG.GET_AUDIO_REACTIVE_CUES]: {
    request: void
    response:
      | {
          success: true
          activeCueType: AudioCueType
          cues: Array<{
            id: AudioCueType
            label: string
            description: string
            groupId: string
            groupName: string
            groupDescription: string
          }>
        }
      | (IpcErrorResult & { activeCueType: null; cues: [] })
  }
  [CONFIG.SET_ACTIVE_AUDIO_CUE]: {
    request: AudioCueType
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

// Utility types derived from IpcInvokeMap
export type IpcInvokeChannel = keyof IpcInvokeMap
export type IpcRequest<T extends IpcInvokeChannel> = IpcInvokeMap[T]['request']
export type IpcResponse<T extends IpcInvokeChannel> = IpcInvokeMap[T]['response']

// ---------------------------------------------------------------------------
// IpcSendMap — fire-and-forget channels (ipcMain.on / ipcRenderer.send)
// ---------------------------------------------------------------------------

export interface IpcSendMap {
  [CUE.YARG_LISTENER_ENABLED]: void
  [CUE.YARG_LISTENER_DISABLED]: void
  [CUE.RB3E_LISTENER_ENABLED]: void
  [CUE.RB3E_LISTENER_DISABLED]: void
  [CUE.RB3E_SWITCH_MODE]: 'direct' | 'cueBased'
  [CUE.SET_LISTEN_CUE_DATA]: boolean
  [CUE.CUE_STYLE]: 'simple' | 'complex'
  [CUE.UPDATE_EFFECT_DEBOUNCE]: number
  [LIGHT.SENDER_ENABLE]: SenderConfig
  [LIGHT.SENDER_DISABLE]: { sender: string }
  [CONFIG.SAVE_MY_LIGHTS]: DmxFixture[]
}

export type IpcSendChannel = keyof IpcSendMap

// ---------------------------------------------------------------------------
// IpcEventMap — main → renderer push channels (webContents.send / ipcRenderer.on)
// ---------------------------------------------------------------------------

export interface CueStateUpdatePayload {
  cueType: CueType
  groupId: string
  groupName: string | null
  isFallback: boolean
  cueStyle: 'primary' | 'secondary'
  counter: number
  limit: number
}

export interface NodeExecutionPayload {
  type: 'activated' | 'deactivated'
  cueId: string
  nodeId: string
  timestamp: number
}

export interface IpcEventMap {
  [RENDERER_RECEIVE.SENDER_START_FAILED]: { sender: string; error: string }
  [RENDERER_RECEIVE.SENDER_ERROR]: string
  [RENDERER_RECEIVE.SENDER_NETWORK_ERROR]: { sender: string; error: string; autoDisabled: boolean }
  [RENDERER_RECEIVE.YARG_ERROR]: string
  [RENDERER_RECEIVE.CONTROLLERS_RESTARTED]: undefined
  [RENDERER_RECEIVE.AUDIO_ENABLE]: AudioConfig
  [RENDERER_RECEIVE.AUDIO_DISABLE]: undefined
  [RENDERER_RECEIVE.AUDIO_ENABLED_CHANGED]: { enabled: boolean }
  [RENDERER_RECEIVE.AUDIO_CONFIG_UPDATE]: AudioConfig | undefined
  [RENDERER_RECEIVE.CUE_STATE_UPDATE]: CueStateUpdatePayload
  [RENDERER_RECEIVE.DMX_VALUES]: { universeBuffer: Record<number, number> }
  [RENDERER_RECEIVE.CUE_HANDLED]: CueData
  [RENDERER_RECEIVE.NODE_CUES_CHANGED]: NodeCueListSummary
  [RENDERER_RECEIVE.EFFECTS_CHANGED]: EffectListSummary
  [RENDERER_RECEIVE.DEBUG_LOG]: {
    message: string
    variables: Array<{ name: string; value: unknown }>
    timestamp: number
  }
  [RENDERER_RECEIVE.NODE_EXECUTION]: NodeExecutionPayload
  [RENDERER_RECEIVE.NODE_CUE_RUNTIME_ERROR]: string
}

export type IpcEventChannel = keyof IpcEventMap

// ---------------------------------------------------------------------------
// IpcRendererSendMap — renderer → main one-way push (audio data streaming)
// ---------------------------------------------------------------------------

export interface IpcRendererSendMap {
  [RENDERER_SEND.AUDIO_DATA]: AudioLightingData
}

export type IpcRendererSendChannel = keyof IpcRendererSendMap
