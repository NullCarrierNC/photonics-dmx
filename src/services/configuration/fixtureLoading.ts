/**
 * `normalizeLoaded` hooks that load every fixture in the lights, layout and rigs files through
 * `fixtureParsing`. Repairs are reported in one message per file. A fixture of a type no build
 * wrote fails the load, which sends the file through corrupt-file recovery.
 */
import equal from 'fast-deep-equal'
import type { DmxRigsConfig, LightingConfiguration } from '../../photonics-dmx/types'
import {
  loadDmxFixture,
  loadDmxLight,
  loadFixtureList,
  type FixtureFaultReport,
} from '../../photonics-dmx/helpers/fixtureParsing'
import type { UserLightsConfig } from './startupMigrations'

type ReportRepair = (message: string) => void

/** How many faults a repair report names before it counts the rest. */
const FAULTS_NAMED = 5

function loadList<T>(
  raw: readonly unknown[],
  path: string,
  load: (raw: unknown, path: string, report: FixtureFaultReport) => T | null,
  faults: string[],
): T[] {
  const loaded = loadFixtureList(raw, path, load, faults)
  if (!loaded.ok) {
    throw new Error(loaded.error)
  }
  return loaded.fixtures
}

/** The loaded data, or the stored data itself when loading changed nothing, so nothing is saved. */
function settle<T>(stored: T, loaded: T, faults: string[], reportRepair: ReportRepair): T {
  if (faults.length > 0) {
    const named = faults.slice(0, FAULTS_NAMED).join(', ')
    const more = faults.length - FAULTS_NAMED
    reportRepair(more > 0 ? `${named} and ${more} more` : named)
  }
  return equal(stored, loaded) ? stored : loaded
}

function loadLightingConfiguration(
  config: LightingConfiguration,
  path: string,
  faults: string[],
): LightingConfiguration {
  // A list that is not an array is left for the file's validator to reject.
  const lights = (list: LightingConfiguration['frontLights'], name: string) =>
    Array.isArray(list) ? loadList(list, `${path}${name}`, loadDmxLight, faults) : list
  return {
    ...config,
    frontLights: lights(config.frontLights, 'frontLights'),
    backLights: lights(config.backLights, 'backLights'),
    strobeLights: lights(config.strobeLights, 'strobeLights'),
  }
}

export function loadUserLightsFixtures(
  data: UserLightsConfig,
  reportRepair: ReportRepair,
): UserLightsConfig {
  if (!Array.isArray(data?.lights)) {
    return data
  }
  const faults: string[] = []
  const lights = loadList(data.lights, 'lights', loadDmxFixture, faults)
  return settle(data, { ...data, lights }, faults, reportRepair)
}

export function loadLightingLayoutFixtures(
  data: LightingConfiguration,
  reportRepair: ReportRepair,
): LightingConfiguration {
  if (typeof data !== 'object' || data === null) {
    return data
  }
  const faults: string[] = []
  return settle(data, loadLightingConfiguration(data, '', faults), faults, reportRepair)
}

export function loadDmxRigsFixtures(
  data: DmxRigsConfig,
  reportRepair: ReportRepair,
): DmxRigsConfig {
  if (!Array.isArray(data?.rigs)) {
    return data
  }
  const faults: string[] = []
  const rigs = data.rigs.map((rig, i) =>
    typeof rig?.config === 'object' && rig.config !== null
      ? { ...rig, config: loadLightingConfiguration(rig.config, `rigs[${i}].config.`, faults) }
      : rig,
  )
  return settle(data, { ...data, rigs }, faults, reportRepair)
}
