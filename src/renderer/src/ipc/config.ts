/**
 * Light library, layout, preferences and rigs.
 */
import type {
  AppPreferences,
  DmxFixture,
  DmxRig,
  LightingConfiguration,
} from '../../../shared/ipcTypes'
import { CONFIG, RIGS } from '../../../shared/ipcChannels'

// ---------------------------------------------------------------------------
// Light management
// ---------------------------------------------------------------------------

export const getLightLibrary = () => window.api.invoke(CONFIG.GET_LIGHT_LIBRARY, undefined)

export const getMyLights = () => window.api.invoke(CONFIG.GET_MY_LIGHTS, undefined)

export const saveMyLights = (data: DmxFixture[]) => window.api.invoke(CONFIG.SAVE_MY_LIGHTS, data)

export const getLightLayout = () => window.api.invoke(CONFIG.GET_LIGHT_LAYOUT, undefined)

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

/** Build a self-contained rig export file (rig + referenced templates) and write it via a save dialog. */
export const exportRig = (rigId: string) => window.api.invoke(RIGS.EXPORT, rigId)

/** Open a rig export file via a file dialog, returning the parsed rig + templates without committing. */
export const pickRigImportFile = () => window.api.invoke(RIGS.IMPORT_PICK, undefined)
