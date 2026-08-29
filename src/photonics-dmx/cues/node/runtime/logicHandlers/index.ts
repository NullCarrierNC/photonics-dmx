/**
 * The logic node dispatch table: one handler per `LogicNode['logicType']`.
 *
 * Mirrors the editor's `LOGIC_NODE_FACTORIES` (renderer useNodeCreation), so authoring a node type
 * and executing it are described the same way. Because {@link LogicHandlerTable} is a total mapped
 * type, adding a member to the `LogicNode` union fails the build here until it is given a handler.
 */

import type { LogicHandlerTable } from './handlerContext'
import { variableHandler, indexedVariableHandler } from './variableHandlers'
import {
  mathHandler,
  expressionHandler,
  clampHandler,
  pulseHandler,
  randomHandler,
} from './numericHandlers'
import {
  selectFromListHandler,
  conditionalHandler,
  frameGateHandler,
  tempoHandler,
  delayHandler,
  debuggerHandler,
  engineHandledPassThrough,
} from './flowHandlers'
import { cueDataHandler, configDataHandler } from './dataHandlers'
import {
  lightsFromIndexHandler,
  reverseLightsHandler,
  createPairsHandler,
  concatLightsHandler,
  buildRingHandler,
  shuffleLightsHandler,
} from './lightArrayHandlers'
import {
  colorFromIndexHandler,
  reverseColorsHandler,
  concatColorsHandler,
  shuffleColorsHandler,
  arrayLengthHandler,
} from './colorArrayHandlers'

export const LOGIC_NODE_HANDLERS: LogicHandlerTable = {
  // Variable stores
  'variable': variableHandler,
  'indexed-variable': indexedVariableHandler,

  // Numeric
  'math': mathHandler,
  'expression': expressionHandler,
  'clamp': clampHandler,
  'pulse': pulseHandler,
  'random': randomHandler,

  // Control flow
  'select-from-list': selectFromListHandler,
  'conditional': conditionalHandler,
  'frame-gate': frameGateHandler,
  'tempo': tempoHandler,
  'delay': delayHandler,
  'debugger': debuggerHandler,

  // Data sources
  'cue-data': cueDataHandler,
  'config-data': configDataHandler,

  // Light arrays
  'lights-from-index': lightsFromIndexHandler,
  'reverse-lights': reverseLightsHandler,
  'create-pairs': createPairsHandler,
  'concat-lights': concatLightsHandler,
  'build-ring': buildRingHandler,
  'shuffle-lights': shuffleLightsHandler,

  // Colour arrays
  'color-from-index': colorFromIndexHandler,
  'reverse-colors': reverseColorsHandler,
  'concat-colors': concatColorsHandler,
  'shuffle-colors': shuffleColorsHandler,
  'array-length': arrayLengthHandler,

  // Run by the execution engine itself, which intercepts them before evaluation.
  'for-each-light': engineHandledPassThrough,
  'led-changed': engineHandledPassThrough,
}

export type { HandlerCtx, LogicHandler, LogicHandlerTable } from './handlerContext'
