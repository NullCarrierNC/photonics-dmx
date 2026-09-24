import type { AppPreferences } from '../../../../shared/ipcTypes'

/** What the Cue Simulation page stores between visits. */
export type SimulationSettings = NonNullable<AppPreferences['simulationSettings']>

/** Whether two stored selections are the same, so a visit that changes nothing writes nothing. */
export function sameSimulationSettings(a: SimulationSettings, b: SimulationSettings): boolean {
  return (
    a.registryType === b.registryType &&
    a.groupId === b.groupId &&
    (a.effectId ?? null) === (b.effectId ?? null) &&
    a.venueSize === b.venueSize &&
    a.bpm === b.bpm &&
    a.instrument === b.instrument
  )
}
