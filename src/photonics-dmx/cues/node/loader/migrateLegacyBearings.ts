import { migrateLegacyBearingToken } from '../../../helpers/stageDirections'

function maybeMigrateString(raw: unknown): unknown {
  if (typeof raw !== 'string') {
    return raw
  }
  const next = migrateLegacyBearingToken(raw)
  return next !== null ? next : raw
}

function migrateLiteralValueSource(valueSource: Record<string, unknown>): void {
  if (valueSource.source === 'literal' && typeof valueSource.value === 'string') {
    const next = migrateLegacyBearingToken(valueSource.value)
    if (next !== null) {
      valueSource.value = next
    }
  }
}

function migrateAction(action: unknown): void {
  if (!action || typeof action !== 'object') {
    return
  }
  const a = action as Record<string, unknown>

  const position = a.position
  if (position && typeof position === 'object') {
    const bearing = (position as Record<string, unknown>).bearing
    if (bearing && typeof bearing === 'object') {
      migrateLiteralValueSource(bearing as Record<string, unknown>)
    }
  }

  const motionPattern = a.motionPattern
  if (motionPattern && typeof motionPattern === 'object') {
    const bearing = (motionPattern as Record<string, unknown>).bearing
    if (bearing && typeof bearing === 'object') {
      migrateLiteralValueSource(bearing as Record<string, unknown>)
    }
  }
}

function migrateLogicNode(node: unknown): void {
  if (!node || typeof node !== 'object') {
    return
  }
  const ln = node as Record<string, unknown>
  const logicType = ln.logicType
  const mode = ln.mode

  if (logicType === 'random' && mode === 'random-choice' && Array.isArray(ln.choices)) {
    ln.choices = ln.choices.map((choice) =>
      typeof choice === 'string' ? (maybeMigrateString(choice) as string) : choice,
    )
  }

  if (logicType === 'variable' && typeof ln.value === 'object' && ln.value !== null) {
    migrateLiteralValueSource(ln.value as Record<string, unknown>)
  }
}

function migrateCueVariables(vars: unknown): void {
  if (!Array.isArray(vars)) {
    return
  }
  for (const v of vars) {
    if (!v || typeof v !== 'object') {
      continue
    }
    const def = v as Record<string, unknown>
    if (def.type === 'string' && typeof def.initialValue === 'string') {
      const next = migrateLegacyBearingToken(def.initialValue)
      if (next !== null) {
        def.initialValue = next
      }
    }
  }
}

/**
 * Rewrites legacy compass-bearing strings in cue file JSON before validation.
 * Mutates parsed object trees in place.
 */
export function migrateLegacyBearings(root: unknown): void {
  if (!root || typeof root !== 'object') {
    return
  }
  const file = root as Record<string, unknown>
  const cues = file.cues
  if (!Array.isArray(cues)) {
    return
  }

  for (const cue of cues) {
    if (!cue || typeof cue !== 'object') {
      continue
    }
    const c = cue as Record<string, unknown>
    migrateCueVariables(c.variables)

    const nodes = c.nodes
    if (!nodes || typeof nodes !== 'object') {
      continue
    }
    const n = nodes as Record<string, unknown>

    if (Array.isArray(n.actions)) {
      for (const action of n.actions) {
        migrateAction(action)
      }
    }
    if (Array.isArray(n.logic)) {
      for (const logicNode of n.logic) {
        migrateLogicNode(logicNode)
      }
    }
  }
}
