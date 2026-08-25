/**
 * Stored application preferences payloads, including per-domain cue prefs and persisted window state.
 */

import type { AppPreferences } from '../../../services/configuration/ConfigurationManager'
import type { CueDomain, CueDomainPrefs } from '../../../services/configuration/cueDomainTypes'
import type { ValidationResult } from './primitives'
import { WHITE_CHANNEL_MIX_MODES } from '../../../photonics-dmx/types'
import { CUE_DOMAINS } from '../../../services/configuration/cueDomainTypes'
import { DEFAULT_AUDIO_GAME_MODE } from '../../../photonics-dmx/listeners/Audio/AudioTypes'
import { clampDmxOutputRefreshRateHz } from '../../../shared/dmxOutputRefresh'
import {
  isPlainObject,
  validateNumberInRange,
  validateStringUnion,
  isStringArray,
} from './primitives'
import { validateStageKitPriority, RB3_PROCESSING_MODES } from './cueValidation'
import { validateAudioConfigPayload, validateAudioGameModePayload } from './audioValidation'

/**
 * Accepts a partial per-domain update for SAVE_PREFS (merged server-side with stored cueDomains).
 */
function validateCueDomainsPayload(
  data: unknown,
): ValidationResult<Partial<Record<CueDomain, Partial<CueDomainPrefs>>>> {
  if (!isPlainObject(data)) {
    return { ok: false, error: 'cueDomains must be a plain object' }
  }
  const src = data
  const out: Partial<Record<CueDomain, Partial<CueDomainPrefs>>> = {}
  for (const d of CUE_DOMAINS) {
    if (!(d in src) || src[d] == null) {
      continue
    }
    if (!isPlainObject(src[d])) {
      return { ok: false, error: `cueDomains.${d} must be an object` }
    }
    const o = src[d] as Record<string, unknown>
    const partial: Partial<CueDomainPrefs> = {}
    if (o.enabledGroups != null) {
      if (!isStringArray(o.enabledGroups)) {
        return { ok: false, error: `cueDomains.${d}.enabledGroups must be a string[]` }
      }
      partial.enabledGroups = o.enabledGroups
    }
    if (o.knownGroups != null) {
      if (!isStringArray(o.knownGroups)) {
        return { ok: false, error: `cueDomains.${d}.knownGroups must be a string[]` }
      }
      partial.knownGroups = o.knownGroups
    }
    if (o.disabledCues != null) {
      if (!isPlainObject(o.disabledCues)) {
        return { ok: false, error: `cueDomains.${d}.disabledCues must be an object` }
      }
      for (const v of Object.values(o.disabledCues)) {
        if (!isStringArray(v)) {
          return { ok: false, error: `cueDomains.${d}.disabledCues values must be string[]` }
        }
      }

      partial.disabledCues = o.disabledCues as Record<string, string[]>
    }
    if (o.selectionMode != null) {
      if (
        o.selectionMode !== 'oncePerSong' &&
        o.selectionMode !== 'perCueChange' &&
        o.selectionMode !== 'withinSong' &&
        o.selectionMode !== 'none'
      ) {
        return { ok: false, error: `cueDomains.${d}.selectionMode is invalid` }
      }
      partial.selectionMode = o.selectionMode
    }
    if ('activeCueRef' in o) {
      const ar = o.activeCueRef
      if (ar === null) {
        partial.activeCueRef = null
      } else if (
        isPlainObject(ar) &&
        typeof ar.groupId === 'string' &&
        typeof ar.cueId === 'string'
      ) {
        partial.activeCueRef = { groupId: ar.groupId, cueId: ar.cueId }
      } else {
        return { ok: false, error: `cueDomains.${d}.activeCueRef is invalid` }
      }
    }
    if (o.probabilityPercent != null) {
      if (typeof o.probabilityPercent !== 'number' || Number.isNaN(o.probabilityPercent)) {
        return { ok: false, error: `cueDomains.${d}.probabilityPercent must be a number` }
      }
      const r = validateNumberInRange(
        o.probabilityPercent,
        0,
        100,
        `cueDomains.${d}.probabilityPercent`,
      )
      if (!r.ok) {
        return r
      }
      partial.probabilityPercent = Math.round(r.value)
    }
    if (o.minimumHoldMs != null) {
      if (typeof o.minimumHoldMs !== 'number' || Number.isNaN(o.minimumHoldMs)) {
        return { ok: false, error: `cueDomains.${d}.minimumHoldMs must be a number` }
      }
      const r = validateNumberInRange(o.minimumHoldMs, 0, 600000, `cueDomains.${d}.minimumHoldMs`)
      if (!r.ok) {
        return r
      }
      partial.minimumHoldMs = Math.round(r.value)
    }
    if (Object.keys(partial).length > 0) {
      out[d] = partial
    }
  }
  return { ok: true, value: out }
}

