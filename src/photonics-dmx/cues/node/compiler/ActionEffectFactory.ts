import { WaitCondition, TrackedLight, Effect, EffectTransition, RGBIO } from '../../../types'
import { DmxLightManager } from '../../../controllers/DmxLightManager'
import { VariableValue } from '../runtime/executionTypes'
import {
  parseBlendMode,
  parseBrightness,
  parseColor,
  parseLightTarget,
  parseLocationGroups,
  parseWaitCondition,
} from '../runtime/valueResolver'
import type {
  ActionTimingConfig,
  NodeActionTarget,
  NodeColorSetting,
  ValueSource,
} from '../../types/nodeCueTypes'
import {
  ResolvedActionTarget,
  ResolvedActionTiming,
  ResolvedColorSetting,
  resolvePositionToAbsolutePercent,
} from './resolvedAction'

import {
  BuildEffectChainStep,
  BuildEffectParams,
  clamp,
  createSingleColorEffect,
  createSingleColorTransition,
  finiteOr,
  normalizeWaitFor,
  resolveColor,
  resolveEasing,
  safeDuration,
} from './effectBuilders'

/** A value source's literal, or undefined for a value held in a variable. */
const literalValue = (
  source: ValueSource | undefined,
): Extract<ValueSource, { source: 'literal' }>['value'] | undefined =>
  source?.source === 'literal' ? source.value : undefined

export class ActionEffectFactory {
  private static resolveTarget(target: NodeActionTarget): ResolvedActionTarget {
    return {
      groups: parseLocationGroups(literalValue(target.groups)),
      filter: parseLightTarget(literalValue(target.filter)),
    }
  }

  private static resolveColorSetting(color: NodeColorSetting): ResolvedColorSetting {
    const opacity = color.opacity?.source === 'literal' ? Number(color.opacity.value) : undefined

    return {
      name: parseColor(literalValue(color.name)),
      brightness: parseBrightness(literalValue(color.brightness)),
      blendMode: parseBlendMode(literalValue(color.blendMode)),
      opacity: opacity !== undefined ? clamp(opacity, 0, 1) : undefined,
    }
  }

  /** An action's timing from its literals, with the fallbacks for anything else. */
  private static resolveTiming(timing: ActionTimingConfig): ResolvedActionTiming {
    const count = (source: ValueSource | undefined): number | undefined => {
      const value = literalValue(source)
      return value === undefined ? undefined : finiteOr(value, undefined)
    }
    const easing = literalValue(timing.easing)
    return {
      waitForCondition: parseWaitCondition(literalValue(timing.waitForCondition)),
      waitForTime: finiteOr(literalValue(timing.waitForTime), 0),
      waitForConditionCount: count(timing.waitForConditionCount),
      duration: finiteOr(literalValue(timing.duration), 200),
      waitUntilCondition: parseWaitCondition(literalValue(timing.waitUntilCondition)),
      waitUntilTime: finiteOr(literalValue(timing.waitUntilTime), 0),
      waitUntilConditionCount: count(timing.waitUntilConditionCount),
      easing: easing === undefined ? undefined : String(easing),
      level: finiteOr(literalValue(timing.level), 1),
    }
  }

  public static resolveLights(
    lightManager: DmxLightManager,
    target: NodeActionTarget,
    variableResolver?: (name: string) => VariableValue | undefined,
  ): TrackedLight[] {
    // Check if groups is a variable reference
    if (target.groups.source === 'variable' && variableResolver) {
      const varValue = variableResolver(target.groups.name)

      // If it's a light-array variable, use those exact lights (ignore filter)
      if (varValue?.type === 'light-array') {
        return varValue.value as TrackedLight[]
      }

      // If it's a string variable, treat as group name(s) and resolve with filter
      if (varValue && typeof varValue.value === 'string') {
        const filter =
          target.filter.source === 'variable'
            ? parseLightTarget(variableResolver(target.filter.name)?.value)
            : parseLightTarget(target.filter.value)
        return lightManager.getLights(parseLocationGroups(varValue.value), filter)
      }
    }

    // Standard group/filter resolution
    const resolved = this.resolveTarget(target)
    return lightManager.getLights(resolved.groups, resolved.filter)
  }

