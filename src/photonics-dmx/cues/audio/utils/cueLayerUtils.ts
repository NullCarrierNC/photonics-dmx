import { ILightingController } from '../../../controllers/sequencer/interfaces'
import { DmxLightManager } from '../../../controllers/DmxLightManager'

/**
 * Clears lighting state for a cue by delegating to Sequencer.removeAllEffects().
 * This matches the behaviour of other cues and guarantees the DMX outputs reset even
 * when no new frames are emitted.
 *
 * @param sequencer Active lighting controller instance
 * @param _layers  Unused; kept for compatibility with existing callers
 * @param _lightManager Unused; kept for compatibility
 * @param _transitionDuration Unused; kept for compatibility
 */
export const clearCueLayers = (
  sequencer: ILightingController | null,
  _layers?: number[],
  _lightManager?: DmxLightManager | null,
  _transitionDuration = 0,
): void => {
  if (!sequencer) {
    return
  }
  sequencer.removeAllEffects()
}
