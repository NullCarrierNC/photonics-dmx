import React from 'react'

const AudioColorMapping: React.FC = () => {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Frequency ranges, threshold, and colours are now configured per Audio Trigger node in the
        Cue Editor. Add an Audio Trigger node to an audio cue and set its frequency band (e.g.
        120–500 Hz) and threshold there.
      </p>
    </div>
  )
}

export default AudioColorMapping
