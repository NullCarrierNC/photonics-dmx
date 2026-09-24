import React, { useState, useEffect, useRef } from 'react'
import {
  CueData,
  InstrumentNoteType,
  DrumNoteType,
} from '../../../photonics-dmx/cues/types/cueTypes'
import { addIpcListener, removeIpcListener } from '../utils/ipcHelpers'
import PostProcessingStatus from './PostProcessingStatus'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import YargNoteGrid, { type ActiveInstrumentNotes } from './CuePreviewYarg/YargNoteGrid'
import { setListenCueData } from '../ipcApi'
import { useRunningMotionLabels } from '../hooks/useRunningMotionLabels'
import { useAtom } from 'jotai'
import { currentCueStateAtom, yargListenerEnabledAtom } from '../atoms'

type Instrument = keyof ActiveInstrumentNotes

const INSTRUMENTS: readonly Instrument[] = ['guitar', 'bass', 'keys', 'drums']

const NO_NOTES: ActiveInstrumentNotes = {
  guitar: new Set(),
  bass: new Set(),
  keys: new Set(),
  drums: new Set(),
}

/** The notes a frame reports for each instrument, or nothing for an instrument it leaves out. */
function notesIn(cueData: CueData): Partial<ActiveInstrumentNotes> {
  const lit = <T extends string>(notes: readonly T[] | undefined, none: T) =>
    notes && notes.length > 0 ? new Set(notes.filter((note) => note !== none)) : undefined
  return {
    guitar: lit(cueData.guitarNotes, InstrumentNoteType.None),
    bass: lit(cueData.bassNotes, InstrumentNoteType.None),
    keys: lit(cueData.keysNotes, InstrumentNoteType.None),
    drums: lit(cueData.drumNotes, DrumNoteType.None),
  }
}

/** How long the panel keeps the details after the last cue frame from outside a song. */
const IDLE_CLEAR_MS = 60_000

