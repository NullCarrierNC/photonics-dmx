import { useAtom } from 'jotai'
import { useCallback, useEffect, useState } from 'react'
import {
  yargListenerEnabledAtom,
  rb3eListenerEnabledAtom,
  audioListenerEnabledAtom,
} from '../atoms'
import { registerIpcListener } from '../utils/ipcHelpers'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import {
  getAudioEnabled,
  getAudioGameMode,
  setAudioEnabled,
  setAudioGameMode,
  disableYarg,
  disableRb3,
} from '../ipcApi'

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
  const [gameModeEnabled, setGameModeEnabled] = useState(false)
  const [gameModeSaving, setGameModeSaving] = useState(false)

  const refreshGameMode = useCallback(async () => {
    try {
      const gm = await getAudioGameMode()
      setGameModeEnabled(gm.enabled)
    } catch {
      setGameModeEnabled(false)
    }
  }, [])

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

    const handleGameModeUpdate = (payload: { enabled: boolean }) => {
      setGameModeEnabled(payload.enabled)
    }

    const cleanupRestarted = registerIpcListener(
      RENDERER_RECEIVE.CONTROLLERS_RESTARTED,
      handleControllersRestarted,
    )
    const cleanupEnabledChanged = registerIpcListener(
      RENDERER_RECEIVE.AUDIO_ENABLED_CHANGED,
      handleAudioEnabledChanged,
    )
    const cleanupGameMode = registerIpcListener(
      RENDERER_RECEIVE.AUDIO_GAME_MODE_UPDATE,
      handleGameModeUpdate,
    )

    // Initialize on mount
    initializeState()

    return () => {
      cleanupRestarted()
      cleanupEnabledChanged()
      cleanupGameMode()
    }
  }, [setIsAudioEnabled])

  useEffect(() => {
    if (isAudioEnabled) {
      void refreshGameMode()
    } else {
      setGameModeEnabled(false)
    }
  }, [isAudioEnabled, refreshGameMode])

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

  const handleGameModeSwitch = async () => {
    if (gameModeSaving || disabled || !isAudioEnabled) return
    const next = !gameModeEnabled
    setGameModeEnabled(next)
    try {
      setGameModeSaving(true)
      const result = await setAudioGameMode({ enabled: next })
      if (!result.success) {
        setGameModeEnabled(!next)
        console.error('Failed to set audio game mode:', result.error)
      } else {
        setGameModeEnabled(result.config.enabled)
      }
    } catch (error) {
      console.error('Failed to set audio game mode:', error)
      setGameModeEnabled(!next)
    } finally {
      setGameModeSaving(false)
    }
  }

  return (
    <div className={className ?? 'mb-4 min-w-[190px] max-w-[220px]'}>
      <div className="flex items-center justify-between">
        <label
          className={`mr-4 text-lg font-semibold ${
            isYargEnabled || isRb3Enabled || disabled
              ? 'text-gray-500'
              : 'text-gray-900 dark:text-gray-100'
          }`}>
          Enable Audio
        </label>
        <button
          type="button"
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

      {isAudioEnabled && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs text-gray-600 dark:text-gray-400 shrink-0">Manual / Game</span>
          <button
            type="button"
            onClick={handleGameModeSwitch}
            disabled={disabled || gameModeSaving}
            title={gameModeEnabled ? 'Game: cues cycle automatically' : 'Manual: pick a cue'}
            className={`w-9 h-5 rounded-full shrink-0 ${
              gameModeEnabled ? 'bg-blue-500' : 'bg-gray-400 dark:bg-gray-500'
            } relative focus:outline-none ${
              disabled || gameModeSaving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            }`}>
            <div
              className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform duration-200 ${
                gameModeEnabled ? 'translate-x-4' : 'translate-x-0'
              }`}></div>
          </button>
        </div>
      )}
    </div>
  )
}

export default AudioToggle
