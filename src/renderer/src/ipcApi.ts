/**
 * IPC API utility for renderer process
 */

// Cue consistency window management
export const setCueConsistencyWindow = (windowMs: number) => 
  window.electron.ipcRenderer.invoke('set-cue-consistency-window', windowMs);

export const getCueConsistencyWindow = () => 
  window.electron.ipcRenderer.invoke('get-cue-consistency-window');

export const getConsistencyStatus = () => 
  window.electron.ipcRenderer.invoke('get-consistency-status');

// Cue groups management
export const getCueGroups = () => 
  window.electron.ipcRenderer.invoke('get-cue-groups');

export const getEnabledCueGroups = () => 
  window.electron.ipcRenderer.invoke('get-enabled-cue-groups');

export const setEnabledCueGroups = (groupIds: string[]) => 
  window.electron.ipcRenderer.invoke('set-enabled-cue-groups', groupIds);

export const getActiveCueGroups = () => 
  window.electron.ipcRenderer.invoke('get-active-cue-groups');

export const setActiveCueGroups = (groupIds: string[]) => 
  window.electron.ipcRenderer.invoke('set-active-cue-groups', groupIds);

// Cue source group information
export const getCueSourceGroup = (cueType: string) => 
  window.electron.ipcRenderer.invoke('get-cue-source-group', cueType);

// Available cues
export const getAvailableCues = (groupId: string) => 
  window.electron.ipcRenderer.invoke('get-available-cues', groupId);

// Light management
export const getLightLibrary = () => 
  window.electron.ipcRenderer.invoke('get-light-library');

export const getMyLights = () => 
  window.electron.ipcRenderer.invoke('get-my-lights');

export const saveMyLights = (data: any) => 
  window.electron.ipcRenderer.send('save-my-lights', data);

export const getLightLayout = (filename: string) => 
  window.electron.ipcRenderer.invoke('get-light-layout', filename);

export const saveLightLayout = (filename: string, data: any) => 
  window.electron.ipcRenderer.invoke('save-light-layout', filename, data);

// Preferences
export const getPrefs = () => 
  window.electron.ipcRenderer.invoke('get-prefs');

export const savePrefs = (updates: any) => 
  window.electron.ipcRenderer.invoke('save-prefs', updates);

// App information
export const getAppVersion = () => 
  window.electron.ipcRenderer.invoke('get-app-version');

// System status
export const getSystemStatus = () => 
  window.electron.ipcRenderer.invoke('get-system-status');

// RB3 specific
export const getRb3Mode = () => 
  window.electron.ipcRenderer.invoke('rb3e-get-mode');

export const getRb3Stats = () => 
  window.electron.ipcRenderer.invoke('rb3e-get-stats');

// Sender management
export const enableSender = (config: any) => 
  window.electron.ipcRenderer.send('sender-enable', config);

export const disableSender = (config: any) => 
  window.electron.ipcRenderer.send('sender-disable', config);

// Listener management
export const enableYarg = () => 
  window.electron.ipcRenderer.send('yarg-listener-enabled');

export const disableYarg = () => 
  window.electron.ipcRenderer.send('yarg-listener-disabled');

export const enableRb3 = () => 
  window.electron.ipcRenderer.send('rb3e-listener-enabled');

export const disableRb3 = () => 
  window.electron.ipcRenderer.send('rb3e-listener-disabled');

export const switchRb3Mode = (mode: 'direct' | 'cueBased') => 
  window.electron.ipcRenderer.send('rb3e-switch-mode', mode);

// Effect management
export const getEffectDebounce = () => 
  window.electron.ipcRenderer.invoke('get-effect-debounce');

export const updateEffectDebounce = (value: number) => 
  window.electron.ipcRenderer.send('update-effect-debounce', value);

// Test effects
export const startTestEffect = (effectId: string, venueSize?: 'NoVenue' | 'Small' | 'Large') => 
  window.electron.ipcRenderer.invoke('start-test-effect', effectId, venueSize);

export const stopTestEffect = () => 
  window.electron.ipcRenderer.invoke('stop-test-effect');
