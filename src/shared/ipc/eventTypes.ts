/**
 * Push and fire-and-forget channel contracts:
 *   IpcSendMap         renderer to main, fire-and-forget (ipcMain.on / ipcRenderer.send)
 *   IpcEventMap        main to renderer push (webContents.send / ipcRenderer.on)
 *   IpcRendererSendMap renderer to main one-way push (audio data streaming)
 *
 * State mutations with user-visible failure belong on IpcInvokeMap instead, so the renderer
 * can branch on a result.
 */

import { CUE, LIGHT, RENDERER_RECEIVE, RENDERER_SEND } from '../ipcChannels'
import type { CueData, CueType } from '../../photonics-dmx/cues/types/cueTypes'
import type { NodeCueListSummary } from '../../photonics-dmx/cues/node/loader/NodeCueLoader'
import type { EffectListSummary } from '../../photonics-dmx/cues/node/loader/EffectLoader'
import type { ConfigCorruptInfo } from '../../services/configuration/configCorruptTypes'
import type {
  AudioConfig,
  AudioGameModeConfig,
  AudioGameModeSchedulePayload,
  AudioLightingData,
} from '../../photonics-dmx/listeners/Audio/AudioTypes'
import type { Rb3GameModeSchedulePayload } from '../../photonics-dmx/processors/Rb3GameModeManager'
import type { DmxValuesPayload, LifecyclePhase } from './common'

export interface IpcSendMap {
  [CUE.YARG_LISTENER_ENABLED]: void
  [CUE.YARG_LISTENER_DISABLED]: void
  [CUE.RB3E_LISTENER_ENABLED]: void
  [CUE.RB3E_LISTENER_DISABLED]: void
  [CUE.SET_LISTEN_CUE_DATA]: boolean
  [CUE.CUE_STYLE]: 'simple' | 'complex'
  [LIGHT.CONSOLE_SEND_DMX]: Record<number, number>
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

export interface NodeCueRuntimeErrorPayload {
  /** Graph the error came from — cue: `${groupId}:${cueId}`, effect: the effect definition id —
   *  matching the editor's currentGraphId (as {@link NodeExecutionPayload.cueId} does) so the highlight
   *  can be scoped to the open graph. Optional: emitters without graph context omit it, and consumers
   *  must still surface an unattributed error rather than drop it. */
  graphId?: string
  /** Id of the node that threw, for editor highlighting. */
  nodeId: string
  /** Human-readable error message (no longer prefixed with the node id). */
  message: string
}

export interface IpcEventMap {
  [RENDERER_RECEIVE.SENDER_START_FAILED]: { sender: string; error: string }
  [RENDERER_RECEIVE.SENDER_ERROR]: string
  [RENDERER_RECEIVE.SENDER_NETWORK_ERROR]: { sender: string; error: string; autoDisabled: boolean }
  [RENDERER_RECEIVE.YARG_ERROR]: {
    type: string
    message: string
    autoDisabled?: boolean
    severity?: 'error' | 'warning'
    datagramVersion?: number
  }
  [RENDERER_RECEIVE.RB3_ERROR]: { type: string; message: string; autoDisabled?: boolean }
  [RENDERER_RECEIVE.CONTROLLERS_RESTARTED]: undefined
  [RENDERER_RECEIVE.AUDIO_ENABLE]: AudioConfig
  [RENDERER_RECEIVE.AUDIO_DISABLE]: undefined
  [RENDERER_RECEIVE.AUDIO_ENABLED_CHANGED]: { enabled: boolean }
  [RENDERER_RECEIVE.AUDIO_CONFIG_UPDATE]: AudioConfig | undefined
  [RENDERER_RECEIVE.AUDIO_GAME_MODE_UPDATE]: AudioGameModeConfig
  [RENDERER_RECEIVE.AUDIO_CUE_GROUPS_CHANGED]: undefined
  [RENDERER_RECEIVE.YARG_MOTION_CUE_GROUPS_CHANGED]: undefined
  [RENDERER_RECEIVE.RB3_MOTION_CUE_GROUPS_CHANGED]: undefined
  [RENDERER_RECEIVE.AUDIO_MOTION_CUE_GROUPS_CHANGED]: undefined
  [RENDERER_RECEIVE.MOTION_ENABLED_CHANGED]: boolean
  [RENDERER_RECEIVE.AUDIO_MOTION_CUE_CHANGE]: {
    ref: { groupId: string; cueId: string } | null
    source: 'manual' | 'auto' | 'cleared'
    manualFallback: boolean
  }
  [RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE]: {
    ref: { groupId: string; cueId: string } | null
    source: 'manual' | 'auto' | 'cleared'
    manualFallback: boolean
  }
  [RENDERER_RECEIVE.RB3_MOTION_CUE_CHANGE]: {
    ref: { groupId: string; cueId: string } | null
    source: 'manual' | 'auto' | 'cleared'
    manualFallback: boolean
  }
  [RENDERER_RECEIVE.AUDIO_GAME_MODE_CUE_CHANGE]: { activeCueType: string }
  [RENDERER_RECEIVE.AUDIO_GAME_MODE_DEADLINE]: AudioGameModeSchedulePayload
  [RENDERER_RECEIVE.RB3_GAME_MODE_CUE_CHANGE]: { groupId: string | null }
  [RENDERER_RECEIVE.RB3_GAME_MODE_DEADLINE]: Rb3GameModeSchedulePayload
  [RENDERER_RECEIVE.AUDIO_STROBE_STATE]: {
    active: boolean
    strobeCueType: string | null
  }
  [RENDERER_RECEIVE.AUDIO_DATA_MIRROR]: AudioLightingData
  [RENDERER_RECEIVE.CUE_STATE_UPDATE]: CueStateUpdatePayload
  [RENDERER_RECEIVE.DMX_VALUES]: DmxValuesPayload
  [RENDERER_RECEIVE.CONFIG_CORRUPT_RECOVERED]: { files: ConfigCorruptInfo[] }
  [RENDERER_RECEIVE.CUE_HANDLED]: CueData
  [RENDERER_RECEIVE.NODE_CUES_CHANGED]: NodeCueListSummary
  [RENDERER_RECEIVE.EFFECTS_CHANGED]: EffectListSummary
  [RENDERER_RECEIVE.DEBUG_LOG]: {
    message: string
    variables: Array<{ name: string; value: unknown }>
    timestamp: number
  }
  [RENDERER_RECEIVE.NODE_EXECUTION]: NodeExecutionPayload
  [RENDERER_RECEIVE.NODE_CUE_RUNTIME_ERROR]: NodeCueRuntimeErrorPayload
  [RENDERER_RECEIVE.LIFECYCLE_PHASE_CHANGED]: LifecyclePhase
}

export type IpcEventChannel = keyof IpcEventMap

// ---------------------------------------------------------------------------
// IpcRendererSendMap — renderer → main one-way push (audio data streaming)
// ---------------------------------------------------------------------------

export interface IpcRendererSendMap {
  [RENDERER_SEND.AUDIO_DATA]: AudioLightingData
}

export type IpcRendererSendChannel = keyof IpcRendererSendMap
