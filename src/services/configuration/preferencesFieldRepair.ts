import { appPreferenceErrors } from './configDataValidators'
import { DEFAULT_PREFERENCES, type AppPreferences } from './configurationDefaults'
import {
  CUE_DOMAINS,
  createDefaultCueDomainPrefs,
  createDefaultCueDomains,
  type CueDomain,
} from './cueDomainTypes'

/** A field the repair can put back to its default, as a path of keys. */
type FieldPath = string[]

const isCueDomain = (key: string): key is CueDomain =>
  (CUE_DOMAINS as readonly string[]).includes(key)

/**
 * The field a schema error belongs to: a top-level key, `cueDomains` itself, one cue domain, or
 * one field inside a cue domain. A bad array item or map entry resets the whole field it sits in.
 * Null for an error with no field to reset, such as a file that is not an object.
 */
function fieldFor(instancePath: string, missingProperty: unknown): FieldPath | null {
  const segments = instancePath.split('/').filter(Boolean)
  if (typeof missingProperty === 'string') segments.push(missingProperty)
  if (segments.length === 0) return null
  if (segments[0] !== 'cueDomains') return [segments[0]]
  if (segments.length > 1 && !isCueDomain(segments[1])) return null
  return segments.slice(0, 3)
}

/** The shipped default for a field, copied, or undefined when it has none. */
function defaultFor(field: FieldPath): unknown {
  const [key, domain, domainField] = field
  if (key !== 'cueDomains') {
    return structuredClone((DEFAULT_PREFERENCES as unknown as Record<string, unknown>)[key])
  }
  if (domain === undefined) return createDefaultCueDomains()
  const domainDefaults = createDefaultCueDomainPrefs(domain as CueDomain)
  if (domainField === undefined) return domainDefaults
  return structuredClone((domainDefaults as unknown as Record<string, unknown>)[domainField])
}

function setField(target: Record<string, unknown>, field: FieldPath, value: unknown): void {
  let holder = target
  for (const key of field.slice(0, -1)) {
    holder = holder[key] as Record<string, unknown>
  }
  const last = field[field.length - 1]
  if (value === undefined) {
    delete holder[last]
  } else {
    holder[last] = value
  }
}

/**
 * Resets each stored preference the schema rejects to its shipped default and keeps everything
 * else. Fields are reset shallowest first, so a bad `cueDomains` is rebuilt before any field inside
 * it. When the result still fails the schema, the input comes back unchanged and the file is set
 * aside.
 *
 * @param report Told which fields were reset, when any were.
 */
export function repairInvalidPreferenceFields(
  prefs: AppPreferences,
  report?: (message: string) => void,
): AppPreferences {
  const errors = appPreferenceErrors(prefs)
  if (errors.length === 0) return prefs

  const fields = new Map<string, FieldPath>()
  for (const error of errors) {
    const field = fieldFor(error.instancePath, error.params?.missingProperty)
    if (!field) return prefs
    fields.set(field.join('.'), field)
  }

  const repaired = structuredClone(prefs) as unknown as Record<string, unknown>
  const ordered = [...fields.values()].sort((a, b) => a.length - b.length)
  const reset: string[] = []
  for (const field of ordered) {
    if (reset.some((done) => field.join('.').startsWith(`${done}.`))) continue
    setField(repaired, field, defaultFor(field))
    reset.push(field.join('.'))
  }

  if (appPreferenceErrors(repaired).length > 0) return prefs
  report?.(`Reset to default: ${reset.join(', ')}`)
  return repaired as unknown as AppPreferences
}
