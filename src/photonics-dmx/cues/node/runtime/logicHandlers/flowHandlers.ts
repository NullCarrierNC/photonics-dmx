/**
 * Handlers for the control-flow logic nodes: branching, gating, tempo derivation, list selection,
 * the engine-blocking delay, and the debugger tap.
 */

import { RENDERER_RECEIVE } from '../../../../../shared/ipcChannels'
import {
  TEMPO_DEFAULTS,
  type LogicNode,
  type ValueSource,
  type VariableType,
} from '../../../types/nodeCueTypes'
import { resolveValue } from '../valueResolver'
import { extractCueDataValue } from '../dataExtractors'
import { log, type HandlerCtx, type LogicHandler } from './handlerContext'

export const selectFromListHandler: LogicHandler<'select-from-list'> = (logicNode, ctx) => {
  const { nodeId, context, variableDefinitions, getVarStore } = ctx
  // Pick a number from an inline list by index, with wraparound (the numeric analogue of
  // color-from-index). An empty list leaves the target variable unwritten.
  const list = logicNode.list
  if (!list || list.length === 0) {
    log.warn(`select-from-list node ${nodeId}: list is empty`)
    return ctx.next()
  }
  const rawIndex = Number(resolveValue('number', logicNode.index, context, variableDefinitions))
  const idx = Math.floor(isNaN(rawIndex) ? 0 : rawIndex)
  const wrapped = ((idx % list.length) + list.length) % list.length
  const targetVarStore = getVarStore(logicNode.assignTo)
  targetVarStore.set(logicNode.assignTo, { type: 'number', value: list[wrapped] })
  return ctx.next()
}

export const conditionalHandler: LogicHandler<'conditional'> = (logicNode, ctx) => {
  const { edges, context, variableDefinitions } = ctx
  const resolveType = (source: ValueSource | undefined): VariableType => {
    if (!source) return 'number'
    if (source.source === 'literal') {
      if (Array.isArray(source.value)) return 'light-array'
      if (typeof source.value === 'boolean') return 'boolean'
      if (typeof source.value === 'number') return 'number'
      return 'string'
    }
    const cueVar = context.cueLevelVarStore.get(source.name)
    const groupVar = context.groupLevelVarStore.get(source.name)
    const existing = cueVar ?? groupVar
    if (existing) return existing.type as VariableType
    return 'number'
  }

  let leftType = resolveType(logicNode.left)
  let rightType = resolveType(logicNode.right)

  // When one side is a variable (strongly typed) and the other is a literal,
  // coerce the literal's effective type to match -- prevents JSON serialisation
  // artefacts (e.g. "1" instead of 1) from changing comparison semantics.
  if (logicNode.left?.source === 'variable' && logicNode.right?.source === 'literal') {
    rightType = leftType
  } else if (logicNode.left?.source === 'literal' && logicNode.right?.source === 'variable') {
    leftType = rightType
  }

  const useStringCompare =
    leftType === 'string' ||
    rightType === 'string' ||
    leftType === 'cue-type' ||
    rightType === 'cue-type' ||
    leftType === 'color' ||
    rightType === 'color' ||
    leftType === 'event' ||
    rightType === 'event'
  const useBooleanCompare = leftType === 'boolean' || rightType === 'boolean'

  let outcome = false

  if (logicNode.comparator === '==' || logicNode.comparator === '!=') {
    if (useBooleanCompare) {
      const left = resolveValue('boolean', logicNode.left, context, variableDefinitions)
      const right = resolveValue('boolean', logicNode.right, context, variableDefinitions)
      outcome = logicNode.comparator === '==' ? left === right : left !== right
    } else if (useStringCompare) {
      const left = resolveValue('string', logicNode.left, context, variableDefinitions)
      const right = resolveValue('string', logicNode.right, context, variableDefinitions)
      outcome = logicNode.comparator === '==' ? left === right : left !== right
    } else {
      const left = Number(resolveValue('number', logicNode.left, context, variableDefinitions))
      const right = Number(resolveValue('number', logicNode.right, context, variableDefinitions))
      outcome = logicNode.comparator === '==' ? left === right : left !== right
    }
  } else {
    const left = Number(resolveValue('number', logicNode.left, context, variableDefinitions))
    const right = Number(resolveValue('number', logicNode.right, context, variableDefinitions))
    switch (logicNode.comparator) {
      case '>':
        outcome = left > right
        break
      case '>=':
        outcome = left >= right
        break
      case '<':
        outcome = left < right
        break
      case '<=':
        outcome = left <= right
        break
    }
  }

  const branch = outcome ? 'true' : 'false'
  const targeted = edges.filter((edge) => edge.fromPort === branch)
  return targeted.map((edge) => edge.to)
}

export const frameGateHandler: LogicHandler<'frame-gate'> = (logicNode, ctx) => {
  const { nodeId, edges, context, variableDefinitions, cueLevelVarStore } = ctx
  // Fire the `true` port every `divisor`-th time this node is reached, `false` otherwise. The counter
  // lives in an internal cue-store key (no `__`-prefixed collision with authored names) and is cleared
  // with the cue-level vars on each activation, so the gate phase restarts per activation without an
  // authored counter variable.
  const key = `__framegate_${nodeId}`
  const count = Number(cueLevelVarStore.get(key)?.value ?? 0) + 1
  cueLevelVarStore.set(key, { type: 'number', value: count })
  // A non-finite divisor (e.g. an expression that produced NaN) would make `count % divisor` never 0
  // and stick the gate on the false port, so it falls back to 1 (fire every frame).
  const rawDivisor = Number(resolveValue('number', logicNode.divisor, context, variableDefinitions))
  const divisor = Number.isFinite(rawDivisor) ? Math.max(1, Math.round(rawDivisor)) : 1
  const branch = count % divisor === 0 ? 'true' : 'false'
  return edges.filter((edge) => edge.fromPort === branch).map((edge) => edge.to)
}

