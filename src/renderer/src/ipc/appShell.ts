/**
 * App shell calls: lifecycle, windows, app info, system status and the OS shell.
 */
import { CONFIG, LIFECYCLE, LIGHT, SHELL, WINDOW } from '../../../shared/ipcChannels'
import { orThrow } from './ipcResult'

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export const getLifecyclePhase = () =>
  window.api.invoke(LIFECYCLE.GET_PHASE, undefined).then(orThrow)

export const retryControllerInit = () => window.api.invoke(LIFECYCLE.RETRY_INIT, undefined)

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
// Shell
// ---------------------------------------------------------------------------

export const showItemInFolder = (filePath: string) =>
  window.api.invoke(SHELL.SHOW_ITEM_IN_FOLDER, filePath)

export const openPath = (filePath: string) => window.api.invoke(SHELL.OPEN_PATH, filePath)
