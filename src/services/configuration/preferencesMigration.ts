import { DEFAULT_PREFERENCES, type AppPreferences } from './configurationDefaults'
import { REQUIRED_PREFERENCE_KEYS } from './configDataValidators'
import {
  normalizeEnttecProDmxSpeedHz,
  normalizeOpenDmxSpeedHz,
} from '../../shared/dmxOutputRefresh'
import { clampSacnUniverse } from '../../shared/sacnUniverse'
import { clampClockRateMs } from '../../shared/clockRate'
import {
  CUE_DOMAINS,
  type CueDomain,
  type CueDomainPrefs,
  type CueDomainSelectionMode,
  createDefaultCueDomainPrefs,
  createDefaultCueDomains,
  mergePartialCueDomains,
} from './cueDomainTypes'

/** Top-level keys from v3 and earlier that moved into `cueDomains` (do not copy through as top-level). */
export const LEGACY_FLAT_CUE_PREF_KEYS = new Set<string>([
  'enabledCueGroups',
  'knownYargCueGroups',
  'enabledAudioCueGroups',
  'knownAudioCueGroups',
  'disabledYargCues',
  'disabledAudioCues',
  'enabledMotionCueGroups',
  'knownMotionCueGroups',
  'disabledMotionCues',
  'enabledAudioMotionCueGroups',
  'knownAudioMotionCueGroups',
  'disabledAudioMotionCues',
  'motionGroupSelectionMode',
  'audioMotionGroupSelectionMode',
  'motionCueMinimumHoldMs',
  'motionCueProbabilityPercent',
  'audioMotionCueProbabilityPercent',
  'activeAudioMotionCueRef',
  'activeYargMotionCueRef',
  'cueGroupSelectionMode',
])

/** v2 flat USB sender fields — merged into `enttecProConfig` / `openDmxConfig` (never left top-level in v4). */
export const LEGACY_FLAT_SENDER_PREF_KEYS = new Set<string>([
  'enttecProPort',
  'openDmxPort',
  'openDmxSpeed',
])

/**
 * Merges legacy flat Enttec / OpenDMX port fields from `src` into nested config on `out`.
 * Does not copy `enttecProPort` / `openDmxPort` / `openDmxSpeed` to the return value; callers
 * use this after excluding those keys from top-level `pick` merge, or to fix straggler v4 files.
 */
export function applyLegacySenderFlatToNested(
  src: Record<string, unknown>,
  out: AppPreferences,
): AppPreferences {
  const defaultEnttec: NonNullable<AppPreferences['enttecProConfig']> = {
    port: DEFAULT_PREFERENCES.enttecProConfig!.port,
    dmxSpeed: DEFAULT_PREFERENCES.enttecProConfig!.dmxSpeed,
  }
  const defaultOpen: NonNullable<AppPreferences['openDmxConfig']> = {
    port: DEFAULT_PREFERENCES.openDmxConfig!.port,
    dmxSpeed: DEFAULT_PREFERENCES.openDmxConfig!.dmxSpeed,
  }

  const next: AppPreferences = { ...out }

  const enttec = next.enttecProConfig
  if (!enttec) {
    const port = typeof src.enttecProPort === 'string' ? src.enttecProPort : ''
    next.enttecProConfig = { ...defaultEnttec, port }
  } else if (typeof enttec.port !== 'string') {
    const legacyPort = typeof src.enttecProPort === 'string' ? src.enttecProPort : ''
    next.enttecProConfig = {
      ...defaultEnttec,
      ...enttec,
      port: typeof enttec.port === 'string' ? enttec.port : legacyPort,
    }
  } else if (
    enttec.port === '' &&
    typeof src.enttecProPort === 'string' &&
    src.enttecProPort.length > 0
  ) {
    next.enttecProConfig = { ...enttec, port: src.enttecProPort }
  }

  const legacyDmxPort = src.openDmxPort
  const legacySpeed = src.openDmxSpeed
  const o = next.openDmxConfig
    ? { ...next.openDmxConfig }
    : { port: defaultOpen.port, dmxSpeed: defaultOpen.dmxSpeed }
  if (typeof o.port !== 'string') {
    o.port = typeof legacyDmxPort === 'string' ? legacyDmxPort : defaultOpen.port
  } else if (o.port === '' && typeof legacyDmxPort === 'string' && legacyDmxPort.length > 0) {
    o.port = legacyDmxPort
  }
  if (typeof o.dmxSpeed !== 'number' || Number.isNaN(o.dmxSpeed)) {
    o.dmxSpeed =
      typeof legacySpeed === 'number' && !Number.isNaN(legacySpeed)
        ? Math.round(legacySpeed)
        : defaultOpen.dmxSpeed
  } else if (
    o.dmxSpeed === defaultOpen.dmxSpeed &&
    typeof legacySpeed === 'number' &&
    !Number.isNaN(legacySpeed)
  ) {
    o.dmxSpeed = Math.round(legacySpeed)
  }
  next.openDmxConfig = o

  return next
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

function isRecordStringArrays(v: unknown): v is Record<string, string[]> {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) {
    return false
  }
  for (const x of Object.values(v as Record<string, unknown>)) {
    if (!isStringArray(x)) {
      return false
    }
  }
  return true
}

