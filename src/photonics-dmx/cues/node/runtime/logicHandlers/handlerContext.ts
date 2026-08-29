/**
 * Shared context and support helpers for the logic node handlers.
 *
 * Each handler receives the node (narrowed to its own `logicType`) and a {@link HandlerCtx}
 * carrying everything the handler bodies close over: the variable stores, the resolver inputs,
 * and the once-only warning keys. The evaluator builds one ctx per node evaluation and dispatches
 * through {@link LogicHandlerTable}.
 */

import type {
  Connection,
  LogicNode,
  NodeCueMode,
  VariableDefinition,
  VariableType,
} from '../../../types/nodeCueTypes'
import type { Color, TrackedLight } from '../../../../types'
import type { DmxLightManager } from '../../../../controllers/DmxLightManager'
import type { ExecutionContext } from '../ExecutionContext'
import type { VariableValue } from '../executionTypes'
import { createLogger } from '../../../../../shared/logger'

/** Shared by every handler, so log lines carry one prefix whichever module they come from. */
export const log = createLogger('logicNodeEvaluator')

/** The empty-slot / uninitialised value for a variable type, matching resolveValue's no-source defaults
 *  (arrays -> [], number -> 0, boolean -> false, others -> ''), with 'transparent' for a colour so an
 *  unwritten colour cell shows through rather than resolving to black. */
export function zeroForType(t: VariableType): number | boolean | string | TrackedLight[] | Color[] {
  if (t === 'light-array' || t === 'color-array') return []
  if (t === 'number') return 0
  if (t === 'boolean') return false
  if (t === 'color') return 'transparent'
  return ''
}

/** Expression nodes whose formula failed to parse and have already been warned about, keyed by
 *  `${nodeId}:${expression}`, so a malformed formula logs once instead of every frame. */
export const warnedExpressionParseErrors = new Set<string>()

/** Nodes whose input resolved to nothing usable (an empty source array, an empty palette, no
 *  valid indices, a variable of the wrong type) and have already been warned about, keyed by
 *  `${rigId}:${cueId}:${nodeId}:${reason}`. A rig with no lights in a group is a valid setup,
 *  so such a node logs once per rig. */
const warnedDegenerateInputNodes = new Set<string>()

/** Logs `message` the first time a given key is seen. */
export function warnOncePerNode(key: string, message: string): void {
  if (warnedDegenerateInputNodes.has(key)) return
  warnedDegenerateInputNodes.add(key)
  log.warn(message)
}

/** Everything a logic handler needs beyond the node itself. */
export interface HandlerCtx {
  nodeId: string
  edges: Connection[]
  context: ExecutionContext
  cueId: string
  /** The domain the running cue belongs to, so `cue-data` resolves against the right extractor. */
  mode: NodeCueMode
  /** Absent for graphs that drive no lights; the light-dependent handlers throw when it is needed. */
  lightManager?: DmxLightManager
  variableDefinitions: VariableDefinition[]
  /** Needed directly by `frame-gate`, which keeps its counter in an internal cue-store key. */
  cueLevelVarStore: Map<string, VariableValue>
  /** Resolves a variable name to the store its declared scope puts it in (cue vs cue-group). */
  getVarStore: (varName: string) => Map<string, VariableValue>
  /** Once-only warning key for a degenerate input, carrying the rig id so a node that is fine on
   *  one rig and degenerate on another warns per rig. */
  degenerateKey: (suffix: string) => string
  /** ` [rig: <label>]` when the rig is named, otherwise empty. Appended to degenerate-input warnings. */
  rigSuffix: string
  /** When set, debugger nodes send payloads here (e.g. to the renderer via IPC). */
  debugOutput?: (channel: string, data: unknown) => void
  /** Every outgoing edge's target: the default "carry on" result most handlers return. */
  next: () => string[]
}

/** A handler for one `logicType`, receiving that variant of the union. */
export type LogicHandler<K extends LogicNode['logicType']> = (
  node: Extract<LogicNode, { logicType: K }>,
  ctx: HandlerCtx,
) => string[]

/**
 * One handler per logic type. Total rather than Partial, so adding a member to the `LogicNode`
 * union fails the build here until it is given a handler.
 */
export type LogicHandlerTable = {
  [K in LogicNode['logicType']]: LogicHandler<K>
}
