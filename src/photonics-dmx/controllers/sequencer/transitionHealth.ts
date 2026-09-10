/**
 * The frame loop's housekeeping: clamping a light state back into range, reaping transitions that
 * outlived their duration, and the reset the controller falls back on when a frame throws.
 *
 * These read and write the controller's maps, so they take them as arguments rather than closing
 * over them.
 */
import { BLEND_MODE_OPTIONS } from '../../constants/options'
import { opaqueBlack } from './lightBlending'
import type { BlendMode, RGBIO } from '../../types'
import type { LightStateManager } from './LightStateManager'
import type { TransitionData } from './LightTransitionController'
import { createLogger } from '../../../shared/logger'
const log = createLogger('LightTransitionController')

/** Absolute floor for the orphan cutoff, before a transition's own duration extends it. */
export const MIN_TRANSITION_AGE_MS = 5000

/**
 * Returns the state with every channel forced back into its valid range and an unrecognised blend
 * mode replaced by `replace`.
 */
export function correctLightState(state: RGBIO): RGBIO {
  // Ensure all required properties exist and are valid
  const corrected = { ...state }

  // Clamp RGB values to valid range (0-255)
  corrected.red = Math.max(0, Math.min(255, corrected.red ?? 0))
  corrected.green = Math.max(0, Math.min(255, corrected.green ?? 0))
  corrected.blue = Math.max(0, Math.min(255, corrected.blue ?? 0))
  corrected.intensity = Math.max(0, Math.min(255, corrected.intensity ?? 0))
  corrected.opacity = Math.max(0, Math.min(1, corrected.opacity ?? 1))

  // Ensure blend mode is valid
  if (!BLEND_MODE_OPTIONS.includes(corrected.blendMode as BlendMode)) {
    corrected.blendMode = 'replace'
  }

  // Validate optional pan/tilt values (normalised 0-100 % of fixture range)
  if (corrected.pan !== undefined) {
    corrected.pan = Math.max(0, Math.min(100, corrected.pan))
  }
  if (corrected.tilt !== undefined) {
    corrected.tilt = Math.max(0, Math.min(100, corrected.tilt))
  }

  return corrected
}

/**
 * The 1-based position of a light in the tracked lights array, or 0 when it is not tracked.
 * Used to name a light in a warning the way the rig is laid out.
 */
export function lightPosition(lightStateManager: LightStateManager, lightId: string): number {
  const trackedLightIds = lightStateManager.getTrackedLightIds()
  const index = trackedLightIds.indexOf(lightId)
  return index !== -1 ? index + 1 : 0
}

/** Corrects any layer state that has drifted out of range, in place. */
export function validateAllStates(
  currentLayerStates: Map<string, Map<number, RGBIO>>,
  lightStateManager: LightStateManager,
): void {
  for (const [lightId, layerMap] of currentLayerStates.entries()) {
    for (const [layer, state] of layerMap.entries()) {
      const corrected = correctLightState(state)
      if (JSON.stringify(state) !== JSON.stringify(corrected)) {
        const position = lightPosition(lightStateManager, lightId)
        log.warn(
          `Corrected invalid state for light ${lightId} (position ${position}), layer ${layer}`,
        )
        layerMap.set(layer, corrected)
      }
    }
  }
}

/**
 * Drops transitions that have been running well past their duration.
 *
 * A longer transition gets a proportionally longer grace period, so a legitimate multi-second fade
 * is not reaped mid-fade.
 */
export function cleanupOrphanedTransitions(
  transitionsByLight: Map<string, Map<number, TransitionData>>,
  lightStateManager: LightStateManager,
  currentTime: number,
): void {
  for (const [lightId, layerMap] of transitionsByLight.entries()) {
    for (const [layer, transitionData] of layerMap.entries()) {
      const duration = transitionData.transition.transform.duration
      const maxTransitionAge = Math.max(MIN_TRANSITION_AGE_MS, duration * 1.5)
      if (currentTime - transitionData.startTime > maxTransitionAge) {
        const position = lightPosition(lightStateManager, lightId)
        log.warn(
          `Removing orphaned transition for light ${lightId} (position ${position}), layer ${layer}`,
        )
        layerMap.delete(layer)

        // Clean up empty layer maps
        if (layerMap.size === 0) {
          transitionsByLight.delete(lightId)
        }
      }
    }
  }
}

/**
 * Blacks out every tracked light and drops all transition state, for critical error recovery.
 *
 * Says nothing itself. Its one caller runs inside the frame loop and reports the fault it is
 * recovering from once per episode, so a line from here would be a second one every frame.
 */
export function emergencyStateReset(
  lightStateManager: LightStateManager,
  transitionsByLight: Map<string, Map<number, TransitionData>>,
  currentLayerStates: Map<string, Map<number, RGBIO>>,
): void {
  // Force all lights to black state first
  const allLightIds = lightStateManager.getTrackedLightIds()
  const blackState = opaqueBlack()

  allLightIds.forEach((lightId) => {
    lightStateManager.setLightState(lightId, blackState)
  })

  // Clear all internal state
  transitionsByLight.clear()
  currentLayerStates.clear()
}
