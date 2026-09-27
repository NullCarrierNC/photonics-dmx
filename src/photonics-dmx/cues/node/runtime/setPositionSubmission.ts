/**
 * What a set-position action asks for this time it runs, resolved against its context: the lights,
 * the position and the timing, and the fingerprint the engine compares to the last position a
 * light settled at. The engine owns the submission, and this owns nothing of its state.
 */
import type { ActionNode } from '../../types/nodeCueTypes'
import type { Effect, TrackedLight } from '../../../types'
import type { DmxLightManager } from '../../../controllers/DmxLightManager'
import {
  ActionEffectFactory,
  buildSetPositionSubmissionFingerprint,
  type ResolvedActionTarget,
  type ResolvedActionTiming,
  type ResolvedPositionSetting,
} from '../compiler/ActionEffectFactory'
import type { ExecutionContext } from './ExecutionContext'
import type { VariableValue } from './executionTypes'
import { resolveLightTarget, resolveLocationGroups } from './valueResolver'
import { resolveActionLayer, resolveActionPosition, resolveActionTiming } from './actionResolver'

/** A set-position action resolved for one run, ready to be built and submitted. */
export interface ResolvedSetPosition {
  action: ActionNode
  lights: TrackedLight[]
  target: ResolvedActionTarget
  position: ResolvedPositionSetting
  timing: ResolvedActionTiming
  layer: number
  /** Identifies the resolved move, so a repeat of the one a light settled at can be skipped. */
  fingerprint: string
}

/**
 * Resolves a set-position action, or says why there is nothing to move: the action has no position,
 * or its target resolves to no lights.
 */
export function resolveSetPosition(
  action: ActionNode,
  context: ExecutionContext,
  lightManager: DmxLightManager,
  lookupVar: (varName: string) => VariableValue | undefined,
): ResolvedSetPosition | 'no-position' | 'no-lights' {
  if (!action.position) return 'no-position'

  const target: ResolvedActionTarget = {
    groups: resolveLocationGroups(action.target.groups, context),
    filter: resolveLightTarget(action.target.filter, context),
  }
  const position = resolveActionPosition(action.position, context)
  const timing = resolveActionTiming(action.timing, context)
  const layer = resolveActionLayer(action.layer, context)

  const lights = ActionEffectFactory.resolveLights(
    lightManager,
    action.target,
    context.unknownValues,
    lookupVar,
  )
  if (!lights || lights.length === 0) return 'no-lights'

  return {
    action,
    lights,
    target,
    position,
    timing,
    layer,
    fingerprint: buildSetPositionSubmissionFingerprint(target, position, layer, timing),
  }
}

/** The state-target effect a resolved set-position submits, or null when none can be built. */
export function buildSetPositionEffect(resolved: ResolvedSetPosition): Effect | null {
  return ActionEffectFactory.buildEffect({
    action: resolved.action,
    lights: resolved.lights,
    waitCondition: undefined,
    waitTime: 0,
    resolvedTarget: resolved.target,
    resolvedTiming: resolved.timing,
    resolvedLayer: resolved.layer,
    resolvedPosition: resolved.position,
  })
}
