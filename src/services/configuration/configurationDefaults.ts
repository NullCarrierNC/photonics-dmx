import {
  DMX_OUTPUT_REFRESH_RATE_HZ_DEFAULT,
  OPEN_DMX_DEFAULT_REFRESH_RATE_HZ,
} from '../../shared/dmxOutputRefresh'
import {
  type AudioConfig,
  type AudioGameModeConfig,
  DEFAULT_AUDIO_GAME_MODE,
} from '../../photonics-dmx/listeners/Audio/AudioTypes'
import { AudioCueType } from '../../photonics-dmx/cues/types/audioCueTypes'
import { DEFAULT_AUDIO_CONFIG } from '../../photonics-dmx/listeners/Audio'
import { createDefaultCueDomains, type CueDomainPrefs, type CueDomain } from './cueDomainTypes'

/**
 * Application preferences (persisted in prefs.json).
 * Per-domain cue lists and motion settings live under `cueDomains`.
 */
export interface AppPreferences {
  effectDebounce: number
  complex: boolean
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
    /** Unified refresh rate (Hz); drives sender cap and protocol refresh. */
    refreshRateHz?: number
  }
  sacnConfig?: {
    universe: number
    networkInterface?: string
    unicastDestination?: string
    useUnicast: boolean
    /** Unified refresh rate (Hz); drives sender cap and protocol refresh. */
    refreshRateHz?: number
  }
  brightness?: {
    low: number
    medium: number
    high: number
    max: number
  }
  cueDomains: Record<CueDomain, CueDomainPrefs>
  /** Master switch: when false, YARG and audio automatic motion layers are off. */
  motionEnabled?: boolean
  cueConsistencyWindow: number
  clockRate: number

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
  allowMultipleActiveRigs?: boolean
  /** When true, show audio preferences, spectrum analyzer, cue editor, multi-rig UI, and other advanced features. */
  advancedModeEnabled?: boolean
  audioConfig?: AudioConfig
  activeAudioCueType?: AudioCueType
  audioGameMode?: AudioGameModeConfig
  simulationSettings?: {
    registryType: 'YARG' | 'RB3E'
    groupId: string
    effectId: string | null
    venueSize: 'NoVenue' | 'Small' | 'Large'
    bpm: number
    instrument: 'guitar' | 'bass' | 'keys' | 'drums'
  }
  leftMenuCollapsed?: boolean
  windowState?: {
    width: number
    height: number
    x?: number
    y?: number
  }
  cueEditorWindowState?: {
    width: number
    height: number
    x?: number
    y?: number
  }
  audioPreviewWindowState?: {
    width: number
    height: number
    x?: number
    y?: number
  }
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  effectDebounce: 0,
  complex: true,
  cueDomains: createDefaultCueDomains(),
  cueConsistencyWindow: 60000,
  motionEnabled: true,
  clockRate: 10,
  activeAudioCueType: '' as AudioCueType,
  audioGameMode: DEFAULT_AUDIO_GAME_MODE,

  brightness: {
    low: 40,
    medium: 100,
    high: 180,
    max: 255,
  },

  dmxOutputConfig: {
    sacnEnabled: true,
    artNetEnabled: false,
    enttecProEnabled: false,
    openDmxEnabled: false,
  },
  enttecProConfig: {
    port: '',
  },
  openDmxConfig: {
    port: '',
    dmxSpeed: OPEN_DMX_DEFAULT_REFRESH_RATE_HZ,
  },
  artNetConfig: {
    host: '',
    universe: 0,
    net: 0,
    subnet: 0,
    subuni: 0,
    port: 6454,
    refreshRateHz: DMX_OUTPUT_REFRESH_RATE_HZ_DEFAULT,
  },
  sacnConfig: {
    universe: 1,
    useUnicast: false,
    unicastDestination: '',
    refreshRateHz: DMX_OUTPUT_REFRESH_RATE_HZ_DEFAULT,
  },
  stageKitPrefs: {
    yargPriority: 'prefer-for-tracked',
  },
  dmxSettingsPrefs: {
    artNetExpanded: false,
    enttecProExpanded: false,
    sacnExpanded: false,
    openDmxExpanded: false,
  },
  allowMultipleActiveRigs: false,
  advancedModeEnabled: false,
  audioConfig: DEFAULT_AUDIO_CONFIG,
  cueEditorWindowState: {
    width: 1200,
    height: 900,
  },
  audioPreviewWindowState: {
    width: 560,
    height: 480,
  },
}
