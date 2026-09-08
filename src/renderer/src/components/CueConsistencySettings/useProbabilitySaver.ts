/**
 * Debounced saving for one probability slider.
 *
 * A drag reports a position on every step, so the write waits until the positions stop arriving or
 * the drag ends. The value the main process returns is what the slider ends up showing, and a
 * refused write re-reads rather than guessing. A position equal to the last one written is dropped.
 * A pending write still goes out when the panel unmounts, without touching state that has gone.
 */
import { useCallback, useEffect, useRef } from 'react'
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
  const pending = useRef<{
    timer: ReturnType<typeof setTimeout> | null
    pendingValue: number | null
    lastSentValue: number | null
  }>({ timer: null, pendingValue: null, lastSentValue: null })

  const send = useCallback(
    async (applyServerValue: (percent: number) => void) => {
      const next = pending.current.pendingValue
      if (next == null) return
      if (next === pending.current.lastSentValue) {
        pending.current.pendingValue = null
        return
      }
      pending.current.pendingValue = null
      const take = (result: PercentResult): void => {
        if (result.success && typeof result.percent === 'number') {
          pending.current.lastSentValue = result.percent
          applyServerValue(result.percent)
        }
      }
      try {
        const result = await save(next)
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

  const onCommit = useCallback(() => {
    if (pending.current.timer) {
      clearTimeout(pending.current.timer)
      pending.current.timer = null
    }
    void send(apply)
  }, [send, apply])

  const onChange = useCallback(
    (percent: number) => {
      const clamped = Math.max(0, Math.min(100, Math.round(percent)))
      apply(clamped)
      pending.current.pendingValue = clamped
      if (pending.current.timer) {
        clearTimeout(pending.current.timer)
      }
      pending.current.timer = setTimeout(() => {
        pending.current.timer = null
        onCommit()
      }, PROBABILITY_SAVE_DEBOUNCE_MS)
    },
    [apply, onCommit],
  )

  // Held in a ref so the unmount write uses the current save, not the one from the first render.
  const sendRef = useRef(send)
  useEffect(() => {
    sendRef.current = send
  }, [send])

  useEffect(() => {
    const state = pending
    return () => {
      if (state.current.timer) {
        clearTimeout(state.current.timer)
        state.current.timer = null
      }
      void sendRef.current(() => {})
    }
  }, [])

  const seed = useCallback((percent: number) => {
    pending.current.lastSentValue = percent
  }, [])

  return { onChange, onCommit, seed }
}
