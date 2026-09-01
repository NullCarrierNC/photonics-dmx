import React, { useCallback, useEffect, useState } from 'react'
import { useAtom } from 'jotai'
import { lightingPrefsAtom } from '../atoms'
import { getMasterOutput, savePrefs, setMasterOutput } from '../ipcApi'
import { createLogger } from '../../../shared/logger'

const log = createLogger('MasterOutputSidebar')

/** Matches the left sidebar's header block so the two line up across the top of the window. */
const HEADER_CLASS = 'h-16 bg-gray-800 dark:bg-gray-950 text-white flex items-center justify-center'

// Fixed height because both labels change word count when toggled ("Blackout" to "Blacked Out"),
// and letting the buttons resize would shift the other one under the pointer mid-click.
const TOGGLE_BASE =
  'w-full min-h-[3rem] flex items-center justify-center text-center rounded px-1 py-2 text-[11px] font-semibold uppercase tracking-wide leading-tight transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500'

/**
 * The global output controls, always visible down the right edge of the main window.
 *
 * Main holds the authoritative state ({@link MasterOutputState}); this reads it on mount and pushes
 * changes back. The two paths are deliberately separate: every change goes to the live channel
 * immediately, while only the persisted half is written to prefs, and only when a gesture ends. A
 * fader dragged across its range would otherwise rewrite prefs.json once per pixel.
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

  /** Persist on gesture end only; the value is already live by the time this runs. */
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
    <div className="fixed top-0 right-0 h-full w-[72px] flex flex-col shadow-lg bg-white dark:bg-gray-900 dark:text-white">
      <div className={HEADER_CLASS}>
        <span className="text-xs font-semibold uppercase tracking-wide">Out</span>
      </div>

      <div className="flex-grow flex flex-col items-center gap-3 px-2 py-3 min-h-0">
        <label
          htmlFor="master-dimmer"
          className="text-[11px] font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400">
          Master
        </label>

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
          className="flex-grow min-h-0 accent-blue-500 cursor-pointer"
          // Chromium renders a range vertically from `writing-mode` alone; `direction: rtl` puts
          // full output at the top, which is the way a fader reads on a physical desk.
          style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
        />

        <span className="text-xs tabular-nums text-gray-700 dark:text-gray-300">
          {dimmerPercent}%
        </span>
      </div>

      <div className="px-2 pb-3 flex flex-col gap-2">
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
          className={`${TOGGLE_BASE} ${
            strobeEnabled
              ? 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
              : 'bg-amber-500 text-white hover:bg-amber-600'
          }`}>
          {strobeEnabled ? 'Strobe On' : 'Strobe Off'}
        </button>

        <button
          type="button"
          onClick={toggleBlackout}
          aria-pressed={blackout}
          title={blackout ? 'Output is blacked out' : 'Black out all DMX output'}
          className={`${TOGGLE_BASE} ${
            blackout
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
          }`}>
          {blackout ? 'Blacked Out' : 'Blackout'}
        </button>
      </div>
    </div>
  )
}

export default MasterOutputSidebar
