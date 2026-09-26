import { useCallback, useMemo, useRef, useState } from 'react'

export interface WriteQueue {
  /**
   * Runs `write` once every write queued before it has settled, and answers with its outcome. A
   * write that fails does not hold back the ones after it.
   */
  enqueue: <T>(write: () => Promise<T>) => Promise<T>
  /** Writes queued or running, for a panel that shows it is saving. */
  pending: number
  /** Whether any write is queued or running, read at call time. */
  isBusy: () => boolean
}

/** Runs a panel's writes one at a time, in the order they were asked for. */
export function useWriteQueue(): WriteQueue {
  const tail = useRef<Promise<unknown>>(Promise.resolve())
  const count = useRef(0)
  const [pending, setPending] = useState(0)

  const enqueue = useCallback(<T>(write: () => Promise<T>): Promise<T> => {
    count.current += 1
    setPending(count.current)
    const run = tail.current.then(write).finally(() => {
      count.current -= 1
      setPending(count.current)
    })
    tail.current = run.catch(() => undefined)
    return run
  }, [])

  const isBusy = useCallback(() => count.current > 0, [])

  return useMemo(() => ({ enqueue, pending, isBusy }), [enqueue, pending, isBusy])
}
