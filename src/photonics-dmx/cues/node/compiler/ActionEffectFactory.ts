/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  WaitCondition,
  TrackedLight,
  Effect,
  EffectTransition,
  RGBIO,
  LocationGroup,
  Color,
  Brightness,
  BlendMode,
  LightTarget,
} from '../../../types'
import { DmxLightManager } from '../../../controllers/DmxLightManager'
import { VariableValue } from '../runtime/executionTypes'
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

export class ActionEffectFactory {
  // Helper to resolve target if needed
  private static resolveTarget(target: any): ResolvedActionTarget {
    // Check if already resolved (has array for groups)
    if (Array.isArray(target.groups)) {
      return target as ResolvedActionTarget
    }
    // Otherwise treat as ValueSource - use literal value or default
    const groupsValue = target.groups?.source === 'literal' ? String(target.groups.value) : 'front'
    const filterValue = target.filter?.source === 'literal' ? String(target.filter.value) : 'all'

    return {
      groups: groupsValue.split(',').map((g) => g.trim()) as LocationGroup[],
      filter: filterValue as LightTarget,
    }
  }

  // Helper to resolve color if needed
  private static resolveColorSetting(color: any): ResolvedColorSetting {
    // Check if already resolved
    if (typeof color.name === 'string' && typeof color.brightness === 'string') {
      return color as ResolvedColorSetting
    }
    // Otherwise treat as ValueSource
    const name = color.name?.source === 'literal' ? String(color.name.value) : 'blue'
    const brightness =
      color.brightness?.source === 'literal' ? String(color.brightness.value) : 'medium'
    const blendMode =
      color.blendMode?.source === 'literal' ? String(color.blendMode.value) : 'replace'
    const opacity = color.opacity?.source === 'literal' ? Number(color.opacity.value) : undefined

    return {
      name: name as Color,
      brightness: brightness as Brightness,
      blendMode: blendMode as BlendMode,
      opacity: opacity !== undefined ? clamp(opacity, 0, 1) : undefined,
    }
  }

  // Helper to resolve timing if needed
  private static resolveTiming(timing: any): ResolvedActionTiming {
    // Check if already resolved
    if (typeof timing.waitForTime === 'number') {
      return timing as ResolvedActionTiming
    }
    // Otherwise treat as ValueSource. A condition from anything but a literal reads as 'none'.
    const condition = (source: unknown): WaitCondition => {
      if (typeof source === 'string') return source as WaitCondition
      const literal = source as { source?: string; value?: unknown } | undefined
      return literal?.source === 'literal' ? (String(literal.value) as WaitCondition) : 'none'
    }
    return {
      waitForCondition: condition(timing.waitForCondition),
      waitForTime:
        timing.waitForTime?.source === 'literal' ? finiteOr(timing.waitForTime.value, 0) : 0,
      waitForConditionCount:
        timing.waitForConditionCount?.source === 'literal'
          ? finiteOr(timing.waitForConditionCount.value, undefined)
          : undefined,
      duration: timing.duration?.source === 'literal' ? finiteOr(timing.duration.value, 200) : 200,
      waitUntilCondition: condition(timing.waitUntilCondition),
      waitUntilTime:
        timing.waitUntilTime?.source === 'literal' ? finiteOr(timing.waitUntilTime.value, 0) : 0,
      waitUntilConditionCount:
        timing.waitUntilConditionCount?.source === 'literal'
          ? finiteOr(timing.waitUntilConditionCount.value, undefined)
          : undefined,
      easing: (() => {
        const e = timing.easing as string | { source?: string; value?: unknown } | undefined
        if (e === undefined) return undefined
        if (typeof e === 'string') return e
        if (e && typeof e === 'object' && e.source === 'literal') return String(e.value)
        return undefined
      })(),
      level: timing.level?.source === 'literal' ? finiteOr(timing.level.value, 1) : 1,
    }
  }

  public static resolveLights(
    lightManager: DmxLightManager,
    target: any,
    variableResolver?: (name: string) => VariableValue | undefined,
  ): TrackedLight[] {
    // Check if groups is a variable reference
    if (target.groups?.source === 'variable' && variableResolver) {
      const varValue = variableResolver(target.groups.name)

      // If it's a light-array variable, use those exact lights (ignore filter)
      if (varValue?.type === 'light-array') {
        return varValue.value as TrackedLight[]
      }

      // If it's a string variable, treat as group name(s) and resolve with filter
      if (varValue && typeof varValue.value === 'string') {
        const groupsStr = varValue.value || 'front'
        const groups = groupsStr.split(',').map((g) => g.trim()) as LocationGroup[]
        let filter: LightTarget = 'all'
        if (target.filter?.source === 'variable' && variableResolver) {
          const filterVar = variableResolver(target.filter.name)
          if (filterVar?.value) filter = String(filterVar.value) as LightTarget
        } else if (target.filter?.source === 'literal') {
          filter = String(target.filter.value) as LightTarget
        }
        return lightManager.getLights(groups, filter)
      }
    }

    // Standard group/filter resolution
    const resolved = this.resolveTarget(target)
    const groups: LocationGroup[] = resolved.groups.length > 0 ? resolved.groups : ['front']
    return lightManager.getLights(groups, resolved.filter)
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
