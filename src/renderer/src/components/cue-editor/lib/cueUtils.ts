import type {
  AudioEventNode,
  AudioNodeCueDefinition,
  ValueSource,
  YargNodeCueDefinition,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { YargEventType } from '../../../../../photonics-dmx/types'
import { AUDIO_EVENT_OPTIONS, YARG_EVENT_OPTIONS } from './options'
import { createId } from './cueDefaults'

// Helper to display ValueSource as text
const displayValueSource = (vs: ValueSource | undefined, defaultValue: string = ''): string => {
  if (!vs) return defaultValue
  if (vs.source === 'literal') {
    return String(vs.value ?? defaultValue)
  }
  return `$${vs.name}`
}

const getYargEventLabel = (eventType: YargEventType): string =>
  YARG_EVENT_OPTIONS.find((option) => option.value === eventType)?.label ?? eventType

const getAudioEventLabel = (eventType: AudioEventNode['eventType']): string =>
  AUDIO_EVENT_OPTIONS.find((option) => option.value === eventType)?.label ?? eventType

const getConditionLabel = (condition: string, timeSource?: ValueSource): string => {
  if (!condition) return 'none'
  if (condition === 'delay') {
    const timeText = displayValueSource(timeSource, '0')
    return `delay [${timeText}ms]`
  }
  return condition
}

const getTextColorForBg = (name: string): string => {
  const lightish = ['white', 'yellow', 'amber', 'chartreuse', 'cyan', 'transparent']
  return lightish.includes(name) ? '#111827' : '#f9fafb'
}

const HIDDEN_CUE_TYPES = new Set(['NoCue', 'UnknownCue', 'Strobe', 'DisableAll', 'Strobe_Off'])

/** Returns false for internal/system cue types that should never appear in the UI selector. */
function isCueTypeSelectable(type: string): boolean {
  if (HIDDEN_CUE_TYPES.has(type)) return false
  if (type.startsWith('Keyframe_')) return false
  return true
}

/**
 * Picks a group id for an imported file when the original id is already registered.
 * Preserves the original string when it does not collide (case-insensitive).
 */
function suggestNonConflictingGroupId(
  originalId: string,
  takenLowercase: ReadonlySet<string>,
): string {
  const base = originalId.trim() || 'imported-group'
  if (!takenLowercase.has(base.toLowerCase())) {
    return base
  }
  let n = 2
  let candidate = `${base}-imported`
  while (takenLowercase.has(candidate.toLowerCase())) {
    candidate = `${base}-imported-${n}`
    n += 1
  }
  return candidate
}

type AnyNodeCue = YargNodeCueDefinition | AudioNodeCueDefinition

/** Reads the cue-type identifier for a lighting cue: `cueType` (YARG) or `cueTypeId` (audio). */
function getCueTypeId(cue: AnyNodeCue): string | null {
  if (cue.kind !== 'lighting') return null
  if ('cueType' in cue) return (cue as YargNodeCueDefinition & { kind: 'lighting' }).cueType
  return (cue as AudioNodeCueDefinition & { kind: 'lighting' }).cueTypeId
}

/** Writes the cue-type identifier back onto a lighting cue, matching its YARG/audio shape. */
function setCueTypeId(cue: AnyNodeCue, value: string): void {
  if (cue.kind !== 'lighting') return
  if ('cueType' in cue) {
    ;(cue as YargNodeCueDefinition & { kind: 'lighting' }).cueType = value as never
  } else {
    ;(cue as AudioNodeCueDefinition & { kind: 'lighting' }).cueTypeId = value
  }
}

export type CueCollisionResult = {
  cue: AnyNodeCue
  notices: string[]
}

/**
 * Reconciles a cue (typically pasted from another cue in the JSON view) against its sibling
 * cues so it can be saved without colliding on identity. Returns a clone with a unique id,
 * a de-duplicated name, and (for lighting cues) a free cue type, plus a human-readable notice
 * for every adjustment applied. The input is never mutated.
 */
function resolveCueCollisions(
  cue: AnyNodeCue,
  siblings: AnyNodeCue[],
  availableCueTypes: string[],
): CueCollisionResult {
  const next = JSON.parse(JSON.stringify(cue)) as AnyNodeCue
  const notices: string[] = []

  // (a) ID collision — regenerate against any sibling id.
  const siblingIds = new Set(siblings.map((c) => c.id))
  if (siblingIds.has(next.id)) {
    next.id = `cue-${createId()}`
    notices.push(`ID already in use — regenerated to "${next.id}".`)
  }

  // (b) Name collision — append " (pasted1)", " (pasted2)", … until unique (case-insensitive).
  const siblingNamesLower = new Set(siblings.map((c) => (c.name ?? '').trim().toLowerCase()))
  const originalName = (next.name ?? '').trim()
  if (siblingNamesLower.has(originalName.toLowerCase())) {
    let n = 1
    let candidate = `${originalName} (pasted${n})`
    while (siblingNamesLower.has(candidate.toLowerCase())) {
      n += 1
      candidate = `${originalName} (pasted${n})`
    }
    next.name = candidate
    notices.push(`Name already in use — renamed to "${candidate}".`)
  }

  // (c) Cue-type collision (lighting cues only) — reassign to a free type.
  const cueType = getCueTypeId(next)
  if (cueType !== null) {
    const inUse = new Set(siblings.map(getCueTypeId).filter((t): t is string => t !== null))
    if (inUse.has(cueType)) {
      const free = availableCueTypes.find((t) => !inUse.has(t))
      if (free) {
        setCueTypeId(next, free)
        notices.push(
          `Cue type "${cueType}" was already in use — changed to "${free}". You can change this in the main editor.`,
        )
      } else if ('cueTypeId' in next) {
        // Audio cue types are free-form: synthesise a unique id when the registry has none free.
        let n = 1
        let candidate = `${cueType}-pasted${n}`
        while (inUse.has(candidate)) {
          n += 1
          candidate = `${cueType}-pasted${n}`
        }
        setCueTypeId(next, candidate)
        notices.push(
          `Cue type "${cueType}" was already in use — changed to "${candidate}". You can change this in the main editor.`,
        )
      } else {
        notices.push(
          `Cue type "${cueType}" is already in use and no free cue type is available — change it in the main editor.`,
        )
      }
    }
  }

  return { cue: next, notices }
}

/** Returns the first item when sorted alphabetically by name (matches sidebar order). */
function firstByName<T extends { name?: string; id: string }>(items: T[]): T | null {
  if (items.length === 0) return null
  const sorted = [...items].sort((a, b) =>
    (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' }),
  )
  return sorted[0] ?? null
}

export {
  displayValueSource,
  firstByName,
  getAudioEventLabel,
  getConditionLabel,
  getTextColorForBg,
  getYargEventLabel,
  isCueTypeSelectable,
  resolveCueCollisions,
  suggestNonConflictingGroupId,
}
