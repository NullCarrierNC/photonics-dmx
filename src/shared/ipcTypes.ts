/**
 * Central IPC type contracts.
 *
 * Four maps tie every channel to its payload type:
 *   IpcInvokeMap       channels using ipcMain.handle / ipcRenderer.invoke (request to response)
 *   IpcSendMap         channels using ipcMain.on / ipcRenderer.send (fire-and-forget, state
 *                      mutations with user-visible failure use IpcInvokeMap)
 *   IpcEventMap        channels using webContents.send / ipcRenderer.on (main to renderer push)
 *   IpcRendererSendMap renderer to main one-way push (not request/response)
 *
 * IpcInvokeMap is assembled here from one interface per domain under `shared/ipc/`, so a channel
 * is declared next to the channels it ships with. Keys reference channel constants from
 * ipcChannels.ts, and TypeScript resolves the correct types when those constants are passed to
 * the typed bridge. Import from this barrel rather than reaching into `shared/ipc/` directly.
 */

import type { CueAuthoringInvokeMap } from './ipc/cueAuthoringTypes'
import type { AppShellInvokeMap } from './ipc/appShellTypes'
import type { ListenerInvokeMap } from './ipc/listenerTypes'
import type { LightingInvokeMap } from './ipc/lightingTypes'
import type { CueSelectionInvokeMap } from './ipc/cueSelectionTypes'
import type { SenderInvokeMap } from './ipc/senderTypes'
import type { ConfigInvokeMap } from './ipc/configTypes'

// ---------------------------------------------------------------------------
// Re-used domain types (re-exported so consumers can import from one place)
// ---------------------------------------------------------------------------

export type {
  NodeCueFile,
  NodeCueMode,
  NodeCueKind,
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
export type {
  AudioConfig,
  AudioGameModeConfig,
  AudioGameModeSchedulePayload,
  AudioLightingData,
} from '../photonics-dmx/listeners/Audio/AudioTypes'
export type { Rb3GameModeSchedulePayload } from '../photonics-dmx/processors/Rb3GameModeManager'

// ---------------------------------------------------------------------------
// Shared response shapes and cross-domain payloads
// ---------------------------------------------------------------------------

export type {
  IpcErrorResult,
  IpcSuccessResult,
  LifecyclePhase,
  DmxValuesPayload,
} from './ipc/common'

// ---------------------------------------------------------------------------
// IpcInvokeMap, request/response channels (ipcMain.handle / ipcRenderer.invoke)
// ---------------------------------------------------------------------------

export type {
  CueAuthoringInvokeMap,
  AppShellInvokeMap,
  ListenerInvokeMap,
  LightingInvokeMap,
  CueSelectionInvokeMap,
  SenderInvokeMap,
  ConfigInvokeMap,
}

export interface IpcInvokeMap
  extends CueAuthoringInvokeMap,
    AppShellInvokeMap,
    ListenerInvokeMap,
    LightingInvokeMap,
    CueSelectionInvokeMap,
    SenderInvokeMap,
    ConfigInvokeMap {}

// Utility types derived from IpcInvokeMap
export type IpcInvokeChannel = keyof IpcInvokeMap
export type IpcRequest<T extends IpcInvokeChannel> = IpcInvokeMap[T]['request']
export type IpcResponse<T extends IpcInvokeChannel> = IpcInvokeMap[T]['response']

// ---------------------------------------------------------------------------
// Push and fire-and-forget channels
// ---------------------------------------------------------------------------

export type {
  IpcSendMap,
  IpcSendChannel,
  IpcEventMap,
  IpcEventChannel,
  IpcRendererSendMap,
  IpcRendererSendChannel,
  CueStateUpdatePayload,
  NodeExecutionPayload,
  NodeCueRuntimeErrorPayload,
} from './ipc/eventTypes'
