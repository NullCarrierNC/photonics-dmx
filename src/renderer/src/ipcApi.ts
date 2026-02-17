/**
 * IPC API utility for renderer process
 */

import { NODE_CUES, EFFECTS, WINDOW, LIGHT, CONFIG, CUE } from '../../shared/ipcChannels';

// Cue consistency window management
export const setCueConsistencyWindow = (windowMs: number) =>
  window.electron.ipcRenderer.invoke(LIGHT.SET_CUE_CONSISTENCY_WINDOW, windowMs);

export const getCueConsistencyWindow = () =>
  window.electron.ipcRenderer.invoke(LIGHT.GET_CUE_CONSISTENCY_WINDOW);

export const getConsistencyStatus = () =>
  window.electron.ipcRenderer.invoke(LIGHT.GET_CONSISTENCY_STATUS);

// Cue groups management
export const getCueGroups = () =>
  window.electron.ipcRenderer.invoke(LIGHT.GET_CUE_GROUPS);

export const getEnabledCueGroups = () =>
  window.electron.ipcRenderer.invoke(CONFIG.GET_ENABLED_CUE_GROUPS);

export const setEnabledCueGroups = (groupIds: string[]) =>
  window.electron.ipcRenderer.invoke(CONFIG.SET_ENABLED_CUE_GROUPS, groupIds);

export const getActiveCueGroups = () =>
  window.electron.ipcRenderer.invoke(LIGHT.GET_ACTIVE_CUE_GROUPS);

export const setActiveCueGroups = (groupIds: string[]) =>
  window.electron.ipcRenderer.invoke(LIGHT.SET_ACTIVE_CUE_GROUPS, groupIds);

// Cue source group information
export const getCueSourceGroup = (cueType: string) =>
  window.electron.ipcRenderer.invoke(LIGHT.GET_CUE_SOURCE_GROUP, cueType);

// Available cues
export const getAvailableCues = (groupId: string) =>
  window.electron.ipcRenderer.invoke(LIGHT.GET_AVAILABLE_CUES, groupId);

// Light management
export const getLightLibrary = () =>
  window.electron.ipcRenderer.invoke(CONFIG.GET_LIGHT_LIBRARY);

export const getMyLights = () =>
  window.electron.ipcRenderer.invoke(CONFIG.GET_MY_LIGHTS);

export const saveMyLights = (data: unknown) =>
  window.electron.ipcRenderer.send(CONFIG.SAVE_MY_LIGHTS, data);

export const getLightLayout = (filename: string) =>
  window.electron.ipcRenderer.invoke(CONFIG.GET_LIGHT_LAYOUT, filename);

export const saveLightLayout = (filename: string, data: unknown) =>
  window.electron.ipcRenderer.invoke(CONFIG.SAVE_LIGHT_LAYOUT, filename, data);

// Preferences
export const getPrefs = () =>
  window.electron.ipcRenderer.invoke(CONFIG.GET_PREFS);

export const savePrefs = (updates: unknown) =>
  window.electron.ipcRenderer.invoke(CONFIG.SAVE_PREFS, updates);

// Window management
export const openCueEditorWindow = () =>
  window.electron.ipcRenderer.invoke(WINDOW.OPEN_CUE_EDITOR);

// App information
export const getAppVersion = () =>
  window.electron.ipcRenderer.invoke(CONFIG.GET_APP_VERSION);

// System status
export const getSystemStatus = () =>
  window.electron.ipcRenderer.invoke(LIGHT.GET_SYSTEM_STATUS);

// RB3 specific
export const getRb3Mode = () =>
  window.electron.ipcRenderer.invoke(CUE.RB3E_GET_MODE);

export const getRb3Stats = () =>
  window.electron.ipcRenderer.invoke(CUE.RB3E_GET_STATS);

// Sender management
export const enableSender = (config: unknown) =>
  window.electron.ipcRenderer.send(LIGHT.SENDER_ENABLE, config);

export const disableSender = (config: { sender: string }) =>
  window.electron.ipcRenderer.send(LIGHT.SENDER_DISABLE, config);

