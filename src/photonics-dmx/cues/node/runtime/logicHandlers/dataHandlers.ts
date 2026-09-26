/** Handlers for the data-source logic nodes: reading the game frame and the rig configuration. */

import { inferVariableValue } from '../valueResolver'
import { extractCueDataValue, extractConfigDataValue } from '../dataExtractors'
import type { VariableValue } from '../executionTypes'
import type { NodeCueMode } from '../../../types/nodeCueTypes'
import { getCueDomain } from '../../../domains'
import {
  getAudioCueDataPropertyMeta,
  getNetCueDataPropertyMeta,
} from '../../../../constants/cueDataPropertyMeta'
import type { LogicHandler } from './handlerContext'

/** The empty value of a cue-data property's type, for a frame that does not carry the field. */
function emptyCueDataValue(property: string, mode: NodeCueMode): VariableValue {
  const meta =
    getCueDomain(mode).family === 'audio'
      ? getAudioCueDataPropertyMeta(property)
      : getNetCueDataPropertyMeta(property)
  switch (meta?.type) {
    case 'number':
      return { type: 'number', value: 0 }
    case 'boolean':
      return { type: 'boolean', value: false }
    default:
      return { type: 'string', value: '' }
  }
}

export const cueDataHandler: LogicHandler<'cue-data'> = (logicNode, ctx) => {
  const { cueId, mode, context, getVarStore } = ctx
  const value = extractCueDataValue(logicNode.dataProperty, context.cueData, cueId, mode)

  if (logicNode.assignTo) {
    getVarStore(logicNode.assignTo).set(
      logicNode.assignTo,
      value === undefined
        ? emptyCueDataValue(logicNode.dataProperty, mode)
        : inferVariableValue(value),
    )
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
    getVarStore(logicNode.assignTo).set(
      logicNode.assignTo,
      Array.isArray(value) ? { type: 'light-array', value } : { type: 'number', value },
    )
  }

  return ctx.next()
}
