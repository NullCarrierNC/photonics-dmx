import React from 'react'

interface CueSimulationActionsProps {
  disabled: boolean
  onTestEffect: () => void
  onStopTestEffect: () => void
  onSimulateBeat: () => void
  onSimulateMeasure: () => void
  onSimulateKeyframe: () => void
}

/**
 * Row of simulation action buttons (Start Test, Stop, Simulate Beat/Measure/Keyframe).
 */
export const CueSimulationActions: React.FC<CueSimulationActionsProps> = ({
  disabled,
  onTestEffect,
  onStopTestEffect,
  onSimulateBeat,
  onSimulateMeasure,
  onSimulateKeyframe,
}) => (
  <div className="flex items-center mt-4 flex-wrap gap-4">
    <div className="flex flex-wrap gap-2">
      <button
        onClick={onTestEffect}
        className={`px-4 py-2 rounded ${
          disabled
            ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
            : 'bg-blue-500 text-white hover:bg-blue-600'
        }`}
        disabled={disabled}>
        Start Test Cue
      </button>
      <button
        onClick={onStopTestEffect}
        className={`px-4 py-2 rounded ${
          disabled
            ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
            : 'bg-orange-500 text-white hover:bg-orange-600'
        }`}
        disabled={disabled}>
        Stop Test Cue
      </button>
      <button
        onClick={onSimulateBeat}
        className={`px-4 py-2 rounded ${
          disabled
            ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
            : 'bg-purple-500 text-white hover:bg-purple-600'
        }`}
        disabled={disabled}>
        Simulate Beat
      </button>
      <button
        onClick={onSimulateMeasure}
        className={`px-4 py-2 rounded ${
          disabled
            ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
            : 'bg-yellow-500 text-white hover:bg-yellow-600'
        }`}
        disabled={disabled}>
        Simulate Measure
      </button>
      <button
        onClick={onSimulateKeyframe}
        className={`px-4 py-2 rounded ${
          disabled
            ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
            : 'bg-emerald-500 text-white hover:bg-emerald-600'
        }`}
        disabled={disabled}>
        Simulate Keyframe
      </button>
    </div>
  </div>
)

export default CueSimulationActions