export const tempoHandler: LogicHandler<'tempo'> = (logicNode, ctx) => {
  const { cueId, mode, context, variableDefinitions, getVarStore } = ctx
  // Read the song tempo and write the derived timing vars in one node, replacing the per-cue
  // read/guard/clamp/multiply/band chain. A song reporting no tempo (bpm <= 0 on menus/practice) falls
  // back to fallbackBeatMs before clamping, so tempo-locked tweens still breathe at a sensible rate.
  // numOr absorbs an absent (null/undefined) or non-numeric bound as the default rather than poisoning
  // the whole derivation with NaN.
  const numOr = (vs: ValueSource | undefined, dflt: number): number => {
    if (vs == null) return dflt
    const n = Number(resolveValue('number', vs, context, variableDefinitions))
    return Number.isFinite(n) ? n : dflt
  }

  const bpm = Number(extractCueDataValue('bpm', context.cueData, cueId, mode))
  const beatMsRaw =
    bpm > 0
      ? Math.round(60000 / bpm)
      : numOr(logicNode.fallbackBeatMs, TEMPO_DEFAULTS.fallbackBeatMs)
  const beatMs = Math.min(
    Math.max(beatMsRaw, numOr(logicNode.minBeatMs, TEMPO_DEFAULTS.minBeatMs)),
    numOr(logicNode.maxBeatMs, TEMPO_DEFAULTS.maxBeatMs),
  )
  const barMs = beatMs * numOr(logicNode.beatsPerBar, TEMPO_DEFAULTS.beatsPerBar)
  const phraseMs = barMs * numOr(logicNode.barsPerPhrase, TEMPO_DEFAULTS.barsPerPhrase)

  getVarStore(logicNode.assignBeatMs).set(logicNode.assignBeatMs, {
    type: 'number',
    value: beatMs,
  })
  if (logicNode.assignBarMs) {
    getVarStore(logicNode.assignBarMs).set(logicNode.assignBarMs, {
      type: 'number',
      value: barMs,
    })
  }
  if (logicNode.assignPhraseMs) {
    getVarStore(logicNode.assignPhraseMs).set(logicNode.assignPhraseMs, {
      type: 'number',
      value: phraseMs,
    })
  }

  if (logicNode.assignCycles) {
    const bands = logicNode.cycleBands ?? TEMPO_DEFAULTS.cycleBands
    const values = logicNode.cycleValues ?? TEMPO_DEFAULTS.cycleValues
    // Start at the base value and override to the next band's value for each ascending threshold met,
    // mirroring the chain's independent "if bpm >= band" set nodes.
    let cycles = values[0] ?? 0
    for (let i = 0; i < bands.length; i++) {
      if (bpm >= bands[i]) cycles = values[i + 1] ?? cycles
    }
    getVarStore(logicNode.assignCycles).set(logicNode.assignCycles, {
      type: 'number',
      value: cycles,
    })
  }

  return ctx.next()
}

export const delayHandler: LogicHandler<'delay'> = (_logicNode, ctx) => {
  // Delay nodes are handled specially in the execution engine (they block).
  // This handler just returns the next nodes - the actual delay happens in NodeExecutionEngine.
  return ctx.next()
}

export const debuggerHandler: LogicHandler<'debugger'> = (logicNode, ctx) => {
  const { context, variableDefinitions, getVarStore, debugOutput } = ctx
  // Log the message
  const message = String(resolveValue('string', logicNode.message, context, variableDefinitions))
  log.info(`[DebuggerNode] ${message}`)

  // Log checked variables with their current values
  const variablesForLog = logicNode.variablesToLog.map((varName) => {
    const varStore = getVarStore(varName)
    const variable = varStore.get(varName)
    return {
      name: varName,
      value: variable ? variable.value : undefined,
    }
  })

  for (const varName of logicNode.variablesToLog) {
    const varStore = getVarStore(varName)
    const variable = varStore.get(varName)
    if (variable) {
      log.info(`[DebuggerNode] ${varName}:`, variable.value)
    } else {
      log.info(`[DebuggerNode] ${varName}: <undefined>`)
    }
  }

  debugOutput?.(RENDERER_RECEIVE.DEBUG_LOG, {
    message,
    variables: variablesForLog,
    timestamp: Date.now(),
  })

  return ctx.next()
}

/**
 * `for-each-light` and `led-changed` are intercepted by the execution engine before evaluation
 * (see BaseNodeExecutionEngine), which runs their branches itself. Reaching a handler here means
 * the node was evaluated outside that path, so it carries on down every edge.
 */
export function engineHandledPassThrough<K extends LogicNode['logicType']>(
  _logicNode: Extract<LogicNode, { logicType: K }>,
  ctx: HandlerCtx,
): string[] {
  return ctx.next()
}
