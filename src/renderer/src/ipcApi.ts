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
  LIFECYCLE,
  LIGHT,
  CONFIG,
  CUE,
  SHELL,
  RENDERER_SEND,
} from '../../shared/ipcChannels'
import type {
  NodeCueFile,
  NodeCueMode,
  NodeCueKind,
  EffectFile,
  EffectMode,
  DmxRig,
  DmxFixture,
  LightingConfiguration,
  SenderConfig,
  AudioCueType,
  CueType,
  AppPreferences,
  AudioConfig,
  AudioGameModeConfig,
  AudioLightingData,
} from '../../shared/ipcTypes'
import type { FixtureConfig } from '../../photonics-dmx/types'

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export const getLifecyclePhase = () => window.api.invoke(LIFECYCLE.GET_PHASE, undefined)

// ---------------------------------------------------------------------------
// Cue consistency window
// ---------------------------------------------------------------------------

export const setCueConsistencyWindow = (windowMs: number) =>
  window.api.invoke(LIGHT.SET_CUE_CONSISTENCY_WINDOW, windowMs)

export const getCueConsistencyWindow = () =>
  window.api.invoke(LIGHT.GET_CUE_CONSISTENCY_WINDOW, undefined)

export const getMotionCueMinHoldMs = () =>
  window.api.invoke(LIGHT.GET_MOTION_CUE_MIN_HOLD_MS, undefined)

export const setMotionCueMinHoldMs = (minHoldMs: number) =>
  window.api.invoke(LIGHT.SET_MOTION_CUE_MIN_HOLD_MS, minHoldMs)

export const getYargFallbackCueTimeMs = () =>
  window.api.invoke(LIGHT.GET_YARG_FALLBACK_CUE_TIME_MS, undefined)

export const setYargFallbackCueTimeMs = (fallbackMs: number) =>
  window.api.invoke(LIGHT.SET_YARG_FALLBACK_CUE_TIME_MS, fallbackMs)

export const getMotionCueProbabilityPercent = () =>
  window.api.invoke(LIGHT.GET_MOTION_CUE_PROBABILITY_PERCENT, undefined)

export const setMotionCueProbabilityPercent = (percent: number) =>
  window.api.invoke(LIGHT.SET_MOTION_CUE_PROBABILITY_PERCENT, percent)

export const getAudioMotionCueProbabilityPercent = () =>
  window.api.invoke(LIGHT.GET_AUDIO_MOTION_CUE_PROBABILITY_PERCENT, undefined)

export const setAudioMotionCueProbabilityPercent = (percent: number) =>
  window.api.invoke(LIGHT.SET_AUDIO_MOTION_CUE_PROBABILITY_PERCENT, percent)

export const getCueGroupSelectionMode = () =>
  window.api.invoke(LIGHT.GET_CUE_GROUP_SELECTION_MODE, undefined)

export const setCueGroupSelectionMode = (mode: 'oncePerSong' | 'withinSong') =>
  window.api.invoke(LIGHT.SET_CUE_GROUP_SELECTION_MODE, mode)

export const getYargMotionGroupSelectionMode = () =>
  window.api.invoke(LIGHT.GET_YARG_MOTION_GROUP_SELECTION_MODE, undefined)

export const setYargMotionGroupSelectionMode = (mode: 'oncePerSong' | 'perCueChange' | 'none') =>
  window.api.invoke(LIGHT.SET_YARG_MOTION_GROUP_SELECTION_MODE, mode)

export const getAudioMotionGroupSelectionMode = () =>
  window.api.invoke(LIGHT.GET_AUDIO_MOTION_GROUP_SELECTION_MODE, undefined)

export const setAudioMotionGroupSelectionMode = (mode: 'oncePerSong' | 'perCueChange' | 'none') =>
  window.api.invoke(LIGHT.SET_AUDIO_MOTION_GROUP_SELECTION_MODE, mode)

export const getYargMotionCueGroups = () =>
  window.api.invoke(LIGHT.GET_YARG_MOTION_CUE_GROUPS, undefined)

export const getAudioMotionCueGroups = () =>
  window.api.invoke(LIGHT.GET_AUDIO_MOTION_CUE_GROUPS, undefined)

export const getAvailableYargMotionCues = (groupId?: string) =>
  window.api.invoke(LIGHT.GET_AVAILABLE_YARG_MOTION_CUES, groupId)

export const getAvailableAudioMotionCues = (groupId?: string) =>
  window.api.invoke(LIGHT.GET_AVAILABLE_AUDIO_MOTION_CUES, groupId)

export const startYargMotionCueSimulation = (groupId: string, cueId: string) =>
  window.api.invoke(LIGHT.START_YARG_MOTION_CUE_SIMULATION, { groupId, cueId })