/** Upper bound on a persisted window edge, wide enough for any real multi-monitor desktop. */
const WINDOW_DIMENSION_MAX = 100000

/** Cap on a persisted audio cue id, so an unbounded string can't be written to prefs. */
const MAX_AUDIO_CUE_TYPE_LENGTH = 200

type PersistedWindowState = { width: number; height: number; x?: number; y?: number }

/**
 * Shape-check a persisted window rectangle. These feed the BrowserWindow constructor, which
 * misbehaves on zero, negative or non-finite extents, so width and height are clamped into a usable
 * range rather than rejected, and a whole prefs save isn't lost to an odd window size. Position is
 * left unclamped because negative coordinates are legitimate on a multi-monitor desktop.
 */
function validateWindowStatePayload(
  value: unknown,
  field: string,
): ValidationResult<PersistedWindowState> {
  if (!isPlainObject(value)) {
    return { ok: false, error: `${field} must be an object` }
  }
  const out: PersistedWindowState = { width: 0, height: 0 }
  for (const key of ['width', 'height'] as const) {
    const n = value[key]
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      return { ok: false, error: `${field}.${key} must be a finite number` }
    }
    out[key] = Math.round(Math.max(1, Math.min(WINDOW_DIMENSION_MAX, n)))
  }
  for (const key of ['x', 'y'] as const) {
    if (value[key] === undefined) continue
    const n = value[key]
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      return { ok: false, error: `${field}.${key} must be a finite number` }
    }
    out[key] = Math.round(n)
  }
  return { ok: true, value: out }
}

const APP_PREFERENCES_KEYS = new Set<keyof AppPreferences>([
  'effectDebounce',
  'complex',
  'enttecProConfig',
  'openDmxConfig',
  'artNetConfig',
  'sacnConfig',
  'brightness',
  'cueDomains',
  'cueConsistencyWindow',
  'clockRate',
  'yargFallbackCueTimeMs',
  'globalDmxPublishingRateHz',
  'dmxOutputConfig',
  'stageKitPrefs',
  'rb3Prefs',
  'dmxSettingsPrefs',
  'allowMultipleActiveRigs',
  'advancedModeEnabled',
  'audioConfig',
  'activeAudioCueType',
  'audioGameMode',
  'motionEnabled',
  'simulationSettings',
  'leftMenuCollapsed',
  'windowState',
  'cueEditorWindowState',
  'audioPreviewWindowState',
  'whiteChannelMixMode',
  'venuePostProcessingEnabled',
])

/**
 * Validates a preferences update payload, stripping any keys that are not
 * part of AppPreferences so unexpected data is never persisted.
 */
