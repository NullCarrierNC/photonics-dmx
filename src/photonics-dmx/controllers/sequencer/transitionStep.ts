/**
 * One transition sampled at one instant: where its colour has reached, and whether it is done.
 */
import type { RGBIO } from '../../types'
import { getEasingValue, interpolate, interpolateFloat } from './lightBlending'
import { correctLightState } from './transitionHealth'
import type { TransitionData } from './LightTransitionController'

export type TransitionStep = {
  /** The interpolated layer colour, already corrected back into range. */
  state: RGBIO
  /** Whether the transition has reached its end and can be dropped. */
  complete: boolean
}

/**
 * Pan and tilt are percentages of the fixture's range. They stay fractional, so a fade reaches
 * every position the fixture resolves, and `correctLightState` keeps them within 0-100.
 */
function interpolatePosition(start: number, end: number, t: number): number {
  return start + (end - start) * t
}

/**
 * Samples a transition at `now`, which every layer in a frame shares so they move together.
 *
 * A zero duration lands on the end state at once. pan and tilt are interpolated only when an
 * endpoint defines one, and an endpoint that names just one of them holds that value throughout.
 */
export function stepTransition(data: TransitionData, now: number): TransitionStep {
  const { startState, endState, startTime, transition } = data

  const elapsed = now - startTime
  const duration = transition.transform.duration
  // Clamped at both ends. A transition started during this same tick is stamped after the frame
  // sampled its clock, so elapsed can be negative, and the easing curves are defined over 0 to 1.
  const progress = duration > 0 ? Math.max(0, Math.min(elapsed / duration, 1)) : 1
  const easedProgress = getEasingValue(progress, transition.transform.easing)

  const state: RGBIO = {
    red: interpolate(startState.red, endState.red, easedProgress),
    green: interpolate(startState.green, endState.green, easedProgress),
    blue: interpolate(startState.blue, endState.blue, easedProgress),
    intensity: interpolate(startState.intensity, endState.intensity, easedProgress),
    opacity: interpolateFloat(startState.opacity ?? 1.0, endState.opacity ?? 1.0, easedProgress),
    blendMode: endState.blendMode,
  }

  if (startState.pan !== undefined || endState.pan !== undefined) {
    const startPan = startState.pan ?? endState.pan ?? 0
    const endPan = endState.pan ?? startState.pan ?? 0
    state.pan = interpolatePosition(startPan, endPan, easedProgress)
  }

  if (startState.tilt !== undefined || endState.tilt !== undefined) {
    const startTilt = startState.tilt ?? endState.tilt ?? 0
    const endTilt = endState.tilt ?? startState.tilt ?? 0
    state.tilt = interpolatePosition(startTilt, endTilt, easedProgress)
  }

  // Completion lands on the frame where elapsed reaches the duration, so the fade runs its full
  // length to the exact end colour.
  return { state: correctLightState(state), complete: progress >= 1 }
}
