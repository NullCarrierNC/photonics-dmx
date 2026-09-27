import type { EffectTransition } from '../../types/effects'
import type { WaitCondition } from '../../types/songEvents'
import type { LightEffectState } from './interfaces'

/**
 * How long a `delay` wait lasts. A count of zero means no wait at all rather than one period.
 */
function delayWaitMs(transition: EffectTransition): number {
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
 * The tempo events a hold counts only from frames after the one it began in, so a chase step shown
 * on a beat frame holds through that beat. A keyframe or note ends a hold in the frame its step
 * began, which is how a toggle authored on keyframes answers one arriving with its cue.
 */
const FRAME_GATED_HOLDS: ReadonlySet<WaitCondition> = new Set<WaitCondition>(['beat', 'measure'])

/** Prepares the transition an effect has just moved on to. */
export type PrepareTransition = (
  effect: LightEffectState,
  transition: EffectTransition,
  currentTime: number,
) => void

/**
 * Moves an effect past its current transition. With `prepare`, the next transition, if there is
 * one, is prepared at once. Without it, the next frame's pass prepares it from `idle`.
 */
function advancePastTransition(
  effect: LightEffectState,
  currentTime: number,
  prepare?: PrepareTransition,
): void {
  effect.currentTransitionIndex += 1
  effect.state = 'idle'
  if (prepare && effect.currentTransitionIndex < effect.transitions.length) {
    prepare(effect, effect.transitions[effect.currentTransitionIndex], currentTime)
  }
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
 * @param publishedFrames The light transition controller's published frame count, which a beat or
 *   measure hold records so {@link countHoldEvent} can tell a later frame's event from this one's.
 * @param prepare Prepares the next transition when the effect advances at once.
 * @returns true when the effect advanced past this transition.
 */
export function applyWaitUntil(
  effect: LightEffectState,
  transition: EffectTransition,
  currentTime: number,
  publishedFrames: number,
  prepare?: PrepareTransition,
): boolean {
  if (transition.waitUntilCondition !== 'delay' && transition.waitUntilConditionCount === 0) {
    // An event-type condition counted zero times needs no event, so move on now.
    advancePastTransition(effect, currentTime, prepare)
    return true
  }

  effect.transitionStartTime = currentTime
  if (transition.waitUntilCondition === 'delay') {
    effect.waitEndTime = currentTime + delayWaitMs(transition)
    return false
  }

  effect.waitEndTime = currentTime
  effect.holdSinceFrame = FRAME_GATED_HOLDS.has(transition.waitUntilCondition)
    ? publishedFrames
    : undefined
  return false
}

/**
 * Counts one occurrence of the event a held transition waits until. A positive count ends the hold
 * on the occurrence that brings it to zero or below, so 2.5 waits three. An uncounted, zero or
 * negative one ends on the first.
 *
 * A beat or measure counts only once a frame has published since the hold began, so a step started
 * or submitted in the frame of a beat shows until the next one. A transition waiting to start
 * takes that frame's beat.
 *
 * @returns true when the hold ended.
 */
export function countHoldEvent(
  effect: LightEffectState,
  transition: EffectTransition,
  currentTime: number,
  publishedFrames: number,
  prepare: PrepareTransition,
): boolean {
  if (effect.holdSinceFrame !== undefined && publishedFrames <= effect.holdSinceFrame) {
    return false
  }
  const count = transition.waitUntilConditionCount
  if (count !== undefined && count > 0) {
    transition.waitUntilConditionCount = count - 1
    if (count - 1 > 0) return false
  }
  advancePastTransition(effect, currentTime, prepare)
  return true
}