  public static buildEffect(params: BuildEffectParams): Effect | null {
    const { action, lights } = params
    if (!lights || lights.length === 0) {
      return null
    }

    // Use provided resolved values or resolve from action
    const timing = params.resolvedTiming ?? this.resolveTiming(action.timing)
    const layer =
      params.resolvedLayer ?? (action.layer?.source === 'literal' ? Number(action.layer.value) : 0)

    // For set-color, don't use level (original cues don't use it)
    const timingLevel = 1
    const intensityScale = clamp((params.intensityScale ?? 1) * timingLevel, 0, 1)
    let waitFor: WaitCondition = timing.waitForCondition ?? 'none'
    let waitForTime = safeDuration((params.waitTime ?? 0) + (timing.waitForTime ?? 0), 0, 0)

    // If caller passed an explicit waitCondition (e.g., chain-level override) and it's not 'none', respect it
    if (params.waitCondition && params.waitCondition !== 'none') {
      waitFor = params.waitCondition
      waitForTime = safeDuration((params.waitTime ?? 0) + (timing.waitForTime ?? 0), 0, 0)
    }

    // If action wants to start immediately but has a chain offset, convert to delay gate
    if (waitFor === 'none' && waitForTime > 0) {
      waitFor = 'delay'
    }

    const easing = resolveEasing(timing.easing)

    let effect: Effect | null = null

    switch (action.effectType) {
      case 'set-position': {
        const pos = params.resolvedPosition
        if (!pos) {
          return null
        }

        const transitions: EffectTransition[] = lights.map((light) => {
          const { pan, tilt } = resolvePositionToAbsolutePercent(
            pos,
            light.config,
            light.bearingIsFlipped,
          )
          const positionRgbio: RGBIO = {
            red: 0,
            green: 0,
            blue: 0,
            intensity: 0,
            opacity: 0.0,
            blendMode: 'replace',
            pan,
            tilt,
          }
          return createSingleColorTransition({
            lights: [light],
            layer,
            waitFor,
            waitForTime,
            color: positionRgbio,
            timing,
            easing,
          })
        })

        effect = {
          id: 'single-color',
          description: 'Single color effect',
          transitions,
        }
        break
      }
      case 'set-color': {
        const resolvedForColor =
          params.resolvedColor ??
          (action.color ? this.resolveColorSetting(action.color) : undefined)
        if (!resolvedForColor) {
          return null
        }
        // Floor at 0.01: intensityScale carries the audio-reactive level here, and a silent frame
        // (intensity 0) keeps a faint glow rather than the rig going fully black between beats.
        // clamp above already guarantees a finite value, so this only affects the genuine-zero case.
        const baseColor = resolveColor(resolvedForColor, intensityScale || 0.01)
        effect = createSingleColorEffect({
          lights,
          layer,
          waitFor,
          color: baseColor,
          timing: timing,
          easing,
        })
        break
      }
      case 'blackout': {
        // Blackout is handled directly by sequencer, not as an effect
        // Return null to indicate this should be handled specially
        return null
      }
      default:
        return null
    }

    return effect
  }

  /**
   * Build a single sequencer Effect with multiple sequential transitions from a chain
   * of action nodes. This is used to ensure "red then yellow" type patterns complete
   * as an atomic unit (no early callback after the first action) and to preserve layer
   * continuity between steps.
   *
   * Important: all steps must target the same lights and the same layer.
   */
  public static buildEffectChain(steps: BuildEffectChainStep[]): Effect | null {
    if (!steps || steps.length === 0) return null

    // Validate common lights + layer
    const first = steps[0]
    if (!first.lights || first.lights.length === 0) return null
    const baseLayer =
      first.resolvedLayer ??
      (first.action.layer?.source === 'literal' ? Number(first.action.layer.value) : 0)
    const baseLightIds = first.lights.map((l) => l.id).join(',')

    const transitions: EffectTransition[] = []

    for (const step of steps) {
      if (step.action.effectType !== 'set-color') {
        return null
      }
      if (!step.lights || step.lights.length === 0) return null

      const layer =
        step.resolvedLayer ??
        (step.action.layer?.source === 'literal' ? Number(step.action.layer.value) : 0)
      if (layer !== baseLayer) return null

      const ids = step.lights.map((l) => l.id).join(',')
      if (ids !== baseLightIds) return null

      const timing = step.resolvedTiming ?? this.resolveTiming(step.action.timing)
      const primaryColor =
        step.resolvedColor ??
        (step.action.color ? this.resolveColorSetting(step.action.color) : undefined)
      if (!primaryColor) {
        return null
      }

      const timingLevel = 1
      const intensityScale = clamp((step.intensityScale ?? 1) * timingLevel, 0, 1)
      const easing = resolveEasing(timing.easing)
      // Floor at 0.01 to keep a faint glow on a silent audio frame (see the set-color case above).
      const color = resolveColor(primaryColor, intensityScale || 0.01)

      const { waitFor, waitForTime } = normalizeWaitFor(timing, 0)

      transitions.push(
        createSingleColorTransition({
          lights: step.lights,
          layer,
          waitFor,
          waitForTime,
          color,
          timing,
          easing,
        }),
      )
    }

    return {
      id: 'action-chain',
      description: 'Chained action effect',
      transitions,
    }
  }
}

export {
  clamp,
  createSingleColorEffect,
  createSingleColorTransition,
  finiteOr,
  normalizeWaitFor,
  resolveColor,
  resolveEasing,
  safeDuration,
} from './effectBuilders'
export type { BuildEffectChainStep, BuildEffectParams } from './effectBuilders'

export {
  buildSetPositionSubmissionFingerprint,
  resolvePositionToAbsolutePercent,
  resolvedMotionPatternSettingsEqual,
  resolvedMotionPatternSettingsEqualExceptBearing,
  trackedLightIdsEqualOrder,
} from './resolvedAction'
export type {
  ResolvedActionTarget,
  ResolvedActionTiming,
  ResolvedColorSetting,
  ResolvedMotionPatternSetting,
  ResolvedPositionSetting,
} from './resolvedAction'
