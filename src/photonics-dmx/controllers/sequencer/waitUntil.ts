import type { EffectTransition } from '../../types/effects'
import type { LightEffectState } from './interfaces'

/**
 * How long a `delay` wait lasts. A count of zero means no wait at all rather than one period.
 */
export function delayWaitMs(transition: EffectTransition): number {
  const count = transition.waitUntilConditionCount ?? 1
  return count > 0 ? count * transition.waitUntilTime : 0
}

/**
 * Whether a light's first transition waits before it starts. A zero-length delay starts in the
 * frame it is submitted, so it does not count.
 */
export function firstTransitionWaits(transitions: EffectTransition[], lightId: string): boolean {
  const first = transitions.find((t) => t.lights.some((l) => l.id === lightId))
  if (!first || first.waitForCondition === 'none') return false
  return !(first.waitForCondition === 'delay' && first.waitForTime <= 0)
}

/**
 * Applies a transition's `waitUntil` clause to an effect that has just reached its end colour.
 *
 * The scheduler and both transition-engine paths run this, so a zero count means the same thing
 * wherever a transition is advanced.
 *
 * The `none` case is left to each caller: one advances straight away and one holds a frame so the
 * blend pass can run, so each keeps its own branch for it.
 *
 * @param onAdvance Called after the index moves on, so the caller can prepare the next transition.
 * @returns true when the effect advanced past this transition.
 */
export function applyWaitUntil(
  effect: LightEffectState,
  transition: EffectTransition,
  currentTime: number,
  onAdvance?: (effect: LightEffectState, currentTime: number) => void,
): boolean {
  if (transition.waitUntilCondition !== 'delay' && transition.waitUntilConditionCount === 0) {
    // An event-type condition counted zero times needs no event, so move on now.
    effect.currentTransitionIndex += 1
    effect.state = 'idle'
    onAdvance?.(effect, currentTime)
    return true
  }

  if (transition.waitUntilCondition === 'delay') {
    effect.transitionStartTime = currentTime
    effect.waitEndTime = currentTime + delayWaitMs(transition)
    return false
  }

  effect.transitionStartTime = currentTime
  effect.waitEndTime = currentTime
  return false
}
