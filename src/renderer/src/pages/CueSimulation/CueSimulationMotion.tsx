import React, { useCallback, useEffect, useState } from 'react'
import { FaChevronCircleDown, FaChevronCircleRight } from 'react-icons/fa'
import {
  getMotionCueGroups,
  getAvailableMotionCues,
  startMotionCueSimulation,
  stopMotionCueSimulation,
} from '../../ipcApi'

type MotionGroupRow = { id: string; name: string; description?: string; cueCount: number }
type MotionCueRow = { id: string; name: string; description: string }

interface CueSimulationMotionProps {
  /** When true, controls are non-interactive (e.g. parent gated simulation off). */
  disabled?: boolean
}

/**
 * Collapsible motion group/cue selection and start/stop for simulating motion cues in Cue Simulation.
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
        const list = await getMotionCueGroups()
        if (!cancelled && Array.isArray(list)) {
          setGroups(list)
        }
      } catch (e) {
        console.error('Failed to load motion cue groups:', e)
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
        const list = await getAvailableMotionCues(groupId)
        if (!cancelled && Array.isArray(list)) {
          setCues(list)
          setCueId((prev) => {
            if (prev && list.some((c) => c.id === prev)) return prev
            return list[0]?.id ?? ''
          })
        }
      } catch (e) {
        console.error('Failed to load motion cues:', e)
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
      const result = await startMotionCueSimulation(groupId, cueId)
      if (!result.success) {
        console.error(
          'Failed to start motion cue simulation:',
          'error' in result ? result.error : '',
        )
      }
    } catch (e) {
      console.error('Error starting motion cue simulation:', e)
    } finally {
      setIsStarting(false)
    }
  }, [groupId, cueId, disabled, isStarting])

  const handleStop = useCallback(async () => {
    try {
      await stopMotionCueSimulation()
    } catch (e) {
      console.error('Error stopping motion cue simulation:', e)
    }
  }, [])

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
      </div>
    </div>
  )
}

export default CueSimulationMotion
