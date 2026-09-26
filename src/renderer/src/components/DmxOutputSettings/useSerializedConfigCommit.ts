import { useCallback, useEffect, useRef } from 'react'
import { useWriteQueue } from '../../hooks/useWriteQueue'

/**
 * Serializes field edits for one sender's config (Enttec Pro, OpenDMX, ArtNet, sACN) so two commits
 * started close together merge onto the latest committed value instead of each reading a stale
 * snapshot and overwriting the other's field.
 *
 * A ref holds the latest committed config, updated synchronously so the very next commit (even one
 * started before this render's state has landed) reads it rather than the render-time prop. Prefs
 * changing from elsewhere (load, another window) are only picked up while nothing local is
 * pending, so an in-flight edit is never clobbered by a read that started before it. Commits run
 * one at a time through a write queue: persist, then the stored-config update, then the optional
 * push to a running sender. A failed persist leaves the ref at the last committed config.
 */
export function useSerializedConfigCommit<Config extends object>(options: {
  /** The config as currently stored in preferences, with defaults filled in. */
  stored: Config
  /** Persists the merged config, reporting failure on its own. Resolves true once it lands. */
  persist: (config: Config, what: string) => Promise<boolean>
  /** Applies the merged config to preference state once persisted. */
  setStored: (config: Config) => void
  /** Pushes the merged config to an already-running sender. Omit for a sender with no live-update
   *  channel, so a commit there is just persist and store. */
  applyToRunningSender?: (config: Config, what: string) => Promise<void>
}): (patch: Partial<Config>, what: string) => Promise<boolean> {
  const { stored, persist, setStored, applyToRunningSender } = options
  const configRef = useRef<Config>(stored)
  const { enqueue, isBusy } = useWriteQueue()

  useEffect(() => {
    if (!isBusy()) {
      configRef.current = stored
    }
  }, [stored, isBusy])

  return useCallback(
    (patch: Partial<Config>, what: string): Promise<boolean> =>
      enqueue(async (): Promise<boolean> => {
        const newConfig = { ...configRef.current, ...patch }
        const saved = await persist(newConfig, what)
        if (!saved) return false
        configRef.current = newConfig
        setStored(newConfig)
        if (applyToRunningSender) {
          await applyToRunningSender(newConfig, what)
        }
        return true
      }),
    [enqueue, persist, setStored, applyToRunningSender],
  )
}
