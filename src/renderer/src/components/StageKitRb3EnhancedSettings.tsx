import React from 'react'
import { useAtom } from 'jotai'
import { lightingPrefsAtom, rb3eListenerEnabledAtom } from '../atoms'
import { setRb3ProcessingMode } from '../ipcApi'
import { createLogger } from '../../../shared/logger'

const log = createLogger('StageKitRb3EnhancedSettings')

const modeOptions = [
  { value: 'direct', label: 'Direct (Stage Kit)' },
  { value: 'cue', label: 'Cue' },
] as const

const getModeDescription = (mode: string): string => {
  switch (mode) {
    case 'cue':
      return 'Drives the node cue system from the RB3E LED state, running an always-active RB3 gameplay cue. Node cues react to LED positions and colours, so RB3 gameplay can use full DMX animations from your enabled cue groups.'
    default:
      return 'Uses the RB3E LED lighting data directly to re-create the original Stage Kit lighting effects, mapping the 8 LED positions to your DMX lights. This is the most authentic Stage Kit experience.'
  }
}

const StageKitRb3EnhancedSettings: React.FC = () => {
  const [prefs, setPrefs] = useAtom(lightingPrefsAtom)
  const [isRb3Enabled] = useAtom(rb3eListenerEnabledAtom)
  const mode = prefs.rb3Prefs?.processingMode ?? 'direct'

  const handleModeChange = async (processingMode: 'direct' | 'cue') => {
    setPrefs((prev) => ({
      ...prev,
      rb3Prefs: { ...prev.rb3Prefs, processingMode },
    }))
    try {
      await setRb3ProcessingMode(processingMode)
      log.info(`RB3 processing mode changed to: ${processingMode}`)
    } catch (error) {
      log.error('Failed to save RB3 processing mode:', error)
    }
  }

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
          RB3E reports the game's Stage Kit LED state over the network. <em>Direct</em> mode maps
          that LED data straight to your DMX lights to re-create the original Stage Kit effects.{' '}
          <em>Cue</em> mode instead feeds the LED state into the node cue system so RB3 gameplay can
          drive full DMX animations from your enabled cue groups.
        </p>

        <div className="space-y-3 mb-4">
          <div>
            <label
              htmlFor="rb3-processing-mode"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Processing Mode
            </label>
            <select
              id="rb3-processing-mode"
              value={mode}
              onChange={(e) => handleModeChange(e.target.value as 'direct' | 'cue')}
              className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
              {modeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {getModeDescription(mode)}
            </p>
            {isRb3Enabled && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                Toggle RB3E off and on again to apply a mode change.
              </p>
            )}
          </div>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          In direct mode, if you have 8 lights then each of the 8 LED positions maps to a single DMX
          light (1-8). If two or more colours are set to the same LED position then the resulting
          colour and brightness is a blend of the LED values assigned to that position. E.g. Green
          and Blue on LED 1 results in Cyan on DMX light 1.
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          If you have 4 lights then the Stage Kit LED colours assigned to lights 5-8 are mapped
          5-&gt;1, 6-&gt;2, 7-&gt;3, 8-&gt;4. The resulting colour and brightness is a blend of the
          LED values assigned to 1 and 5, 2 and 6, etc. This means effects set to LEDs 1-4 and 5-8
          get blended together on DMX lights 1-4.
        </p>
      </div>
    </div>
  )
}

export default StageKitRb3EnhancedSettings
