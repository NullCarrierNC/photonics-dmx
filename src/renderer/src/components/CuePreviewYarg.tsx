import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  CueData,
  InstrumentNoteType,
  DrumNoteType,
} from '../../../photonics-dmx/cues/types/cueTypes'
import { addIpcListener, removeIpcListener } from '../utils/ipcHelpers'
import PostProcessingStatus from './PostProcessingStatus'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import YargNoteGrid from './CuePreviewYarg/YargNoteGrid'
import {
  getActiveYargMotionCue,
  getAvailableYargMotionCues,
  getMotionEnabled,
  getYargMotionCueGroups,
  setListenCueData,
} from '../ipcApi'
import { useAtom } from 'jotai'
import { currentCueStateAtom, yargListenerEnabledAtom } from '../atoms'

interface CuePreviewYargProps {
  className?: string
  showBeatIndicator?: boolean
  showMeasureIndicator?: boolean
  showKeyframeIndicator?: boolean
  manualBeatType?: string
  manualMeasureType?: string
  manualKeyframeType?: string
  simulationMode?: boolean
}

const CuePreviewYarg: React.FC<CuePreviewYargProps> = ({
  className = '',
  showBeatIndicator = false,
  showMeasureIndicator = false,
  showKeyframeIndicator = false,
  manualBeatType = 'Manual Beat',
  manualMeasureType = 'Manual Measure',
  manualKeyframeType = 'Manual Keyframe',
  simulationMode = false,
}) => {
  const [currentCueData, setCurrentCueData] = useState<CueData | null>(null)
  const [cueState] = useAtom(currentCueStateAtom)
  const [yargListenerEnabled] = useAtom(yargListenerEnabledAtom)

  // Separate state for primary and secondary cues
  const [primaryCueName, setPrimaryCueName] = useState<string>('')
  const [secondaryCueName, setSecondaryCueName] = useState<string>('')

  // State for beat and measure indicators
  const [beatReceived, setBeatReceived] = useState(false)
  const [measureReceived, setMeasureReceived] = useState(false)
  const [lastBeatType, setLastBeatType] = useState<string | null>(null)
  const [lastMeasureType, setLastMeasureType] = useState<string | null>(null)
  // State for keyframe indicator
  const [keyframeReceived, setKeyframeReceived] = useState(false)
  const [lastKeyframeType, setLastKeyframeType] = useState<string | null>(null)

  const [motionGlobalEnabled, setMotionGlobalEnabled] = useState(true)
  const [motionPlayingLabel, setMotionPlayingLabel] = useState<string | null>(null)
  const [motionPlayingGroupLabel, setMotionPlayingGroupLabel] = useState<string | null>(null)

  // State for instrument note indicators
  const [activeInstrumentNotes, setActiveInstrumentNotes] = useState<{
    guitar: Set<InstrumentNoteType>
    bass: Set<InstrumentNoteType>
    keys: Set<InstrumentNoteType>
    drums: Set<DrumNoteType>
  }>({
    guitar: new Set<InstrumentNoteType>(),
    bass: new Set<InstrumentNoteType>(),
    keys: new Set<InstrumentNoteType>(),
    drums: new Set<DrumNoteType>(),
  })

  // Refs to track previous values for comparison
  const prevBeatRef = useRef<string | null>(null)
  const prevMeasureRef = useRef<number | undefined>(undefined)
  const prevKeyframeRef = useRef<string | null>(null)

  // Refs for instrument note clear timers so sustained notes stay solid (cancel previous timer on new packet)
  const guitarClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bassClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const keysClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const drumsClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // What the primary row is showing, read by the effect below without depending on it. Depending
  // on the state it sets would restart the effect when its own clear timer fires, and the cue
  // state atom still holds the last value, so the row would flip between the cue and blank for
  // as long as the page stayed open.
  const primaryCueNameRef = useRef<string>('')
  const primaryClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const secondaryClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadMotionLabels = useCallback(async () => {
    try {
      const me = await getMotionEnabled()
      setMotionGlobalEnabled(me === true)
      if (!me) {
        setMotionPlayingGroupLabel(null)
        setMotionPlayingLabel(null)
        return
      }
      const activeRef = await getActiveYargMotionCue()
      if (activeRef && typeof activeRef === 'object' && 'groupId' in activeRef) {
        const ref = activeRef as { groupId: string; cueId: string }
        const groups = await getYargMotionCueGroups()
        const groupRow = groups?.find((g) => g.id === ref.groupId)
        setMotionPlayingGroupLabel(groupRow?.name ?? ref.groupId)
        const cues = await getAvailableYargMotionCues(ref.groupId)
        const row = cues.find((c) => c.id === ref.cueId)
        setMotionPlayingLabel(row?.name ?? ref.cueId)
      } else {
        setMotionPlayingGroupLabel(null)
        setMotionPlayingLabel(null)
      }
    } catch {
      setMotionPlayingGroupLabel(null)
      setMotionPlayingLabel(null)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async; setState only after awaited IPC, no synchronous render cascade
    void loadMotionLabels()
    const onRefresh = () => void loadMotionLabels()
    addIpcListener(RENDERER_RECEIVE.MOTION_ENABLED_CHANGED, onRefresh)
    addIpcListener(RENDERER_RECEIVE.YARG_MOTION_CUE_GROUPS_CHANGED, onRefresh)
    return () => {
      removeIpcListener(RENDERER_RECEIVE.MOTION_ENABLED_CHANGED, onRefresh)
      removeIpcListener(RENDERER_RECEIVE.YARG_MOTION_CUE_GROUPS_CHANGED, onRefresh)
    }
  }, [loadMotionLabels])

  useEffect(() => {
    const onMotionCueChange = async (payload: {
      ref: { groupId: string; cueId: string } | null
    }) => {
      if (!payload.ref) {
        setMotionPlayingLabel(null)
        setMotionPlayingGroupLabel(null)
        return
      }
      try {
        const groups = await getYargMotionCueGroups()
        const groupRow = groups?.find((g) => g.id === payload.ref!.groupId)
        setMotionPlayingGroupLabel(groupRow?.name ?? payload.ref.groupId)
        const cues = await getAvailableYargMotionCues(payload.ref.groupId)
        const row = cues.find((c) => c.id === payload.ref!.cueId)
        setMotionPlayingLabel(row?.name ?? payload.ref.cueId)
      } catch {
        setMotionPlayingGroupLabel(payload.ref.groupId)
        setMotionPlayingLabel(payload.ref.cueId)
      }
    }
    addIpcListener(RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE, onMotionCueChange)
    return () => {
      removeIpcListener(RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE, onMotionCueChange)
    }
  }, [])

  // Update primary/secondary cue display based on cue state changes; clear after 100ms when no cue firing (same delay as notes)
  useEffect(() => {
    if (!cueState?.cueType || !cueState?.cueStyle) return
    const { cueType, cueStyle } = cueState
    if (cueStyle === 'primary') {
      if (primaryCueNameRef.current && primaryCueNameRef.current !== cueType) {
        clearTimeout(secondaryClearTimerRef.current ?? undefined)
        // eslint-disable-next-line react-hooks/set-state-in-effect -- sync display from IPC cue state
        setSecondaryCueName('')
      }
      clearTimeout(primaryClearTimerRef.current ?? undefined)
      primaryCueNameRef.current = cueType
      setPrimaryCueName(cueType)
      primaryClearTimerRef.current = setTimeout(() => {
        primaryCueNameRef.current = ''
        setPrimaryCueName('')
      }, 200)
    } else if (cueStyle === 'secondary') {
      clearTimeout(secondaryClearTimerRef.current ?? undefined)
      setSecondaryCueName(cueType)
      secondaryClearTimerRef.current = setTimeout(() => setSecondaryCueName(''), 200)
    }
  }, [cueState])

  // Handle manual indicators via props
  useEffect(() => {
    if (showBeatIndicator) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync indicator from props
      setLastBeatType(manualBeatType)
      setBeatReceived(true)

      // Clear beat indicator after 100ms
      const timer = setTimeout(() => {
        setBeatReceived(false)
      }, 100)

      return () => clearTimeout(timer)
    }
    return undefined
  }, [showBeatIndicator, manualBeatType])

  useEffect(() => {
    if (showKeyframeIndicator) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync indicator from props
      setLastKeyframeType(manualKeyframeType)
      setKeyframeReceived(true)

      // Clear keyframe indicator after 200ms
      const timer = setTimeout(() => {
        setKeyframeReceived(false)
      }, 200)

      return () => clearTimeout(timer)
    }
    return undefined
  }, [showKeyframeIndicator, manualKeyframeType])

  useEffect(() => {
    if (showMeasureIndicator) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync indicator from props
      setLastMeasureType(manualMeasureType)
      setMeasureReceived(true)

      // Clear measure indicator after 200ms
      const timer = setTimeout(() => {
        setMeasureReceived(false)
      }, 200)

      return () => clearTimeout(timer)
    }
    return undefined
  }, [showMeasureIndicator, manualMeasureType])

  // Listen for cue events when YARG listener is enabled or in simulation mode
  useEffect(() => {
    if (!yargListenerEnabled && !simulationMode) {
      // Clear data when listener is disabled and not in simulation mode
      clearTimeout(primaryClearTimerRef.current ?? undefined)
      clearTimeout(secondaryClearTimerRef.current ?? undefined)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when listener disabled
      setCurrentCueData(null)
      setPrimaryCueName('')
      setSecondaryCueName('')
      setBeatReceived(false)
      setMeasureReceived(false)
      setKeyframeReceived(false)
      setLastBeatType(null)
      setLastMeasureType(null)
      setLastKeyframeType(null)
      return
    }

    // Only tell the main process to start sending cue data if not in simulation mode
    if (!simulationMode) {
      setListenCueData(true)
    }

    const handleCueData = (cueData: CueData) => {
      // Beat detection - check for beat values in the beat property
      if (cueData.beat && cueData.beat !== 'Unknown') {
        if (cueData.beat !== prevBeatRef.current) {
          // Check if it's a beat event
          if (cueData.beat === 'Strong' || cueData.beat === 'Weak') {
            setLastBeatType(cueData.beat)
            setBeatReceived(true)

            // Clear beat indicator
            setTimeout(() => {
              setBeatReceived(false)
            }, 200)
          }
          // Check if it's a measure event coming through the beat property
          else if (cueData.beat === 'Measure') {
            setLastMeasureType('Measure Event')
            setMeasureReceived(true)

            // Clear measure indicator
            setTimeout(() => {
              setMeasureReceived(false)
            }, 250)
          }
        }

        // Update our ref with the current beat value
        prevBeatRef.current = cueData.beat
      }

      // Measure detection - check if the measure number changed. Measures are 1-indexed, so 0 (the
      // default/unset value) is treated as "no measure" and not shown.
      if (cueData.measureOrBeat) {
        // Check if it's a new measure (compare with our ref)
        if (cueData.measureOrBeat !== prevMeasureRef.current) {
          setLastMeasureType(`Measure ${cueData.measureOrBeat}`)
          setMeasureReceived(true)

          // Clear measure indicator after 500ms
          setTimeout(() => {
            setMeasureReceived(false)
          }, 250)
        }

        // Update our ref with the current measure value
        prevMeasureRef.current = cueData.measureOrBeat
      }

      // Keyframe detection - check if the keyframe changed
      if (cueData.keyframe && cueData.keyframe !== 'Unknown') {
        if (cueData.keyframe !== prevKeyframeRef.current) {
          // Only show keyframes that aren't "Off"
          if (cueData.keyframe !== 'Off') {
            setLastKeyframeType(cueData.keyframe)
            setKeyframeReceived(true)

            // Clear keyframe indicator after 500ms
            setTimeout(() => {
              setKeyframeReceived(false)
            }, 250)
          }
        }

        // Update our ref with the current keyframe value
        prevKeyframeRef.current = cueData.keyframe
      }

      // Handle instrument notes (ref-tracked timers so sustained notes stay solid; each new packet cancels previous clear)
      if (cueData.guitarNotes && cueData.guitarNotes.length > 0) {
        const guitarNotes = cueData.guitarNotes.filter((note) => note !== InstrumentNoteType.None)
        clearTimeout(guitarClearTimerRef.current ?? undefined)
        setActiveInstrumentNotes((prev) => ({
          ...prev,
          guitar: new Set(guitarNotes.map((note) => note)),
        }))
        guitarClearTimerRef.current = setTimeout(() => {
          setActiveInstrumentNotes((prev) => ({
            ...prev,
            guitar: new Set<InstrumentNoteType>(),
          }))
        }, 100)
      }

      if (cueData.bassNotes && cueData.bassNotes.length > 0) {
        const bassNotes = cueData.bassNotes.filter((note) => note !== InstrumentNoteType.None)
        clearTimeout(bassClearTimerRef.current ?? undefined)
        setActiveInstrumentNotes((prev) => ({
          ...prev,
          bass: new Set(bassNotes.map((note) => note)),
        }))
        bassClearTimerRef.current = setTimeout(() => {
          setActiveInstrumentNotes((prev) => ({
            ...prev,
            bass: new Set<InstrumentNoteType>(),
          }))
        }, 100)
      }

      if (cueData.keysNotes && cueData.keysNotes.length > 0) {
        const keysNotes = cueData.keysNotes.filter((note) => note !== InstrumentNoteType.None)
        clearTimeout(keysClearTimerRef.current ?? undefined)
        setActiveInstrumentNotes((prev) => ({
          ...prev,
          keys: new Set(keysNotes.map((note) => note)),
        }))
        keysClearTimerRef.current = setTimeout(() => {
          setActiveInstrumentNotes((prev) => ({
            ...prev,
            keys: new Set<InstrumentNoteType>(),
          }))
        }, 100)
      }

      if (cueData.drumNotes && cueData.drumNotes.length > 0) {
        const drumNotes = cueData.drumNotes.filter((note) => note !== DrumNoteType.None)
        clearTimeout(drumsClearTimerRef.current ?? undefined)
        setActiveInstrumentNotes((prev) => ({
          ...prev,
          drums: new Set(drumNotes.map((note) => note)),
        }))
        drumsClearTimerRef.current = setTimeout(() => {
          setActiveInstrumentNotes((prev) => ({
            ...prev,
            drums: new Set<DrumNoteType>(),
          }))
        }, 100)
      }

      setCurrentCueData(cueData)
    }
    addIpcListener(RENDERER_RECEIVE.CUE_HANDLED, handleCueData)

    return () => {
      setListenCueData(false)
      removeIpcListener(RENDERER_RECEIVE.CUE_HANDLED, handleCueData)
      clearTimeout(guitarClearTimerRef.current ?? undefined)
      clearTimeout(bassClearTimerRef.current ?? undefined)
      clearTimeout(keysClearTimerRef.current ?? undefined)
      clearTimeout(drumsClearTimerRef.current ?? undefined)
      clearTimeout(primaryClearTimerRef.current ?? undefined)
      clearTimeout(secondaryClearTimerRef.current ?? undefined)
    }
  }, [yargListenerEnabled, simulationMode])

  const getTitle = () => {
    if (cueState?.groupName) {
      return `Current Cue Group: ${cueState.groupName}${cueState.isFallback ? ' - fallback' : ''}`
    }
    return 'Current Cue Group'
  }

  const getAutoGenStatus = () => {
    if (simulationMode) {
      return 'Simulation'
    }
    if (currentCueData?.trackMode !== undefined) {
      return currentCueData.trackMode === 'autogen' ? 'Auto-Generated' : 'Tracked'
    }
    return null
  }

  const autoGenStatus = getAutoGenStatus()
  return (
    <div className={`p-3 bg-gray-200 dark:bg-gray-700 rounded-lg mt-4 ${className}`}>
      <div className="flex justify-between items-center mb-1">
        <h3 className="text-lg font-semibold">{getTitle()}</h3>
        {autoGenStatus && (
          <span
            className={`text-sm font-medium px-2 py-1 rounded ${
              autoGenStatus === 'Simulation'
                ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                : autoGenStatus === 'Auto-Generated'
                  ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
                  : 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200'
            }`}>
            {autoGenStatus}
          </span>
        )}
      </div>
      {currentCueData ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* First row - 4 columns */}
            <div>
              <p>
                <span className="font-medium">Primary:</span>{' '}
                <span className="text-sm">{primaryCueName || 'None'}</span>
              </p>
              <p>
                <span className="font-medium">Secondary:</span>{' '}
                <span className="text-sm">{secondaryCueName || ''}</span>
              </p>
            </div>

            <div>
              <p className="font-medium">Strobe State:</p>
              <p>{currentCueData.strobeState || 'None'}</p>
            </div>

            <div>
              <p className="font-medium">BPM:</p>
              <p>{currentCueData.beatsPerMinute}</p>
            </div>

            {/* Venue Size holds all song, so it sits on the card rather than in a chip. */}
            <div>
              <p className="font-medium">Venue Size:</p>
              <div className="p-2 rounded">
                <p>{currentCueData.venueSize || 'Unknown'}</p>
              </div>
            </div>

            {/* Second row - 4 columns */}
            {!!currentCueData.measureOrBeat && (
              <div>
                <p className="font-medium">Current Measure:</p>
                <p>Measure {currentCueData.measureOrBeat}</p>
              </div>
            )}

            {/* Beat event detector */}
            <div>
              <p className="font-medium">Beat Event:</p>
              <div
                className={`p-2 rounded ${beatReceived ? 'bg-yellow-200 dark:bg-yellow-500' : 'bg-gray-100 dark:bg-gray-600'}`}>
                {beatReceived ? (
                  <p className="font-bold">{lastBeatType}</p>
                ) : (
                  <p>Waiting for beat...</p>
                )}
              </div>
            </div>

            {/* Measure event detector */}
            <div>
              <p className="font-medium">Measure Event:</p>
              <div
                className={`p-2 rounded ${measureReceived ? 'bg-yellow-200 dark:bg-yellow-500' : 'bg-gray-100 dark:bg-gray-600'}`}>
                {measureReceived ? (
                  <p className="font-bold">{lastMeasureType}</p>
                ) : (
                  <p>Waiting for measure...</p>
                )}
              </div>
            </div>

            {/* Keyframe event detector */}
            <div>
              <p className="font-medium">Keyframe Event:</p>
              <div
                className={`p-2 rounded ${keyframeReceived ? 'bg-emerald-200 dark:bg-emerald-900' : 'bg-gray-100 dark:bg-gray-600'}`}>
                {keyframeReceived ? <p className="font-bold">{lastKeyframeType}</p> : <p>Off</p>}
              </div>
            </div>

            <PostProcessingStatus state={currentCueData.postProcessing} />
          </div>

          {/* Instrument Notes Section */}
          <div className="mt-4">
            <YargNoteGrid activeInstrumentNotes={activeInstrumentNotes} />
          </div>

          {motionGlobalEnabled && (
            <div className="mt-4 pt-3 border-t border-gray-300 dark:border-gray-600">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="min-w-0">
                  <p>
                    <span className="font-medium">Motion Cue Group:</span>{' '}
                    <span className="text-sm">{motionPlayingGroupLabel ?? '—'}</span>
                  </p>
                </div>
                <div className="min-w-0">
                  <p>
                    <span className="font-medium">Motion Cue:</span>{' '}
                    <span className="text-sm">{motionPlayingLabel ?? '—'}</span>
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {motionGlobalEnabled && (motionPlayingGroupLabel || motionPlayingLabel) ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="min-w-0">
                <p>
                  <span className="font-medium">Motion Cue Group:</span>{' '}
                  <span className="text-sm">{motionPlayingGroupLabel ?? '—'}</span>
                </p>
              </div>
              <div className="min-w-0">
                <p>
                  <span className="font-medium">Motion Cue:</span>{' '}
                  <span className="text-sm">{motionPlayingLabel ?? '—'}</span>
                </p>
              </div>
            </div>
          ) : (
            <p className="text-gray-500 dark:text-gray-400">No active YARG cue</p>
          )}
        </>
      )}
    </div>
  )
}

export default CuePreviewYarg
