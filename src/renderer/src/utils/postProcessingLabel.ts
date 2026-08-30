import type { PostProcessing } from '../../../photonics-dmx/cues/types/cueTypes'

/**
 * Turns a venue post-processing state into the wording YARG and its documentation use, so the cue
 * preview and the simulation picker name an effect the same way.
 */
export function postProcessingLabel(state: PostProcessing | undefined): string {
  if (!state) return 'Unknown'
  return state.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
}
