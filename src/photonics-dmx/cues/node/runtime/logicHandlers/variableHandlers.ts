/** Handlers for the variable-store logic nodes: whole-variable reads/writes and indexed families. */

import { resolveNumber, resolveVariableValue } from '../valueResolver'
import { zeroForType, type LogicHandler } from './handlerContext'

export const variableHandler: LogicHandler<'variable'> = (logicNode, ctx) => {
  const { context, variableDefinitions, getVarStore } = ctx
  if (logicNode.mode !== 'get') {
    // A multi-set node lists its targets in `assignments`; a legacy single-set node reads as one.
    const assignments =
      logicNode.assignments && logicNode.assignments.length > 0
        ? logicNode.assignments
        : [
            {
              varName: logicNode.varName,
              valueType: logicNode.valueType,
              value: logicNode.value,
            },
          ]
    for (const assignment of assignments) {
      const value = resolveVariableValue(
        assignment.valueType,
        assignment.value,
        context,
        variableDefinitions,
      )
      const varStore = getVarStore(assignment.varName)
      if (logicNode.mode === 'init') {
        if (!varStore.has(assignment.varName)) {
          varStore.set(assignment.varName, value)
        }
      } else {
        varStore.set(assignment.varName, value)
      }
    }
  }
  return ctx.next()
}

export const indexedVariableHandler: LogicHandler<'indexed-variable'> = (logicNode, ctx) => {
  const { context, variableDefinitions, getVarStore } = ctx
  // Read or write one slot of a `${varName}#${index}` family. The slot lives in the same store the
  // base `varName` is declared in (cue vs cue-group), so a family of latches clears on activation.
  const rawIndex = resolveNumber(logicNode.index, context, variableDefinitions)
  const index = Math.floor(isNaN(rawIndex) ? 0 : rawIndex)
  const slotKey = `${logicNode.varName}#${index}`
  const varStore = getVarStore(logicNode.varName)
  const valueType = logicNode.valueType
  if (logicNode.mode === 'set') {
    varStore.set(
      slotKey,
      resolveVariableValue(valueType, logicNode.value, context, variableDefinitions),
    )
  } else if (logicNode.assignTo) {
    // get: always write the target so it can't read a stale value from a previous iteration. An empty
    // slot yields the family type's zero (matching the readers' no-source defaults, plus
    // 'transparent' for a colour so an unwritten cell shows through rather than paints black).
    const slot = varStore.get(slotKey)
    const targetStore = getVarStore(logicNode.assignTo)
    if (slot !== undefined) {
      targetStore.set(logicNode.assignTo, { type: slot.type, value: slot.value })
    } else {
      targetStore.set(logicNode.assignTo, { type: valueType, value: zeroForType(valueType) })
    }
  }
  return ctx.next()
}
