/** Handlers for the numeric logic nodes: arithmetic, formulas, clamping, wall-clock pulses, rolls. */

import type { RandomRoll } from '../../../types/nodeCueTypes'
import type { TrackedLight } from '../../../../types'
import { randomBetween, shuffle } from '../../../../helpers/utils'
import { resolveValue } from '../valueResolver'
import { compileExpression } from '../expressionEvaluator'
import { monotonicNowMs } from '../../../../../shared/time'
import { log, warnedExpressionParseErrors, type LogicHandler } from './handlerContext'

export const mathHandler: LogicHandler<'math'> = (logicNode, ctx) => {
  const { context, variableDefinitions, getVarStore } = ctx
  const left = Number(resolveValue('number', logicNode.left, context, variableDefinitions))
  const right = Number(resolveValue('number', logicNode.right, context, variableDefinitions))
  let result = 0

  switch (logicNode.operator) {
    case 'add':
      result = left + right
      break
    case 'subtract':
      result = left - right
      break
    case 'multiply':
      result = left * right
      break
    // Divide/modulus by zero intentionally clamp to 0 rather than throwing: math nodes absorb
    // bad operands as a data condition instead of surfacing a runtime error.
    case 'divide':
      result = right === 0 ? 0 : left / right
      break
    case 'modulus':
      result = right === 0 ? 0 : left % right
      break
    // Proper modulo, always in [0, right), unlike `modulus` which keeps JS `%` sign. Wraps a
    // possibly-negative index or step back into range (the ((n % r) + r) % r idiom used elsewhere).
    case 'wrap':
      result = right === 0 ? 0 : ((left % right) + right) % right
      break
  }

  if (logicNode.assignTo) {
    const varStore = getVarStore(logicNode.assignTo)
    varStore.set(logicNode.assignTo, { type: 'number', value: result })
  }

  return ctx.next()
}

export const expressionHandler: LogicHandler<'expression'> = (logicNode, ctx) => {
  const { nodeId, context, variableDefinitions, getVarStore } = ctx
  // Evaluate the formula, resolving each identifier as a number variable through the SAME resolver
  // every other node uses (so scope/typing match). An unresolvable (undeclared/uninitialized) variable
  // reads as 0 rather than throwing, like the math node absorbing a divide-by-zero, so one stray name
  // can't blank the whole cue. A formula that fails to parse warns once (the graph re-runs every frame)
  // and leaves the target unwritten.
  let result = 0
  try {
    result = compileExpression(logicNode.expression).evaluate((name) => {
      try {
        return Number(
          resolveValue('number', { source: 'variable', name }, context, variableDefinitions),
        )
      } catch {
        return 0
      }
    })
  } catch (err) {
    const warnKey = `${nodeId}:${logicNode.expression}`
    if (!warnedExpressionParseErrors.has(warnKey)) {
      warnedExpressionParseErrors.add(warnKey)
      log.warn(`expression node ${nodeId}: ${err instanceof Error ? err.message : String(err)}`)
    }
    return ctx.next()
  }
  const varStore = getVarStore(logicNode.assignTo)
  varStore.set(logicNode.assignTo, { type: 'number', value: result })
  return ctx.next()
}

export const clampHandler: LogicHandler<'clamp'> = (logicNode, ctx) => {
  const { context, variableDefinitions, getVarStore } = ctx
  const value = Number(resolveValue('number', logicNode.value, context, variableDefinitions))
  const min = Number(resolveValue('number', logicNode.min, context, variableDefinitions))
  const max = Number(resolveValue('number', logicNode.max, context, variableDefinitions))
  // Constrain value to [min, max]. A degenerate range (min > max) clamps to max, since
  // Math.min(max, Math.max(min, value)) resolves to max rather than throwing.
  const result = Math.min(Math.max(value, min), max)
  const varStore = getVarStore(logicNode.assignTo)
  varStore.set(logicNode.assignTo, { type: 'number', value: result })
  return ctx.next()
}

