import { useAtom } from 'jotai'
import { useEffect, useState } from 'react'
import {
  yargListenerEnabledAtom,
  rb3eListenerEnabledAtom,
  audioListenerEnabledAtom,
} from '../atoms'
import { registerIpcListener } from '../utils/ipcHelpers'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { getAudioEnabled, setAudioEnabled, disableYarg, disableRb3 } from '../ipcApi'

interface AudioToggleProps {
  disabled?: boolean
  /** Overrides default wrapper layout (e.g. Audio Preview header row). */
  className?: string
}

const AudioToggle = ({ disabled = false, className }: AudioToggleProps) => {
  const [isAudioEnabled, setIsAudioEnabled] = useAtom(audioListenerEnabledAtom)
  const [isYargEnabled, setIsYargEnabled] = useAtom(yargListenerEnabledAtom)
  const [isRb3Enabled, setIsRb3Enabled] = useAtom(rb3eListenerEnabledAtom)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    // Initialize toggle state from runtime enabled state (not config)
    const initializeState = async () => {
      try {
        const enabled = await getAudioEnabled()
        setIsAudioEnabled(enabled)
      } catch (error) {
        console.error('Error initializing Audio toggle state:', error)
      }
    }

    // Handle controllers restarted event - audio is disabled on restart
    const handleControllersRestarted = () => {
      console.log('Controllers restarted, audio disabled')
      setIsAudioEnabled(false)
    }

    const handleAudioEnabledChanged = (payload: { enabled: boolean }) => {
      setIsAudioEnabled(payload.enabled)
    }

    const cleanupRestarted = registerIpcListener(
      RENDERER_RECEIVE.CONTROLLERS_RESTARTED,
      handleControllersRestarted,
    )
    const cleanupEnabledChanged = registerIpcListener(
      RENDERER_RECEIVE.AUDIO_ENABLED_CHANGED,
      handleAudioEnabledChanged,
    )

    // Initialize on mount
    initializeState()

    return () => {
      cleanupRestarted()
      cleanupEnabledChanged()
    }
  }, [setIsAudioEnabled])

  const handleToggle = async () => {
    if (isSaving || disabled) return

    const newState = !isAudioEnabled
    setIsAudioEnabled(newState)

    try {
      setIsSaving(true)
      const result = await setAudioEnabled(newState)
      if (!result.success) {
        console.error('Failed to save audio enabled state:', result.error)
        setIsAudioEnabled(!newState) // Revert on failure
      } else {
        // Disable YARG/RB3E when audio is enabled (mutual exclusion)
        if (newState) {
          if (isYargEnabled) {
            setIsYargEnabled(false)
            disableYarg()
          }
          if (isRb3Enabled) {
            setIsRb3Enabled(false)
            disableRb3()
          }
        }
      }
    } catch (error) {
      console.error('Failed to save audio enabled state:', error)
      setIsAudioEnabled(!newState) // Revert on failure
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className={`flex items-center justify-between ${className ?? 'mb-4 w-[190px]'}`}>
      <label
        className={`mr-4 text-lg font-semibold ${
          isYargEnabled || isRb3Enabled || disabled
            ? 'text-gray-500'
            : 'text-gray-900 dark:text-gray-100'
        }`}>
        Enable Audio
      </label>
      <button
        onClick={handleToggle}
        disabled={isYargEnabled || isRb3Enabled || disabled || isSaving}
        className={`w-12 h-6 rounded-full ${
          isAudioEnabled ? 'bg-green-500' : 'bg-gray-400'
        } relative focus:outline-none ${
          isYargEnabled || isRb3Enabled || disabled || isSaving
            ? 'opacity-50 cursor-not-allowed'
            : 'cursor-pointer'
        }`}>
        <div
          className={`w-6 h-6 bg-white rounded-full shadow-md transform transition-transform duration-200 ${
            isAudioEnabled ? 'translate-x-6' : 'translate-x-0'
          }`}></div>
      </button>
    </div>
  )
}

export default AudioToggle
