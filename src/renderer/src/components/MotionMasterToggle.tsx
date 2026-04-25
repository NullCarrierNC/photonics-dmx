import React, { useCallback, useEffect, useState } from 'react'
import { addIpcListener, removeIpcListener } from '../utils/ipcHelpers'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { getMotionEnabled, setMotionEnabled } from '../ipcApi'

export interface MotionMasterToggleProps {
  /** When false, downstream motion preference controls are dimmed (controlled by parent). */
  onMotionEnabledChange?: (enabled: boolean) => void
}

const MotionMasterToggle: React.FC<MotionMasterToggleProps> = ({ onMotionEnabledChange }) => {
  const [enabled, setEnabled] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getMotionEnabled()
      .then((v) => {
        if (!cancelled && typeof v === 'boolean') {
          setEnabled(v)
          onMotionEnabledChange?.(v)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [onMotionEnabledChange])

  useEffect(() => {
    const onBroadcast = (value: boolean) => {
      setEnabled(value)
      onMotionEnabledChange?.(value)
    }
    addIpcListener(RENDERER_RECEIVE.MOTION_ENABLED_CHANGED, onBroadcast)
    return () => {
      removeIpcListener(RENDERER_RECEIVE.MOTION_ENABLED_CHANGED, onBroadcast)
    }
  }, [onMotionEnabledChange])

  const onChange = useCallback(
    async (next: boolean) => {
      if (saving) return
      setSaving(true)
      try {
        const result = await setMotionEnabled(next)
        if (result && typeof result === 'object' && 'success' in result && result.success) {
          setEnabled(next)
          onMotionEnabledChange?.(next)
        }
      } catch (e) {
        console.error('Failed to set motion enabled', e)
      } finally {
        setSaving(false)
      }
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
    </div>
  )
}

export default MotionMasterToggle
