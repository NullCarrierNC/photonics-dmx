import { createLogger } from '../../../../shared/logger'
import { migrateLegacyBearings } from '../loader/migrateLegacyBearings'
const log = createLogger('migrations')

/**
 * Converts legacy `timing.easing` string to ValueSource for backward compatibility.
 */
function migrateEasingInActions(actions: unknown[]): unknown[] {
  return actions.map((action) => {
    if (!action || typeof action !== 'object') return action
    const a = action as { timing?: Record<string, unknown> }
    const timing = a.timing
    if (!timing || typeof timing !== 'object') return action
    const easing = timing.easing
    if (typeof easing === 'string') {
      return {
        ...a,
        timing: {
          ...timing,
          easing: { source: 'literal', value: easing },
        },
      }
    }
    return action
  })
}

export function migrateEasingInNodeCueFile(value: unknown): unknown {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { cues?: unknown }).cues)) {
    return value
  }
  const file = value as { cues: Array<{ nodes?: { actions?: unknown[] } }> }
  const migratedCues = file.cues.map((cue) => {
    const actions = cue.nodes?.actions
    if (!Array.isArray(actions)) return cue
    return {
      ...cue,
      nodes: {
        ...cue.nodes,
        actions: migrateEasingInActions(actions),
      },
    }
  })
  const out = { ...file, cues: migratedCues }
  migrateLegacyBearings(out)
  return out
}

export function migrateEasingInEffectFile(value: unknown): unknown {
  if (
    !value ||
    typeof value !== 'object' ||
    !Array.isArray((value as { effects?: unknown }).effects)
  ) {
    return value
  }
  const file = value as { effects: Array<{ nodes?: { actions?: unknown[] } }> }
  const migratedEffects = file.effects.map((effect) => {
    const actions = effect.nodes?.actions
    if (!Array.isArray(actions)) return effect
    return {
      ...effect,
      nodes: {
        ...effect.nodes,
        actions: migrateEasingInActions(actions),
      },
    }
  })
  return { ...file, effects: migratedEffects }
}

/**
 * Legacy audio cues used `audio-beat` for entry `eventType` and sometimes for action `waitForCondition` /
 * `waitUntilCondition` literals. Renamed to `beat` (same as WaitCondition).
 * Mutates in place; logs once per file when anything is rewritten.
 */
function normalizeLegacyAudioBeatAliases(value: unknown): void {
  if (!value || typeof value !== 'object') {
    return
  }
  const file = value as { group?: { id?: string }; cues?: unknown[] }
  if (!Array.isArray(file.cues)) {
    return
  }
  const groupId = file.group?.id ?? '(unknown)'
  let changed = false

  const fixLiteralValueSource = (vs: unknown): void => {
    if (!vs || typeof vs !== 'object') {
      return
    }
    const v = vs as { source?: string; value?: unknown }
    if (v.source === 'literal' && v.value === 'audio-beat') {
      v.value = 'beat'
      changed = true
    }
  }

  for (const cue of file.cues) {
    if (!cue || typeof cue !== 'object') {
      continue
    }
    const nodes = (cue as { nodes?: { events?: unknown[]; actions?: unknown[] } }).nodes
    if (!nodes) {
      continue
    }

    if (Array.isArray(nodes.events)) {
      for (const ev of nodes.events) {
        if (!ev || typeof ev !== 'object') {
          continue
        }
        const e = ev as { eventType?: string }
        if (e.eventType === 'audio-beat') {
          e.eventType = 'beat'
          changed = true
        }
      }
    }

    if (Array.isArray(nodes.actions)) {
      for (const act of nodes.actions) {
        if (!act || typeof act !== 'object') {
          continue
        }
        const timing = (act as { timing?: unknown }).timing
        if (!timing || typeof timing !== 'object') {
          continue
        }
        const t = timing as { waitForCondition?: unknown; waitUntilCondition?: unknown }
        fixLiteralValueSource(t.waitForCondition)
        fixLiteralValueSource(t.waitUntilCondition)
      }
    }
  }

  if (changed) {
    log.warn(
      `[audio cue] '${groupId}': deprecated 'audio-beat' was renamed to 'beat' (entry events and/or action wait timing). Re-save in the editor to clear this warning.`,
    )
  }
}

/**
 * Migrates audio node cue file payload for backward compatibility (e.g. strip removed properties).
 * Returns a clone with deprecated fields removed so schema validation passes.
 */
function migrateAudioNodeCueFile(value: unknown): unknown {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { cues?: unknown }).cues)) {
    return value
  }
  const file = value as { cues: Array<{ nodes?: { events?: unknown[] } }> }
  const migratedCues = file.cues.map((cue) => {
    const events = cue.nodes?.events
    if (!Array.isArray(events)) return cue
    const migratedEvents = events.map((event) => {
      if (
        event &&
        typeof event === 'object' &&
        (event as { eventType?: string }).eventType === 'audio-trigger' &&
        'balance' in event
      ) {
        const { balance: _removed, ...rest } = event as { balance?: unknown; [k: string]: unknown }
        return rest
      }
      return event
    })
    return { ...cue, nodes: { ...cue.nodes, events: migratedEvents } }
  })
  return { ...file, cues: migratedCues }
}

export function prepareAudioNodeCueFileForValidation(value: unknown): unknown {
  normalizeLegacyAudioBeatAliases(value)
  return migrateEasingInNodeCueFile(migrateAudioNodeCueFile(value))
}