// Listener management
export const enableYarg = () =>
  window.electron.ipcRenderer.send(CUE.YARG_LISTENER_ENABLED);

export const disableYarg = () =>
  window.electron.ipcRenderer.send(CUE.YARG_LISTENER_DISABLED);

export const enableRb3 = () =>
  window.electron.ipcRenderer.send(CUE.RB3E_LISTENER_ENABLED);

export const disableRb3 = () =>
  window.electron.ipcRenderer.send(CUE.RB3E_LISTENER_DISABLED);

export const switchRb3Mode = (mode: 'direct' | 'cueBased') =>
  window.electron.ipcRenderer.send(CUE.RB3E_SWITCH_MODE, mode);

// Effect management
export const getEffectDebounce = () =>
  window.electron.ipcRenderer.invoke(CUE.GET_EFFECT_DEBOUNCE);

export const updateEffectDebounce = (value: number) =>
  window.electron.ipcRenderer.send(CUE.UPDATE_EFFECT_DEBOUNCE, value);

// Test effects
export const startTestEffect = (effectId: string, venueSize?: 'NoVenue' | 'Small' | 'Large', bpm?: number) =>
  window.electron.ipcRenderer.invoke(LIGHT.START_TEST_EFFECT, effectId, venueSize, bpm);

export const stopTestEffect = () =>
  window.electron.ipcRenderer.invoke(LIGHT.STOP_TEST_EFFECT);

export const setNodeCueDebug = (enabled: boolean) =>
  window.electron.ipcRenderer.invoke(NODE_CUES.SET_DEBUG, enabled);

// Node cue management
export const listNodeCueFiles = () =>
  window.electron.ipcRenderer.invoke(NODE_CUES.LIST);

export const reloadNodeCueFiles = () =>
  window.electron.ipcRenderer.invoke(NODE_CUES.RELOAD);

export const readNodeCueFile = (filePath: string) =>
  window.electron.ipcRenderer.invoke(NODE_CUES.READ, filePath);

export const saveNodeCueFile = (payload: { mode: 'yarg' | 'audio'; filename: string; content: unknown }) =>
  window.electron.ipcRenderer.invoke(NODE_CUES.SAVE, payload);

export const deleteNodeCueFile = (filePath: string) =>
  window.electron.ipcRenderer.invoke(NODE_CUES.DELETE, filePath);

export const validateNodeCue = (payload: { path?: string; content?: unknown }) =>
  window.electron.ipcRenderer.invoke(NODE_CUES.VALIDATE, payload);

export const getNodeCueTypes = (mode: 'yarg' | 'audio') =>
  window.electron.ipcRenderer.invoke(NODE_CUES.GET_CUE_TYPES, mode);

export const importNodeCueFile = (mode?: 'yarg' | 'audio') =>
  window.electron.ipcRenderer.invoke(NODE_CUES.IMPORT, mode);

export const exportNodeCueFile = (filePath: string) =>
  window.electron.ipcRenderer.invoke(NODE_CUES.EXPORT, filePath);

// Effect file management
export const listEffectFiles = () =>
  window.electron.ipcRenderer.invoke(EFFECTS.LIST);

export const reloadEffectFiles = () =>
  window.electron.ipcRenderer.invoke(EFFECTS.RELOAD);

export const readEffectFile = (filePath: string) =>
  window.electron.ipcRenderer.invoke(EFFECTS.READ, filePath);

export const saveEffectFile = (payload: { mode: 'yarg' | 'audio'; filename: string; content: unknown }) =>
  window.electron.ipcRenderer.invoke(EFFECTS.SAVE, payload);

export const deleteEffectFile = (filePath: string) =>
  window.electron.ipcRenderer.invoke(EFFECTS.DELETE, filePath);

export const validateEffect = (payload: { path?: string; content?: unknown }) =>
  window.electron.ipcRenderer.invoke(EFFECTS.VALIDATE, payload);

export const importEffectFile = (mode?: 'yarg' | 'audio') =>
  window.electron.ipcRenderer.invoke(EFFECTS.IMPORT, mode);

export const exportEffectFile = (filePath: string) =>
  window.electron.ipcRenderer.invoke(EFFECTS.EXPORT, filePath);

