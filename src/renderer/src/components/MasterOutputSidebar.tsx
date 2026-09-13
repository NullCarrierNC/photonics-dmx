import React, { useCallback, useEffect, useState } from 'react'
import { useAtom } from 'jotai'
import { lightingPrefsAtom } from '../atoms'
import { getMasterOutput, savePrefs, setMasterOutput } from '../ipcApi'
import { createLogger } from '../../../shared/logger'

const log = createLogger('MasterOutputSidebar')

/** The content column in App reserves this much on the right, since the sidebar is `fixed`. */
export const MASTER_OUTPUT_SIDEBAR_WIDTH_PX = 99

// Fixed height because a label can wrap onto a different number of lines when it toggles, and a
// fixed button keeps the other one where it is under the pointer.
const TOGGLE_BASE =
  'w-full min-h-[3rem] flex items-center justify-center text-center rounded border-2 px-1 py-2 text-[11px] font-bold leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500'

/** Red marks the state needing the operator's attention: strobes live, or the rig blacked out. */
const TOGGLE_ALERT = 'bg-red-600 border-transparent text-white hover:bg-red-700'
const TOGGLE_SAFE = 'border-green-500 text-green-600 dark:text-green-400 hover:bg-green-500/10'

/** Every 10%, with the long marks at 0, 50 and 100. */
const FADER_TICKS = Array.from({ length: 11 }, (_, i) => i % 5 === 0)

/**
 * Half the fader cap's height in `.console-fader`. The cap's centre travels this far short of each
 * end of the input, so the scale is inset by the same amount to line its marks up with the cap.
 */
const FADER_CAP_HALF_HEIGHT_PX = 9

const FaderScale: React.FC<{ side: 'left' | 'right' }> = ({ side }) => (
  <div
    aria-hidden="true"
    className={`absolute flex flex-col justify-between pointer-events-none ${
      side === 'left' ? 'left-0 items-start' : 'right-0 items-end'
    }`}
    style={{ top: FADER_CAP_HALF_HEIGHT_PX, bottom: FADER_CAP_HALF_HEIGHT_PX }}>
    {FADER_TICKS.map((major, i) => (
      <div key={i} className={`h-px bg-gray-400 dark:bg-gray-500 ${major ? 'w-3' : 'w-1.5'}`} />
    ))}
  </div>
)

/**
 * The global output controls, always visible down the right edge of the main window.
 *
 * Main holds the authoritative state ({@link MasterOutputState}), and this reads it on mount and
 * pushes changes back. The two paths are deliberately separate: every change goes to the live
 * channel immediately, while only the persisted half is written to prefs, and only when a gesture
 * ends, so a fader drag writes prefs.json once.
 */