function safeYargLightingMode(
  v: unknown,
): Extract<CueDomainSelectionMode, 'oncePerSong' | 'withinSong'> | undefined {
  if (v === 'oncePerSong' || v === 'withinSong') {
    return v
  }
  return undefined
}

function safeMotionMode(
  v: unknown,
): Extract<CueDomainSelectionMode, 'oncePerSong' | 'perCueChange' | 'none'> | undefined {
  if (v === 'oncePerSong' || v === 'perCueChange' || v === 'none') {
    return v
  }
  return undefined
}

function safeActiveRef(v: unknown): { groupId: string; cueId: string } | null | undefined {
  if (v === null) {
    return null
  }
  if (v == null || typeof v !== 'object' || Array.isArray(v)) {
    return undefined
  }
  const o = v as Record<string, unknown>
  if (typeof o.groupId === 'string' && typeof o.cueId === 'string') {
    return { groupId: o.groupId, cueId: o.cueId }
  }
  return undefined
}

function mergeOneDomain(def: CueDomainPrefs, raw: unknown): CueDomainPrefs {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return def
  }
  const o = raw as Record<string, unknown>
  const enabled = o.enabledGroups
  const known = o.knownGroups
  const disabled = o.disabledCues
  const sm = o.selectionMode
  const aref = o.activeCueRef
  const prob = o.probabilityPercent
  const minHold = o.minimumHoldMs
  let next = { ...def }
  if (isStringArray(enabled)) {
    next = { ...next, enabledGroups: enabled }
  }
  if (isStringArray(known)) {
    next = { ...next, knownGroups: known }
  }
  if (isRecordStringArrays(disabled)) {
    next = { ...next, disabledCues: { ...def.disabledCues, ...disabled } }
  }
  if (sm === 'oncePerSong' || sm === 'perCueChange' || sm === 'withinSong' || sm === 'none') {
    next = { ...next, selectionMode: sm }
  }
  if ('activeCueRef' in o) {
    const a = safeActiveRef(aref)
    if (a !== undefined) {
      next = { ...next, activeCueRef: a }
    }
  }
  if (typeof prob === 'number' && !Number.isNaN(prob)) {
    next = { ...next, probabilityPercent: Math.round(prob) }
  }
  if (typeof minHold === 'number' && !Number.isNaN(minHold)) {
    next = { ...next, minimumHoldMs: Math.round(minHold) }
  }
  return next
}

/**
 * Migrates preferences from the flat v3 shape into v4 `cueDomains`.
 * Malformed per-domain data falls back to defaults for that domain only.
 */
