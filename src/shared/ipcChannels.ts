/**
 * IPC channel definitions
 * Use these constants in both main (handlers) and renderer (ipcApi)
 */

// ---- Node cues ----
export const NODE_CUES = {
  SET_DEBUG: 'node-cues:set-debug',
  LIST: 'node-cues:list',
  RELOAD: 'node-cues:reload',
  READ: 'node-cues:read',
  SAVE: 'node-cues:save',
  DELETE: 'node-cues:delete',
  VALIDATE: 'node-cues:validate',
  GET_CUE_TYPES: 'node-cues:get-cue-types',
  IMPORT: 'node-cues:import',
  EXPORT: 'node-cues:export',
} as const

// ---- Effects ----
export const EFFECTS = {
  LIST: 'effects:list',
  RELOAD: 'effects:reload',
  READ: 'effects:read',
  SAVE: 'effects:save',
  DELETE: 'effects:delete',
  VALIDATE: 'effects:validate',
  IMPORT: 'effects:import',
  EXPORT: 'effects:export',
} as const

// ---- Window ----
export const WINDOW = {
  OPEN_CUE_EDITOR: 'open-cue-editor-window',
  OPEN_AUDIO_PREVIEW: 'open-audio-preview-window',
} as const

// ---- Shell ----
export const SHELL = {
  SHOW_ITEM_IN_FOLDER: 'shell:showItemInFolder',
  OPEN_PATH: 'shell:openPath',
  RUN_NODE_SCRIPT: 'shell:runNodeScript',
} as const

// ---- Cue / listeners ----
export const CUE = {
  DISABLE_YARG: 'disable-yarg',
  DISABLE_RB3: 'disable-rb3',
  RB3E_GET_MODE: 'rb3e-get-mode',
  RB3E_GET_STATS: 'rb3e-get-stats',
  GET_YARG_ENABLED: 'get-yarg-enabled',
  GET_RB3_ENABLED: 'get-rb3-enabled',
  YARG_LISTENER_ENABLED: 'yarg-listener-enabled',
  YARG_LISTENER_DISABLED: 'yarg-listener-disabled',
  RB3E_LISTENER_ENABLED: 'rb3e-listener-enabled',
  RB3E_LISTENER_DISABLED: 'rb3e-listener-disabled',
  RB3E_SWITCH_MODE: 'rb3e-switch-mode',
  SET_LISTEN_CUE_DATA: 'set-listen-cue-data',
  CUE_STYLE: 'cue-style',
  UPDATE_EFFECT_DEBOUNCE: 'update-effect-debounce',
  GET_EFFECT_DEBOUNCE: 'get-effect-debounce',
} as const

// ---- Light / senders / simulation ----
export const LIGHT = {
  SENDER_ENABLE: 'sender-enable',
  SENDER_DISABLE: 'sender-disable',
  SENDER_DISABLE_ALL: 'sender-disable-all',
  GET_SYSTEM_STATUS: 'get-system-status',
  GET_CUE_GROUPS: 'get-cue-groups',
  GET_ACTIVE_CUE_GROUPS: 'get-active-cue-groups',
  ACTIVATE_CUE_GROUP: 'activate-cue-group',
  DEACTIVATE_CUE_GROUP: 'deactivate-cue-group',
  ENABLE_CUE_GROUP: 'enable-cue-group',
  DISABLE_CUE_GROUP: 'disable-cue-group',
  SET_ACTIVE_CUE_GROUPS: 'set-active-cue-groups',
  GET_NETWORK_INTERFACES: 'get-network-interfaces',
  START_TEST_EFFECT: 'start-test-effect',
  STOP_TEST_EFFECT: 'stop-test-effect',
  SIMULATE_BEAT: 'simulate-beat',
  SIMULATE_KEYFRAME: 'simulate-keyframe',
  SIMULATE_MEASURE: 'simulate-measure',
  SIMULATE_INSTRUMENT_NOTE: 'simulate-instrument-note',
  GET_AVAILABLE_CUES: 'get-available-cues',
  GET_AVAILABLE_AUDIO_CUES: 'get-available-audio-cues',
  GET_AUDIO_CUE_GROUPS: 'get-audio-cue-groups',
  GET_CUE_SOURCE_GROUP: 'get-cue-source-group',
  SET_CUE_CONSISTENCY_WINDOW: 'set-cue-consistency-window',
  GET_CUE_CONSISTENCY_WINDOW: 'get-cue-consistency-window',
  GET_MOTION_CUE_MIN_HOLD_MS: 'get-motion-cue-min-hold-ms',
  SET_MOTION_CUE_MIN_HOLD_MS: 'set-motion-cue-min-hold-ms',
  SET_CUE_GROUP_SELECTION_MODE: 'set-cue-group-selection-mode',
  GET_CUE_GROUP_SELECTION_MODE: 'get-cue-group-selection-mode',
  GET_CONSISTENCY_STATUS: 'get-consistency-status',
  GET_YARG_MOTION_CUE_GROUPS: 'get-yarg-motion-cue-groups',
  GET_AUDIO_MOTION_CUE_GROUPS: 'get-audio-motion-cue-groups',
  GET_AVAILABLE_YARG_MOTION_CUES: 'get-available-yarg-motion-cues',
  GET_AVAILABLE_AUDIO_MOTION_CUES: 'get-available-audio-motion-cues',
  GET_YARG_MOTION_GROUP_SELECTION_MODE: 'get-yarg-motion-group-selection-mode',
  SET_YARG_MOTION_GROUP_SELECTION_MODE: 'set-yarg-motion-group-selection-mode',
  GET_AUDIO_MOTION_GROUP_SELECTION_MODE: 'get-audio-motion-group-selection-mode',
  SET_AUDIO_MOTION_GROUP_SELECTION_MODE: 'set-audio-motion-group-selection-mode',
  START_YARG_MOTION_CUE_SIMULATION: 'start-yarg-motion-cue-simulation',
  START_AUDIO_MOTION_CUE_SIMULATION: 'start-audio-motion-cue-simulation',
  STOP_MOTION_CUE_SIMULATION: 'stop-motion-cue-simulation',
  UPDATE_SACN_CONFIG: 'update-sacn-config',
  CONSOLE_ENABLE: 'console-enable',
  CONSOLE_DISABLE: 'console-disable',
  CONSOLE_SEND_DMX: 'console-send-dmx',
  CONSOLE_UPDATE_CHANNEL: 'console-update-channel',
  CONSOLE_SET_HOME: 'console-set-home',
  CONSOLE_SET_FIXTURE_CONFIG: 'console-set-fixture-config',
} as const

