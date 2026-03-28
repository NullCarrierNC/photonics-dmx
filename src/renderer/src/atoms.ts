import { atom } from 'jotai'
import { DmxFixture, LightingConfiguration, DmxRig } from '../../photonics-dmx/types'
import type { AudioLightingData } from '../../photonics-dmx/listeners/Audio/AudioTypes'
import { AudioCueType } from '../../photonics-dmx/cues/types/audioCueTypes'
import { Pages } from './types'

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
      const { panHome, panMin, panMax, tiltHome, tiltMin, tiltMax } = DmxLight.config
      const areConfigChannelsValid =
        panHome >= panMin && panHome <= panMax && tiltHome >= tiltMin && tiltHome <= tiltMax

      return areChannelsValid && areConfigChannelsValid
    }

    return areChannelsValid
  })

  // Sort the filtered list alphabetically by DmxLight name
  return validDmxLights.sort((a, b) => a.name.localeCompare(b.name))
})

export const activeDmxLightsConfigAtom = atom<LightingConfiguration | null>(null)

/**
 * Atom for storing all DMX rigs
 */
export const dmxRigsAtom = atom<DmxRig[]>([])

/**
 * Atom for tracking the currently selected rig ID for editing
 */
export const activeRigIdAtom = atom<string | null>(null)

/**
 * Atom for the selected rig ID on DMX Preview / Cue Simulation pages.
 * Shared across pages so selection persists when navigating between them.
 */
export const previewRigIdAtom = atom<string | null>(null)

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

/**
 * Live Monitor toggle in Cue Editor (audio mode).
 * When true, the Cue Editor window captures audio and sends it to the main process
 * so trigger nodes can be evaluated in real time.
 */
export const liveMonitorEnabledAtom = atom<boolean>(false)

export const isSenderErrorAtom = atom<boolean>(false)
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- error message or serialized error
export const senderErrorAtom = atom<any>('')

export const effectDebounceTimeAtom = atom<number>(1600)

export const senderEnttecProEnabledAtom = atom<boolean>(false)
export const enttecProComPortAtom = atom<string>('')
export const senderOpenDmxEnabledAtom = atom<boolean>(false)
export const openDmxComPortAtom = atom<string>('')

export const senderArtNetEnabledAtom = atom<boolean>(false)

// ArtNet config derived from preferences with fallback defaults
export const artNetConfigAtom = atom((get) => {
  const prefs = get(lightingPrefsAtom)
  return {
    host: prefs.artNetConfig?.host || '127.0.0.1',
    universe: prefs.artNetConfig?.universe || 0,
    net: prefs.artNetConfig?.net || 0,
    subnet: prefs.artNetConfig?.subnet || 0,
    subuni: prefs.artNetConfig?.subuni || 0,
    port: prefs.artNetConfig?.port || 6454,
  }
})

// sACN config derived from preferences with fallback defaults
export const sacnConfigAtom = atom((get) => {
  const prefs = get(lightingPrefsAtom)
  return {
    universe: prefs.sacnConfig?.universe ?? 1,
    networkInterface: prefs.sacnConfig?.networkInterface || '',
    unicastDestination: prefs.sacnConfig?.unicastDestination || '',
    useUnicast: prefs.sacnConfig?.useUnicast || false,
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
  }
  sacnConfig?: {
    universe: number
    networkInterface?: string
    unicastDestination?: string
    useUnicast: boolean
  }
  brightness?: {
    low: number
    medium: number
    high: number
    max: number
  }
  enabledCueGroups?: string[]
  activeAudioCueType?: AudioCueType
  cueConsistencyWindow?: number
  allowMultipleActiveRigs?: boolean

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
