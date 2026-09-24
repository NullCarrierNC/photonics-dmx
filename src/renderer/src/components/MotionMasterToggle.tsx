import React, { useCallback, useState } from 'react'
import { setMotionEnabled } from '../ipcApi'
import { persistSetting } from '../ipc/persistPrefs'
import { SaveErrorAlert } from './controls/SaveErrorAlert'

export interface MotionMasterToggleProps {
  /** The motion master state, which the parent reads from main and follows. */
  enabled: boolean
  /** Told the new state once main has stored it, so downstream motion controls follow. */
  onMotionEnabledChange: (enabled: boolean) => void
}

const MotionMasterToggle: React.FC<MotionMasterToggleProps> = ({
  enabled,
  onMotionEnabledChange,
}) => {
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const onChange = useCallback(
    async (next: boolean) => {
      if (saving) return
      setSaving(true)
      setSaveError(null)
      const saved = await persistSetting(
        () => setMotionEnabled(next),
        'motion support',
        setSaveError,
      )
      if (saved !== null) {
        onMotionEnabledChange(next)
      }
      setSaving(false)
    },
    [onMotionEnabledChange, saving],
  )

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600">
        Moving Head Motion Support
      </h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Enable support for motion cues in YARG and audio modes. When off, motion output is disabled
        and motion-related preferences are disabled.
      </p>
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          className="form-checkbox h-5 w-5 text-blue-600 rounded"
          checked={enabled}
          disabled={saving}
          onChange={(e) => void onChange(e.target.checked)}
        />
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
          Enable motion support (YARG + audio)
        </span>
      </label>
      <SaveErrorAlert message={saveError} />
    </div>
  )
}

export default MotionMasterToggle
