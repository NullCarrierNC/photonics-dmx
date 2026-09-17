import { useCallback, useEffect, useRef } from 'react'

type UsbAdapterConfig = { port: string; dmxSpeed: number }

/**
 * Serializes port/rate edits for one USB adapter config (Enttec Pro, OpenDMX) so two commits
 * started close together merge onto the latest committed value instead of each reading a stale
 * snapshot and overwriting the other's field.
 *
 * A ref holds the latest committed config, updated synchronously so the very next commit (even one
 * started before this render's state has landed) reads it rather than the render-time prop. Prefs
 * changing from elsewhere (load, another window) are only picked up while nothing local is
 * pending, so an in-flight edit is never clobbered by a read that started before it. Commits run
 * one at a time through a promise chain: persist, then the stored-config update, then the optional
 * push to a running sender. A failed persist leaves the ref at the last committed config.
 */
export function useSerializedConfigCommit(options: {
  /** The config as currently stored in preferences. */
  stored: UsbAdapterConfig | undefined
  /** Used when nothing is stored yet. */
  defaultConfig: UsbAdapterConfig
  /** Persists the merged config, reporting failure on its own. Resolves true once it lands. */
  persist: (config: UsbAdapterConfig, what: string) => Promise<boolean>
  /** Applies the merged config to preference state once persisted. */
  setStored: (config: UsbAdapterConfig) => void
  /** Pushes the merged config to an already-running sender. Omit for a sender with no live-update
   *  channel, so a commit there is just persist and store. */
  applyToRunningSender?: (config: UsbAdapterConfig, what: string) => Promise<void>
}): (patch: Partial<UsbAdapterConfig>, what: string) => Promise<boolean> {
  const { stored, defaultConfig, persist, setStored, applyToRunningSender } = options
  const configRef = useRef<UsbAdapterConfig>(stored ?? defaultConfig)
  const chainRef = useRef<Promise<void>>(Promise.resolve())
  const pendingCountRef = useRef(0)

  useEffect(() => {
    if (pendingCountRef.current === 0) {
      configRef.current = stored ?? defaultConfig
    }
  }, [stored, defaultConfig])

  return useCallback(
    (patch: Partial<UsbAdapterConfig>, what: string): Promise<boolean> => {
      pendingCountRef.current += 1
      const run = chainRef.current.then(async (): Promise<boolean> => {
        const newConfig = { ...configRef.current, ...patch }
        const saved = await persist(newConfig, what)
        if (!saved) return false
        configRef.current = newConfig
        setStored(newConfig)
        if (applyToRunningSender) {
          await applyToRunningSender(newConfig, what)
        }
        return true
      })
      chainRef.current = run.then(
        () => undefined,
        () => undefined,
      )
      return run.finally(() => {
        pendingCountRef.current -= 1
      })
    },
    [persist, setStored, applyToRunningSender],
  )
}