export const pulseHandler: LogicHandler<'pulse'> = (logicNode, ctx) => {
  const { context, variableDefinitions, getVarStore } = ctx
  // Turn wall-clock time into a cycle index (+ optional fractional phase) so downstream nodes can
  // strobe (conditional on phase) or sequence (wrap the index into select-from-list) at a
  // tempo-locked, fps-independent rate. Stateful: the cycle origin is persisted in anchorVar, a
  // cue-level var that resets on cue-started, so the phase is activation-relative and restarts each
  // time the cue re-fires. The graph re-runs every cue-called frame, reading the clock afresh.
  const now = monotonicNowMs()
  const anchorStore = getVarStore(logicNode.anchorVar)
  const stored = anchorStore.get(logicNode.anchorVar)
  let anchor = stored ? Number(stored.value) : NaN
  // Unseeded (undefined var) or reset-to-default 0 both mean "capture the origin now".
  if (!Number.isFinite(anchor) || anchor <= 0) {
    anchor = now
    anchorStore.set(logicNode.anchorVar, { type: 'number', value: anchor })
  }
  // Guard interval to >= 1ms: a zero/negative/NaN interval would divide-by-zero the cycle math.
  const interval = Math.max(
    1,
    Number(resolveValue('number', logicNode.interval, context, variableDefinitions)),
  )
  const cycles = (now - anchor) / interval
  const index = Math.floor(cycles)
  getVarStore(logicNode.assignTo).set(logicNode.assignTo, { type: 'number', value: index })
  if (logicNode.assignPhase) {
    getVarStore(logicNode.assignPhase).set(logicNode.assignPhase, {
      type: 'number',
      value: cycles - index,
    })
  }
  return ctx.next()
}

export const randomHandler: LogicHandler<'random'> = (logicNode, ctx) => {
  const { nodeId, context, variableDefinitions, getVarStore } = ctx
  // Perform one roll into its assignTo var. A multi-roll node lists rolls in `rolls`; a legacy
  // single-roll node reads as one roll (the node itself satisfies the RandomRoll shape).
  const performRoll = (roll: RandomRoll): void => {
    const varStore = getVarStore(roll.assignTo)
    if (roll.mode === 'random-integer') {
      const minVal = Number(
        resolveValue(
          'number',
          roll.min ?? { source: 'literal', value: 0 },
          context,
          variableDefinitions,
        ),
      )
      const maxVal = Number(
        resolveValue(
          'number',
          roll.max ?? { source: 'literal', value: 1 },
          context,
          variableDefinitions,
        ),
      )
      const min = Math.floor(minVal)
      const max = Math.floor(maxVal)
      const result = min <= max ? randomBetween(min, max) : min
      varStore.set(roll.assignTo, { type: 'number', value: result })
    } else if (roll.mode === 'random-choice') {
      const choices = roll.choices ?? []
      const result = choices.length > 0 ? choices[randomBetween(0, choices.length - 1)] ?? '' : ''
      varStore.set(roll.assignTo, { type: 'string', value: result })
    } else if (roll.mode === 'random-light') {
      const sourceVarStore = getVarStore(roll.sourceVariable ?? '')
      const sourceVar = sourceVarStore.get(roll.sourceVariable ?? '')
      if (!sourceVar || sourceVar.type !== 'light-array') {
        log.warn(
          `random node ${nodeId}: source variable "${roll.sourceVariable}" is not a light-array`,
        )
        return
      }
      const lightsArray = sourceVar.value as TrackedLight[]
      const countVal = Number(
        resolveValue(
          'number',
          roll.count ?? { source: 'literal', value: 1 },
          context,
          variableDefinitions,
        ),
      )
      const count = Math.max(0, Math.min(Math.floor(countVal), lightsArray.length))
      const shuffled = shuffle(lightsArray)
      const picked = shuffled.slice(0, count)
      varStore.set(roll.assignTo, { type: 'light-array', value: picked })
    }
  }

  const rolls = logicNode.rolls && logicNode.rolls.length > 0 ? logicNode.rolls : [logicNode]
  for (const roll of rolls) {
    performRoll(roll)
  }
  return ctx.next()
}