export function migratePrefsV3ToV4(legacy: unknown, defaults: AppPreferences): AppPreferences {
  if (legacy == null || typeof legacy !== 'object' || Array.isArray(legacy)) {
    return { ...defaults, cueDomains: { ...createDefaultCueDomains() } }
  }
  const src = legacy as Record<string, unknown>
  const out: AppPreferences = applyLegacySenderFlatToNested(src, {
    ...defaults,
    ...pickNonLegacyTopLevel(src),
  })

  const defaultDomains = createDefaultCueDomains()
  let cueDomains: Record<CueDomain, CueDomainPrefs> = { ...defaultDomains }

  const fromNested = src.cueDomains
  if (fromNested != null && typeof fromNested === 'object' && !Array.isArray(fromNested)) {
    const n = fromNested as Record<string, unknown>
    for (const d of CUE_DOMAINS) {
      if (d in n) {
        cueDomains[d] = mergeOneDomain(defaultDomains[d], n[d])
      }
    }
  }

  if (hasAnyFlatV3Key(src)) {
    try {
      cueDomains = buildFromFlatV3IfNeeded(src, cueDomains)
    } catch {
      // keep merged nested + defaults
    }
  }

  out.cueDomains = cueDomains
  return normalizeCueDomains(out)
}

/**
 * Settings whose shipped defaults changed in v5. Existing prefs carried over from earlier
 * versions are bumped to these values once (when the file is below v5); every other field is
 * preserved. New installs never run this — they start at v5 with the current DEFAULT_PREFERENCES.
 *
 * This is a deliberate one-time overwrite of these specific fields, including any value the user
 * had previously set for them; it is not a general "reset to defaults".
 */
export function migratePrefsV4ToV5(legacy: unknown, defaults: AppPreferences): AppPreferences {
  const base =
    legacy != null && typeof legacy === 'object' && !Array.isArray(legacy)
      ? (legacy as AppPreferences)
      : defaults

  const out: AppPreferences = { ...base }

  out.cueConsistencyWindow = defaults.cueConsistencyWindow
  out.stageKitPrefs = {
    ...base.stageKitPrefs,
    yargPriority: defaults.stageKitPrefs!.yargPriority,
  }

  const currentDomains =
    base.cueDomains != null &&
    typeof base.cueDomains === 'object' &&
    !Array.isArray(base.cueDomains)
      ? base.cueDomains
      : createDefaultCueDomains()
  out.cueDomains = mergePartialCueDomains(currentDomains, {
    yargMotion: { probabilityPercent: defaults.cueDomains.yargMotion.probabilityPercent },
    audioMotion: { probabilityPercent: defaults.cueDomains.audioMotion.probabilityPercent },
  })

  return normalizeCueDomains(out)
}

/**
 * Seeds cue-domain entries added after v5 (`rb3`, `rb3Motion`) when a stored prefs.json predates
 * them. Every other field is preserved untouched. New installs never run this — they start at the
 * current version with the full DEFAULT_PREFERENCES.
 */
export function migratePrefsV5ToV6(legacy: unknown, defaults: AppPreferences): AppPreferences {
  const base =
    legacy != null && typeof legacy === 'object' && !Array.isArray(legacy)
      ? (legacy as AppPreferences)
      : defaults

  const currentDomains =
    base.cueDomains != null &&
    typeof base.cueDomains === 'object' &&
    !Array.isArray(base.cueDomains)
      ? base.cueDomains
      : createDefaultCueDomains()

  // normalizeCueDomains defaults any missing domain (including rb3 / rb3Motion) via its
  // `?? createDefaultCueDomainPrefs(d)` fallback, so no separate seeding pass is needed here.
  return normalizeCueDomains({ ...base, cueDomains: currentDomains })
}

