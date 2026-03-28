import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { addIpcListener, removeIpcListener } from '../utils/ipcHelpers'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import {
  getAudioEnabled,
  getAudioGameMode,
  getAudioReactiveCues,
  setActiveAudioCue,
} from '../ipcApi'

interface AudioCueOption {
  id: string
  label: string
  description: string
  groupId: string
  groupName: string
  groupDescription?: string
}

interface CueStateResponse {
  success: boolean
  activeCueType?: string | null
  secondaryCueType?: string | null
  cues?: AudioCueOption[]
  error?: string
}

interface AudioCueSelectorPanelProps {
  className?: string
}

const DROPDOWN_WIDTH = 'min-w-[220px] md:w-[240px]'

/** Minimum time the strobe-firing indicator stays visible after an inactive edge. */
const MIN_STROBE_DISPLAY_MS = 200

const AudioCueSelectorPanel: React.FC<AudioCueSelectorPanelProps> = ({ className = '' }) => {
  const [audioEnabled, setAudioEnabled] = useState(false)
  const [availableCues, setAvailableCues] = useState<AudioCueOption[]>([])
  const [activeCue, setActiveCue] = useState<string | null>(null)
  const [secondaryCueType, setSecondaryCueType] = useState<string | null>(null)
  const [selectedCueId, setSelectedCueId] = useState<string>('')
  const [selectedGroupId, setSelectedGroupId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gameModeEnabled, setGameModeEnabled] = useState(false)
  const [strobeFiringDisplay, setStrobeFiringDisplay] = useState(false)
  const [strobeCueType, setStrobeCueType] = useState<string | null>(null)
  const strobeHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadCueState = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true)
      }
      const enabled = await getAudioEnabled()
      setAudioEnabled(enabled)

      try {
        const gm = await getAudioGameMode()
        setGameModeEnabled(gm.enabled)
      } catch {
        setGameModeEnabled(false)
      }

      if (!enabled) {
        setAvailableCues([])
        setActiveCue(null)
        setSecondaryCueType(null)
        setStrobeCueType(null)
        setSelectedCueId('')
        setSelectedGroupId('')
        setError(null)
        return
      }

      const response: CueStateResponse = await getAudioReactiveCues()
      if (response?.success) {
        const sortedCues = (response.cues ?? []).sort((a, b) => {
          if (a.groupName === b.groupName) {
            return (a.label || a.id).localeCompare(b.label || b.id)
          }
          return a.groupName.localeCompare(b.groupName)
        })
        setAvailableCues(sortedCues)
        const initialCueId = response.activeCueType ?? sortedCues[0]?.id ?? ''
        const initialGroupId =
          sortedCues.find((cue) => cue.id === initialCueId)?.groupId ?? sortedCues[0]?.groupId ?? ''
        setActiveCue(initialCueId || null)
        setSecondaryCueType(response.secondaryCueType ?? null)
        setSelectedCueId(initialCueId || '')
        setSelectedGroupId(initialGroupId || '')
        setError(null)
      } else {
        setAvailableCues([])
        setActiveCue(null)
        setSecondaryCueType(null)
        setSelectedCueId('')
        setSelectedGroupId('')
        setError(response?.error || 'Unable to load audio cue state')
      }
    } catch (err) {
      console.error('Failed to load audio reactive cues', err)
      setError('Failed to load audio cue state')
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    loadCueState()

    const handleAudioEvent = () => loadCueState(true)
    addIpcListener(RENDERER_RECEIVE.AUDIO_CONFIG_UPDATE, handleAudioEvent)
    addIpcListener(RENDERER_RECEIVE.AUDIO_ENABLE, handleAudioEvent)
    addIpcListener(RENDERER_RECEIVE.AUDIO_DISABLE, handleAudioEvent)
    addIpcListener(RENDERER_RECEIVE.AUDIO_GAME_MODE_UPDATE, handleAudioEvent)

    return () => {
      removeIpcListener(RENDERER_RECEIVE.AUDIO_CONFIG_UPDATE, handleAudioEvent)
      removeIpcListener(RENDERER_RECEIVE.AUDIO_ENABLE, handleAudioEvent)
      removeIpcListener(RENDERER_RECEIVE.AUDIO_DISABLE, handleAudioEvent)
      removeIpcListener(RENDERER_RECEIVE.AUDIO_GAME_MODE_UPDATE, handleAudioEvent)
    }
  }, [loadCueState])

  useEffect(() => {
    const handleGameModeCueChange = (payload: { activeCueType: string }) => {
      setActiveCue(payload.activeCueType || null)
    }
    addIpcListener(RENDERER_RECEIVE.AUDIO_GAME_MODE_CUE_CHANGE, handleGameModeCueChange)
    return () => {
      removeIpcListener(RENDERER_RECEIVE.AUDIO_GAME_MODE_CUE_CHANGE, handleGameModeCueChange)
    }
  }, [])

  useEffect(() => {
    const clearHideTimer = () => {
      if (strobeHideTimerRef.current) {
        clearTimeout(strobeHideTimerRef.current)
        strobeHideTimerRef.current = null
      }
    }

    const handleStrobeState = (payload: { active: boolean; strobeCueType: string | null }) => {
      setStrobeCueType(payload.strobeCueType)
      if (payload.active) {
        clearHideTimer()
        setStrobeFiringDisplay(true)
      } else {
        clearHideTimer()
        strobeHideTimerRef.current = setTimeout(() => {
          setStrobeFiringDisplay(false)
          strobeHideTimerRef.current = null
        }, MIN_STROBE_DISPLAY_MS)
      }
    }

    addIpcListener(RENDERER_RECEIVE.AUDIO_STROBE_STATE, handleStrobeState)
    return () => {
      removeIpcListener(RENDERER_RECEIVE.AUDIO_STROBE_STATE, handleStrobeState)
      clearHideTimer()
    }
  }, [])

  const groupOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; description?: string }>()
    availableCues.forEach((cue) => {
      if (!map.has(cue.groupId)) {
        map.set(cue.groupId, {
          id: cue.groupId,
          name: cue.groupName,
          description: cue.groupDescription,
        })
      }
    })
    return Array.from(map.values())
  }, [availableCues])

  // Ensure we always have a valid group selection when cues load
  useEffect(() => {
    if (availableCues.length === 0) {
      setSelectedGroupId('')
      setSelectedCueId('')
      return
    }

    if (!selectedGroupId) {
      const firstGroupId = availableCues[0].groupId
      setSelectedGroupId(firstGroupId)
      const firstCue = availableCues.find((cue) => cue.groupId === firstGroupId)
      if (firstCue) {
        setSelectedCueId(firstCue.id)
      }
      return
    }

    const hasGroup = availableCues.some((cue) => cue.groupId === selectedGroupId)
    if (!hasGroup) {
      const fallbackGroupId = availableCues[0].groupId
      setSelectedGroupId(fallbackGroupId)
      const fallbackCue = availableCues.find((cue) => cue.groupId === fallbackGroupId)
      if (fallbackCue) {
        setSelectedCueId(fallbackCue.id)
      }
    }
  }, [availableCues, selectedGroupId])

  const cuesForSelectedGroup = useMemo(
    () => availableCues.filter((cue) => cue.groupId === selectedGroupId),
    [availableCues, selectedGroupId],
  )

  const selectedGroupInfo = useMemo(
    () => groupOptions.find((group) => group.id === selectedGroupId),
    [groupOptions, selectedGroupId],
  )

  const selectedCue = useMemo(
    () => availableCues.find((cue) => cue.id === (selectedCueId || activeCue || '')),
    [availableCues, selectedCueId, activeCue],
  )

  const activeCueForGameMode = useMemo(
    () => (activeCue ? availableCues.find((cue) => cue.id === activeCue) : undefined),
    [availableCues, activeCue],
  )

  const secondaryCueForGameMode = useMemo(() => {
    if (!secondaryCueType) {
      return undefined
    }
    return availableCues.find((cue) => cue.id === secondaryCueType)
  }, [availableCues, secondaryCueType])

  const handleCueChange = async (cueId: string) => {
    setSelectedCueId(cueId)

    if (!cueId || saving || cueId === activeCue) {
      return
    }

    setSaving(true)
    try {
      const result: { success: boolean; error?: string } = await setActiveAudioCue(cueId)
      if (result?.success) {
        setActiveCue(cueId)
        setError(null)
      } else {
        setError(result?.error || 'Unable to update cue selection')
      }
    } catch (err) {
      console.error('Failed to set active audio cue', err)
      setError('Failed to set active cue')
    } finally {
      setSaving(false)
    }
  }

  const handleGroupChange = (groupId: string) => {
    setSelectedGroupId(groupId)
    const firstCueInGroup = availableCues.find((cue) => cue.groupId === groupId)
    if (firstCueInGroup) {
      handleCueChange(firstCueInGroup.id)
    } else {
      setSelectedCueId('')
    }
  }

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-md  ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
          Audio Reactive Cue
        </h2>
        <span
          className={`text-xs font-semibold px-2 py-1 rounded ${
            audioEnabled
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
              : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
          }`}>
          {audioEnabled ? 'Audio Reactive Enabled' : 'Audio Reactive Disabled'}
        </span>
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        When game mode is enabled, cues are cycled randomly through your enabled audio cue groups.
        When disabled you can select the cue manually.
      </p>

      {error && (
        <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700 dark:bg-red-900 dark:text-red-100">
          {error}
        </div>
      )}

      {!audioEnabled && (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Enable Audio Reactive mode in Audio Settings to pick a cue.
        </p>
      )}

      {audioEnabled && loading && (
        <p className="text-sm text-gray-600 dark:text-gray-400">Loading available cues…</p>
      )}

      {audioEnabled && !loading && availableCues.length === 0 && (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          No audio cues are available in the enabled groups.
        </p>
      )}

      {audioEnabled && !loading && availableCues.length > 0 && (
        <div className="space-y-4">
          {gameModeEnabled ? (
            <div className="p-3 bg-gray-200 dark:bg-gray-700 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                  Current cue
                </h3>
              </div>
              <div className="overflow-x-auto">
                <div className="grid w-full min-w-[36rem] grid-cols-4 gap-3 sm:gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 dark:text-gray-200">Cue group</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {activeCueForGameMode?.groupName ?? '—'}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 dark:text-gray-200">Primary cue</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {activeCueForGameMode?.label ?? activeCue ?? '—'}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 dark:text-gray-200">Secondary cue</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {secondaryCueForGameMode?.label ?? secondaryCueType ?? 'None'}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 dark:text-gray-200">Strobe</p>
                    <p
                      className={`text-sm ${
                        strobeFiringDisplay
                          ? 'text-gray-900 dark:text-white'
                          : 'text-gray-500 dark:text-gray-400'
                      }`}>
                      {strobeFiringDisplay
                        ? strobeCueType
                          ? availableCues.find((c) => c.id === strobeCueType)?.label ??
                            strobeCueType
                          : 'Active'
                        : 'Inactive'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-4 md:flex-row">
                <div className={`${DROPDOWN_WIDTH}`}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Audio Cue Group
                  </label>
                  <select
                    className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:text-gray-200"
                    value={selectedGroupId || ''}
                    onChange={(event) => handleGroupChange(event.target.value)}
                    disabled={saving || groupOptions.length === 0}>
                    <option value="" disabled>
                      {groupOptions.length === 0 ? 'No groups available' : 'Choose a group'}
                    </option>
                    {groupOptions.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={`${DROPDOWN_WIDTH}`}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Audio Cue
                  </label>
                  <select
                    className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:text-gray-200"
                    value={selectedCueId || activeCue || ''}
                    onChange={(event) => handleCueChange(event.target.value)}
                    disabled={saving || cuesForSelectedGroup.length === 0}>
                    <option value="" disabled>
                      {cuesForSelectedGroup.length === 0
                        ? 'No cues for this group'
                        : 'Choose a cue'}
                    </option>
                    {cuesForSelectedGroup.map((cue) => (
                      <option key={cue.id} value={cue.id}>
                        {cue.label || cue.id}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {(selectedGroupInfo || selectedCue) && (
                <div className="">
                  {selectedGroupInfo && (
                    <div>
                      <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                        <strong>Group Description:</strong>{' '}
                        {selectedGroupInfo.description ||
                          'No description available for this group.'}
                      </div>
                    </div>
                  )}
                  {selectedCue && (
                    <div>
                      <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                        <strong>Cue Description:</strong>{' '}
                        {selectedCue.description || 'No description available for this cue.'}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default AudioCueSelectorPanel
