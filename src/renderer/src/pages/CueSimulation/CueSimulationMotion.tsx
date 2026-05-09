import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { FaChevronCircleDown, FaChevronCircleRight } from 'react-icons/fa'
import {
  getYargMotionCueGroups,
  getAvailableYargMotionCues,
  startYargMotionCueSimulation,
  stopMotionCueSimulation,
} from '../../ipcApi'
import { createLogger } from '../../../../shared/logger'

const log = createLogger('CueSimulationMotion')

type MotionGroupRow = { id: string; name: string; description?: string; cueCount: number }
type MotionCueRow = { id: string; name: string; description: string }

interface CueSimulationMotionProps {
  /** When true, controls are non-interactive (e.g. parent gated simulation off). */
  disabled?: boolean
}

/**
 * Collapsible YARG motion group/cue selection and start/stop for simulating motion cues in Cue Simulation.
 */
export const CueSimulationMotion: React.FC<CueSimulationMotionProps> = ({ disabled = false }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [groups, setGroups] = useState<MotionGroupRow[]>([])
  const [groupId, setGroupId] = useState('')
  const [cues, setCues] = useState<MotionCueRow[]>([])
  const [cueId, setCueId] = useState('')
  const [isStarting, setIsStarting] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const list = await getYargMotionCueGroups()
        if (!cancelled && Array.isArray(list)) {
          const sorted = [...list].sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
          )
          setGroups(sorted)
        }
      } catch (e) {
        log.error('Failed to load motion cue groups:', e)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!groupId) {
      setCues([])
      setCueId('')
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const list = await getAvailableYargMotionCues(groupId)
        if (!cancelled && Array.isArray(list)) {
          const sorted = [...list].sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
          )
          setCues(sorted)
          setCueId((prev) => {
            if (prev && sorted.some((c) => c.id === prev)) return prev
            return sorted[0]?.id ?? ''
          })
        }
      } catch (e) {
        log.error('Failed to load motion cues:', e)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [groupId])

  const handleStart = useCallback(async () => {
    if (!groupId || !cueId || disabled || isStarting) return
    setIsStarting(true)
    try {
      const result = await startYargMotionCueSimulation(groupId, cueId)
      if (!result.success) {
        log.error('Failed to start motion cue simulation:', 'error' in result ? result.error : '')
      }
    } catch (e) {
      log.error('Error starting motion cue simulation:', e)
    } finally {
      setIsStarting(false)
    }
  }, [groupId, cueId, disabled, isStarting])

  const handleStop = useCallback(async () => {
    try {
      await stopMotionCueSimulation()
    } catch (e) {
      log.error('Error stopping motion cue simulation:', e)
    }
  }, [])

  const selectedMotionGroup = useMemo(
    () => (groupId ? groups.find((g) => g.id === groupId) : undefined),
    [groups, groupId],
  )
  const selectedMotionCue = useMemo(
    () => (cueId ? cues.find((c) => c.id === cueId) : undefined),
    [cues, cueId],
  )

  const motionGroupDescription = selectedMotionGroup?.description?.trim() ?? ''
  const motionCueDescription = selectedMotionCue?.description?.trim() ?? ''
  const showMotionGroupDescription = Boolean(groupId && motionGroupDescription)
  const showMotionCueDescription = Boolean(
    cueId && motionCueDescription && motionCueDescription !== 'No description available',
  )

  return (
    <div className="mt-6 bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600">
      <button
        type="button"
        className="w-full px-4 py-3 text-left font-medium text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset rounded-t-lg flex items-center justify-between"
        onClick={() => setIsOpen((o) => !o)}>
        <span>Motion Cue Simulation</span>
        {isOpen ? <FaChevronCircleDown size={20} /> : <FaChevronCircleRight size={20} />}
      </button>
      <div className={`px-4 pb-4 ${isOpen ? '' : 'hidden'}`}>
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Motion group
            </label>
            <select
              value={groupId}
              onChange={(e) => {
                setGroupId(e.target.value)
                setCueId('')
              }}
              className="p-2 border rounded dark:bg-gray-700 dark:text-gray-200"
              style={{ minWidth: '180px' }}
              disabled={disabled}>
              <option value="">— Select —</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Motion cue
            </label>
            <select
              value={cueId}
              onChange={(e) => setCueId(e.target.value)}
              className="p-2 border rounded dark:bg-gray-700 dark:text-gray-200"
              style={{ minWidth: '180px' }}
              disabled={disabled || !groupId}>
              <option value="">— Select —</option>
              {cues.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleStart}
              className={`px-4 py-2 rounded text-sm ${
                disabled || !groupId || !cueId || isStarting
                  ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              }`}
              disabled={disabled || !groupId || !cueId || isStarting}>
              Start simulating motion cue
            </button>
            <button
              type="button"
              onClick={handleStop}
              className={`px-4 py-2 rounded text-sm ${
                disabled
                  ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                  : 'bg-orange-500 text-white hover:bg-orange-600'
              }`}
              disabled={disabled}>
              Stop simulating motion cue
            </button>
          </div>
        </div>

        {showMotionGroupDescription && (
          <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            <strong>Motion group description:</strong> {motionGroupDescription}
          </div>
        )}

        {showMotionCueDescription && (
          <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            <strong>Motion cue description:</strong> {motionCueDescription}
          </div>
        )}
      </div>
    </div>
  )
}

export default CueSimulationMotion
