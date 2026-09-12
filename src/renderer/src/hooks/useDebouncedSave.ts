/**
 * One write for a burst of changes.
 *
 * A slider drag, a typed field or a page that stores its own selections all report far faster than
 * a write to the preferences file should happen. This holds the latest value, writes it once the
 * changes stop arriving, and writes a pending one on the way out rather than dropping it, which is
 * what stops a change made just before leaving a page from disappearing.
 *
 * The write itself belongs to the caller: it says whether the value landed, and anything it wants
 * to do with a refusal, a revert or a value the main process answered with, it does in there.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react'

/** How long a burst has to go quiet before the write goes out. */
export const DEFAULT_QUIET_MS = 300

export interface DebouncedSave<T> {
  /** Hold this value, and write it once the changes stop arriving. */
  saveSoon: (value: T, quietMs?: number) => void
  /** Write whatever is being held, now. */
  flush: () => void
  /** Drop whatever is being held without writing it. */
  cancel: () => void
  /** Record what is already stored, so an unchanged value writes nothing. */
  seed: (value: T) => void
}

export interface DebouncedSaveOptions<T> {
  /** Quiet window, when a call does not name its own. */
  quietMs?: number
  /** Whether a held value matches what was last written, and so need not be written again. */
  isEqual?: (a: T, b: T) => boolean
}

export function useDebouncedSave<T>(
  write: (value: T) => Promise<unknown>,
  options: DebouncedSaveOptions<T> = {},
): DebouncedSave<T> {
  const quietMs = options.quietMs ?? DEFAULT_QUIET_MS
  const isEqual = options.isEqual
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const held = useRef<{ value: T } | null>(null)
  const written = useRef<{ value: T } | null>(null)

  // Held in a ref so the unmount write uses the current writer, not the one from the first render.
  const writeRef = useRef(write)
  useEffect(() => {
    writeRef.current = write
  }, [write])

  const isEqualRef = useRef(isEqual)
  useEffect(() => {
    isEqualRef.current = isEqual
  }, [isEqual])

  const clearTimer = useCallback((): void => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  const flush = useCallback((): void => {
    clearTimer()
    const pending = held.current
    if (pending === null) {
      return
    }
    held.current = null
    const last = written.current
    const same = isEqualRef.current
    if (last !== null && same !== undefined && same(last.value, pending.value)) {
      return
    }
    written.current = pending
    void writeRef.current(pending.value)
  }, [clearTimer])

  const cancel = useCallback((): void => {
    clearTimer()
    held.current = null
  }, [clearTimer])

  const saveSoon = useCallback(
    (value: T, burstQuietMs: number = quietMs): void => {
      held.current = { value }
      clearTimer()
      timer.current = setTimeout(() => {
        timer.current = null
        flush()
      }, burstQuietMs)
    },
    [clearTimer, flush, quietMs],
  )

  const seed = useCallback((value: T): void => {
    written.current = { value }
  }, [])

  // A burst that has not settled is written on the way out rather than dropped, so leaving a page
  // within the quiet window does not silently lose the change.
  const flushRef = useRef(flush)
  useEffect(() => {
    flushRef.current = flush
  }, [flush])

  useEffect(() => {
    return () => {
      flushRef.current()
    }
  }, [])

  // One object for the life of the hook, so a caller can depend on it in an effect.
  return useMemo(() => ({ saveSoon, flush, cancel, seed }), [saveSoon, flush, cancel, seed])
}
