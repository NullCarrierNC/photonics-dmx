import { useCallback, useEffect, useRef, useState } from 'react'
import { getAudioConfig, saveAudioConfig } from '../ipcApi'
import { registerIpcListener } from '../utils/ipcHelpers'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { wasRefused } from '../ipc/ipcResult'
import { createLogger } from '../../../shared/logger'
import type { AudioConfig } from '../../../photonics-dmx/listeners/Audio/AudioTypes'

const log = createLogger('useAudioConfigFields')

export interface AudioConfigFields<T> {
  /** Current values, seeded from the defaults until the stored config arrives. */
  values: T
  /** True while a save is in flight, so a panel can hold its controls. */
  isSaving: boolean
  /** Whether the stored config has been read yet. */
  loaded: boolean
  /** Apply a change locally and persist it, putting the old values back if the save fails. */
  save: (patch: Partial<T>) => Promise<void>
  /** Apply a change locally without persisting, for controls that commit on release. */
  set: (patch: Partial<T>) => void
  /** Persist whatever is currently held locally. */
  commit: () => Promise<void>
}

/**
 * Reads the audio-configuration fields a panel owns into local state and writes them back.
 *
 * A panel names the fields it owns by giving their defaults, and takes the load, the push from
 * main, the save and the revert on a refused or failed write from here.
 */
export function useAudioConfigFields<K extends keyof AudioConfig>(
  defaults: Pick<AudioConfig, K>,
): AudioConfigFields<Pick<AudioConfig, K>> {
  type T = Pick<AudioConfig, K>

  const [values, setValues] = useState<T>(defaults)
  const [isSaving, setIsSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  // Saves read the latest values without the callbacks depending on them.
  const latest = useRef<T>(defaults)
  latest.current = values
  // The defaults are a literal at the call site, so a new object arrives on every render. The
  // field list is what matters, and that does not change.
  const fields = useRef(Object.keys(defaults) as K[])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const config = await getAudioConfig()
        if (!cancelled && config) {
          const stored = {} as Partial<T>
          for (const key of fields.current) {
            if (config[key] !== undefined) {
              stored[key] = config[key]
            }
          }
          setValues((prev) => ({ ...prev, ...stored }))
        }
      } catch (error) {
        log.error('Failed to load audio settings:', error)
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Main pushes the whole config when something else changes it, so the panel follows rather than
  // showing a value the engine is no longer using.
  useEffect(
    () =>
      registerIpcListener(RENDERER_RECEIVE.AUDIO_CONFIG_UPDATE, (config) => {
        if (!config) return
        const pushed = {} as Partial<T>
        for (const key of fields.current) {
          if ((config as AudioConfig)[key] !== undefined) {
            pushed[key] = (config as AudioConfig)[key]
          }
        }
        setValues((prev) => ({ ...prev, ...pushed }))
      }),
    [],
  )

  const persist = useCallback(async (next: T, previous: T): Promise<void> => {
    setIsSaving(true)
    try {
      const result = await saveAudioConfig(next)
      if (wasRefused(result)) {
        log.error('Audio settings were refused:', result.error)
        setValues(previous)
      }
    } catch (error) {
      log.error('Failed to save audio settings:', error)
      setValues(previous)
    } finally {
      setIsSaving(false)
    }
  }, [])

  const save = useCallback(
    async (patch: Partial<T>): Promise<void> => {
      const previous = latest.current
      const next = { ...previous, ...patch }
      setValues(next)
      await persist(next, previous)
    },
    [persist],
  )

  const set = useCallback((patch: Partial<T>): void => {
    setValues((prev) => ({ ...prev, ...patch }))
  }, [])

  const commit = useCallback(async (): Promise<void> => {
    const current = latest.current
    await persist(current, current)
  }, [persist])

  return { values, isSaving, loaded, save, set, commit }
}
