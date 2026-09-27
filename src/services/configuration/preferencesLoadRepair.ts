import { DEFAULT_PREFERENCES, type AppPreferences } from './configurationDefaults'
import { REQUIRED_PREFERENCE_KEYS } from './configDataValidators'
import {
  normalizeEnttecProDmxSpeedHz,
  normalizeOpenDmxSpeedHz,
} from '../../shared/dmxOutputRefresh'
import { clampSacnUniverse } from '../../shared/sacnUniverse'
import { isPlainObject } from '../../shared/plainObject'
import { clampClockRateMs } from '../../shared/clockRate'
import { isBrightness, isColor } from '../../photonics-dmx/types'
import { DEFAULT_AUDIO_IDLE_DETECTION } from '../../photonics-dmx/listeners/Audio/AudioConfig'
import {
  CUE_DOMAINS,
  type CueDomain,
  type CueDomainPrefs,
  createDefaultCueDomainPrefs,
} from './cueDomainTypes'

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

/**
 * Brings a stored audio idle colour or brightness this build does not know back to its default.
 * Both reach the idle look's colour lookup, which has no reading for a name it does not know.
 *
 * @param report Told which fields were reset, when any were.
 */
export function healStoredAudioIdleLook(
  prefs: AppPreferences,
  report?: (message: string) => void,
): AppPreferences {
  const audioConfig = prefs?.audioConfig
  const idle = audioConfig?.idleDetection
  if (!isPlainObject(idle)) {
    return prefs
  }
  const healed = { ...idle }
  const reset: string[] = []
  if (idle.idleColor !== undefined && !isColor(idle.idleColor)) {
    healed.idleColor = DEFAULT_AUDIO_IDLE_DETECTION.idleColor
    reset.push('audioConfig.idleDetection.idleColor')
  }
  if (idle.idleBrightness !== undefined && !isBrightness(idle.idleBrightness)) {
    healed.idleBrightness = DEFAULT_AUDIO_IDLE_DETECTION.idleBrightness
    reset.push('audioConfig.idleDetection.idleBrightness')
  }
  if (reset.length === 0) {
    return prefs
  }
  report?.(`Reset to default: ${reset.join(', ')}`)
  return { ...prefs, audioConfig: { ...audioConfig, idleDetection: healed } }
}

/**
 * Brings stored sender settings that the drivers cannot use back into range.
 *
 * A universe outside what sACN defines makes the sender throw as it is built, which leaves the
 * output off on this launch and every later one. Returns the preferences it was given when there
 * is nothing to bring back, so a load that changes nothing is not written out again.
 */
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
