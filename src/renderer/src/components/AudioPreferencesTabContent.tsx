import React from 'react'
import AudioToggle from './AudioToggle'
import AudioDeviceSelector from './AudioDeviceSelector'
import AudioSensitivityControls from './AudioSensitivityControls'
import AudioStrobeSettings from './AudioStrobeSettings'
import AudioBandSettings from './AudioBandSettings'
import AudioBeatDetection from './AudioBeatDetection'
import AudioSmoothingSettings from './AudioSmoothingSettings'
import AudioGameModeSettings from './AudioGameModeSettings'
import AudioIdleDetectionSettings from './AudioIdleDetectionSettings'

/** Audio-reactive and input settings for the Preferences Audio tab. */
const AudioPreferencesTabContent: React.FC = () => {
  return (
    <div className="space-y-2">
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
          Game Mode
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Randomly selects an audio cue from your enabled audio cue groups. Each cue runs for a
          random duration between the minimum and maximum values.
        </p>
        <AudioGameModeSettings />
        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-600">
          <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200">
            Idle / menu detection (Game Mode)
          </h3>
          <AudioIdleDetectionSettings />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 dark:border-gray-700">
        <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600">
          Sensitivity and Noise Floor
        </h2>
        <AudioSensitivityControls />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 dark:border-gray-700">
        <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600">
          Strobe Settings
        </h2>
        <AudioStrobeSettings />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 dark:border-gray-700">
        <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600">
          Frequency Bands
        </h2>
        <AudioBandSettings />
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
    </div>
  )
}

export default AudioPreferencesTabContent
