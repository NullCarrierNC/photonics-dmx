import React, { useCallback, useState, useEffect } from 'react'
import { CueData } from '../../../photonics-dmx/cues/types/cueTypes'
import { addIpcListener, removeIpcListener } from '../utils/ipcHelpers'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import type { Rb3GameModeSchedulePayload } from '../../../shared/ipcTypes'
import {
  setListenCueData,
  getMotionEnabled,
  getRb3CueGroups,
  getRb3MotionCueGroups,
  getAvailableRb3MotionCues,
  getActiveRb3MotionCue,
} from '../ipcApi'
import { useAtom } from 'jotai'
import { rb3eListenerEnabledAtom } from '../atoms'
import { createLogger } from '../../../shared/logger'
const log = createLogger('CuePreviewRb3e')

interface CuePreviewRb3eProps {
  className?: string
}

interface ColorBankState {
  red: number[]
  green: number[]
  blue: number[]
  yellow: number[]
}

const EMPTY_BANKS: ColorBankState = { red: [], green: [], blue: [], yellow: [] }

const maskToPositions = (mask = 0): number[] =>
  Array.from({ length: 8 }, (_, i) => i).filter((i) => (mask & (1 << i)) !== 0)

/**
 * Derive the four StageKit colour banks (lit positions per colour) from an incoming cue frame. Pure
 * so it can be unit-tested without mounting the component.
 *
 * Every source (cue mode, simulation, and the direct StageKit processor which now accumulates its
 * per-packet updates) emits `ledBanks` as the authoritative full snapshot, so this just reads it and
 * replaces all four banks. On the rare frame with no `ledBanks` the previous banks are retained.
 */
export function nextColorBanks(prev: ColorBankState, cueData: CueData): ColorBankState {
  const b = cueData.ledBanks
  if (!b) return prev
  return {
    red: maskToPositions(b.red),
    green: maskToPositions(b.green),
    blue: maskToPositions(b.blue),
    yellow: maskToPositions(b.yellow),
  }
}