// ---- Config ----
export const CONFIG = {
  GET_LIGHT_LIBRARY: 'get-light-library',
  GET_MY_LIGHTS: 'get-my-lights',
  SAVE_MY_LIGHTS: 'save-my-lights',
  GET_LIGHT_LAYOUT: 'get-light-layout',
  SAVE_LIGHT_LAYOUT: 'save-light-layout',
  GET_DMX_RIGS: 'get-dmx-rigs',
  GET_DMX_RIG: 'get-dmx-rig',
  GET_ACTIVE_RIGS: 'get-active-rigs',
  SAVE_DMX_RIG: 'save-dmx-rig',
  DELETE_DMX_RIG: 'delete-dmx-rig',
  GET_APP_VERSION: 'get-app-version',
  GET_VALIDATION_ERRORS: 'get-validation-errors',
  GET_PREFS: 'get-prefs',
  SAVE_PREFS: 'save-prefs',
  GET_ENABLED_CUE_GROUPS: 'get-enabled-cue-groups',
  SET_ENABLED_CUE_GROUPS: 'set-enabled-cue-groups',
  GET_CLOCK_RATE: 'get-clock-rate',
  SET_CLOCK_RATE: 'set-clock-rate',
  GET_AUDIO_CONFIG: 'get-audio-config',
  SAVE_AUDIO_CONFIG: 'save-audio-config',
  GET_AUDIO_ENABLED: 'get-audio-enabled',
  SET_AUDIO_ENABLED: 'set-audio-enabled',
  GET_ENABLED_AUDIO_CUE_GROUPS: 'get-enabled-audio-cue-groups',
  SET_ENABLED_AUDIO_CUE_GROUPS: 'set-enabled-audio-cue-groups',
  GET_DISABLED_YARG_CUES: 'get-disabled-yarg-cues',
  SET_DISABLED_YARG_CUES: 'set-disabled-yarg-cues',
  GET_DISABLED_AUDIO_CUES: 'get-disabled-audio-cues',
  SET_DISABLED_AUDIO_CUES: 'set-disabled-audio-cues',
  GET_ENABLED_YARG_MOTION_CUE_GROUPS: 'get-enabled-yarg-motion-cue-groups',
  SET_ENABLED_YARG_MOTION_CUE_GROUPS: 'set-enabled-yarg-motion-cue-groups',
  GET_DISABLED_YARG_MOTION_CUES: 'get-disabled-yarg-motion-cues',
  SET_DISABLED_YARG_MOTION_CUES: 'set-disabled-yarg-motion-cues',
  GET_ENABLED_AUDIO_MOTION_CUE_GROUPS: 'get-enabled-audio-motion-cue-groups',
  SET_ENABLED_AUDIO_MOTION_CUE_GROUPS: 'set-enabled-audio-motion-cue-groups',
  GET_DISABLED_AUDIO_MOTION_CUES: 'get-disabled-audio-motion-cues',
  SET_DISABLED_AUDIO_MOTION_CUES: 'set-disabled-audio-motion-cues',
  GET_AUDIO_REACTIVE_CUES: 'get-audio-reactive-cues',
  SET_ACTIVE_AUDIO_CUE: 'set-active-audio-cue',
  GET_AUDIO_GAME_MODE: 'get-audio-game-mode',
  SET_AUDIO_GAME_MODE: 'set-audio-game-mode',
  GET_MOTION_ENABLED: 'get-motion-enabled',
  SET_MOTION_ENABLED: 'set-motion-enabled',
  GET_ACTIVE_AUDIO_MOTION_CUE: 'get-active-audio-motion-cue',
  SET_ACTIVE_AUDIO_MOTION_CUE: 'set-active-audio-motion-cue',
  GET_ACTIVE_YARG_MOTION_CUE: 'get-active-yarg-motion-cue',
  SET_ACTIVE_YARG_MOTION_CUE: 'set-active-yarg-motion-cue',
  GET_STAGE_KIT_PRIORITY: 'get-stage-kit-priority',
  SET_STAGE_KIT_PRIORITY: 'set-stage-kit-priority',
} as const

