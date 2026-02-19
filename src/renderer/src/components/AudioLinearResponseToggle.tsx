import React, { useEffect, useState } from 'react'
import { addIpcListener, removeIpcListener } from '../utils/ipcHelpers'
import { CONFIG, RENDERER_RECEIVE } from '../../../shared/ipcChannels'

const AudioLinearResponseToggle: React.FC = () => {
  const [linearResponse, setLinearResponse] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await window.electron.ipcRenderer.invoke(CONFIG.GET_AUDIO_CONFIG)
        setLinearResponse(config?.linearResponse !== false)
      } catch (error) {
        console.error('Failed to load audio linear response setting:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadConfig()

    const handleUpdate = (_event: unknown, config: { linearResponse?: boolean }) => {
      setLinearResponse(config?.linearResponse !== false)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- IPC handler signature
    addIpcListener(RENDERER_RECEIVE.AUDIO_CONFIG_UPDATE, handleUpdate as any)
    return () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- IPC handler signature
      removeIpcListener(RENDERER_RECEIVE.AUDIO_CONFIG_UPDATE, handleUpdate as any)
  }, [])

  const handleToggle = async () => {
    if (isSaving) return

    const nextValue = !linearResponse
    setLinearResponse(nextValue)

    try {
      setIsSaving(true)
      const result = await window.electron.ipcRenderer.invoke(CONFIG.SAVE_AUDIO_CONFIG, {
        linearResponse: nextValue,
      })

      if (!result?.success) {
        console.error('Failed to save linear response setting:', result?.error)
        const config = await window.electron.ipcRenderer.invoke(CONFIG.GET_AUDIO_CONFIG)
        setLinearResponse(config?.linearResponse !== false)
      }
    } catch (error) {
      console.error('Failed to save linear response setting:', error)
      const config = await window.electron.ipcRenderer.invoke(CONFIG.GET_AUDIO_CONFIG)
      setLinearResponse(config?.linearResponse !== false)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex items-start justify-between">
      <div className="pr-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Linear Response
        </label>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Is audio reactive brightness linear or in discrete steps (low / medium / high / max).
        </p>
      </div>
      <div className="flex items-center">
        <input
          type="checkbox"
          className="w-5 h-5 accent-blue-500 cursor-pointer"
          checked={linearResponse}
          disabled={isLoading || isSaving}
          onChange={handleToggle}
        />
      </div>
    </div>
  )
}

export default AudioLinearResponseToggle
