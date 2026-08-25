import React from 'react'
import {
  POST_PROCESSING_VALUES,
  type PostProcessing,
} from '../../../../photonics-dmx/cues/types/cueTypes'
import { postProcessingLabel } from '../../utils/postProcessingLabel'

interface CueSimulationPostProcessingProps {
  selectedState: PostProcessing
  onStateChange: (state: PostProcessing) => void
  disabled: boolean
}

/** Every state YARG can report, less the placeholder it never sends. */
const SELECTABLE_STATES = POST_PROCESSING_VALUES.filter((state) => state !== 'Unknown')

/**
 * Applies a venue post-processing effect to the lights without YARG running, so the effects can be
 * checked against the preview. A real YARG packet takes the state over as soon as one arrives.
 */
export const CueSimulationPostProcessing: React.FC<CueSimulationPostProcessingProps> = ({
  selectedState,
  onStateChange,
  disabled,
}) => (
  <div className="mt-6">
    <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200">
      Venue Post-Processing
    </h3>
    <div>
      <label
        htmlFor="cue-sim-post-processing"
        className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Effect
      </label>
      <select
        id="cue-sim-post-processing"
        value={selectedState}
        onChange={(e) => onStateChange(e.target.value as PostProcessing)}
        className="p-2 border rounded dark:bg-gray-700 dark:text-gray-200"
        style={{ width: '260px' }}
        disabled={disabled}>
        {SELECTABLE_STATES.map((state) => (
          <option key={state} value={state}>
            {postProcessingLabel(state)}
          </option>
        ))}
      </select>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        Mirrors the effect YARG applies to the venue on screen. Turn it off from the Venue
        Post-Processing preference on the YARG tab.
      </p>
    </div>
  </div>
)

export default CueSimulationPostProcessing
