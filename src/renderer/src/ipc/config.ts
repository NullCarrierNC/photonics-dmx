/**
 * Light library, layout, preferences and rigs.
 *
 * The getters answer with a bare value, so a refusal from main becomes a throw here.
 */
import type {
  AppPreferences,
  DmxFixture,
  DmxRig,
  LightingConfiguration,
} from '../../../shared/ipcTypes'
import { CONFIG, RIGS } from '../../../shared/ipcChannels'
import { orThrow } from './ipcResult'

// ---------------------------------------------------------------------------
// Light management
// ---------------------------------------------------------------------------

export const getLightLibrary = () =>
  window.api.invoke(CONFIG.GET_LIGHT_LIBRARY, undefined).then(orThrow)

export const getMyLights = () => window.api.invoke(CONFIG.GET_MY_LIGHTS, undefined).then(orThrow)

export const saveMyLights = (data: DmxFixture[]) => window.api.invoke(CONFIG.SAVE_MY_LIGHTS, data)

export const getLightLayout = () =>
  window.api.invoke(CONFIG.GET_LIGHT_LAYOUT, undefined).then(orThrow)

export const saveLightLayout = (data: LightingConfiguration) =>
  window.api.invoke(CONFIG.SAVE_LIGHT_LAYOUT, data)

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

export const getPrefs = () => window.api.invoke(CONFIG.GET_PREFS, undefined).then(orThrow)

export const savePrefs = (updates: Partial<AppPreferences>) =>
  window.api.invoke(CONFIG.SAVE_PREFS, updates)

// ---------------------------------------------------------------------------
// DMX rigs
// ---------------------------------------------------------------------------

export const getDmxRigs = () => window.api.invoke(CONFIG.GET_DMX_RIGS, undefined).then(orThrow)

export const getDmxRig = (id: string) => window.api.invoke(CONFIG.GET_DMX_RIG, id).then(orThrow)

export const getActiveRigs = () =>
  window.api.invoke(CONFIG.GET_ACTIVE_RIGS, undefined).then(orThrow)

export const saveDmxRig = (rig: DmxRig) => window.api.invoke(CONFIG.SAVE_DMX_RIG, rig)

export const deleteDmxRig = (id: string) => window.api.invoke(CONFIG.DELETE_DMX_RIG, id)

/** Build a self-contained rig export file (rig + referenced templates) and write it via a save dialog. */
export const exportRig = (rigId: string) => window.api.invoke(RIGS.EXPORT, rigId)

/** Open a rig export file via a file dialog, returning the parsed rig + templates without committing. */
export const pickRigImportFile = () => window.api.invoke(RIGS.IMPORT_PICK, undefined)
