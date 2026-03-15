/**
 * Typed IPC API for the renderer process.
 *
 * All IPC calls go through this module — components and hooks import
 * named functions from here rather than calling window.api directly.
 */

import {
  NODE_CUES,
  EFFECTS,
  WINDOW,
  LIGHT,
  CONFIG,
  CUE,
  SHELL,
  RENDERER_SEND,
} from '../../shared/ipcChannels'
import type {
  NodeCueFile,
  NodeCueMode,
  EffectFile,
  EffectMode,
  DmxRig,
  LightingConfiguration,
  SenderConfig,
  AudioCueType,
  AppPreferences,
  AudioConfig,
  AudioLightingData,
} from '../../shared/ipcTypes'

// ---------------------------------------------------------------------------
// Cue consistency window
// ---------------------------------------------------------------------------

export const setCueConsistencyWindow = (windowMs: number) =>
  window.api.invoke(LIGHT.SET_CUE_CONSISTENCY_WINDOW, windowMs)

export const getCueConsistencyWindow = () =>
  window.api.invoke(LIGHT.GET_CUE_CONSISTENCY_WINDOW, undefined)

export const getConsistencyStatus = () => window.api.invoke(LIGHT.GET_CONSISTENCY_STATUS, undefined)

// ---------------------------------------------------------------------------
// Cue groups
// ---------------------------------------------------------------------------

export const getCueGroups = () => window.api.invoke(LIGHT.GET_CUE_GROUPS, undefined)

export const getEnabledCueGroups = () => window.api.invoke(CONFIG.GET_ENABLED_CUE_GROUPS, undefined)

export const setEnabledCueGroups = (groupIds: string[]) =>
  window.api.invoke(CONFIG.SET_ENABLED_CUE_GROUPS, groupIds)

export const getActiveCueGroups = () => window.api.invoke(LIGHT.GET_ACTIVE_CUE_GROUPS, undefined)

export const setActiveCueGroups = (groupIds: string[]) =>
  window.api.invoke(LIGHT.SET_ACTIVE_CUE_GROUPS, groupIds)

export const activateCueGroup = (groupId: string) =>
  window.api.invoke(LIGHT.ACTIVATE_CUE_GROUP, groupId)

export const deactivateCueGroup = (groupId: string) =>
  window.api.invoke(LIGHT.DEACTIVATE_CUE_GROUP, groupId)

export const enableCueGroup = (groupId: string) =>
  window.api.invoke(LIGHT.ENABLE_CUE_GROUP, groupId)

export const disableCueGroup = (groupId: string) =>
  window.api.invoke(LIGHT.DISABLE_CUE_GROUP, groupId)

export const getCueSourceGroup = (cueType: string) =>
  window.api.invoke(LIGHT.GET_CUE_SOURCE_GROUP, cueType)

export const getAvailableCues = (groupId: string | undefined) =>
  window.api.invoke(LIGHT.GET_AVAILABLE_CUES, groupId)

export const getAudioCueGroups = () => window.api.invoke(LIGHT.GET_AUDIO_CUE_GROUPS, undefined)

export const getAvailableAudioCues = (groupId?: string) =>
  window.api.invoke(LIGHT.GET_AVAILABLE_AUDIO_CUES, groupId)

// ---------------------------------------------------------------------------
// Light management
// ---------------------------------------------------------------------------

export const getLightLibrary = () => window.api.invoke(CONFIG.GET_LIGHT_LIBRARY, undefined)

export const getMyLights = () => window.api.invoke(CONFIG.GET_MY_LIGHTS, undefined)

export const saveMyLights = (data: import('../../shared/ipcTypes').DmxFixture[]) =>
  window.api.send(CONFIG.SAVE_MY_LIGHTS, data)

export const getLightLayout = (filename: string) =>
  window.api.invoke(CONFIG.GET_LIGHT_LAYOUT, filename)

export const saveLightLayout = (data: LightingConfiguration) =>
  window.api.invoke(CONFIG.SAVE_LIGHT_LAYOUT, data)

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

export const getPrefs = () => window.api.invoke(CONFIG.GET_PREFS, undefined)

export const savePrefs = (updates: Partial<AppPreferences>) =>
  window.api.invoke(CONFIG.SAVE_PREFS, updates)

// ---------------------------------------------------------------------------
// DMX rigs
// ---------------------------------------------------------------------------

export const getDmxRigs = () => window.api.invoke(CONFIG.GET_DMX_RIGS, undefined)

export const getDmxRig = (id: string) => window.api.invoke(CONFIG.GET_DMX_RIG, id)

export const getActiveRigs = () => window.api.invoke(CONFIG.GET_ACTIVE_RIGS, undefined)

export const saveDmxRig = (rig: DmxRig) => window.api.invoke(CONFIG.SAVE_DMX_RIG, rig)

export const deleteDmxRig = (id: string) => window.api.invoke(CONFIG.DELETE_DMX_RIG, id)

// ---------------------------------------------------------------------------
// Audio configuration
// ---------------------------------------------------------------------------

