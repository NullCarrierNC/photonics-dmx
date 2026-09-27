import { useAtom, useAtomValue } from 'jotai'
import { useCallback, useEffect, useId, useState } from 'react'
import {
  yargListenerEnabledAtom,
  rb3eListenerEnabledAtom,
  audioListenerEnabledAtom,
} from '../atoms'
import { registerIpcListener } from '../utils/ipcHelpers'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { getAudioGameMode, setAudioEnabled, setAudioGameMode } from '../ipcApi'
import { createLogger } from '../../../shared/logger'
import { isRunSwitchHeld } from './controls/runSwitchHold'

const log = createLogger('AudioToggle')

interface AudioToggleProps {
  /** Holds the switch off for a reason outside audio. Running audio can still be switched off. */
  notReady?: boolean
  disabled?: boolean
  /** Overrides default wrapper layout (e.g. Audio Preview header row). */
  className?: string
}

const AudioToggle = ({ notReady = false, disabled = false, className }: AudioToggleProps) => {
  const [isAudioEnabled, setIsAudioEnabled] = useAtom(audioListenerEnabledAtom)
  const isYargEnabled = useAtomValue(yargListenerEnabledAtom)
  const isRb3Enabled = useAtomValue(rb3eListenerEnabledAtom)
  const [isSaving, setIsSaving] = useState(false)
  const [gameModeEnabled, setGameModeEnabled] = useState(false)
  const [gameModeSaving, setGameModeSaving] = useState(false)
  const labelId = useId()
  // Only one listener runs at a time, so a game listener holds audio off.
  const held = isRunSwitchHeld(isAudioEnabled, notReady || isYargEnabled || isRb3Enabled, disabled)

  const refreshGameMode = useCallback(async () => {
    try {
      const gm = await getAudioGameMode()
      setGameModeEnabled(gm.enabled)
    } catch {
      setGameModeEnabled(false)
    }
  }, [])

  useEffect(() => {
    return registerIpcListener(RENDERER_RECEIVE.AUDIO_GAME_MODE_UPDATE, (payload) => {
      setGameModeEnabled(payload.enabled)
    })
  }, [])

  useEffect(() => {
    if (isAudioEnabled) {
      void refreshGameMode()
    } else {
      setGameModeEnabled(false)
    }
  }, [isAudioEnabled, refreshGameMode])

  const handleToggle = async () => {
    if (isSaving || held) return

    const newState = !isAudioEnabled
    setIsAudioEnabled(newState)

    try {
      setIsSaving(true)
      const result = await setAudioEnabled(newState)
      if (!result.success) {
        log.error('Failed to save audio enabled state:', result.error)
        setIsAudioEnabled(!newState) // Revert on failure
      }
    } catch (error) {
      log.error('Failed to save audio enabled state:', error)
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
        log.error('Failed to set audio game mode:', result.error)
      } else {
        setGameModeEnabled(result.config.enabled)
      }
    } catch (error) {
      log.error('Failed to set audio game mode:', error)
      setGameModeEnabled(!next)
    } finally {
      setGameModeSaving(false)
    }
  }

  return (
    <div className={className ?? 'mb-4 min-w-[190px] max-w-[220px]'}>
      <div className="flex items-center justify-between">
        <label
          id={labelId}
          className={`mr-4 text-lg font-semibold ${
            held ? 'text-gray-500' : 'text-gray-900 dark:text-gray-100'
          }`}>
          Enable Audio
        </label>
        <button
          type="button"
          role="switch"
          aria-checked={isAudioEnabled}
          aria-labelledby={labelId}
          onClick={() => void handleToggle()}
          disabled={held || isSaving}
          className={`w-12 h-6 rounded-full ${
            isAudioEnabled ? 'bg-green-500' : 'bg-gray-400'
          } relative focus:outline-none ${
            held || isSaving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
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
            role="switch"
            aria-checked={gameModeEnabled}
            aria-label="Game mode"
            onClick={() => void handleGameModeSwitch()}
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