/**
 * Load-time repair for cue domains, so a shortfall in one domain cannot cost the user every
 * setting in the file.
 *
 * AJV requires all six domains and, inside each, `enabledGroups`, `knownGroups` and `disabledCues`.
 * A domain that is absent, incomplete, or carrying one of those in the wrong shape fails that check
 * and sends the whole prefs.json to corrupt-recovery, which renames it aside and writes defaults.
 * The shortfalls that get here are a domain added to `CUE_DOMAINS` after the file was written, a
 * write interrupted part way, a hand edit, and any future addition to the required list.
 *
 * Returns the same object when every domain is already complete, because `ConfigFile` compares by
 * reference to decide whether to persist and a fresh object every load would rewrite the file every
 * launch. A malformed `cueDomains` (not an object at all) is left untouched so a wholly-corrupt
 * file still falls through to validation.
 */
/**
 * Fills in top-level preferences the schema requires but the stored file does not carry, from the
 * shipped defaults, so a file predating a newly required key passes validation and keeps the rest
 * of its settings. Returns the input untouched when nothing is missing.
 */
export function seedMissingRequiredPrefs(prefs: AppPreferences): AppPreferences {
  if (prefs == null || typeof prefs !== 'object' || Array.isArray(prefs)) {
    return prefs
  }
  const stored = prefs as unknown as Record<string, unknown>
  const missing = REQUIRED_PREFERENCE_KEYS.filter((key) => stored[key] === undefined)
  if (missing.length === 0) {
    return prefs
  }
  const seeded = { ...stored }
  for (const key of missing) {
    seeded[key] = (DEFAULT_PREFERENCES as unknown as Record<string, unknown>)[key]
  }
  return seeded as unknown as AppPreferences
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Brings stored sender settings that the drivers cannot use back into range.
 *
 * A universe outside what sACN defines makes the sender throw as it is built, which leaves the
 * output off on this launch and every later one. Returns the preferences it was given when there
 * is nothing to bring back, so a load that changes nothing is not written out again.
 */
/**
 * Brings a stored clock rate back into the window the engine renders effects in, so a file written
 * when the window was wider does not leave the tick slower than any effect can be shown at.
 */
export function healStoredClockRate(prefs: AppPreferences): AppPreferences {
  const stored = prefs?.clockRate
  if (typeof stored !== 'number') {
    return prefs
  }
  const rate = clampClockRateMs(stored)
  return rate === stored ? prefs : { ...prefs, clockRate: rate }
}

export function healStoredSenderConfigs(prefs: AppPreferences): AppPreferences {
  let next = prefs

  const sacn = next?.sacnConfig
  if (isPlainObject(sacn) && typeof sacn.universe === 'number') {
    const universe = clampSacnUniverse(sacn.universe)
    if (universe !== sacn.universe) {
      next = { ...next, sacnConfig: { ...sacn, universe } }
    }
  }

  const enttec = next?.enttecProConfig
  if (isPlainObject(enttec)) {
    const dmxSpeed = normalizeEnttecProDmxSpeedHz(enttec.dmxSpeed)
    if (enttec.dmxSpeed !== dmxSpeed) {
      next = { ...next, enttecProConfig: { ...enttec, dmxSpeed } }
    }
  }

  const openDmx = next?.openDmxConfig
  if (isPlainObject(openDmx)) {
    const dmxSpeed = normalizeOpenDmxSpeedHz(openDmx.dmxSpeed)
    if (openDmx.dmxSpeed !== dmxSpeed) {
      next = { ...next, openDmxConfig: { ...openDmx, dmxSpeed } }
    }
  }

  return next
}

/**
 * Whether a stored domain carries the three keys the schema requires, in the shapes it requires.
 * Anything else has to be repaired before validation, or the whole file is moved aside for it.
 */
function cueDomainIsComplete(stored: unknown): boolean {
  if (!isPlainObject(stored)) {
    return false
  }
  return (
    Array.isArray(stored.enabledGroups) &&
    Array.isArray(stored.knownGroups) &&
    isPlainObject(stored.disabledCues)
  )
}

/**
 * A complete domain built from what was stored, with anything absent or the wrong shape taken from
 * the defaults. Every value is freshly allocated, so nothing here aliases DEFAULT_PREFERENCES.
 */
function repairCueDomain(domain: CueDomain, stored: unknown): CueDomainPrefs {
  if (!isPlainObject(stored)) {
    return createDefaultCueDomainPrefs(domain)
  }
  const overrides: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(stored)) {
    if (value !== undefined) {
      overrides[key] = value
    }
  }
  // Dropping a bad value lets the default take its place, since spreading undefined over a default
  // would reinstate the missing key rather than fill it.
  if (!Array.isArray(overrides.enabledGroups)) {
    delete overrides.enabledGroups
  }
  if (!Array.isArray(overrides.knownGroups)) {
    delete overrides.knownGroups
  }
  if (!isPlainObject(overrides.disabledCues)) {
    delete overrides.disabledCues
  }
  return createDefaultCueDomainPrefs(domain, overrides as Partial<CueDomainPrefs>)
}

