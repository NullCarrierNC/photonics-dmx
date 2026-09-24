/**
 * Restores the Cue Simulation selections on mount and stores them as they change.
 *
 * The stored group is kept until the cue registry lists it. Until then the page shows whatever
 * group the selector offers in its place, and what is stored stays the stored group and effect
 * until the user picks a group, a cue or another game type.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { EffectSelector } from '../../../../photonics-dmx/types'
import { getAvailableCues, getAvailableRb3Cues, getPrefs } from '../../ipcApi'
import { useDebouncedSave } from '../../hooks/useDebouncedSave'
import { persistPrefs } from '../../ipc/persistPrefs'
import { createLogger } from '../../../../shared/logger'
import { sameSimulationSettings, type SimulationSettings } from './simulationSettings'

const log = createLogger('CueSimulation')

/** How long the selections have to stop changing before they are stored. */
const SETTINGS_QUIET_MS = 500

type StoredGroup = { groupId: string; effectId: string | null }

const NOTHING_STORED: StoredGroup = { groupId: '', effectId: null }

/** Who put a group on the page: the user, or the selector choosing one for itself. */
export type GroupOrigin = 'user' | 'default'

export interface SimulationSelection {
  registryType: SimulationSettings['registryType']
  groupId: string
  effect: EffectSelector | null
  venueSize: SimulationSettings['venueSize']
  bpm: number
  instrument: SimulationSettings['instrument']
}

export interface SimulationSelectionSetters {
  setRegistryType: (registryType: SimulationSettings['registryType']) => void
  setVenueSize: (venueSize: SimulationSettings['venueSize']) => void
  setBpm: (bpm: number) => void
  setInstrument: (instrument: SimulationSettings['instrument']) => void
  setEffect: (effect: EffectSelector | null) => void
}

export interface SimulationSettingsState {
  /** False until the stored selections are back in place. Nothing is stored before then. */
  restored: boolean
  saveError: string | null
  /** The stored group the page is waiting for the registry to list, or empty. */
  heldGroupId: string
  /** The page now shows this group. The stored one is adopted, a user's pick replaces it. */
  groupShown: (groupId: string, origin: GroupOrigin) => void
  /** The user chose something that replaces the stored group and effect. */
  releaseHeldGroup: () => void
}

export function useSimulationSettings(
  selection: SimulationSelection,
  setters: SimulationSelectionSetters,
): SimulationSettingsState {
  const { registryType, groupId, effect, venueSize, bpm, instrument } = selection
  const { setRegistryType, setVenueSize, setBpm, setInstrument, setEffect } = setters
  const [restored, setRestored] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [held, setHeldState] = useState<StoredGroup | null>(null)
  const heldRef = useRef<StoredGroup | null>(null)
  // The effect to restore and the group it belongs to. Carrying the group is what makes the
  // restore independent of when the group arrives, since it arrives as a state update.
  const savedEffectRef = useRef<{ groupId: string; effectId: string } | null>(null)
  // The first selection after the restore is what the store already holds.
  const baselineTakenRef = useRef(false)

  const setHeld = useCallback((next: StoredGroup | null) => {
    heldRef.current = next
    setHeldState(next)
  }, [])

  // A selection changes as fast as the user clicks, so the write waits for the clicking to stop
  // and still goes out if the page is left first.
  const writeSimulationSettings = useCallback(async (settings: SimulationSettings) => {
    const landed = await persistPrefs(
      { simulationSettings: settings },
      'the simulation settings',
      (message) => setSaveError(message),
    )
    if (landed) setSaveError(null)
    return landed
  }, [])
  const settingsSaver = useDebouncedSave(writeSimulationSettings, {
    quietMs: SETTINGS_QUIET_MS,
    isEqual: sameSimulationSettings,
  })

  useEffect(() => {
    const loadSettings = async (): Promise<StoredGroup> => {
      const saved = (await getPrefs()).simulationSettings
      if (!saved) return NOTHING_STORED
      if (saved.registryType) setRegistryType(saved.registryType)
      if (saved.venueSize) setVenueSize(saved.venueSize)
      if (saved.bpm) setBpm(saved.bpm)
      if (saved.instrument) setInstrument(saved.instrument)
      return { groupId: saved.groupId ?? '', effectId: saved.effectId ?? null }
    }

    void loadSettings()
      .catch((error: unknown) => {
        log.error('Error loading simulation settings:', error)
        return NOTHING_STORED
      })
      .then((stored) => {
        setHeld(stored)
        setRestored(true)
      })
  }, [setRegistryType, setVenueSize, setBpm, setInstrument, setHeld])

  useEffect(() => {
    if (!restored) {
      return
    }
    const settings: SimulationSettings = {
      registryType,
      groupId: held ? held.groupId : groupId,
      // A saved effect still being restored is kept, so a slow cue list never stores it as cleared.
      effectId: held ? held.effectId : effect?.id ?? savedEffectRef.current?.effectId ?? null,
      venueSize,
      bpm,
      instrument,
    }
    if (!baselineTakenRef.current) {
      baselineTakenRef.current = true
      settingsSaver.seed(settings)
      return
    }
    settingsSaver.saveSoon(settings)
  }, [restored, settingsSaver, held, registryType, groupId, effect?.id, venueSize, bpm, instrument])

  // Load the saved effect once its group is selected and the group's cues are available.
  useEffect(() => {
    let cancelled = false
    const saved = savedEffectRef.current
    if (!saved || saved.groupId !== groupId) {
      return
    }

    const checkForEffects = async (retries = 10) => {
      try {
        const availableEffects =
          registryType === 'RB3E'
            ? await getAvailableRb3Cues(groupId)
            : await getAvailableCues(groupId)
        if (cancelled || savedEffectRef.current !== saved) return
        if (availableEffects && availableEffects.length > 0) {
          const savedEffect = availableEffects.find((e: EffectSelector) => e.id === saved.effectId)
          if (savedEffect) {
            setEffect(savedEffect)
          }
          // Either it was restored or this group no longer offers it. Done either way.
          savedEffectRef.current = null
        } else if (retries > 0) {
          // Effects not loaded yet, retry after a short delay
          setTimeout(() => void checkForEffects(retries - 1), 200)
        } else {
          savedEffectRef.current = null
        }
      } catch (error) {
        log.error('Error loading saved effect:', error)
        savedEffectRef.current = null
      }
    }
    // Settles after the first attempt: the retry chain carries on through a timer.
    void checkForEffects()
    return () => {
      cancelled = true
    }
  }, [groupId, registryType, setEffect])

  // Moving to a different group than the saved effect belongs to abandons the restore.
  useEffect(() => {
    const saved = savedEffectRef.current
    if (saved && saved.groupId !== groupId) {
      savedEffectRef.current = null
    }
  }, [groupId])

  const groupShown = useCallback(
    (shownGroupId: string, origin: GroupOrigin) => {
      const stored = heldRef.current
      if (stored && stored.groupId === shownGroupId) {
        if (stored.effectId) {
          savedEffectRef.current = { groupId: shownGroupId, effectId: stored.effectId }
        }
        setHeld(null)
      } else if (origin === 'user') {
        setHeld(null)
      }
    },
    [setHeld],
  )

  const releaseHeldGroup = useCallback(() => setHeld(null), [setHeld])

  return {
    restored,
    saveError,
    heldGroupId: held?.groupId ?? '',
    groupShown,
    releaseHeldGroup,
  }
}