/** All handle/invoke channel names in one object for lookup. */
export const CHANNELS = {
  ...NODE_CUES,
  ...EFFECTS,
  ...WINDOW,
  ...SHELL,
  ...CUE,
  ...LIGHT,
  ...CONFIG,
} as const

export type ChannelName = (typeof CHANNELS)[keyof typeof CHANNELS]

/** Main process -> renderer (one-way send). Use when main calls webContents.send(). */
export const RENDERER_RECEIVE = {
  SENDER_START_FAILED: 'sender-start-failed',
  SENDER_ERROR: 'sender-error',
  SENDER_NETWORK_ERROR: 'sender-network-error',
  YARG_ERROR: 'yarg-error',
  CONTROLLERS_RESTARTED: 'controllers-restarted',
  AUDIO_ENABLE: 'audio:enable',
  AUDIO_DISABLE: 'audio:disable',
  /** Broadcast after SET_AUDIO_ENABLED so all windows sync Enable Audio UI. */
  AUDIO_ENABLED_CHANGED: 'audio:enabled-changed',
  AUDIO_CONFIG_UPDATE: 'audio:config-update',
  AUDIO_GAME_MODE_UPDATE: 'audio:game-mode-update',
  /** Enabled audio cue groups or per-cue disables changed (Preferences → all windows). */
  AUDIO_CUE_GROUPS_CHANGED: 'audio:cue-groups-changed',
  /** YARG motion enabled groups or per-cue disables changed (Preferences → all windows). */
  YARG_MOTION_CUE_GROUPS_CHANGED: 'yarg-motion:cue-groups-changed',
  /** Audio motion enabled groups or per-cue disables changed (Preferences → all windows). */
  AUDIO_MOTION_CUE_GROUPS_CHANGED: 'audio-motion:cue-groups-changed',
  /** Global motion master toggle changed (YARG + audio motion handlers). */
  MOTION_ENABLED_CHANGED: 'motion:enabled-changed',
  /** Active audio motion program changed (manual/auto selection result). */
  AUDIO_MOTION_CUE_CHANGE: 'audio-motion:cue-active-change',
  /** Active YARG motion program changed (manual/auto selection result). */
  YARG_MOTION_CUE_CHANGE: 'yarg-motion:cue-active-change',
  /** Game Mode primary cue changed (main process → renderer). */
  AUDIO_GAME_MODE_CUE_CHANGE: 'audio:game-mode-cue-change',
  /** Strobe cue firing state (main process → renderer, on transitions). */
  AUDIO_STROBE_STATE: 'audio:strobe-state',
  /** Mirrored AudioLightingData for Audio Preview window (main process → single target window). */
  AUDIO_DATA_MIRROR: 'audio:data-mirror',
  CUE_STATE_UPDATE: 'cue-state-update',
  DMX_VALUES: 'dmx-values',
  CUE_HANDLED: 'cue-handled',
  NODE_CUES_CHANGED: 'node-cues:changed',
  EFFECTS_CHANGED: 'effects:changed',
  DEBUG_LOG: 'node-cues:debug-log',
  NODE_EXECUTION: 'node-cues:node-execution',
  NODE_CUE_RUNTIME_ERROR: 'node-cue:runtime-error',
} as const

export type RendererReceiveChannel = (typeof RENDERER_RECEIVE)[keyof typeof RENDERER_RECEIVE]

/** Renderer -> main (main process listens). Use when main calls ipcMain.on(). */
export const RENDERER_SEND = {
  AUDIO_DATA: 'audio:data',
} as const
