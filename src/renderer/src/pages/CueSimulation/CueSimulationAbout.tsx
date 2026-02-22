import React from 'react'
import { FaChevronCircleDown, FaChevronCircleRight } from 'react-icons/fa'

interface CueSimulationAboutProps {
  isOpen: boolean
  onToggle: () => void
}

/**
 * Collapsible "Using Cue Simulation" help section.
 */
export const CueSimulationAbout: React.FC<CueSimulationAboutProps> = ({ isOpen, onToggle }) => (
  <div className="bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 mb-6">
    <button
      className="w-full px-4 py-3 text-left font-medium text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset rounded-t-lg flex items-center justify-between"
      onClick={onToggle}>
      <span>Using Cue Simulation</span>
      {isOpen ? <FaChevronCircleDown size={20} /> : <FaChevronCircleRight size={20} />}
    </button>
    <div className={`px-4 pb-4 ${isOpen ? '' : 'hidden'}`}>
      <p className="text-sm text-gray-600 dark:text-gray-400 mt-4">
        Cue Simulation allows you to test and preview lighting effects before using them in-game.
        You can select different cue groups, choose specific cues, and manually simulate beats,
        measures, keyframes, and in some cases instrument notes to see how the cues respond.
      </p>
      <p className="text-sm text-gray-600 dark:text-gray-400 mt-4">
        Which cue groups are enabled is defined in the Preferences menu.
      </p>
      <hr className="my-6 border-gray-200 dark:border-gray-600" />
      <p className="text-sm text-gray-600 dark:text-gray-400 mt-4">
        Testing a cue will give you an approximation of what it will look like in-game. Some effects
        require you to manually simulate a beat or keyframe. You can adjust the BPM value to test
        how effects respond to different tempos. In YARG, some effects are modified by run-time data
        such as the notes being played.
      </p>
      <p className="text-sm text-gray-600 dark:text-gray-400 mt-4">
        If you have DMX output enabled above the effect will be sent to your lighting rig. Compare
        this with the DMX Preview to confirm the configuration of your lights is correct.
      </p>
    </div>
  </div>
)

export default CueSimulationAbout
