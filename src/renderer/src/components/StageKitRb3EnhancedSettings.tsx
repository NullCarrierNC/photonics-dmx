import React from 'react'

const StageKitRb3EnhancedSettings: React.FC = () => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600">
        Stage Kit Mode (RB3)
      </h2>

      <div>
        <h3 className="text-lg font-medium mb-3 text-gray-800 dark:text-gray-200">
          Rock Band 3 Enhanced
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Due to how the RB3E networking works, Photonics doesn't use the cue system like it does
          with YARG. Instead it uses the provided LED lighting data directly to re-create the
          original Stage Kit lighting effects. This is essentially the same as using YARG in Stage
          Kit mode.
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          If you have 8 lights then each of the 8 LED positions will be mapped to a single DMX light
          (1-8). If two or more colours are set to the same LED position then the resulting colour
          and brightness will be a blend of the LED values assigned to that position. E.g. Green and
          Blue on LED's 1 with result in Cyan on DMX light 1.
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          If you have 4 lights then the Stage Kit LED colours assigned to lights 5-8 will be mapped
          5-&gt;1, 6-&gt;2, 7-&gt;3, 8-&gt;4. The resulting colour and brightness will be a blend of
          the LED values assigned to 1 and 5, 2 and 6, etc. This means effects set to LEDs 1-4 and
          5-8 will get blended together on DMX lights 1-4.
        </p>
      </div>
    </div>
  )
}

export default StageKitRb3EnhancedSettings