export const getAudioConfig = () => window.api.invoke(CONFIG.GET_AUDIO_CONFIG, undefined)

export const saveAudioConfig = (updates: Partial<AudioConfig>) =>
  window.api.invoke(CONFIG.SAVE_AUDIO_CONFIG, updates)

export const getAudioEnabled = () => window.api.invoke(CONFIG.GET_AUDIO_ENABLED, undefined)

export const setAudioEnabled = (enabled: boolean) =>
  window.api.invoke(CONFIG.SET_AUDIO_ENABLED, enabled)

export const getEnabledAudioCueGroups = () =>
  window.api.invoke(CONFIG.GET_ENABLED_AUDIO_CUE_GROUPS, undefined)

export const setEnabledAudioCueGroups = (groupIds: string[]) =>
  window.api.invoke(CONFIG.SET_ENABLED_AUDIO_CUE_GROUPS, groupIds)

export const getAudioReactiveCues = () =>
  window.api.invoke(CONFIG.GET_AUDIO_REACTIVE_CUES, undefined)

export const setActiveAudioCue = (cueType: AudioCueType) =>
  window.api.invoke(CONFIG.SET_ACTIVE_AUDIO_CUE, cueType)

// ---------------------------------------------------------------------------
// Stage kit
// ---------------------------------------------------------------------------

export const getStageKitPriority = () => window.api.invoke(CONFIG.GET_STAGE_KIT_PRIORITY, undefined)

export const setStageKitPriority = (priority: 'prefer-for-tracked' | 'random' | 'never') =>
  window.api.invoke(CONFIG.SET_STAGE_KIT_PRIORITY, priority)

// ---------------------------------------------------------------------------
// Clock rate
// ---------------------------------------------------------------------------

export const getClockRate = () => window.api.invoke(CONFIG.GET_CLOCK_RATE, undefined)

export const setClockRate = (clockRate: number) =>
  window.api.invoke(CONFIG.SET_CLOCK_RATE, clockRate)

// ---------------------------------------------------------------------------
// Window management
// ---------------------------------------------------------------------------

export const openCueEditorWindow = () => window.api.invoke(WINDOW.OPEN_CUE_EDITOR, undefined)

// ---------------------------------------------------------------------------
// App information
// ---------------------------------------------------------------------------

export const getAppVersion = () => window.api.invoke(CONFIG.GET_APP_VERSION, undefined)

// ---------------------------------------------------------------------------
// System status
// ---------------------------------------------------------------------------

export const getSystemStatus = () => window.api.invoke(LIGHT.GET_SYSTEM_STATUS, undefined)

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

export const getNetworkInterfaces = () => window.api.invoke(LIGHT.GET_NETWORK_INTERFACES, undefined)

export const updateSacnConfig = (config: {
  universe?: number
  networkInterface?: string
  useUnicast?: boolean
  unicastDestination?: string
}) => window.api.invoke(LIGHT.UPDATE_SACN_CONFIG, config)

// ---------------------------------------------------------------------------
// RB3E
// ---------------------------------------------------------------------------

export const getRb3Mode = () => window.api.invoke(CUE.RB3E_GET_MODE, undefined)

export const getRb3Stats = () => window.api.invoke(CUE.RB3E_GET_STATS, undefined)

// ---------------------------------------------------------------------------
// Sender management
// ---------------------------------------------------------------------------

export const enableSender = (config: SenderConfig) => window.api.send(LIGHT.SENDER_ENABLE, config)

export const disableSender = (config: { sender: string }) =>
  window.api.send(LIGHT.SENDER_DISABLE, config)

// ---------------------------------------------------------------------------
// Listener management
// ---------------------------------------------------------------------------

export const enableYarg = () => window.api.send(CUE.YARG_LISTENER_ENABLED, undefined)

export const disableYarg = () => window.api.send(CUE.YARG_LISTENER_DISABLED, undefined)

export const enableRb3 = () => window.api.send(CUE.RB3E_LISTENER_ENABLED, undefined)

export const disableRb3 = () => window.api.send(CUE.RB3E_LISTENER_DISABLED, undefined)

export const switchRb3Mode = (mode: 'direct' | 'cueBased') =>
  window.api.send(CUE.RB3E_SWITCH_MODE, mode)

export const getYargEnabled = () => window.api.invoke(CUE.GET_YARG_ENABLED, undefined)

export const getRb3Enabled = () => window.api.invoke(CUE.GET_RB3_ENABLED, undefined)

export const setListenCueData = (shouldListen: boolean) =>
  window.api.send(CUE.SET_LISTEN_CUE_DATA, shouldListen)

export const setCueStyle = (style: 'simple' | 'complex') => window.api.send(CUE.CUE_STYLE, style)

// ---------------------------------------------------------------------------
// Effect debounce
// ---------------------------------------------------------------------------

export const getEffectDebounce = () => window.api.invoke(CUE.GET_EFFECT_DEBOUNCE, undefined)

