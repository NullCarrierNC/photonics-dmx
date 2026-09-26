/**
 * How an 'update' submission carries a running effect over to a resubmission of itself, light by
 * light, so an effect sent again on every frame goes on from the look it is showing.
 */
import type { Effect, EffectTransition, RGBIO } from '../../types'
import type { IEffectTransformer, ILayerManager, LightEffectState } from './interfaces'
import type { LightTransitionController } from './LightTransitionController'

/** What {@link carryOverRunning} reads the running effects from and retargets their fades with. */
export interface CarryOverDeps {
  layerManager: ILayerManager
  effectTransformer: IEffectTransformer
  lightTransitionController: LightTransitionController
}

/** Whether two colours agree on every channel, position included. */
function sameColour(a: RGBIO, b: RGBIO): boolean {
  return (
    a.red === b.red &&
    a.green === b.green &&
    a.blue === b.blue &&
    a.intensity === b.intensity &&
    a.opacity === b.opacity &&
    a.blendMode === b.blendMode &&
    a.pan === b.pan &&
    a.tilt === b.tilt
  )
}

/** Whether two steps wait the same way before they start and fade over the same curve. */
function sameFade(a: EffectTransition, b: EffectTransition): boolean {
  return (
    a.layer === b.layer &&
    a.waitForCondition === b.waitForCondition &&
    a.waitForTime === b.waitForTime &&
    a.waitForConditionCount === b.waitForConditionCount &&
    a.transform.duration === b.transform.duration &&
    a.transform.easing === b.transform.easing
  )
}

function sameStep(a: EffectTransition, b: EffectTransition): boolean {
  return (
    sameFade(a, b) &&
    sameColour(a.transform.color, b.transform.color) &&
    a.waitUntilCondition === b.waitUntilCondition &&
    a.waitUntilTime === b.waitUntilTime &&
    a.waitUntilConditionCount === b.waitUntilConditionCount
  )
}

/**
 * Carries `running` over to `steps`, its effect resubmitted for the same light. With the same
 * steps it runs on untouched. Partway through the same first fade to a different colour, it takes
 * the new steps and the fade heads for the new colour from where it is, on its own clock. Returns
 * false when the light has to start the resubmission afresh.
 */
function carryOver(
  running: LightEffectState | undefined,
  name: string,
  effect: Effect,
  steps: EffectTransition[],
  lightTransitionController: LightTransitionController,
): boolean {
  if (running?.name !== name || steps.length === 0) return false
  if (
    running.transitions.length === steps.length &&
    running.transitions.every((step, index) => sameStep(step, steps[index]))
  ) {
    return true
  }
  if (running.currentTransitionIndex !== 0 || running.state !== 'transitioning') return false
  if (!sameFade(running.transitions[0], steps[0])) return false
  const color = steps[0].transform.color
  if (!lightTransitionController.retargetTransition(running.lightId, running.layer, color)) {
    return false
  }
  running.effect = effect
  running.transitions = steps
  return true
}

/**
 * Takes out of `transitionsByLayerAndLight` every light whose running effect of this name carries
 * over to the resubmission, leaving the lights the submission still has to start.
 */
export function carryOverRunning(
  name: string,
  effect: Effect,
  transitionsByLayerAndLight: Map<number, Map<string, EffectTransition[]>>,
  deps: CarryOverDeps,
): void {
  for (const [layer, byLight] of transitionsByLayerAndLight) {
    for (const [lightId, transitions] of byLight) {
      const steps = deps.effectTransformer
        .expandTransitionsByLight(transitions)
        .filter((step) => step.lights.some((light) => light.id === lightId))
      const running = deps.layerManager.getActiveEffect(layer, lightId)
      if (carryOver(running, name, effect, steps, deps.lightTransitionController)) {
        byLight.delete(lightId)
      }
    }
  }
}
