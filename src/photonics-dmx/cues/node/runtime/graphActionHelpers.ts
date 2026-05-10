import type { ActionNode, Connection } from '../../types/nodeCueTypes'
import type { TrackedLight } from '../../../types'
import { ActionEffectFactory } from '../compiler/ActionEffectFactory'
import type { ResolvedActionTiming, ResolvedColorSetting } from '../compiler/ActionEffectFactory'
import type { DmxLightManager } from '../../../controllers/DmxLightManager'
import type { ExecutionContext } from './ExecutionContext'
import { resolveActionColor, resolveActionLayer, resolveActionTiming } from './actionResolver'
import type { VariableValue } from './executionTypes'

/** One resolved step in a homogeneous set-color action chain. */
export type ResolvedSetColorChainStep = {
  action: ActionNode
  lights: TrackedLight[]
  lightIds: string
  resolvedLayer: number
  resolvedTiming: ResolvedActionTiming
  resolvedColor: ResolvedColorSetting
}

/**
 * Marks tail nodes in a linear action chain so they are not executed independently.
 */
export function markConsecutiveActionChainTailVisited(
  context: ExecutionContext,
  actionChain: ActionNode[],
  emitNodeActivated: (nodeId: string) => void,
): void {
  for (let i = 1; i < actionChain.length; i++) {
    context.markVisited(actionChain[i].id)
    emitNodeActivated(actionChain[i].id)
  }
}

/**
 * Walks the adjacency map from `startActionId` collecting consecutive action nodes joined by a
 * single outgoing edge into a linear chain. The chain stops at the first action with 0 or 2+
 * outgoing edges, or when the next node is not an action node, or on a cycle.
 *
 * Both NodeExecutionEngine (cue runtime) and EffectExecutionEngine (effect runtime) call this
 * with their compiled adjacency/actionMap so chained set-color actions can be composed.
 */
export function buildActionChain(
  startAction: ActionNode,
  adjacency: Map<string, Connection[]>,
  actionMap: Map<string, ActionNode>,
): ActionNode[] {
  const chain: ActionNode[] = [startAction]
  const visited = new Set<string>([startAction.id])

  let currentId = startAction.id
  while (true) {
    const outgoing = adjacency.get(currentId) ?? []
    if (outgoing.length !== 1) break
    const nextId = outgoing[0].to
    const next = actionMap.get(nextId)
    if (!next) break
    if (visited.has(nextId)) break
    chain.push(next)
    visited.add(nextId)
    currentId = nextId
  }
  return chain
}

/**
 * Compile-time policy for `resolveChainStep`. Both engines currently use identical policy; the
 * shape exists so a future engine divergence (e.g. effect engine allowing blackout chain steps)
 * doesn't require duplicating the resolver.
 */
export interface ResolveChainStepPolicy {
  /** Whether `effectType: 'blackout'` is a valid chain step. Both engines reject it today. */
  allowBlackout: boolean
}

export const DEFAULT_RESOLVE_CHAIN_STEP_POLICY: ResolveChainStepPolicy = {
  allowBlackout: false,
}

/**
 * Resolves a single action into a `ResolvedSetColorChainStep`, or returns `null` if the action
 * isn't chainable (wrong effect type, missing color, or empty light target). Both engines use
 * this to feed `tryBuildHomogeneousSetColorChainData`.
 */
export function resolveChainStep(
  action: ActionNode,
  context: ExecutionContext,
  lightManager: DmxLightManager,
  resolveVariable: (varName: string) => VariableValue | undefined,
  policy: ResolveChainStepPolicy = DEFAULT_RESOLVE_CHAIN_STEP_POLICY,
): ResolvedSetColorChainStep | null {
  const isSetColor = action.effectType === 'set-color'
  const isAllowedBlackout = action.effectType === 'blackout' && policy.allowBlackout
  if (!isSetColor && !isAllowedBlackout) {
    return null
  }
  if (!action.color) return null

  const resolvedLayer = resolveActionLayer(action.layer, context)
  const resolvedColor = resolveActionColor(action.color, context)
  const resolvedTiming = resolveActionTiming(action.timing, context)

  const chainLights = ActionEffectFactory.resolveLights(
    lightManager,
    action.target,
    resolveVariable,
  )
  if (!chainLights || chainLights.length === 0) return null

  const lightIds = chainLights.map((l) => l.id).join(',')
  return {
    action,
    lights: chainLights,
    lightIds,
    resolvedLayer,
    resolvedTiming,
    resolvedColor,
  }
}

/**
 * When every step resolves to the same layer and light id set, returns chain data for composition.
 */
export function tryBuildHomogeneousSetColorChainData(
  actionChain: ActionNode[],
  resolveStep: (a: ActionNode) => ResolvedSetColorChainStep | null,
): { steps: ResolvedSetColorChainStep[]; baseLayer: number; baseLights: TrackedLight[] } | null {
  const steps: ResolvedSetColorChainStep[] = []
  let baseLayer: number | null = null
  let baseLightIds: string | null = null

  for (const stepAction of actionChain) {
    const step = resolveStep(stepAction)
    if (!step) {
      return null
    }
    if (baseLayer === null) {
      baseLayer = step.resolvedLayer
      baseLightIds = step.lightIds
    } else if (baseLayer !== step.resolvedLayer || baseLightIds !== step.lightIds) {
      return null
    }
    steps.push(step)
  }

  return { steps, baseLayer: baseLayer ?? 0, baseLights: steps[0]?.lights ?? [] }
}

export function mapSetColorChainStepsForEffectFactory(
  steps: ResolvedSetColorChainStep[],
  baseLights: TrackedLight[],
  baseLayer: number,
): Array<{
  action: ActionNode
  lights: TrackedLight[]
  resolvedColor: ResolvedColorSetting
  resolvedTiming: ResolvedActionTiming
  resolvedLayer: number
  intensityScale: number
}> {
  return steps.map((step) => ({
    action: step.action,
    lights: baseLights,
    resolvedColor: step.resolvedColor,
    resolvedTiming: step.resolvedTiming,
    resolvedLayer: baseLayer,
    intensityScale: 1,
  }))
}

export interface RunContextBatchOptions {
  /** Effect engine catches per-node errors and emits a runtime error; cue engine lets them throw. */
  onNodeError?: (nodeId: string, error: unknown) => void
  /** Cue engine notifies a lifecycle hook when the batch completes without going idle. */
  onBlocked?: () => void
}

/**
 * Wraps a `beginBatch` / iterate / `endBatch` / `tryComplete` cycle so that intermediate
 * dead-end branches don't dispose the context before sibling branches register a blocking node.
 *
 * Both engines call this to dispatch a list of next nodes after a batch boundary; the only
 * differences are (a) the effect engine catches per-node errors to emit a runtime error event,
 * and (b) the cue engine signals `'blocked'` lifecycle when the batch completes without going
 * idle. Pass `onNodeError` / `onBlocked` to keep those engine-specific behaviours.
 */
export function runContextBatch(
  context: ExecutionContext,
  nodeIds: string[],
  executeNode: (nodeId: string) => void,
  options: RunContextBatchOptions = {},
): void {
  context.beginBatch()
  for (const nodeId of nodeIds) {
    if (options.onNodeError) {
      try {
        executeNode(nodeId)
      } catch (error) {
        options.onNodeError(nodeId, error)
      }
    } else {
      executeNode(nodeId)
    }
  }
  context.endBatch()
  if (context.tryComplete()) {
    context.dispose()
  } else if (options.onBlocked) {
    options.onBlocked()
  }
}
