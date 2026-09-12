/**
 * Effects and the transitions they are made of.
 */
import type { TrackedLight } from './fixtures'
import type { RGBIO } from './lighting'
import type { WaitCondition } from './songEvents'

/**
 * Interface representing a lighting effect with transitions
 */
export interface Effect {
  id: string
  description: string
  transitions: EffectTransition[]
}

/**
 * Interface defining a transition within an effect
 */
export interface EffectTransition {
  lights: TrackedLight[]
  layer: number

  waitForCondition: WaitCondition
  waitForTime: number // in milliseconds
  waitForConditionCount?: number
  /**
   * When true, this transition is used purely for timing (no light changes).
   * TransitionEngine skips applying any light transforms for timing-only steps.
   */
  timingOnly?: boolean
  transform: {
    color: RGBIO
    easing: string
    duration: number // in milliseconds
  }
  waitUntilCondition: WaitCondition
  waitUntilTime: number // in milliseconds
  waitUntilConditionCount?: number
}
