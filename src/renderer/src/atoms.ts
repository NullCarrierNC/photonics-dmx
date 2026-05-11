import { atom, getDefaultStore } from 'jotai'
import { atomFamily, atomWithStorage, createJSONStorage } from 'jotai/utils'
import type { CueDomain, CueDomainPrefs } from '../../services/configuration/cueDomainTypes'
import {
  DmxFixture,
  LightingConfiguration,
  DmxRig,
  normalizeFixtureConfig,
} from '../../photonics-dmx/types'
import type { AudioLightingData } from '../../photonics-dmx/listeners/Audio/AudioTypes'
import { AudioCueType } from '../../photonics-dmx/cues/types/audioCueTypes'
import { Pages } from './types'
import {
  clampDmxOutputRefreshRateHz,
  DMX_OUTPUT_REFRESH_RATE_HZ_DEFAULT,
} from '../../shared/dmxOutputRefresh'

/**
 * Atom for tracking current page in navigation
 */
export const currentPageAtom = atom<Pages>(Pages.Status)

/**
 * Atom for storing available DmxLight fixture types
 */
export const dmxLightsLibraryAtom = atom<DmxFixture[]>([])

/**
 * Atom for storing user's configured DmxLights
 */
export const myDmxLightsAtom = atom<DmxFixture[]>([])

export const dmxLightTypesAtom = atom((get) =>
  get(dmxLightsLibraryAtom).map((DmxLight) => ({
    DmxLightType: DmxLight.fixture,
    label: DmxLight.label,
  })),
)

// Derived atom to sort MyDmxLightsAtom in descending alphabetical order by name
export const sortedMyDmxLightsAtom = atom((get) =>
  [...get(myDmxLightsAtom)].sort((a, b) => a.name.localeCompare(b.name)),
)

export const myValidDmxLightsAtom = atom((get) => {
  // Get the list of DmxLights from myDmxLightsAtom
  const myDmxLights = get(myDmxLightsAtom)

  // Filter DmxLights that have all channel values greater than 0
  const validDmxLights = myDmxLights.filter((DmxLight: DmxFixture) => {
    const { channels } = DmxLight

    // Check if all channel values in the channels object are greater than 0
    const areChannelsValid = Object.values(channels).every((value) => value > 0)

    // Include configChannels if they exist and ensure their values are valid
    if (DmxLight.config) {
      const cfg = normalizeFixtureConfig(DmxLight.config)
      const areConfigChannelsValid =
        cfg.panHome >= 0 && cfg.panHome <= 100 && cfg.tiltHome >= 0 && cfg.tiltHome <= 100

      return areChannelsValid && areConfigChannelsValid
    }

    return areChannelsValid
  })

  // Sort the filtered list alphabetically by DmxLight name
  return validDmxLights.sort((a, b) => a.name.localeCompare(b.name))
})

export const activeDmxLightsConfigAtom = atom<LightingConfiguration | null>(null)

/**
 * True while the Light Layout page has unsaved edits (drives leave navigation / beforeunload).
 */
export const lightsLayoutHasUnsavedChangesAtom = atom(false)

export type ConfirmRequest = {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  resolve: (ok: boolean) => void
}

/**
 * When set, `ConfirmModalHost` shows a global confirmation dialog.
 */
export const confirmRequestAtom = atom<ConfirmRequest | null>(null)

/**
 * Atom for storing all DMX rigs
 */
export const dmxRigsAtom = atom<DmxRig[]>([])

/**
 * Atom for tracking the currently selected rig ID for editing
 */
export const activeRigIdAtom = atom<string | null>(null)

const LAST_USED_RIG_STORAGE_KEY = 'photonics.dmx.lastUsedRigId'

const rigIdLocalStorage = createJSONStorage<string | null>(() => localStorage)

/**
 * Picks `current` if it appears in `orderedIds`, otherwise the first id, or null if the list is empty.
 */
export function resolveLastUsedRigId(
  current: string | null,
  orderedIds: readonly string[],
): string | null {
  if (orderedIds.length === 0) {
    return null
  }
  if (current != null && orderedIds.includes(current)) {
    return current
  }
  return orderedIds[0]
}

/**
 * Selected rig ID for DMX Preview, Cue Simulation, and DMX Console.
 * Persisted in localStorage; validate against loaded rig lists (active vs all) in those UIs.
 */