export const startAudioMotionCueSimulation = (groupId: string, cueId: string) =>
  window.api.invoke(LIGHT.START_AUDIO_MOTION_CUE_SIMULATION, { groupId, cueId })

export const stopMotionCueSimulation = () =>
  window.api.invoke(LIGHT.STOP_MOTION_CUE_SIMULATION, undefined)

export const getConsistencyStatus = () => window.api.invoke(LIGHT.GET_CONSISTENCY_STATUS, undefined)

// ---------------------------------------------------------------------------
// Cue groups
// ---------------------------------------------------------------------------

export const getCueGroups = () => window.api.invoke(LIGHT.GET_CUE_GROUPS, undefined)

export const getEnabledCueGroups = () => window.api.invoke(CONFIG.GET_ENABLED_CUE_GROUPS, undefined)

export const setEnabledCueGroups = (groupIds: string[]) =>
  window.api.invoke(CONFIG.SET_ENABLED_CUE_GROUPS, groupIds)

export const enableCueGroup = (groupId: string) =>
  window.api.invoke(LIGHT.ENABLE_CUE_GROUP, groupId)

export const disableCueGroup = (groupId: string) =>
  window.api.invoke(LIGHT.DISABLE_CUE_GROUP, groupId)

export const getCueSourceGroup = (cueType: CueType) =>
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

export const saveMyLights = (data: DmxFixture[]) => window.api.invoke(CONFIG.SAVE_MY_LIGHTS, data)

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

export const getDisabledYargCues = () => window.api.invoke(CONFIG.GET_DISABLED_YARG_CUES, undefined)

export const setDisabledYargCues = (disabled: Record<string, string[]>) =>
  window.api.invoke(CONFIG.SET_DISABLED_YARG_CUES, disabled)

export const getDisabledAudioCues = () =>
  window.api.invoke(CONFIG.GET_DISABLED_AUDIO_CUES, undefined)

export const setDisabledAudioCues = (disabled: Record<string, string[]>) =>
  window.api.invoke(CONFIG.SET_DISABLED_AUDIO_CUES, disabled)

export const getEnabledYargMotionCueGroups = () =>
  window.api.invoke(CONFIG.GET_ENABLED_YARG_MOTION_CUE_GROUPS, undefined)

export const setEnabledYargMotionCueGroups = (groupIds: string[]) =>
  window.api.invoke(CONFIG.SET_ENABLED_YARG_MOTION_CUE_GROUPS, groupIds)

export const getDisabledYargMotionCues = () =>
  window.api.invoke(CONFIG.GET_DISABLED_YARG_MOTION_CUES, undefined)

export const setDisabledYargMotionCues = (disabled: Record<string, string[]>) =>
  window.api.invoke(CONFIG.SET_DISABLED_YARG_MOTION_CUES, disabled)

export const getEnabledAudioMotionCueGroups = () =>
  window.api.invoke(CONFIG.GET_ENABLED_AUDIO_MOTION_CUE_GROUPS, undefined)

export const setEnabledAudioMotionCueGroups = (groupIds: string[]) =>
  window.api.invoke(CONFIG.SET_ENABLED_AUDIO_MOTION_CUE_GROUPS, groupIds)

export const getDisabledAudioMotionCues = () =>
  window.api.invoke(CONFIG.GET_DISABLED_AUDIO_MOTION_CUES, undefined)

export const setDisabledAudioMotionCues = (disabled: Record<string, string[]>) =>
  window.api.invoke(CONFIG.SET_DISABLED_AUDIO_MOTION_CUES, disabled)

export const getAudioReactiveCues = () =>
  window.api.invoke(CONFIG.GET_AUDIO_REACTIVE_CUES, undefined)

export const setActiveAudioCue = (cueType: AudioCueType) =>
  window.api.invoke(CONFIG.SET_ACTIVE_AUDIO_CUE, cueType)

export const getAudioGameMode = () => window.api.invoke(CONFIG.GET_AUDIO_GAME_MODE, undefined)

export const setAudioGameMode = (updates: Partial<AudioGameModeConfig>) =>
  window.api.invoke(CONFIG.SET_AUDIO_GAME_MODE, updates)

export const getMotionEnabled = () => window.api.invoke(CONFIG.GET_MOTION_ENABLED, undefined)

export const setMotionEnabled = (enabled: boolean) =>
  window.api.invoke(CONFIG.SET_MOTION_ENABLED, enabled)

export const getActiveAudioMotionCue = () =>
  window.api.invoke(CONFIG.GET_ACTIVE_AUDIO_MOTION_CUE, undefined)

