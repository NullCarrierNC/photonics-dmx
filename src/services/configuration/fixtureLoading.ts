/**
 * `normalizeLoaded` hooks that load every fixture in the lights, layout and rigs files through
 * `fixtureParsing`. Values reset and keys dropped are reported in one message each per file. A
 * fixture of a type no build wrote fails the load, which sends the file through corrupt-file recovery.
 */
import equal from 'fast-deep-equal'
import { isSavedFixture } from '../../photonics-dmx/types'
import type {
  DmxFixture,
  DmxLight,
  DmxRigsConfig,
  LightingConfiguration,
} from '../../photonics-dmx/types'
import {
  loadDmxFixture,
  loadDmxLight,
  parseFixtureList,
  rigLightLoader,
  type FixtureFault,
  type FixtureFaultKind,
  type FixtureFaultReport,
} from '../../photonics-dmx/helpers/fixtureParsing'
import type { ConfigRepairReport } from './configCorruptTypes'
import type { UserLightsConfig } from './startupMigrations'

/** How many faults a repair report names before it counts the rest. */
const FAULTS_NAMED = 5

function loadList<T>(
  raw: readonly unknown[],
  path: string,
  load: (raw: unknown, path: string, report: FixtureFaultReport) => T | null,
  faults: FixtureFault[],
): T[] {
  const loaded = parseFixtureList(raw, path, load, faults)
  if (!loaded.ok) {
    throw new Error(loaded.error)
  }
  return loaded.value
}

/** Names up to {@link FAULTS_NAMED} faults of one kind, counting the rest. */
function describeFaults(faults: readonly FixtureFault[], kind: FixtureFaultKind): string | null {
  const messages = faults.filter((fault) => fault.kind === kind).map((fault) => fault.message)
  if (messages.length === 0) return null
  const named = messages.slice(0, FAULTS_NAMED).join(', ')
  const more = messages.length - FAULTS_NAMED
  return more > 0 ? `${named} and ${more} more` : named
}

/**
 * The loaded data, or the stored data itself when loading changed nothing, so nothing is saved.
 * Values reset are reported apart from keys dropped, so a dropped key never hides a reset.
 */
function settle<T>(
  stored: T,
  loaded: T,
  faults: readonly FixtureFault[],
  reportRepair: ConfigRepairReport,
): T {
  for (const kind of ['reset', 'dropped'] as const) {
    const message = describeFaults(faults, kind)
    if (message !== null) reportRepair(message, kind)
  }
  return equal(stored, loaded) ? stored : loaded
}

function loadLightingConfiguration(
  config: LightingConfiguration,
  path: string,
  load: (raw: unknown, path: string, report: FixtureFaultReport) => DmxLight | null,
  faults: FixtureFault[],
): LightingConfiguration {
  // A list that is not an array is left for the file's validator to reject.
  const lights = (list: LightingConfiguration['frontLights'], name: string) =>
    Array.isArray(list) ? loadList(list, `${path}${name}`, load, faults) : list
  return {
    ...config,
    frontLights: lights(config.frontLights, 'frontLights'),
    backLights: lights(config.backLights, 'backLights'),
    strobeLights: lights(config.strobeLights, 'strobeLights'),
  }
}

export function loadUserLightsFixtures(
  data: UserLightsConfig,
  reportRepair: ConfigRepairReport,
): UserLightsConfig {
  // A bare array in the file is the template list itself.
  const stored: unknown = data
  const config = Array.isArray(stored) ? { lights: stored } : data
  if (!Array.isArray(config?.lights)) {
    return data
  }
  const faults: FixtureFault[] = []
  // Rig lights reference their template by id, so a template without one gets a new id.
  const lights = loadList(config.lights, 'lights', loadDmxFixture, faults).map((fixture, i) => {
    if (isSavedFixture(fixture)) return fixture
    faults.push({ message: `lights[${i}].id is missing`, kind: 'reset' })
    return { ...fixture, id: globalThis.crypto.randomUUID() }
  })
  return settle(data, { ...config, lights }, faults, reportRepair)
}

export function loadLightingLayoutFixtures(
  data: LightingConfiguration,
  reportRepair: ConfigRepairReport,
): LightingConfiguration {
  if (typeof data !== 'object' || data === null) {
    return data
  }
  const faults: FixtureFault[] = []
  return settle(
    data,
    loadLightingConfiguration(data, '', loadDmxLight, faults),
    faults,
    reportRepair,
  )
}

/**
 * Rig lights take their fixture type from the loaded `templates` they name, as the rig's template
 * sync does after the load.
 */
export function loadDmxRigsFixtures(
  data: DmxRigsConfig,
  templates: readonly DmxFixture[],
  reportRepair: ConfigRepairReport,
): DmxRigsConfig {
  if (!Array.isArray(data?.rigs)) {
    return data
  }
  const faults: FixtureFault[] = []
  const load = rigLightLoader(templates)
  const rigs = data.rigs.map((rig, i) =>
    typeof rig?.config === 'object' && rig.config !== null
      ? {
          ...rig,
          config: loadLightingConfiguration(rig.config, `rigs[${i}].config.`, load, faults),
        }
      : rig,
  )
  return settle(data, { ...data, rigs }, faults, reportRepair)
}
