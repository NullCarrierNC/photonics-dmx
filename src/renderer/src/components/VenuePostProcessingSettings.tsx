import React, { useCallback, useState } from 'react'
import { useAtom } from 'jotai'
import { lightingPrefsAtom } from '../atoms'
import { savePrefs } from '../ipcApi'
import type { IpcErrorResult, IpcSuccessResult } from '../../../shared/ipcTypes'
import { createLogger } from '../../../shared/logger'

const log = createLogger('VenuePostProcessingSettings')

const isSaveFailure = (result: IpcSuccessResult | IpcErrorResult): result is IpcErrorResult =>
  !result.success

const VenuePostProcessingSettings: React.FC = () => {
  const [prefs, setPrefs] = useAtom(lightingPrefsAtom)
  const [saving, setSaving] = useState(false)

  const enabled = prefs.venuePostProcessingEnabled ?? true

  const onChange = useCallback(
    async (next: boolean) => {
      if (saving) return
      setSaving(true)
      try {
        const result = await savePrefs({ venuePostProcessingEnabled: next })
        if (isSaveFailure(result)) {
          log.error('Failed to save Venue Post-Processing preference', result.error)
          return
        }
        setPrefs((prev) => ({
          ...prev,
          venuePostProcessingEnabled: next,
        }))
      } catch (e) {
        log.error('Failed to save Venue Post-Processing preference', e)
      } finally {
        setSaving(false)
      }
    },
    [saving, setPrefs],
  )

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600">
        Venue Post-Processing
      </h2>
      <p
        id="venue-post-processing-description"
        className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        YARG applies visual effects to the on-screen venue during a song, such as black and white,
        sepia tone, photo negative and trails. When this is enabled your lights mimic those effects:
        a black and white section on screen turns the rig greyscale. Turn it off to keep your lights
        running normally at all times.
      </p>
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          className="form-checkbox h-5 w-5 text-blue-600 rounded"
          checked={enabled}
          disabled={saving}
          onChange={(e) => void onChange(e.target.checked)}
          aria-describedby="venue-post-processing-description"
        />
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
          Apply venue post-processing to lights
        </span>
      </label>
    </div>
  )
}

export default VenuePostProcessingSettings