export const previewRigIdAtom = atomWithStorage<string | null>(
  LAST_USED_RIG_STORAGE_KEY,
  null,
  rigIdLocalStorage,
)

const PREVIEW_DIMENSION_STORAGE_KEY = 'photonics.dmx.previewDimension'

const previewDimensionLocalStorage = createJSONStorage<'2d' | '3d'>(() => localStorage)

/**
 * DMX preview card: 2D disc vs 3D stage. Persisted so the choice survives navigation and app restarts.
 */
export const dmxPreviewDimensionAtom = atomWithStorage<'2d' | '3d'>(
  PREVIEW_DIMENSION_STORAGE_KEY,
  '2d',
  previewDimensionLocalStorage,
)

/**
 * Atom for last-known DMX values (channel -> value).
 * Persists across page navigation so persistent cues (e.g. YARG menu) remain visible in preview.
 */
export const dmxValuesAtom = atom<Record<number, number>>({})

export const senderSacnEnabledAtom = atom<boolean>(false)

export const senderIpcEnabledAtom = atom<boolean>(false)

export const yargListenerEnabledAtom = atom<boolean>(false)

export const rb3eListenerEnabledAtom = atom<boolean>(false)

export const audioListenerEnabledAtom = atom<boolean>(false)

/**
 * Atom for storing live audio analysis data
 * Updated by AudioCaptureManager, consumed by CuePreviewAudio
 */
export const audioDataAtom = atom<AudioLightingData | null>(null)

export const isSenderErrorAtom = atom<boolean>(false)
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- error message or serialized error
export const senderErrorAtom = atom<any>('')

export const effectDebounceTimeAtom = atom<number>(1600)

export const senderEnttecProEnabledAtom = atom<boolean>(false)
export const enttecProComPortAtom = atom<string>('')
export const senderOpenDmxEnabledAtom = atom<boolean>(false)
export const openDmxComPortAtom = atom<string>('')

export const senderArtNetEnabledAtom = atom<boolean>(false)

/** Maps main-process sender IDs (`getEnabledSenders` / `SENDER_DISABLE_ALL`) to toggle atoms. Excludes `ipc` (preview only). */
const OUTPUT_SENDER_TOGGLE_ATOMS: Record<string, typeof senderSacnEnabledAtom> = {
  sacn: senderSacnEnabledAtom,
  artnet: senderArtNetEnabledAtom,
  enttecpro: senderEnttecProEnabledAtom,
  opendmx: senderOpenDmxEnabledAtom,
}

/** Sync UI toggles after those senders were stopped on the main process (e.g. leaving DMX Console). */
export function resetOutputSenderToggleAtoms(disabledIds: readonly string[]): void {
  const store = getDefaultStore()
  for (const id of disabledIds) {
    const a = OUTPUT_SENDER_TOGGLE_ATOMS[id]
    if (a) {
      store.set(a, false)
    }
  }
}

/**
 * Sync all output sender toggle atoms from a main-process sender status snapshot.
 * Call this after CONTROLLERS_RESTARTED so that the UI reflects the actual runtime
 * sender state (which may have been auto-restored from persisted preferences).
 */
export function syncOutputSenderAtoms(senderStatus: {
  sacn: boolean
  artnet: boolean
  enttecpro: boolean
  ipc: boolean
}): void {
  const store = getDefaultStore()
  store.set(senderSacnEnabledAtom, senderStatus.sacn)
  store.set(senderArtNetEnabledAtom, senderStatus.artnet)
  store.set(senderEnttecProEnabledAtom, senderStatus.enttecpro)
}

// ArtNet config derived from preferences with fallback defaults
export const artNetConfigAtom = atom((get) => {
  const prefs = get(lightingPrefsAtom)
  const rawHz = prefs.artNetConfig?.refreshRateHz
  const refreshRateHz =
    typeof rawHz === 'number' && Number.isFinite(rawHz)
      ? clampDmxOutputRefreshRateHz(rawHz)
      : DMX_OUTPUT_REFRESH_RATE_HZ_DEFAULT
  return {
    host: prefs.artNetConfig?.host || '127.0.0.1',
    universe: prefs.artNetConfig?.universe || 0,
    net: prefs.artNetConfig?.net || 0,
    subnet: prefs.artNetConfig?.subnet || 0,
    subuni: prefs.artNetConfig?.subuni || 0,
    port: prefs.artNetConfig?.port || 6454,
    refreshRateHz,
  }
})

