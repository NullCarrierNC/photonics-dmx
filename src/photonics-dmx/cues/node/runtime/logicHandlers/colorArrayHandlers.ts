/**
 * Handlers for the colour-array logic nodes: palette indexing, reversing, concatenating, shuffling.
 * `array-length` lives here too because it is the one array node that accepts either element type.
 */

import type { Color } from '../../../../types'
import { shuffle } from '../../../../helpers/utils'
import { resolveValue } from '../valueResolver'
import { log, warnOncePerNode, type LogicHandler } from './handlerContext'

export const colorFromIndexHandler: LogicHandler<'color-from-index'> = (logicNode, ctx) => {
  const { nodeId, context, variableDefinitions, getVarStore, degenerateKey, rigSuffix } = ctx
  // Pick a colour from a palette by index, with wraparound. The colour analogue of
  // lights-from-index. The palette is a ValueSource resolving to a color-array: an inline
  // literal Color[] (enum-validated at load) or a color-array variable.
  const colors = resolveValue(
    'color-array',
    logicNode.colors,
    context,
    variableDefinitions,
  ) as Color[]
  if (!colors || colors.length === 0) {
    warnOncePerNode(
      degenerateKey('palette-empty'),
      `color-from-index node ${nodeId}: colors palette is empty${rigSuffix}`,
    )
    return ctx.next()
  }

  const rawIndex = Number(resolveValue('number', logicNode.index, context, variableDefinitions))
  const idx = Math.floor(isNaN(rawIndex) ? 0 : rawIndex)
  const wrapped = ((idx % colors.length) + colors.length) % colors.length

  const targetVarStore = getVarStore(logicNode.assignTo)
  targetVarStore.set(logicNode.assignTo, { type: 'color', value: colors[wrapped] })

  return ctx.next()
}

export const reverseColorsHandler: LogicHandler<'reverse-colors'> = (logicNode, ctx) => {
  const { nodeId, getVarStore } = ctx
  const sourceVarStore = getVarStore(logicNode.sourceVariable)
  const sourceVar = sourceVarStore.get(logicNode.sourceVariable)

  if (!sourceVar || sourceVar.type !== 'color-array') {
    log.warn(
      `reverse-colors node ${nodeId}: source variable "${logicNode.sourceVariable}" is not a color-array`,
    )
    return ctx.next()
  }

  const colorsArray = sourceVar.value as Color[]
  const reversed = [...colorsArray].reverse()

  const targetVarStore = getVarStore(logicNode.assignTo)
  targetVarStore.set(logicNode.assignTo, { type: 'color-array', value: reversed })

  return ctx.next()
}

export const concatColorsHandler: LogicHandler<'concat-colors'> = (logicNode, ctx) => {
  const { nodeId, getVarStore } = ctx
  const concatResult: Color[] = []

  for (const varName of logicNode.sourceVariables) {
    const sourceVarStore = getVarStore(varName)
    const sourceVar = sourceVarStore.get(varName)

    if (sourceVar && sourceVar.type === 'color-array') {
      concatResult.push(...(sourceVar.value as Color[]))
    } else {
      log.warn(`concat-colors node ${nodeId}: variable "${varName}" is not a color-array, skipping`)
    }
  }

  const targetVarStore = getVarStore(logicNode.assignTo)
  targetVarStore.set(logicNode.assignTo, { type: 'color-array', value: concatResult })

  return ctx.next()
}

export const shuffleColorsHandler: LogicHandler<'shuffle-colors'> = (logicNode, ctx) => {
  const { nodeId, getVarStore } = ctx
  const sourceVarStore = getVarStore(logicNode.sourceVariable)
  const sourceVar = sourceVarStore.get(logicNode.sourceVariable)

  if (!sourceVar || sourceVar.type !== 'color-array') {
    log.warn(
      `shuffle-colors node ${nodeId}: source variable "${logicNode.sourceVariable}" is not a color-array`,
    )
    return ctx.next()
  }

  const colorsArray = sourceVar.value as Color[]
  const shuffled = shuffle(colorsArray)

  const targetVarStore = getVarStore(logicNode.assignTo)
  targetVarStore.set(logicNode.assignTo, { type: 'color-array', value: shuffled })

  return ctx.next()
}

export const arrayLengthHandler: LogicHandler<'array-length'> = (logicNode, ctx) => {
  const { nodeId, getVarStore } = ctx
  // Get the source array variable (light-array or color-array)
  const sourceVarStore = getVarStore(logicNode.sourceVariable)
  const sourceVar = sourceVarStore.get(logicNode.sourceVariable)

  let length = 0
  if (sourceVar && (sourceVar.type === 'light-array' || sourceVar.type === 'color-array')) {
    length = (sourceVar.value as unknown[]).length
  } else {
    log.warn(
      `array-length node ${nodeId}: source variable "${logicNode.sourceVariable}" is not an array`,
    )
  }

  // Assign the length to the target variable
  const targetVarStore = getVarStore(logicNode.assignTo)
  targetVarStore.set(logicNode.assignTo, { type: 'number', value: length })

  return ctx.next()
}