export const updateEffectDebounce = (value: number) =>
  window.api.send(CUE.UPDATE_EFFECT_DEBOUNCE, value)

// ---------------------------------------------------------------------------
// Test effects and simulation
// ---------------------------------------------------------------------------

export const startTestEffect = (
  effectId: string,
  venueSize?: 'NoVenue' | 'Small' | 'Large',
  bpm?: number,
  cueGroup?: string,
) => window.api.invoke(LIGHT.START_TEST_EFFECT, { effectId, venueSize, bpm, cueGroup })

export const stopTestEffect = () => window.api.invoke(LIGHT.STOP_TEST_EFFECT, undefined)

export const simulateBeat = (data?: {
  venueSize?: 'NoVenue' | 'Small' | 'Large'
  bpm?: number
  cueGroup?: string
  effectId?: string | null
}) => window.api.invoke(LIGHT.SIMULATE_BEAT, data)

export const simulateKeyframe = (data?: {
  venueSize?: 'NoVenue' | 'Small' | 'Large'
  bpm?: number
  cueGroup?: string
  effectId?: string | null
}) => window.api.invoke(LIGHT.SIMULATE_KEYFRAME, data)

export const simulateMeasure = (data?: {
  venueSize?: 'NoVenue' | 'Small' | 'Large'
  bpm?: number
  cueGroup?: string
  effectId?: string | null
}) => window.api.invoke(LIGHT.SIMULATE_MEASURE, data)

export const simulateInstrumentNote = (data: {
  instrument: string
  noteType: string
  venueSize?: 'NoVenue' | 'Small' | 'Large'
  bpm?: number
  cueGroup?: string
  effectId?: string | null
}) => window.api.invoke(LIGHT.SIMULATE_INSTRUMENT_NOTE, data)

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export const showItemInFolder = (filePath: string) =>
  window.api.invoke(SHELL.SHOW_ITEM_IN_FOLDER, filePath)

export const openPath = (filePath: string) => window.api.invoke(SHELL.OPEN_PATH, filePath)

export const runNodeScript = (payload: { scriptName: string; args: string[] }) =>
  window.api.invoke(SHELL.RUN_NODE_SCRIPT, payload)

// ---------------------------------------------------------------------------
// Node cue debug
// ---------------------------------------------------------------------------

export const setNodeCueDebug = (enabled: boolean) => window.api.invoke(NODE_CUES.SET_DEBUG, enabled)

// ---------------------------------------------------------------------------
// Node cue management
// ---------------------------------------------------------------------------

export const listNodeCueFiles = () => window.api.invoke(NODE_CUES.LIST, undefined)

export const reloadNodeCueFiles = () => window.api.invoke(NODE_CUES.RELOAD, undefined)

export const readNodeCueFile = (filePath: string) => window.api.invoke(NODE_CUES.READ, filePath)

export const saveNodeCueFile = (payload: {
  mode: NodeCueMode
  filename: string
  content: NodeCueFile
}) => window.api.invoke(NODE_CUES.SAVE, payload)

export const deleteNodeCueFile = (filePath: string) => window.api.invoke(NODE_CUES.DELETE, filePath)

export const validateNodeCue = (payload: { path?: string; content?: NodeCueFile }) =>
  window.api.invoke(NODE_CUES.VALIDATE, payload)

export const getNodeCueTypes = (mode: NodeCueMode) =>
  window.api.invoke(NODE_CUES.GET_CUE_TYPES, mode)

export const importNodeCueFile = (mode?: NodeCueMode) => window.api.invoke(NODE_CUES.IMPORT, mode)

export const exportNodeCueFile = (filePath: string) => window.api.invoke(NODE_CUES.EXPORT, filePath)

// ---------------------------------------------------------------------------
// Effect file management
// ---------------------------------------------------------------------------

export const listEffectFiles = () => window.api.invoke(EFFECTS.LIST, undefined)

export const reloadEffectFiles = () => window.api.invoke(EFFECTS.RELOAD, undefined)

export const readEffectFile = (filePath: string) => window.api.invoke(EFFECTS.READ, filePath)

export const saveEffectFile = (payload: {
  mode: EffectMode
  filename: string
  content: EffectFile
}) => window.api.invoke(EFFECTS.SAVE, payload)

export const deleteEffectFile = (filePath: string) => window.api.invoke(EFFECTS.DELETE, filePath)

export const validateEffect = (payload: { path?: string; content?: EffectFile }) =>
  window.api.invoke(EFFECTS.VALIDATE, payload)

export const importEffectFile = (mode?: EffectMode) => window.api.invoke(EFFECTS.IMPORT, mode)

export const exportEffectFile = (filePath: string) => window.api.invoke(EFFECTS.EXPORT, filePath)

// ---------------------------------------------------------------------------
// Audio data streaming (renderer → main)
// ---------------------------------------------------------------------------

export const sendAudioData = (data: AudioLightingData) =>
  window.api.sendToMain(RENDERER_SEND.AUDIO_DATA, data)