const MasterOutputSidebar: React.FC = () => {
  const [prefs, setPrefs] = useAtom(lightingPrefsAtom)
  const [dimmerPercent, setDimmerPercent] = useState(100)
  const [blackout, setBlackout] = useState(false)
  const [strobeEnabled, setStrobeEnabled] = useState(true)

  // Read from main rather than from prefs: main has already applied the persisted level and strobe
  // gate, and it also holds blackout, which never persists and so has no prefs value to read.
  useEffect(() => {
    let cancelled = false
    void getMasterOutput()
      .then((state) => {
        if (cancelled) return
        setDimmerPercent(state.dimmerPercent)
        setBlackout(state.blackout)
        setStrobeEnabled(state.strobeOutputEnabled)
      })
      .catch((err) => log.error('Failed to read master output state', err))
    return () => {
      cancelled = true
    }
  }, [])

  const applyLive = useCallback(
    async (update: {
      dimmerPercent?: number
      blackout?: boolean
      strobeOutputEnabled?: boolean
    }): Promise<void> => {
      try {
        const result = await setMasterOutput(update)
        if (!result.success) {
          log.error('Failed to apply master output change', result.error)
        }
      } catch (err) {
        log.error('Failed to apply master output change', err)
      }
    },
    [],
  )

  const handleDimmerChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      const next = Number(event.target.value)
      setDimmerPercent(next)
      void applyLive({ dimmerPercent: next })
    },
    [applyLive],
  )

  /** Persists on gesture end only. The value is already live by the time this runs. */
  const commitDimmer = useCallback((): void => {
    if (prefs.masterDimmerPercent === dimmerPercent) return
    void savePrefs({ masterDimmerPercent: dimmerPercent })
      .then((result) => {
        if (!result.success) {
          log.error('Failed to save master dimmer level', result.error)
          return
        }
        setPrefs((prev) => ({ ...prev, masterDimmerPercent: dimmerPercent }))
      })
      .catch((err) => log.error('Failed to save master dimmer level', err))
  }, [dimmerPercent, prefs.masterDimmerPercent, setPrefs])

  const toggleBlackout = useCallback((): void => {
    const next = !blackout
    setBlackout(next)
    void applyLive({ blackout: next })
  }, [blackout, applyLive])

  const toggleStrobe = useCallback((): void => {
    const next = !strobeEnabled
    setStrobeEnabled(next)
    void applyLive({ strobeOutputEnabled: next })
    void savePrefs({ strobeOutputEnabled: next })
      .then((result) => {
        if (!result.success) {
          log.error('Failed to save strobe output preference', result.error)
          return
        }
        setPrefs((prev) => ({ ...prev, strobeOutputEnabled: next }))
      })
      .catch((err) => log.error('Failed to save strobe output preference', err))
  }, [strobeEnabled, applyLive, setPrefs])

  return (
    <div
      // Starts below the main header (h-16), which runs the full width of the window above it.
      className="fixed top-16 bottom-0 right-0 z-20 px-[10px] flex flex-col shadow-lg bg-white dark:bg-gray-900 dark:text-white"
      style={{ width: MASTER_OUTPUT_SIDEBAR_WIDTH_PX }}>
      <div className="h-16 shrink-0 flex items-center justify-center text-center text-xs font-semibold uppercase tracking-wide border-b border-gray-200 dark:border-gray-700">
        Global Output
      </div>

      <div className="py-3 shrink-0 border-b border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={toggleStrobe}
          // Pressed means "output is being held back", matching the blackout button below, so the
          // two read the same way to a screen reader despite their labels reading opposite ways.
          aria-pressed={!strobeEnabled}
          title={
            strobeEnabled
              ? 'Strobe cues are being sent to the rig'
              : 'Strobe cues are held back from the rig'
          }
          className={`${TOGGLE_BASE} ${strobeEnabled ? TOGGLE_ALERT : TOGGLE_SAFE}`}>
          {strobeEnabled ? 'Strobes Enabled' : 'Strobes Disabled'}
        </button>
      </div>

      <div className="flex-grow flex flex-col items-center gap-3 py-3 min-h-0">
        <label
          htmlFor="master-dimmer"
          className="text-[11px] font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400">
          Brightness
        </label>

        <div className="relative flex-grow min-h-0 w-full flex justify-center">
          <FaderScale side="left" />
          <input
            id="master-dimmer"
            type="range"
            min={0}
            max={100}
            step={1}
            value={dimmerPercent}
            onChange={handleDimmerChange}
            onMouseUp={commitDimmer}
            onKeyUp={commitDimmer}
            onBlur={commitDimmer}
            aria-label="Master dimmer"
            aria-valuetext={`${dimmerPercent} percent`}
            className="console-fader h-full"
          />
          <FaderScale side="right" />
        </div>

        <span className="text-xs tabular-nums text-gray-700 dark:text-gray-300">
          {dimmerPercent}%
        </span>
      </div>

      <div className="pb-3 shrink-0">
        <button
          type="button"
          onClick={toggleBlackout}
          aria-pressed={blackout}
          title={blackout ? 'Output is blacked out' : 'Black out all DMX output'}
          className={`${TOGGLE_BASE} ${blackout ? TOGGLE_ALERT : TOGGLE_SAFE}`}>
          {blackout ? 'Blacked Out' : 'Blackout (Off)'}
        </button>
      </div>
    </div>
  )
}

export default MasterOutputSidebar