/** Scenes where YARG can go quiet for long stretches while the rig keeps running the cue. */
const SONG_SCENES: ReadonlySet<CueData['currentScene']> = new Set(['Gameplay', 'Practice'])

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

  const {
    motionEnabled: motionGlobalEnabled,
    groupLabel: motionPlayingGroupLabel,
    cueLabel: motionPlayingLabel,
  } = useRunningMotionLabels('yarg')

  // State for instrument note indicators
  const [activeInstrumentNotes, setActiveInstrumentNotes] = useState(NO_NOTES)

  // Refs to track previous values for comparison
  const prevBeatRef = useRef<string | null>(null)
  const prevMeasureRef = useRef<number | undefined>(undefined)
  const prevKeyframeRef = useRef<string | null>(null)

  // Refs for instrument note clear timers so sustained notes stay solid (cancel previous timer on new packet)
  // Beat, measure and keyframe indicators clear on their own timer. Held in refs like the
  // instrument ones below, so a fresh packet cancels the clear an older one scheduled rather than
  // letting it blank an indicator that has just lit.
  const beatClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const measureClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const keyframeClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Cue data only arrives when a cue is dispatched. Silence during a song leaves the details up,
  // and silence after a frame from outside one gives them up once IDLE_CLEAR_MS has passed.
  const idleClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const noteClearTimersRef = useRef<Partial<Record<Instrument, ReturnType<typeof setTimeout>>>>({})

  // What the primary row is showing, read by the effect below without depending on it. Depending
  // on the state it sets would restart the effect when its own clear timer fires, and the cue
  // state atom still holds the last value, so the row would flip between the cue and blank for
  // as long as the page stayed open.
  const primaryCueNameRef = useRef<string>('')
  const primaryClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const secondaryClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    const noteClearTimers = noteClearTimersRef.current
    /**
     * Puts the panel back to its waiting state.
     *
     * The previous-value refs go with it: they gate the change detection, so clearing them is
     * what lets a song opening on the beat or keyframe the last one ended on light up.
     */
    const resetCueDetails = (): void => {
      clearTimeout(primaryClearTimerRef.current ?? undefined)
      clearTimeout(secondaryClearTimerRef.current ?? undefined)
      setCurrentCueData(null)
      setPrimaryCueName('')
      setSecondaryCueName('')
      setBeatReceived(false)
      setMeasureReceived(false)
      setKeyframeReceived(false)
      setLastBeatType(null)
      setLastMeasureType(null)
      setLastKeyframeType(null)
      prevBeatRef.current = null
      prevMeasureRef.current = undefined
      prevKeyframeRef.current = null
    }

    if (!yargListenerEnabled && !simulationMode) {
      resetCueDetails()
      return
    }

    // Only tell the main process to start sending cue data if not in simulation mode
    if (!simulationMode) {
      setListenCueData(true)
    }

    const handleCueData = (cueData: CueData) => {
      // Simulation drives one event at a time by hand, so the panel holds what the user just fired.
      if (!simulationMode) {
        clearTimeout(idleClearTimerRef.current ?? undefined)
        idleClearTimerRef.current = SONG_SCENES.has(cueData.currentScene)
          ? null
          : setTimeout(resetCueDetails, IDLE_CLEAR_MS)
      }

      // Beat detection - check for beat values in the beat property
      if (cueData.beat && cueData.beat !== 'Unknown') {
        if (cueData.beat !== prevBeatRef.current) {
          // Check if it's a beat event
          if (cueData.beat === 'Strong' || cueData.beat === 'Weak') {
            setLastBeatType(cueData.beat)
            setBeatReceived(true)

            clearTimeout(beatClearTimerRef.current ?? undefined)
            beatClearTimerRef.current = setTimeout(() => {
              setBeatReceived(false)
            }, 200)
          }
          // Check if it's a measure event coming through the beat property
          else if (cueData.beat === 'Measure') {
            setLastMeasureType('Measure Event')
            setMeasureReceived(true)

            clearTimeout(measureClearTimerRef.current ?? undefined)
            measureClearTimerRef.current = setTimeout(() => {
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

          clearTimeout(measureClearTimerRef.current ?? undefined)
          measureClearTimerRef.current = setTimeout(() => {
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

            clearTimeout(keyframeClearTimerRef.current ?? undefined)
            keyframeClearTimerRef.current = setTimeout(() => {
              setKeyframeReceived(false)
            }, 250)
          }
        }

        // Update our ref with the current keyframe value
        prevKeyframeRef.current = cueData.keyframe
      }

      // Handle instrument notes (ref-tracked timers so sustained notes stay solid; each new packet cancels previous clear)
      const reported = notesIn(cueData)
      for (const instrument of INSTRUMENTS) {
        const notes = reported[instrument]
        if (!notes) continue
        clearTimeout(noteClearTimers[instrument])
        setActiveInstrumentNotes((prev) => ({ ...prev, [instrument]: notes }))
        noteClearTimers[instrument] = setTimeout(() => {
          setActiveInstrumentNotes((prev) => ({ ...prev, [instrument]: NO_NOTES[instrument] }))
        }, 100)
      }

      setCurrentCueData(cueData)
    }
    addIpcListener(RENDERER_RECEIVE.CUE_HANDLED, handleCueData)

    // YARG quitting, or the listener stopping on an error, ends whatever the panel shows.
    const handleYargError = (error: { type: string; autoDisabled?: boolean }) => {
      if (error.type === 'yarg-shutdown' || error.autoDisabled === true) {
        clearTimeout(idleClearTimerRef.current ?? undefined)
        resetCueDetails()
      }
    }
    if (!simulationMode) {
      addIpcListener(RENDERER_RECEIVE.YARG_ERROR, handleYargError)
    }

    return () => {
      setListenCueData(false)
      removeIpcListener(RENDERER_RECEIVE.CUE_HANDLED, handleCueData)
      removeIpcListener(RENDERER_RECEIVE.YARG_ERROR, handleYargError)
      clearTimeout(idleClearTimerRef.current ?? undefined)
      clearTimeout(beatClearTimerRef.current ?? undefined)
      clearTimeout(measureClearTimerRef.current ?? undefined)
      clearTimeout(keyframeClearTimerRef.current ?? undefined)
      for (const timer of Object.values(noteClearTimers)) clearTimeout(timer)
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