export const setActiveAudioMotionCue = (ref: { groupId: string; cueId: string } | null) =>
  window.api.invoke(CONFIG.SET_ACTIVE_AUDIO_MOTION_CUE, ref)

export const getActiveYargMotionCue = () =>
  window.api.invoke(CONFIG.GET_ACTIVE_YARG_MOTION_CUE, undefined)

export const setActiveYargMotionCue = (ref: { groupId: string; cueId: string } | null) =>
  window.api.invoke(CONFIG.SET_ACTIVE_YARG_MOTION_CUE, ref)

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

export const openAudioPreviewWindow = () => window.api.invoke(WINDOW.OPEN_AUDIO_PREVIEW, undefined)

// ---------------------------------------------------------------------------
// App information
// ---------------------------------------------------------------------------

export const getAppVersion = () => window.api.invoke(CONFIG.GET_APP_VERSION, undefined)

export const getValidationErrors = () => window.api.invoke(CONFIG.GET_VALIDATION_ERRORS, undefined)

export const getCorruptRecoveryEvents = () =>
  window.api.invoke(CONFIG.GET_CORRUPT_RECOVERY_EVENTS, undefined)

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
  refreshRateHz?: number
}) => window.api.invoke(LIGHT.UPDATE_SACN_CONFIG, config)

export const updateArtNetConfig = (config: {
  host: string
  universe: number
  net: number
  subnet: number
  subuni: number
  port: number
  refreshRateHz?: number
}) => window.api.invoke(LIGHT.UPDATE_ARTNET_CONFIG, config)

// ---------------------------------------------------------------------------
// RB3E
// ---------------------------------------------------------------------------

export const getRb3Mode = () => window.api.invoke(CUE.RB3E_GET_MODE, undefined)

export const getRb3Stats = () => window.api.invoke(CUE.RB3E_GET_STATS, undefined)

// ---------------------------------------------------------------------------
// Sender management
// ---------------------------------------------------------------------------

export const enableSender = (config: SenderConfig) => window.api.invoke(LIGHT.SENDER_ENABLE, config)

export const disableSender = (config: { sender: string }) =>
  window.api.invoke(LIGHT.SENDER_DISABLE, config)

export const disableAllOutputSenders = () => window.api.invoke(LIGHT.SENDER_DISABLE_ALL, undefined)

// ---------------------------------------------------------------------------
// DMX Console (exclusive manual buffer)
// ---------------------------------------------------------------------------

export const enableConsole = (rigId: string) => window.api.invoke(LIGHT.CONSOLE_ENABLE, { rigId })

export const disableConsole = () => window.api.invoke(LIGHT.CONSOLE_DISABLE, undefined)

export const sendConsoleDmx = (buffer: Record<number, number>) =>
  window.api.send(LIGHT.CONSOLE_SEND_DMX, buffer)

export const updateConsoleChannel = (payload: {
  rigId: string
  lightId: string
  fixtureId: string
  channelName: string
  channelNumber: number
}) => window.api.invoke(LIGHT.CONSOLE_UPDATE_CHANNEL, payload)

export const setConsoleFixtureConfig = (payload: {
  rigId: string
  lightId: string
  fixtureId: string
  config: Partial<FixtureConfig>
}) => window.api.invoke(LIGHT.CONSOLE_SET_FIXTURE_CONFIG, payload)

// ---------------------------------------------------------------------------
// Listener management
// ---------------------------------------------------------------------------

export const enableYarg = () => window.api.send(CUE.YARG_LISTENER_ENABLED, undefined)

export const disableYarg = () => window.api.send(CUE.YARG_LISTENER_DISABLED, undefined)

export const enableRb3 = () => window.api.send(CUE.RB3E_LISTENER_ENABLED, undefined)

export const disableRb3 = () => window.api.send(CUE.RB3E_LISTENER_DISABLED, undefined)

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

export const getNodeCueTypes = (mode: NodeCueMode, kind?: NodeCueKind) =>
  window.api.invoke(NODE_CUES.GET_CUE_TYPES, { mode, kind })

export const pickNodeCueImportFile = (mode?: NodeCueMode) =>
  window.api.invoke(NODE_CUES.IMPORT_PICK, mode)

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

export const pickEffectImportFile = (mode?: EffectMode) =>
  window.api.invoke(EFFECTS.IMPORT_PICK, mode)

export const exportEffectFile = (filePath: string) => window.api.invoke(EFFECTS.EXPORT, filePath)

// ---------------------------------------------------------------------------
// Audio data streaming (renderer → main)
// ---------------------------------------------------------------------------

export const sendAudioData = (data: AudioLightingData) =>
  window.api.sendToMain(RENDERER_SEND.AUDIO_DATA, data)
