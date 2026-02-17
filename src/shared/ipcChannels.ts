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
} as const;

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
} as const;

// ---- Window ----
export const WINDOW = {
  OPEN_CUE_EDITOR: 'open-cue-editor-window',
} as const;

// ---- Shell ----
export const SHELL = {
  SHOW_ITEM_IN_FOLDER: 'shell:showItemInFolder',
  OPEN_PATH: 'shell:openPath',
} as const;

// ---- Cue / listeners ----
export const CUE = {
  DISABLE_YARG: 'disable-yarg',
  DISABLE_RB3: 'disable-rb3',
  RB3E_GET_MODE: 'rb3e-get-mode',
  RB3E_GET_STATS: 'rb3e-get-stats',
  GET_YARG_ENABLED: 'get-yarg-enabled',
  GET_RB3_ENABLED: 'get-rb3-enabled',
} as const;

// ---- Light / senders / simulation ----
export const LIGHT = {
  SENDER_ENABLE: 'sender-enable',
  SENDER_DISABLE: 'sender-disable',
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
} as const;

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
} as const;

/** All handle/invoke channel names in one object for lookup. */
export const CHANNELS = {
  ...NODE_CUES,
  ...EFFECTS,
  ...WINDOW,
  ...SHELL,
  ...CUE,
  ...LIGHT,
  ...CONFIG,
} as const;

export type ChannelName = (typeof CHANNELS)[keyof typeof CHANNELS];