export function validatePreferencesPayload(
  data: unknown,
): ValidationResult<Partial<AppPreferences>> {
  if (!isPlainObject(data)) {
    return { ok: false, error: 'Preferences payload must be an object' }
  }

  const cleaned: Record<string, unknown> = {}
  for (const key of Object.keys(data)) {
    if (APP_PREFERENCES_KEYS.has(key as keyof AppPreferences)) {
      cleaned[key] = data[key]
    }
  }

  if (Object.keys(cleaned).length === 0) {
    return { ok: false, error: 'Preferences payload contains no valid preference keys' }
  }

  if ('cueConsistencyWindow' in cleaned) {
    const v = validateNumberInRange(cleaned.cueConsistencyWindow, 0, 600000, 'cueConsistencyWindow')
    if (!v.ok) return v
    cleaned.cueConsistencyWindow = Math.round(v.value)
  }

  if ('cueDomains' in cleaned) {
    const d = validateCueDomainsPayload(cleaned.cueDomains)
    if (!d.ok) {
      return d
    }
    cleaned.cueDomains = d.value
  }

  if ('advancedModeEnabled' in cleaned && typeof cleaned.advancedModeEnabled !== 'boolean') {
    return { ok: false, error: 'advancedModeEnabled must be a boolean' }
  }

  if (
    'venuePostProcessingEnabled' in cleaned &&
    typeof cleaned.venuePostProcessingEnabled !== 'boolean'
  ) {
    return { ok: false, error: 'venuePostProcessingEnabled must be a boolean' }
  }

  if ('globalDmxPublishingRateHz' in cleaned) {
    const hz = cleaned.globalDmxPublishingRateHz
    if (typeof hz !== 'number' || !Number.isFinite(hz)) {
      return { ok: false, error: 'globalDmxPublishingRateHz must be a finite number' }
    }
    cleaned.globalDmxPublishingRateHz = clampDmxOutputRefreshRateHz(hz)
  }

  if ('sacnConfig' in cleaned) {
    const sc = cleaned.sacnConfig
    if (!isPlainObject(sc)) {
      return { ok: false, error: 'sacnConfig must be an object' }
    }
    const next: Record<string, unknown> = { ...sc }
    if ('refreshRateHz' in next) {
      const hz = next.refreshRateHz
      if (typeof hz !== 'number' || Number.isNaN(hz)) {
        return { ok: false, error: 'sacnConfig.refreshRateHz must be a finite number' }
      }
      next.refreshRateHz = clampDmxOutputRefreshRateHz(hz)
    }
    cleaned.sacnConfig = next
  }

  if ('artNetConfig' in cleaned) {
    const ac = cleaned.artNetConfig
    if (!isPlainObject(ac)) {
      return { ok: false, error: 'artNetConfig must be an object' }
    }
    const next: Record<string, unknown> = { ...ac }
    if ('refreshRateHz' in next) {
      const hz = next.refreshRateHz
      if (typeof hz !== 'number' || Number.isNaN(hz)) {
        return { ok: false, error: 'artNetConfig.refreshRateHz must be a finite number' }
      }
      next.refreshRateHz = clampDmxOutputRefreshRateHz(hz)
    }
    cleaned.artNetConfig = next
  }

  if ('brightness' in cleaned) {
    const b = cleaned.brightness
    if (!isPlainObject(b)) {
      return { ok: false, error: 'brightness must be an object' }
    }
    for (const level of ['low', 'medium', 'high', 'max'] as const) {
      const v = b[level]
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 255) {
        return { ok: false, error: `brightness.${level} must be an integer 0-255` }
      }
    }
  }

  if ('stageKitPrefs' in cleaned) {
    const s = cleaned.stageKitPrefs
    if (!isPlainObject(s)) {
      return { ok: false, error: 'stageKitPrefs must be an object' }
    }
    const priority = validateStageKitPriority(s.yargPriority)
    if (!priority.ok) {
      return { ok: false, error: `stageKitPrefs.yargPriority: ${priority.error}` }
    }
  }

  if ('rb3Prefs' in cleaned) {
    const r = cleaned.rb3Prefs
    if (!isPlainObject(r)) {
      return { ok: false, error: 'rb3Prefs must be an object' }
    }
    const mode = validateStringUnion(r.processingMode, RB3_PROCESSING_MODES, 'processingMode')
    if (!mode.ok) {
      return { ok: false, error: `rb3Prefs.${mode.error}` }
    }
  }

  if ('whiteChannelMixMode' in cleaned) {
    const mode = validateStringUnion(
      cleaned.whiteChannelMixMode,
      WHITE_CHANNEL_MIX_MODES,
      'whiteChannelMixMode',
    )
    if (!mode.ok) {
      return { ok: false, error: mode.error }
    }
  }

  if ('dmxSettingsPrefs' in cleaned) {
    const d = cleaned.dmxSettingsPrefs
    if (!isPlainObject(d)) {
      return { ok: false, error: 'dmxSettingsPrefs must be an object' }
    }
    for (const key of [
      'artNetExpanded',
      'enttecProExpanded',
      'sacnExpanded',
      'openDmxExpanded',
    ] as const) {
      if (key in d && typeof d[key] !== 'boolean') {
        return { ok: false, error: `dmxSettingsPrefs.${key} must be a boolean` }
      }
    }
  }

  if ('simulationSettings' in cleaned) {
    const s = cleaned.simulationSettings
    if (!isPlainObject(s)) {
      return { ok: false, error: 'simulationSettings must be an object' }
    }
    if (s.registryType !== 'YARG' && s.registryType !== 'RB3E') {
      return { ok: false, error: 'simulationSettings.registryType must be YARG or RB3E' }
    }
    if (typeof s.groupId !== 'string') {
      return { ok: false, error: 'simulationSettings.groupId must be a string' }
    }
    if (s.effectId !== null && typeof s.effectId !== 'string') {
      return { ok: false, error: 'simulationSettings.effectId must be a string or null' }
    }
    if (s.venueSize !== 'NoVenue' && s.venueSize !== 'Small' && s.venueSize !== 'Large') {
      return { ok: false, error: 'simulationSettings.venueSize must be NoVenue, Small, or Large' }
    }
    if (typeof s.bpm !== 'number' || !Number.isFinite(s.bpm)) {
      return { ok: false, error: 'simulationSettings.bpm must be a finite number' }
    }
    const instruments = ['guitar', 'bass', 'keys', 'drums']
    if (typeof s.instrument !== 'string' || !instruments.includes(s.instrument)) {
      return { ok: false, error: 'simulationSettings.instrument must be guitar/bass/keys/drums' }
    }
  }

  // effectDebounce, complex and clockRate are required with a declared type by the prefs schema, so
  // a wrong type here is what routes the file to corrupt-recovery on the next load.
  if ('effectDebounce' in cleaned) {
    const v = validateNumberInRange(cleaned.effectDebounce, 0, 60000, 'effectDebounce')
    if (!v.ok) return v
    cleaned.effectDebounce = Math.round(v.value)
  }

  // Same bound the dedicated SET_YARG_FALLBACK_CUE_TIME_MS channel applies, so a value that is
  // legal through one write path is legal through the other.
  if ('yargFallbackCueTimeMs' in cleaned) {
    const v = validateNumberInRange(
      cleaned.yargFallbackCueTimeMs,
      0,
      600000,
      'yargFallbackCueTimeMs',
    )
    if (!v.ok) return v
    cleaned.yargFallbackCueTimeMs = Math.round(v.value)
  }

  if ('clockRate' in cleaned) {
    const rate = cleaned.clockRate
    if (typeof rate !== 'number' || !Number.isFinite(rate)) {
      return { ok: false, error: 'clockRate must be a finite number' }
    }
    // Clamped to the window Clock itself accepts: a value outside it drives the tick scheduler off
    // its interval, and the slider that produces this is already bounded the same way.
    cleaned.clockRate = Math.round(Math.max(1, Math.min(100, rate)))
  }

  for (const key of [
    'complex',
    'motionEnabled',
    'allowMultipleActiveRigs',
    'leftMenuCollapsed',
  ] as const) {
    if (key in cleaned && typeof cleaned[key] !== 'boolean') {
      return { ok: false, error: `${key} must be a boolean` }
    }
  }

  for (const key of ['windowState', 'cueEditorWindowState', 'audioPreviewWindowState'] as const) {
    if (key in cleaned) {
      const w = validateWindowStatePayload(cleaned[key], key)
      if (!w.ok) return w
      cleaned[key] = w.value
    }
  }

  if ('enttecProConfig' in cleaned) {
    const c = cleaned.enttecProConfig
    if (!isPlainObject(c)) {
      return { ok: false, error: 'enttecProConfig must be an object' }
    }
    if ('port' in c && typeof c.port !== 'string') {
      return { ok: false, error: 'enttecProConfig.port must be a string' }
    }
  }

  if ('openDmxConfig' in cleaned) {
    const c = cleaned.openDmxConfig
    if (!isPlainObject(c)) {
      return { ok: false, error: 'openDmxConfig must be an object' }
    }
    if ('port' in c && typeof c.port !== 'string') {
      return { ok: false, error: 'openDmxConfig.port must be a string' }
    }
    if ('dmxSpeed' in c && (typeof c.dmxSpeed !== 'number' || !Number.isFinite(c.dmxSpeed))) {
      return { ok: false, error: 'openDmxConfig.dmxSpeed must be a finite number' }
    }
  }

  if ('dmxOutputConfig' in cleaned) {
    const c = cleaned.dmxOutputConfig
    if (!isPlainObject(c)) {
      return { ok: false, error: 'dmxOutputConfig must be an object' }
    }
    for (const key of [
      'sacnEnabled',
      'artNetEnabled',
      'enttecProEnabled',
      'openDmxEnabled',
    ] as const) {
      if (key in c && typeof c[key] !== 'boolean') {
        return { ok: false, error: `dmxOutputConfig.${key} must be a boolean` }
      }
    }
  }

  if ('audioConfig' in cleaned) {
    const a = validateAudioConfigPayload(cleaned.audioConfig)
    if (!a.ok) return a
    cleaned.audioConfig = a.value
  }

  if ('audioGameMode' in cleaned) {
    // updatePreferences replaces this key wholesale, so validating the payload against the defaults
    // yields the complete config that gets stored.
    const g = validateAudioGameModePayload(cleaned.audioGameMode, DEFAULT_AUDIO_GAME_MODE)
    if (!g.ok) return g
    cleaned.audioGameMode = g.value
  }

  if ('activeAudioCueType' in cleaned) {
    const t = cleaned.activeAudioCueType
    // AudioCueType is free-form so node-authored cues can register their own ids, so this checks the
    // type and a sane length rather than membership of the registry, which may not be loaded yet.
    if (typeof t !== 'string') {
      return { ok: false, error: 'activeAudioCueType must be a string' }
    }
    if (t.length > MAX_AUDIO_CUE_TYPE_LENGTH) {
      return {
        ok: false,
        error: `activeAudioCueType must be ${MAX_AUDIO_CUE_TYPE_LENGTH} characters or fewer`,
      }
    }
  }

  return { ok: true, value: cleaned as Partial<AppPreferences> }
}
