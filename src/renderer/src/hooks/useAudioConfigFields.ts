import { useCallback, useEffect, useRef, useState } from 'react'
import { getAudioConfig, saveAudioConfig } from '../ipcApi'
import { registerIpcListener } from '../utils/ipcHelpers'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { wasRefused } from '../ipc/ipcResult'
import { saveFailureMessage } from '../ipc/persistPrefs'
import { createLogger } from '../../../shared/logger'
import type { AudioConfig } from '../../../photonics-dmx/listeners/Audio/AudioTypes'

const log = createLogger('useAudioConfigFields')

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
  /** What to show when the last save was refused or threw, null once one lands. */
  saveError: string | null
  /** Whether the stored config has been read yet. */
  loaded: boolean
  /** Apply a change locally and persist it, putting the old values back if the save fails. */
  save: (patch: Partial<T>) => Promise<AudioSaveOutcome>
  /**
   * Apply a change locally without persisting, for controls that commit on release. The save or
   * commit that follows puts back the value from before the first `set` if it is refused.
   */
  set: (patch: Partial<T>) => void
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
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  // The values every callback works from, so none of them depend on the render they were made in.
  const latest = useRef<T>(defaults)
  // The defaults are a literal at the call site, so a new object arrives on every render. The
  // field list is what matters, and that does not change.
  const fields = useRef(Object.keys(defaults) as K[])
  const loading = useRef<Promise<void> | null>(null)
  // The value each field had before `set` first moved it, which a refused save or commit puts back.
  const unsaved = useRef<Partial<T>>({})

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
  // showing a value the engine is no longer using. A field mid-drag keeps the value being dragged,
  // and the pushed value becomes the one a refused save of it puts back.
  useEffect(
    () =>
      registerIpcListener(RENDERER_RECEIVE.AUDIO_CONFIG_UPDATE, (config) => {
        const pushed = owned(config)
        for (const key of Object.keys(pushed) as K[]) {
          if (key in unsaved.current) {
            unsaved.current[key] = pushed[key]
            delete pushed[key]
          }
        }
        apply(pushed)
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
    setSaveError(null)
    try {
      const result = await saveAudioConfig(next)
      if (wasRefused(result)) {
        log.error('Audio settings were refused:', result.error)
        apply(revert)
        setSaveError(saveFailureMessage('the audio settings'))
        return { ok: false, error: result.error }
      }
      return { ok: true, warning: result?.warning }
    } catch (error) {
      log.error('Failed to save audio settings:', error)
      apply(revert)
      setSaveError(saveFailureMessage('the audio settings'))
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    } finally {
      setIsSaving(false)
    }
    // apply is stable, and naming it here would make persist depend on its own identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * The values the named fields had before this change, as the patch that would put them back: the
   * value from before a field's first `set`, or its current value when nothing has set it since.
   * The fields leave the unsaved record, since the write about to run covers them.
   */
  const takeRevert = useCallback((keys: Iterable<K>): Partial<T> => {
    const taken = {} as Partial<T>
    for (const key of keys) {
      taken[key] = key in unsaved.current ? unsaved.current[key] : latest.current[key]
      delete unsaved.current[key]
    }
    return taken
  }, [])

  const save = useCallback(
    async (patch: Partial<T>): Promise<AudioSaveOutcome> => {
      await loading.current
      const revert = takeRevert(Object.keys(patch) as K[])
      return persist(apply(patch), revert)
    },
    [apply, persist, takeRevert],
  )

  const set = useCallback(
    (patch: Partial<T>): void => {
      for (const key of Object.keys(patch) as K[]) {
        if (!(key in unsaved.current)) {
          unsaved.current[key] = latest.current[key]
        }
      }
      apply(patch)
    },
    [apply],
  )

  const commit = useCallback(async (): Promise<AudioSaveOutcome> => {
    await loading.current
    return persist(latest.current, takeRevert(Object.keys(unsaved.current) as K[]))
  }, [persist, takeRevert])

  return { values, isSaving, saveError, loaded, save, set, commit }
}
