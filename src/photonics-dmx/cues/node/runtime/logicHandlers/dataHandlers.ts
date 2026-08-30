/** Handlers for the data-source logic nodes: reading the game frame and the rig configuration. */

import { inferType } from '../valueResolver'
import { extractCueDataValue, extractConfigDataValue } from '../dataExtractors'
import type { LogicHandler } from './handlerContext'

export const cueDataHandler: LogicHandler<'cue-data'> = (logicNode, ctx) => {
  const { cueId, mode, context, getVarStore } = ctx
  const value = extractCueDataValue(logicNode.dataProperty, context.cueData, cueId, mode)

  if (logicNode.assignTo) {
    const varStore = getVarStore(logicNode.assignTo)
    const type = inferType(value)
    varStore.set(logicNode.assignTo, { type, value })
  }

  return ctx.next()
}

export const configDataHandler: LogicHandler<'config-data'> = (logicNode, ctx) => {
  const { lightManager, getVarStore } = ctx
  if (!lightManager) {
    throw new Error('config-data logic is not supported without a light manager')
  }
  const value = extractConfigDataValue(logicNode.dataProperty, lightManager)

  if (logicNode.assignTo) {
    const varStore = getVarStore(logicNode.assignTo)
    const type = Array.isArray(value) ? 'light-array' : 'number'
    varStore.set(logicNode.assignTo, { type, value })
  }

  return ctx.next()
}
