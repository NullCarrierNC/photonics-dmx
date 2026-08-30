/**
 * Logic node evaluation for the node execution engine.
 *
 * Builds the per-evaluation {@link HandlerCtx} and dispatches to the handler registered for the
 * node's `logicType` in {@link LOGIC_NODE_HANDLERS}. The handler bodies live under `logicHandlers/`,
 * grouped by family (variables, numeric, control flow, data sources, light arrays, colour arrays).
 */

import { DmxLightManager } from '../../../controllers/DmxLightManager'
import { LogicNode, VariableDefinition, NodeCueMode } from '../../types/nodeCueTypes'
import { Connection } from '../../types/nodeCueTypes'
import { ExecutionContext } from './ExecutionContext'
import { VariableValue } from './executionTypes'
import { getVariableStore } from './valueResolver'
import { LOGIC_NODE_HANDLERS } from './logicHandlers'
import type { HandlerCtx } from './logicHandlers'

export interface LogicNodeEvaluatorContext {
  cueId: string
  /**
   * Which domain the running cue belongs to, so `cue-data` resolves against the right family's
   * extractor. Required, because a default would quietly resolve one family's frame through the
   * other's extractor.
   */
  mode: NodeCueMode
  /**
   * Required for light-dependent logic (`config-data`, ring/`all-lights-array`). A graph that drives
   * no lights passes it undefined; those logic types throw a clear error if used in such a graph.
   */
  lightManager?: DmxLightManager
  cueLevelVarStore: Map<string, VariableValue>
  groupLevelVarStore: Map<string, VariableValue>
  variableDefinitions: VariableDefinition[]
  executeNode: (nodeId: string, context: ExecutionContext) => void
  /** Optional; when set, debugger nodes send payloads here (e.g. to renderer via IPC). */
  debugOutput?: (channel: string, data: unknown) => void
}

/**
 * Evaluate a logic node and determine which nodes to execute next.
 * This is where runtime variable evaluation happens.
 */
export function evaluateLogicNode(
  logicNode: LogicNode,
  nodeId: string,
  edges: Connection[],
  context: ExecutionContext,
  evaluatorContext: LogicNodeEvaluatorContext,
): string[] {
  const { cueId, mode, lightManager, cueLevelVarStore, groupLevelVarStore, variableDefinitions } =
    evaluatorContext

  const next = (): string[] => edges.map((edge) => edge.to)

  // Rigs resolve their own lights, so a node can be fine on one rig and degenerate on another.
  // The once-only key carries the rig id, which is unique across rigs; the name is for display.
  const rigLabel = lightManager?.rigLabel ?? ''

  const ctx: HandlerCtx = {
    nodeId,
    edges,
    context,
    cueId,
    mode,
    lightManager,
    variableDefinitions,
    cueLevelVarStore,
    getVarStore: (varName: string) =>
      getVariableStore(varName, variableDefinitions, cueLevelVarStore, groupLevelVarStore),
    degenerateKey: (suffix: string) => `${lightManager?.rigId ?? ''}:${cueId}:${nodeId}:${suffix}`,
    rigSuffix: rigLabel ? ` [rig: ${rigLabel}]` : '',
    debugOutput: evaluatorContext.debugOutput,
    next,
  }

  // The table is keyed by the union's discriminant, so each entry's parameter is its own narrowed
  // variant. Indexing with a general `logicType` widens that to an intersection TypeScript cannot
  // call, hence the one cast here. A node whose `logicType` is not in the table (malformed data
  // that passed validation) carries on down every edge.
  const handler = LOGIC_NODE_HANDLERS[logicNode.logicType] as
    | ((node: LogicNode, handlerCtx: HandlerCtx) => string[])
    | undefined
  if (!handler) {
    return next()
  }
  return handler(logicNode, ctx)
}