export function repairCueDomains(prefs: AppPreferences): AppPreferences {
  const domains = prefs?.cueDomains as Record<string, unknown> | undefined
  if (!isPlainObject(domains)) {
    return prefs
  }
  const needsRepair = CUE_DOMAINS.filter((d) => !cueDomainIsComplete(domains[d]))
  if (needsRepair.length === 0) {
    return prefs
  }
  const repaired = { ...(domains as Record<CueDomain, CueDomainPrefs>) }
  for (const d of needsRepair) {
    repaired[d] = repairCueDomain(d, domains[d])
  }
  return { ...prefs, cueDomains: repaired }
}

function pickNonLegacyTopLevel(src: Record<string, unknown>): Partial<AppPreferences> {
  const o: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(src)) {
    if (k === 'cueDomains') {
      continue
    }
    if (LEGACY_FLAT_CUE_PREF_KEYS.has(k) || LEGACY_FLAT_SENDER_PREF_KEYS.has(k)) {
      continue
    }
    o[k] = v
  }
  return o as Partial<AppPreferences>
}

export function hasStraySenderFlatKeys(legacy: Record<string, unknown>): boolean {
  for (const k of LEGACY_FLAT_SENDER_PREF_KEYS) {
    if (k in legacy) {
      return true
    }
  }
  return false
}

