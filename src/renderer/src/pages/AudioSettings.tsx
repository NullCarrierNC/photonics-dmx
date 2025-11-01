import React from 'react';
import AudioToggle from '../components/AudioToggle';
import AudioDeviceSelector from '../components/AudioDeviceSelector';
import AudioSensitivityControls from '../components/AudioSensitivityControls';

const AudioSettings: React.FC = () => {
  return (
    <div className="p-6 space-y-2">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-200">Audio Settings</h1>
      
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600">
          Audio-Reactive Lighting
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Enable audio-reactive lighting to make your DMX lights respond to music from your microphone or audio input device.
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
    </div>
  );
};

export default AudioSettings;