const CuePreviewRb3e: React.FC<CuePreviewRb3eProps> = ({ className = '' }) => {
  const [currentCueData, setCurrentCueData] = useState<CueData | null>(null)
  const [colorBanks, setColorBanks] = useState<ColorBankState>({ ...EMPTY_BANKS })
  const [rb3eListenerEnabled] = useAtom(rb3eListenerEnabledAtom)
  // Game-mode primary cue + countdown (live only; pushed from the RB3 game-mode manager).
  const [primaryGroupLabel, setPrimaryGroupLabel] = useState<string | null>(null)
  const [schedule, setSchedule] = useState<Rb3GameModeSchedulePayload | null>(null)
  const [remainingSec, setRemainingSec] = useState<number | null>(null)
  // Active motion cue (mirrors the YARG preview's motion block).
  const [motionEnabled, setMotionEnabled] = useState(false)
  const [motionGroupLabel, setMotionGroupLabel] = useState<string | null>(null)
  const [motionCueLabel, setMotionCueLabel] = useState<string | null>(null)

  // Listen for cue events when RB3E listener is enabled
  useEffect(() => {
    if (!rb3eListenerEnabled) {
      // Clear data when listener is disabled
      /* eslint-disable react-hooks/set-state-in-effect -- reset when listener disabled */
      setCurrentCueData(null)
      setColorBanks({ ...EMPTY_BANKS })
      setPrimaryGroupLabel(null)
      setSchedule(null)
      setRemainingSec(null)
      /* eslint-enable react-hooks/set-state-in-effect */
      return
    }

    // Tell the main process to start sending cue data
    setListenCueData(true)

    const handleCueData = (cueData: CueData) => {
      log.debug('Received RB3E cue data:', cueData)
      setColorBanks((prev) => nextColorBanks(prev, cueData))
      setCurrentCueData(cueData)
    }
    const handlePrimaryChange = async (payload: { groupId: string | null }) => {
      if (!payload.groupId) {
        setPrimaryGroupLabel(null)
        return
      }
      try {
        const groups = await getRb3CueGroups()
        const row = groups?.find((g) => g.id === payload.groupId)
        setPrimaryGroupLabel(row?.name ?? payload.groupId)
      } catch {
        setPrimaryGroupLabel(payload.groupId)
      }
    }
    const handleDeadline = (payload: Rb3GameModeSchedulePayload) => {
      setSchedule(payload)
      setRemainingSec(
        payload.pending || payload.deadlineMs == null
          ? null
          : Math.max(0, Math.ceil((payload.deadlineMs - Date.now()) / 1000)),
      )
    }
    addIpcListener(RENDERER_RECEIVE.CUE_HANDLED, handleCueData)
    addIpcListener(RENDERER_RECEIVE.RB3_GAME_MODE_CUE_CHANGE, handlePrimaryChange)
    addIpcListener(RENDERER_RECEIVE.RB3_GAME_MODE_DEADLINE, handleDeadline)

    return () => {
      setListenCueData(false)
      removeIpcListener(RENDERER_RECEIVE.CUE_HANDLED, handleCueData)
      removeIpcListener(RENDERER_RECEIVE.RB3_GAME_MODE_CUE_CHANGE, handlePrimaryChange)
      removeIpcListener(RENDERER_RECEIVE.RB3_GAME_MODE_DEADLINE, handleDeadline)
    }
  }, [rb3eListenerEnabled])

  // Resolve the active motion cue's group + cue labels (mirrors the YARG preview).
  const loadMotionLabels = useCallback(async () => {
    try {
      const enabled = await getMotionEnabled()
      setMotionEnabled(enabled === true)
      if (!enabled) {
        setMotionGroupLabel(null)
        setMotionCueLabel(null)
        return
      }
      const ref = await getActiveRb3MotionCue()
      if (ref && typeof ref === 'object' && 'groupId' in ref) {
        const r = ref as { groupId: string; cueId: string }
        const groups = await getRb3MotionCueGroups()
        setMotionGroupLabel(groups?.find((g) => g.id === r.groupId)?.name ?? r.groupId)
        const cues = await getAvailableRb3MotionCues(r.groupId)
        setMotionCueLabel(cues.find((c) => c.id === r.cueId)?.name ?? r.cueId)
      } else {
        setMotionGroupLabel(null)
        setMotionCueLabel(null)
      }
    } catch {
      setMotionGroupLabel(null)
      setMotionCueLabel(null)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async; setState only after awaited IPC
    void loadMotionLabels()
    const onRefresh = () => void loadMotionLabels()
    addIpcListener(RENDERER_RECEIVE.MOTION_ENABLED_CHANGED, onRefresh)
    addIpcListener(RENDERER_RECEIVE.RB3_MOTION_CUE_GROUPS_CHANGED, onRefresh)
    return () => {
      removeIpcListener(RENDERER_RECEIVE.MOTION_ENABLED_CHANGED, onRefresh)
      removeIpcListener(RENDERER_RECEIVE.RB3_MOTION_CUE_GROUPS_CHANGED, onRefresh)
    }
  }, [loadMotionLabels])

  useEffect(() => {
    const onMotionCueChange = async (payload: {
      ref: { groupId: string; cueId: string } | null
    }) => {
      if (!payload.ref) {
        setMotionGroupLabel(null)
        setMotionCueLabel(null)
        return
      }
      try {
        const groups = await getRb3MotionCueGroups()
        setMotionGroupLabel(
          groups?.find((g) => g.id === payload.ref!.groupId)?.name ?? payload.ref.groupId,
        )
        const cues = await getAvailableRb3MotionCues(payload.ref.groupId)
        setMotionCueLabel(cues.find((c) => c.id === payload.ref!.cueId)?.name ?? payload.ref.cueId)
      } catch {
        setMotionGroupLabel(payload.ref.groupId)
        setMotionCueLabel(payload.ref.cueId)
      }
    }
    addIpcListener(RENDERER_RECEIVE.RB3_MOTION_CUE_CHANGE, onMotionCueChange)
    return () => {
      removeIpcListener(RENDERER_RECEIVE.RB3_MOTION_CUE_CHANGE, onMotionCueChange)
    }
  }, [])

  // Tick the countdown once a second while a live deadline is armed. Date.now stays out of render
  // (an impure call there is disallowed); the seconds remaining are derived here and on each push.
  useEffect(() => {
    if (!schedule || schedule.pending || schedule.deadlineMs == null) return
    const deadline = schedule.deadlineMs
    const id = setInterval(
      () => setRemainingSec(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))),
      1000,
    )
    return () => clearInterval(id)
  }, [schedule])

  const getTitle = () => {
    return 'RB3E StageKit Status'
  }

  const renderLedPositions = () => {
    return (
      <div className="space-y-4">
        {/* Color Bank Rows - Always Visible */}
        <div className="space-y-2">
          {(['red', 'green', 'blue', 'yellow'] as const).map((color) => {
            const positions = colorBanks[color]
            const isActive = positions.length > 0
            const colorConfig = {
              red: {
                bg: 'bg-[#ff0000]',
                border: 'border-[#cc0000]',
                text: 'text-white',
                inactiveBg: 'bg-red-950',
                inactiveBorder: 'border-red-950',
                inactiveText: 'text-red-400',
              },
              green: {
                bg: 'bg-[#00ff00]',
                border: 'border-[#00cc00]',
                text: 'text-black',
                inactiveBg: 'bg-green-950',
                inactiveBorder: 'border-green-950',
                inactiveText: 'text-green-400',
              },
              blue: {
                bg: 'bg-[#0000ff]',
                border: 'border-[#0000cc]',
                text: 'text-white',
                inactiveBg: 'bg-blue-950',
                inactiveBorder: 'border-blue-950',
                inactiveText: 'text-blue-400',
              },
              yellow: {
                bg: 'bg-[#ffff00]',
                border: 'border-[#cccc00]',
                text: 'text-black',
                inactiveBg: 'bg-yellow-950',
                inactiveBorder: 'border-yellow-950',
                inactiveText: 'text-yellow-300',
              },
            }
            const config = colorConfig[color]

            return (
              <div key={color} className="flex items-center space-x-4">
                <div className="w-20">
                  <span className="text-sm font-medium capitalize text-gray-700 dark:text-gray-300">
                    {color}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="grid grid-cols-8 gap-1">
                    {Array.from({ length: 8 }, (_, i) => {
                      const isLit = positions.includes(i)
                      return (
                        <div
                          key={i}
                          className={`w-6 h-6 rounded border-2 flex items-center justify-center text-xs font-bold ${
                            isLit
                              ? `${config.bg} ${config.border} ${config.text}`
                              : `${config.inactiveBg} ${config.inactiveBorder} ${config.inactiveText}`
                          }`}>
                          {i + 1}
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className="w-16 text-right">
                  <span
                    className={`text-xs ${isActive ? 'text-gray-700 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400'}`}>
                    {isActive ? `${positions.length} active` : 'inactive'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Horizontal separator */}
        <hr className="border-gray-600 dark:border-gray-500 my-2" />

        {/* Blended Color Row */}
        <div className="space-y-2">
          <div className="flex items-center space-x-4">
            <div className="w-20">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Blended</span>
            </div>
            <div className="flex-1">
              <div className="grid grid-cols-8 gap-1">
                {Array.from({ length: 8 }, (_, i) => {
                  // Calculate which colors are active for this LED position
                  const activeColors = ['red', 'green', 'blue', 'yellow'].filter((color) =>
                    colorBanks[color as keyof ColorBankState].includes(i),
                  )

                  const isBlended = activeColors.length > 0
                  let blendedText = 'text-gray-400'
                  let blendColor = 'rgb(0, 0, 0)'
                  let darkerBlendColor = 'rgb(0, 0, 0)'

                  if (isBlended) {
                    if (activeColors.length === 1) {
                      // Single color - use that color
                      const color = activeColors[0]
                      const colorConfig = {
                        red: {
                          color: 'rgb(255, 0, 0)',
                          border: 'rgb(204, 0, 0)',
                          text: 'text-white',
                        },
                        green: {
                          color: 'rgb(0, 255, 0)',
                          border: 'rgb(0, 204, 0)',
                          text: 'text-black',
                        },
                        blue: {
                          color: 'rgb(0, 0, 255)',
                          border: 'rgb(0, 0, 204)',
                          text: 'text-white',
                        },
                        yellow: {
                          color: 'rgb(255, 255, 0)',
                          border: 'rgb(204, 204, 0)',
                          text: 'text-black',
                        },
                      }
                      blendColor = colorConfig[color as keyof typeof colorConfig].color
                      darkerBlendColor = colorConfig[color as keyof typeof colorConfig].border
                      blendedText = colorConfig[color as keyof typeof colorConfig].text
                    } else {
                      // Multiple colors - calculate actual additive blend
                      let r = 0,
                        g = 0,
                        b = 0

                      if (activeColors.includes('red')) r = 255
                      if (activeColors.includes('green')) g = 255
                      if (activeColors.includes('blue')) b = 255
                      if (activeColors.includes('yellow')) {
                        r = 255
                        g = 255
                      }

                      // Create custom CSS color for the blend
                      blendColor = `rgb(${r}, ${g}, ${b})`
                      darkerBlendColor = `rgb(${Math.floor(r * 0.8)}, ${Math.floor(g * 0.8)}, ${Math.floor(b * 0.8)})`

                      blendedText = r + g + b > 255 ? 'text-black' : 'text-white'
                    }
                  }

                  return (
                    <div
                      key={i}
                      className={`w-6 h-6 rounded border-2 flex items-center justify-center text-xs font-bold ${blendedText}`}
                      style={{
                        backgroundColor: isBlended ? blendColor : 'rgb(17, 24, 39)', // bg-gray-950
                        borderColor: isBlended ? darkerBlendColor : 'rgb(17, 24, 39)', // bg-gray-950
                      }}>
                      {i + 1}
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="w-16 text-right">
              <span className="text-xs text-gray-500 dark:text-gray-400">Blended</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`p-3 bg-gray-200 dark:bg-gray-700 rounded-lg mt-4 ${className}`}>
      <h3 className="text-lg font-semibold mb-3">{getTitle()}</h3>

      {currentCueData ? (
        <div className="space-y-6">
          {/* LED Position Display */}
          <div>
            <h4 className="text-md font-medium mb-3 text-gray-700 dark:text-gray-300">
              LED Position Mapping
            </h4>
            {renderLedPositions()}
          </div>

          {/* Additional RB3E Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium text-gray-700 dark:text-gray-300">Venue Size:</p>
              <p className="text-gray-600 dark:text-gray-400">{currentCueData.venueSize}</p>
            </div>
            <div>
              <p className="font-medium text-gray-700 dark:text-gray-300">Strobe State:</p>
              <div className="flex items-center space-x-2">
                <div
                  className={`w-16 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                    currentCueData.strobeState && currentCueData.strobeState !== 'Strobe_Off'
                      ? 'bg-white border-gray-300 text-black'
                      : 'bg-gray-800 border-gray-600 text-white'
                  }`}>
                  {currentCueData.strobeState === 'Strobe_Off' ? 'OFF' : 'ON'}
                </div>
              </div>
            </div>
          </div>

          {/* Cue Selection: active primary cue + countdown, and the active motion cue */}
          <div className="border-t border-gray-300 dark:border-gray-600 pt-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <p className="min-w-0">
                <span className="font-medium">Primary Cue:</span>{' '}
                <span>{primaryGroupLabel ?? '—'}</span>
              </p>
              <span className="shrink-0 tabular-nums font-medium" aria-live="polite">
                {schedule?.pending
                  ? 'Waiting for Light 1…'
                  : remainingSec != null
                    ? `Next cue in ${remainingSec}s`
                    : ''}
              </span>
            </div>
            {motionEnabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                <p className="min-w-0">
                  <span className="font-medium">Motion Cue Group:</span>{' '}
                  <span>{motionGroupLabel ?? '—'}</span>
                </p>
                <p className="min-w-0">
                  <span className="font-medium">Motion Cue:</span>{' '}
                  <span>{motionCueLabel ?? '—'}</span>
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <p className="text-gray-500 dark:text-gray-400">No active RB3E data</p>
      )}
    </div>
  )
}

export default CuePreviewRb3e
