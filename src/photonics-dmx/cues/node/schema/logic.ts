/**
 * The logic node schema: a union over every logic node kind, composed from the per-family
 * schemas in `logicNodes/`.
 */
import { JSONSchemaType } from 'ajv'
import type { LogicNode } from '../../types/nodeCueTypes'
import {
  arrayLengthLogicSchema,
  buildRingLogicSchema,
  colorFromIndexLogicSchema,
  concatColorsLogicSchema,
  concatLightsLogicSchema,
  createPairsLogicSchema,
  forEachLightLogicSchema,
  lightsFromIndexLogicSchema,
  reverseColorsLogicSchema,
  reverseLightsLogicSchema,
  shuffleColorsLogicSchema,
  shuffleLightsLogicSchema,
} from './logicNodes/collectionSchemas'
import {
  configDataLogicSchema,
  cueDataLogicSchema,
  debuggerLogicSchema,
  indexedVariableLogicSchema,
  ledChangedLogicSchema,
} from './logicNodes/dataSchemas'
import {
  delayLogicSchema,
  frameGateLogicSchema,
  tempoLogicSchema,
} from './logicNodes/timingSchemas'
import {
  clampLogicSchema,
  conditionalLogicSchema,
  expressionLogicSchema,
  mathLogicSchema,
  pulseLogicSchema,
  randomLogicSchema,
  selectFromListLogicSchema,
  variableLogicSchema,
} from './logicNodes/valueSchemas'

export const logicNodeSchema = {
  oneOf: [
    variableLogicSchema,
    mathLogicSchema,
    expressionLogicSchema,
    clampLogicSchema,
    selectFromListLogicSchema,
    pulseLogicSchema,
    conditionalLogicSchema,
    frameGateLogicSchema,
    tempoLogicSchema,
    cueDataLogicSchema,
    configDataLogicSchema,
    lightsFromIndexLogicSchema,
    colorFromIndexLogicSchema,
    reverseColorsLogicSchema,
    concatColorsLogicSchema,
    shuffleColorsLogicSchema,
    arrayLengthLogicSchema,
    reverseLightsLogicSchema,
    createPairsLogicSchema,
    concatLightsLogicSchema,
    buildRingLogicSchema,
    delayLogicSchema,
    debuggerLogicSchema,
    randomLogicSchema,
    shuffleLightsLogicSchema,
    forEachLightLogicSchema,
    indexedVariableLogicSchema,
    ledChangedLogicSchema,
  ],
} as unknown as JSONSchemaType<LogicNode>
