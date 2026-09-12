/**
 * Debounced saving for one probability slider.
 *
 * A drag reports a position on every step, so the write waits until the positions stop arriving or
 * the drag ends. The value the main process returns is what the slider ends up showing, and a
 * refused write re-reads rather than guessing. A position equal to the last one written is dropped.
 * A pending write still goes out when the panel unmounts, without touching state that has gone.
 */
import { useCallback, useEffect, useRef } from 'react'
import { useDebouncedSave } from '../../hooks/useDebouncedSave'
import { createLogger } from '../../../../shared/logger'

const log = createLogger('CueConsistencySettings')

export const PROBABILITY_SAVE_DEBOUNCE_MS = 300

type PercentResult = { success: true; percent: number } | { success: false }

interface ProbabilitySaver {
  /** Report a new slider position, held inside 0 to 100. */
  onChange: (percent: number) => void
  /** Write immediately, for a drag that has ended. */
  onCommit: () => void
  /** Record what the main process already holds, so an unmoved slider writes nothing. */
  seed: (percent: number) => void
}

export function useProbabilitySaver(
  save: (percent: number) => Promise<PercentResult>,
  reload: () => Promise<PercentResult>,
  apply: (percent: number) => void,
  label: string,
): ProbabilitySaver {
  // What main answered with is what the slider ends up showing, and what an unmoved slider is
  // compared against, so the write records it back.
  const recordStored = useRef<(percent: number) => void>(() => {})
  // The panel may be gone by the time a write answers, so the value is applied through whatever
  // the flush was given rather than straight to state.
  const applyAnswer = useRef(apply)
  useEffect(() => {
    applyAnswer.current = apply
  }, [apply])

  const write = useCallback(
    async (percent: number): Promise<void> => {
      const take = (result: PercentResult): void => {
        if (result.success && typeof result.percent === 'number') {
          recordStored.current(result.percent)
          applyAnswer.current(result.percent)
        }
      }
      try {
        const result = await save(percent)
        if (result.success) {
          take(result)
        } else {
          log.error(`Failed to save ${label}`)
          take(await reload())
        }
      } catch (error) {
        log.error(`Failed to save ${label}:`, error)
        try {
          take(await reload())
        } catch (reloadError) {
          log.error(`Failed to reload ${label}:`, reloadError)
        }
      }
    },
    [save, reload, label],
  )

  const saver = useDebouncedSave(write, {
    quietMs: PROBABILITY_SAVE_DEBOUNCE_MS,
    isEqual: (a, b) => a === b,
  })

  const onChange = useCallback(
    (percent: number) => {
      const clamped = Math.max(0, Math.min(100, Math.round(percent)))
      apply(clamped)
      saver.saveSoon(clamped)
    },
    [apply, saver],
  )

  const onCommit = useCallback(() => {
    saver.flush()
  }, [saver])

  useEffect(() => {
    recordStored.current = saver.seed
  }, [saver])

  const seed = useCallback(
    (percent: number) => {
      saver.seed(percent)
    },
    [saver],
  )

  return { onChange, onCommit, seed }
}