// sACN config derived from preferences with fallback defaults
export const sacnConfigAtom = atom((get) => {
  const prefs = get(lightingPrefsAtom)
  const rawHz = prefs.sacnConfig?.refreshRateHz
  const refreshRateHz =
    typeof rawHz === 'number' && Number.isFinite(rawHz)
      ? clampDmxOutputRefreshRateHz(rawHz)
      : DMX_OUTPUT_REFRESH_RATE_HZ_DEFAULT
  return {
    universe: prefs.sacnConfig?.universe ?? 1,
    networkInterface: prefs.sacnConfig?.networkInterface || '',
    unicastDestination: prefs.sacnConfig?.unicastDestination || '',
    useUnicast: prefs.sacnConfig?.useUnicast || false,
    refreshRateHz,
  }
})

/**
 * Interface for lighting preferences stored in the frontend
 * This extends the backend AppPreferences with frontend-specific properties
 */
export interface LightingPreferences {
  // Backend preferences
  effectDebounce?: number
  complex?: boolean
  enttecProConfig?: {
    port: string
  }
  openDmxConfig?: {
    port: string
    dmxSpeed: number
  }
  artNetConfig?: {
    host: string
    universe: number
    net: number
    subnet: number
    subuni: number
    port: number
    refreshRateHz?: number
  }
  sacnConfig?: {
    universe: number
    networkInterface?: string
    unicastDestination?: string
    useUnicast: boolean
    refreshRateHz?: number
  }
  brightness?: {
    low: number
    medium: number
    high: number
    max: number
  }
  cueDomains?: Record<CueDomain, CueDomainPrefs>
  activeAudioCueType?: AudioCueType
  cueConsistencyWindow?: number
  allowMultipleActiveRigs?: boolean
  advancedModeEnabled?: boolean

  // Frontend-specific preferences
  dmxOutputConfig?: {
    sacnEnabled: boolean
    artNetEnabled: boolean
    enttecProEnabled: boolean
    openDmxEnabled: boolean
  }
  stageKitPrefs?: {
    yargPriority: 'prefer-for-tracked' | 'random' | 'never'
  }
  dmxSettingsPrefs?: {
    artNetExpanded: boolean
    enttecProExpanded: boolean
    sacnExpanded: boolean
    openDmxExpanded: boolean
  }
  audioConfig?: {
    deviceId?: number | string
    sampleRate?: number
    fftSize: number
    updateIntervalMs?: number
    sensitivity: number
    noiseFloor?: number
    bands?: Array<{
      id: string
      name: string
      minHz: number
      maxHz: number
      gain: number
    }>
    beatDetection: {
      threshold: number
      decayRate: number
      minInterval: number
    }
    smoothing: {
      enabled: boolean
      alpha: number
    }
    enabled: boolean
    linearResponse?: boolean
    strobeEnabled?: boolean
    strobeTriggerThreshold?: number
    strobeProbability?: number
  }
}

export const lightingPrefsAtom = atom<LightingPreferences>({})

/**
 * Per-domain slice of `cueDomains` from loaded preferences (read-only; updates go through savePrefs or IPC).
 */
export const prefsCueDomainAtom = atomFamily((domain: CueDomain) =>
  atom((get) => get(lightingPrefsAtom).cueDomains?.[domain]),
)

export const useComplexCuesAtom = atom<boolean>(false)

/**
 * When true, show node IDs in the Cue Editor graph and Selected Node inspector.
 */
export const showNodeIdsAtom = atom<boolean>(false)

// Audio configuration atoms
export const audioConfigAtom = atom((get) => {
  const prefs = get(lightingPrefsAtom)
  return prefs.audioConfig
})

export const audioDevicesAtom = atom<Array<{ deviceId: number; label: string }>>([])

export const audioEnabledAtom = atom((get) => {
  const config = get(audioConfigAtom)
  return config?.enabled || false
})

/**
 * Atoms for tracking current cue state (pushed from backend)
 */
export interface CueStateInfo {
  cueType: string | null
  groupId: string | null
  groupName: string | null
  isFallback: boolean
  cueStyle: 'primary' | 'secondary' | null
  counter: number
  limit: number
}

export const currentCueStateAtom = atom<CueStateInfo>({
  cueType: null,
  groupId: null,
  groupName: null,
  isFallback: false,
  cueStyle: null,
  counter: 0,
  limit: 0,
})
