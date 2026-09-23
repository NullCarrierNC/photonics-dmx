import {
  useLayoutEffect,
  useMemo,
  useRef,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'

/** Keys that move a range input. Any other key coming up, Tab or Shift say, commits nothing. */
const VALUE_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
])

export interface CommitOnRelease {
  /** Call from the slider's change handler, so the next release has a move to commit. */
  changed: () => void
  /** Spread onto the slider. */
  props: {
    onPointerUp: (event: PointerEvent<HTMLInputElement>) => void
    onKeyUp: (event: KeyboardEvent<HTMLInputElement>) => void
    onBlur: (event: FocusEvent<HTMLInputElement>) => void
  }
}

/**
 * Commits a slider's value when the user lets go of it: the pointer coming up after a drag, the key
 * that moved it coming up, or the slider losing focus with a move still uncommitted. Each move
 * commits once, and a release that moved nothing commits nothing.
 *
 * @param commit given the slider, for a caller that reads the value off it
 */
export function useCommitOnRelease(commit: (input: HTMLInputElement) => void): CommitOnRelease {
  const pending = useRef(false)
  const latestCommit = useRef(commit)
  useLayoutEffect(() => {
    latestCommit.current = commit
  })

  return useMemo(() => {
    const release = (input: HTMLInputElement): void => {
      if (!pending.current) return
      pending.current = false
      latestCommit.current(input)
    }
    return {
      changed: () => {
        pending.current = true
      },
      props: {
        onPointerUp: (event) => release(event.currentTarget),
        onKeyUp: (event) => {
          if (VALUE_KEYS.has(event.key)) release(event.currentTarget)
        },
        onBlur: (event) => release(event.currentTarget),
      },
    }
  }, [])
}
