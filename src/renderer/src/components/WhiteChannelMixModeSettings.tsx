import React, { useCallback, useState } from 'react'
import { useAtom } from 'jotai'
import { lightingPrefsAtom } from '../atoms'
import { savePrefs } from '../ipcApi'
import {
  DEFAULT_WHITE_CHANNEL_MIX_MODE,
  type WhiteChannelMixMode,
} from '../../../photonics-dmx/types'
import { createLogger } from '../../../shared/logger'

const log = createLogger('WhiteChannelMixModeSettings')

const MODE_OPTIONS: { value: WhiteChannelMixMode; label: string }[] = [
  { value: 'always-rgbw', label: 'Always RGBW' },
  { value: 'strobe-rgbw', label: 'Strobe RGBW' },
  { value: 'w-only', label: 'Use W Only' },
]

function modeDescription(mode: WhiteChannelMixMode): string {
  switch (mode) {
    case 'always-rgbw':
      return 'White is always RGB+W. White is achieved by mixing RGB together + the white channel. Makes white brighter than other colours.'
    case 'w-only':
      return 'White renders on the White channel only, RGB remain dark. Truest white to your fixture, but not as bright.'
    case 'strobe-rgbw':
      return 'Regular lighting renders white on the White channel only, strobes use RGB+W. A flash uses the full brightness of the fixture.'
  }
}

const WhiteChannelMixModeSettings: React.FC = () => {
  const [prefs, setPrefs] = useAtom(lightingPrefsAtom)
  const [saving, setSaving] = useState(false)

  const mode = prefs.whiteChannelMixMode ?? DEFAULT_WHITE_CHANNEL_MIX_MODE

  const onChange = useCallback(
    async (next: WhiteChannelMixMode) => {
      if (saving) return
      setSaving(true)
      try {
        await savePrefs({ whiteChannelMixMode: next })
        setPrefs((prev) => ({ ...prev, whiteChannelMixMode: next }))
      } catch (e) {
        log.error('Failed to save White Channel Mix Mode preference', e)
      } finally {
        setSaving(false)
      }
    },
    [saving, setPrefs],
  )

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600">
        White Channel Mix Mode
      </h2>
      <p id="white-mix-mode-description" className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        For fixtures that have a White channel, this setting controls how White is mixed with RGB.
        Other fixtures are unaffected.
      </p>
      <label
        htmlFor="white-mix-mode"
        className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Mode
      </label>
      <select
        id="white-mix-mode"
        value={mode}
        disabled={saving}
        aria-describedby="white-mix-mode-description"
        onChange={(e) => void onChange(e.target.value as WhiteChannelMixMode)}
        className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
        {MODE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{modeDescription(mode)}</p>
    </div>
  )
}

export default WhiteChannelMixModeSettings
