import { useCallback, useEffect, useRef, useState } from 'react'
import { getAudioConfig, saveAudioConfig } from '../ipcApi'
import { registerIpcListener } from '../utils/ipcHelpers'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { wasRefused } from '../ipc/ipcResult'
import { createLogger } from '../../../shared/logger'
import type { AudioConfig } from '../../../photonics-dmx/listeners/Audio/AudioTypes'

const log = createLogger('useAudioConfigFields')

/** How long a burst of changes has to go quiet before saveSoon writes. */
const SAVE_QUIET_MS = 300

export interface AudioSaveOutcome {
  /** False when the save threw or main refused it, in which case the old values are back. */
  ok: boolean
  /** Main stored the change, but something downstream did not take it. */
  warning?: string
  error?: string
}

export interface AudioConfigFields<T> {
  /** Current values, seeded from the defaults until the stored config arrives. */
  values: T
  /** True while a save is in flight, so a panel can hold its controls. */
  isSaving: boolean
  /** Whether the stored config has been read yet. */
  loaded: boolean
  /** Apply a change locally and persist it, putting the old values back if the save fails. */
  save: (patch: Partial<T>) => Promise<AudioSaveOutcome>
  /** Apply a change locally without persisting, for controls that commit on release. */
  set: (patch: Partial<T>) => void
  /** Apply a change locally and persist it once the changes stop arriving. */
  saveSoon: (patch: Partial<T>, quietMs?: number) => void
  /** Persist whatever is currently held locally. */
  commit: () => Promise<AudioSaveOutcome>
}

/**
 * Reads the audio-configuration fields a panel owns into local state and writes them back.
 *
 * A panel names the fields it owns by giving their defaults, and takes the load, the push from
 * main, the save and the revert on a refused or failed write from here.
 *
 * A write covers every field the panel owns, so it waits for the stored config to arrive first and
 * writes back what was stored for the fields the panel is not touching.
 */
export function useAudioConfigFields<K extends keyof AudioConfig>(
  defaults: Pick<AudioConfig, K>,
): AudioConfigFields<Pick<AudioConfig, K>> {
  type T = Pick<AudioConfig, K>

  const [values, setValues] = useState<T>(defaults)
  const [isSaving, setIsSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  // The values every callback works from, so none of them depend on the render they were made in.
  const latest = useRef<T>(defaults)
  // The defaults are a literal at the call site, so a new object arrives on every render. The
  // field list is what matters, and that does not change.
  const fields = useRef(Object.keys(defaults) as K[])
  const loading = useRef<Promise<void> | null>(null)
  // A debounced save holds one timer and the values from before the burst began, so a revert goes
  // back to what was stored rather than to the middle of a drag, along with the fields it touched.
  const quietTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const burstPrevious = useRef<T | null>(null)
  const burstFields = useRef<Set<K>>(new Set())

  const apply = useCallback((patch: Partial<T>): T => {
    const next = { ...latest.current, ...patch }
    latest.current = next
    setValues(next)
    return next
  }, [])

  const owned = useCallback((config: AudioConfig | undefined): Partial<T> => {
    const picked = {} as Partial<T>
    if (!config) return picked
    for (const key of fields.current) {
      if (config[key] !== undefined) {
        picked[key] = config[key]
      }
    }
    return picked
  }, [])

  useEffect(() => {
    let cancelled = false
    loading.current = (async () => {
      try {
        const config = await getAudioConfig()
        if (!cancelled) apply(owned(config))
      } catch (error) {
        log.error('Failed to load audio settings:', error)
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [apply, owned])

  // Main pushes the whole config when something else changes it, so the panel follows rather than
  // showing a value the engine is no longer using.
  useEffect(
    () =>
      registerIpcListener(RENDERER_RECEIVE.AUDIO_CONFIG_UPDATE, (config) => {
        apply(owned(config))
      }),
    [apply, owned],
  )

  /**
   * Write the panel's fields, putting `revert` back if the write is refused.
   *
   * `revert` holds only the fields this call is changing, at the values they had beforehand. A
   * whole-state snapshot would undo a different field that was saved successfully while this one
   * was in flight, since a write covers every field the panel owns.
   */
  const persist = useCallback(async (next: T, revert: Partial<T>): Promise<AudioSaveOutcome> => {
    setIsSaving(true)
    try {
      const result = await saveAudioConfig(next)
      if (wasRefused(result)) {
        log.error('Audio settings were refused:', result.error)
        apply(revert)
        return { ok: false, error: result.error }
      }
      return { ok: true, warning: result?.warning }
    } catch (error) {
      log.error('Failed to save audio settings:', error)
      apply(revert)
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    } finally {
      setIsSaving(false)
    }
    // apply is stable, and naming it here would make persist depend on its own identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** The current values of the named fields, as the patch that would put them back. */
  const snapshotOf = useCallback((keys: Iterable<K>): Partial<T> => {
    const taken = {} as Partial<T>
    for (const key of keys) {
      taken[key] = latest.current[key]
    }
    return taken
  }, [])

  const save = useCallback(
    async (patch: Partial<T>): Promise<AudioSaveOutcome> => {
      await loading.current
      const revert = snapshotOf(Object.keys(patch) as K[])
      return persist(apply(patch), revert)
    },
    [apply, persist, snapshotOf],
  )

  const set = useCallback(
    (patch: Partial<T>): void => {
      apply(patch)
    },
    [apply],
  )

  const cancelPending = useCallback((): void => {
    if (quietTimer.current !== null) {
      clearTimeout(quietTimer.current)
      quietTimer.current = null
    }
  }, [])

  /** Write whatever a debounced burst was holding, if one is still pending. */
  const flushPending = useCallback((): void => {
    if (burstPrevious.current === null) {
      return
    }
    const before = burstPrevious.current
    const touched = [...burstFields.current]
    burstPrevious.current = null
    burstFields.current = new Set()
    const revert = {} as Partial<T>
    for (const key of touched) {
      revert[key] = before[key]
    }
    void (async () => {
      await loading.current
      await persist(latest.current, revert)
    })()
  }, [persist])

  // Held in a ref so the unmount write uses the current flush, not the one from the first render.
  const flushRef = useRef(flushPending)
  useEffect(() => {
    flushRef.current = flushPending
  }, [flushPending])

  // A burst that has not settled is written on the way out rather than dropped, so leaving a tab
  // within the quiet window does not silently lose the change.
  useEffect(() => {
    return () => {
      cancelPending()
      flushRef.current()
    }
  }, [cancelPending])

  const saveSoon = useCallback(
    (patch: Partial<T>, quietMs: number = SAVE_QUIET_MS): void => {
      if (burstPrevious.current === null) {
        burstPrevious.current = latest.current
      }
      for (const key of Object.keys(patch) as K[]) {
        burstFields.current.add(key)
      }
      apply(patch)
      cancelPending()
      quietTimer.current = setTimeout(() => {
        quietTimer.current = null
        flushPending()
      }, quietMs)
    },
    [apply, cancelPending, flushPending],
  )

  const commit = useCallback(async (): Promise<AudioSaveOutcome> => {
    await loading.current
    // Nothing to put back: a commit writes what the panel already shows.
    return persist(latest.current, {})
  }, [persist])

  return { values, isSaving, loaded, save, set, saveSoon, commit }
}
