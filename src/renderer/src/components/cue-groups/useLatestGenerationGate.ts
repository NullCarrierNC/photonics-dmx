import { useCallback, useRef } from 'react'

/**
 * Guards async persistence so stale responses cannot overwrite newer user intent
 * after rapid toggles.
 */
export function useLatestGenerationGate(): {
  nextGeneration: () => number
  isCurrentGeneration: (token: number) => boolean
} {
  const gen = useRef(0)
  const nextGeneration = useCallback(() => {
    gen.current += 1
    return gen.current
  }, [])
  const isCurrentGeneration = useCallback((token: number) => token === gen.current, [])
  return { nextGeneration, isCurrentGeneration }
}