function buildFromFlatV3IfNeeded(
  src: Record<string, unknown>,
  base: Record<CueDomain, CueDomainPrefs>,
): Record<CueDomain, CueDomainPrefs> {
  if (!hasAnyFlatV3Key(src)) {
    return base
  }

  const d = { ...base }

  const yargDefaults = createDefaultCueDomainPrefs('yarg')
  d.yarg = {
    ...yargDefaults,
    ...d.yarg,
    enabledGroups: isStringArray(src.enabledCueGroups)
      ? src.enabledCueGroups
      : d.yarg.enabledGroups,
    knownGroups: isStringArray(src.knownYargCueGroups)
      ? src.knownYargCueGroups
      : d.yarg.knownGroups,
    disabledCues: isRecordStringArrays(src.disabledYargCues)
      ? { ...src.disabledYargCues }
      : d.yarg.disabledCues,
    selectionMode: safeYargLightingMode(src.cueGroupSelectionMode) ?? d.yarg.selectionMode,
  }

  const audioDefaults = createDefaultCueDomainPrefs('audio')
  d.audio = {
    ...audioDefaults,
    ...d.audio,
    enabledGroups: isStringArray(src.enabledAudioCueGroups)
      ? src.enabledAudioCueGroups
      : d.audio.enabledGroups,
    knownGroups: isStringArray(src.knownAudioCueGroups)
      ? src.knownAudioCueGroups
      : d.audio.knownGroups,
    disabledCues: isRecordStringArrays(src.disabledAudioCues)
      ? { ...src.disabledAudioCues }
      : d.audio.disabledCues,
  }

  const yargMotionDefaults = createDefaultCueDomainPrefs('yargMotion')
  const minHold =
    typeof src.motionCueMinimumHoldMs === 'number' && !Number.isNaN(src.motionCueMinimumHoldMs)
      ? Math.max(0, Math.min(600000, Math.round(src.motionCueMinimumHoldMs as number)))
      : yargMotionDefaults.minimumHoldMs
  d.yargMotion = {
    ...yargMotionDefaults,
    ...d.yargMotion,
    enabledGroups: isStringArray(src.enabledMotionCueGroups)
      ? src.enabledMotionCueGroups
      : d.yargMotion.enabledGroups,
    knownGroups: isStringArray(src.knownMotionCueGroups)
      ? src.knownMotionCueGroups
      : d.yargMotion.knownGroups,
    disabledCues: isRecordStringArrays(src.disabledMotionCues)
      ? { ...src.disabledMotionCues }
      : d.yargMotion.disabledCues,
    selectionMode: safeMotionMode(src.motionGroupSelectionMode) ?? d.yargMotion.selectionMode,
    probabilityPercent:
      typeof src.motionCueProbabilityPercent === 'number' &&
      !Number.isNaN(src.motionCueProbabilityPercent)
        ? Math.max(0, Math.min(100, Math.round(src.motionCueProbabilityPercent as number)))
        : d.yargMotion.probabilityPercent,
    minimumHoldMs: minHold,
    activeCueRef: (() => {
      const r = safeActiveRef(src.activeYargMotionCueRef)
      return r !== undefined ? r : d.yargMotion.activeCueRef
    })(),
  }

  const audioMotionDefaults = createDefaultCueDomainPrefs('audioMotion')
  d.audioMotion = {
    ...audioMotionDefaults,
    ...d.audioMotion,
    enabledGroups: isStringArray(src.enabledAudioMotionCueGroups)
      ? src.enabledAudioMotionCueGroups
      : d.audioMotion.enabledGroups,
    knownGroups: isStringArray(src.knownAudioMotionCueGroups)
      ? src.knownAudioMotionCueGroups
      : d.audioMotion.knownGroups,
    disabledCues: isRecordStringArrays(src.disabledAudioMotionCues)
      ? { ...src.disabledAudioMotionCues }
      : d.audioMotion.disabledCues,
    selectionMode: safeMotionMode(src.audioMotionGroupSelectionMode) ?? d.audioMotion.selectionMode,
    probabilityPercent:
      typeof src.audioMotionCueProbabilityPercent === 'number' &&
      !Number.isNaN(src.audioMotionCueProbabilityPercent)
        ? Math.max(0, Math.min(100, Math.round(src.audioMotionCueProbabilityPercent as number)))
        : d.audioMotion.probabilityPercent,
    minimumHoldMs: minHold,
    activeCueRef: (() => {
      const r = safeActiveRef(src.activeAudioMotionCueRef)
      return r !== undefined ? r : d.audioMotion.activeCueRef
    })(),
  }

  return d
}

function hasAnyFlatV3Key(src: Record<string, unknown>): boolean {
  for (const k of LEGACY_FLAT_CUE_PREF_KEYS) {
    if (k in src) {
      return true
    }
  }
  return false
}

const MOTION_DOMAINS: readonly CueDomain[] = ['yargMotion', 'audioMotion', 'rb3Motion']

function normalizeCueDomains(prefs: AppPreferences): AppPreferences {
  const m = mergePartialCueDomains(prefs.cueDomains, {})
  for (const d of CUE_DOMAINS) {
    const c = m[d] ?? createDefaultCueDomainPrefs(d)
    const normalized = {
      ...c,
      disabledCues: c.disabledCues && typeof c.disabledCues === 'object' ? c.disabledCues : {},
    }
    // Backfill the switch-timer range on motion domains for installs that predate it.
    if (MOTION_DOMAINS.includes(d)) {
      const defaults = createDefaultCueDomainPrefs(d)
      normalized.cueDurationMin = normalized.cueDurationMin ?? defaults.cueDurationMin
      normalized.cueDurationMax = normalized.cueDurationMax ?? defaults.cueDurationMax
    }
    m[d] = normalized
  }
  return { ...prefs, cueDomains: m }
}
