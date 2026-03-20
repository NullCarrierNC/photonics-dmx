import React, { useState } from 'react'
import AudioToggle from '../components/AudioToggle'
import AudioDeviceSelector from '../components/AudioDeviceSelector'
import AudioSensitivityControls from '../components/AudioSensitivityControls'
import AudioBeatDetection from '../components/AudioBeatDetection'
import AudioSmoothingSettings from '../components/AudioSmoothingSettings'
import CuePreviewAudio from '../components/CuePreviewAudio'
import { FaChevronCircleDown, FaChevronCircleRight } from 'react-icons/fa'
import AudioLinearResponseToggle from '../components/AudioLinearResponseToggle'

const AudioSettings: React.FC = () => {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)

  return (
    <div className="p-6 space-y-2 pb-4">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-200">Audio Settings</h1>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600">
          Audio-Reactive Lighting
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Enable audio-reactive lighting to make your DMX lights respond to music from your
          microphone or audio input device.
        </p>
        <AudioToggle />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 dark:border-gray-700">
        <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600">
          Audio Input Device
        </h2>
        <AudioDeviceSelector />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 dark:border-gray-700">
        <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600">
          Audio Sensitivity
        </h2>
        <AudioSensitivityControls />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 dark:border-gray-700">
        <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600">
          Beat Detection
        </h2>
        <AudioBeatDetection />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 dark:border-gray-700">
        <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600">
          Smoothing
        </h2>
        <AudioSmoothingSettings />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 dark:border-gray-700">
        <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600">
          Brightness Response
        </h2>
        <AudioLinearResponseToggle />
      </div>

      {/* Audio Preview Accordion - Sticky at bottom of content area */}
      <div className="sticky bottom-[0px] z-50 mt-4">
        <div className="rounded-lg shadow-lg border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-900">
          <button
            className="w-full flex flex-row gap-4 items-center text-left font-semibold bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-4 py-3 rounded-t-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            onClick={() => setIsPreviewOpen(!isPreviewOpen)}>
            <span>Audio Preview</span>
            {isPreviewOpen ? <FaChevronCircleDown size={20} /> : <FaChevronCircleRight size={20} />}
          </button>

          {isPreviewOpen && (
            <div className="p-4 bg-gray-100 dark:bg-gray-900 rounded-b-lg">
              <CuePreviewAudio />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AudioSettings
