import React, { useCallback, useState } from 'react'
import { useAtom } from 'jotai'
import { lightingPrefsAtom } from '../atoms'
import { savePrefs } from '../ipcApi'
import { createLogger } from '../../../shared/logger'

const log = createLogger('AdvancedModeSettings')

const AdvancedModeSettings: React.FC = () => {
  const [prefs, setPrefs] = useAtom(lightingPrefsAtom)
  const [saving, setSaving] = useState(false)

  const enabled = prefs.advancedModeEnabled ?? false

  const onChange = useCallback(
    async (next: boolean) => {
      if (saving) return
      setSaving(true)
      try {
        await savePrefs({ advancedModeEnabled: next })
        setPrefs((prev) => ({
          ...prev,
          advancedModeEnabled: next,
        }))
      } catch (e) {
        log.error('Failed to save Advanced Mode preference', e)
      } finally {
        setSaving(false)
      }
    },
    [saving, setPrefs],
  )

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600">
        Enabled Advanced Mode
      </h2>
      <p id="advanced-mode-description" className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        When Advanced Mode is enabled you gain access to additional, more advanced, features and
        settings in Photonics. Enable this if you want access to:
      </p>
      <ul className="text-sm text-gray-600 dark:text-gray-400 mb-4 list-disc pl-5 space-y-2">
        <li>
          <strong>Audio reactive lighting / visualization:</strong> lighting cues react to your
          music instead of YARG / RB3E specifically.
        </li>
        <li>
          <strong>Moving Head DMX support:</strong> moving head lights can pan and tilt in time with
          the music.
        </li>
        <li>
          <strong>Cue Editor:</strong> want to modify the lighting or motion cues that come with
          Photonics, or create your own entirely new ones? Use the Cue Editor!
        </li>
      </ul>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Please refer to the documentation at{' '}
        <a
          href="https://photonics.rocks/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 dark:text-blue-400 underline hover:text-blue-500">
          https://photonics.rocks/
        </a>{' '}
        for more information.
      </p>
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          className="form-checkbox h-5 w-5 text-blue-600 rounded"
          checked={enabled}
          disabled={saving}
          onChange={(e) => void onChange(e.target.checked)}
          aria-describedby="advanced-mode-description"
        />
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
          Enable Advanced Mode
        </span>
      </label>
    </div>
  )
}

export default AdvancedModeSettings
