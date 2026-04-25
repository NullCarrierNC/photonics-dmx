import type { DmxFixture, DmxLight, DmxRigsConfig, LightingConfiguration } from '../types'
import { FixtureTypes, normalizeFixtureConfig } from '../types'

const TWO_ROWS_LAYOUT = { id: 'two-rows', label: 'Two Rows (one in front of the other)' } as const

/** Written to `DmxRigsConfig.schemaVersion` after the one-time legacy layout rename and mount backfill. */
export const CURRENT_RIGS_SCHEMA_VERSION = 1

function isMovingHeadFixture(light: DmxFixture): boolean {
  return light.fixture === FixtureTypes.RGBMH || light.fixture === FixtureTypes.RGBWMH
}

function deriveMountFromConfig(light: DmxFixture): 'floor' | 'ceiling' {
  if (!isMovingHeadFixture(light)) {
    return 'floor'
  }
  const c = normalizeFixtureConfig(light.config)
  return c.invertPan === true && c.invertTilt === true ? 'ceiling' : 'floor'
}

function migrateLights(lights: DmxLight[]): { lights: DmxLight[]; changed: boolean } {
  let changed = false
  const next = lights.map((light) => {
    if (light.mount === 'floor' || light.mount === 'ceiling') {
      return light
    }
    changed = true
    return { ...light, mount: deriveMountFromConfig(light) }
  })
  return { lights: next, changed }
}

export type MigrateLightingConfigurationOptions = {
  /** When true, do not rename legacy `front-back` to `two-rows` (new semantic `front-back` is preserved). */
  skipLegacyRename?: boolean
}

/**
 * Normalizes persisted rig lighting config: optionally renames legacy `front-back` to `two-rows`,
 * and sets `mount` on each fixture when missing.
 */
export function migrateLightingConfiguration(
  config: LightingConfiguration,
  options?: MigrateLightingConfigurationOptions,
): {
  config: LightingConfiguration
  changed: boolean
} {
  let changed = false
  let lightLayout = config.lightLayout
  if (!options?.skipLegacyRename && lightLayout?.id === 'front-back') {
    lightLayout = { id: TWO_ROWS_LAYOUT.id, label: TWO_ROWS_LAYOUT.label }
    changed = true
  }

  const front = migrateLights(config.frontLights)
  const back = migrateLights(config.backLights)
  const strobe = migrateLights(config.strobeLights)
  if (front.changed || back.changed || strobe.changed) {
    changed = true
  }

  if (!changed) {
    return { config, changed: false }
  }

  return {
    config: {
      ...config,
      lightLayout,
      frontLights: front.lights,
      backLights: back.lights,
      strobeLights: strobe.lights,
    },
    changed: true,
  }
}

export function migrateDmxRigsConfig(input: DmxRigsConfig): {
  config: DmxRigsConfig
  changed: boolean
} {
  const alreadyMigrated = input.schemaVersion === CURRENT_RIGS_SCHEMA_VERSION

  const nextRigs = input.rigs.map((rig) => {
    const { config, changed } = migrateLightingConfiguration(rig.config, {
      skipLegacyRename: alreadyMigrated,
    })
    return changed ? { ...rig, config } : rig
  })

  const rigsMutated = nextRigs.some((rig, i) => rig !== input.rigs[i])
  const needSchemaStamp = !alreadyMigrated

  if (!rigsMutated && !needSchemaStamp) {
    return { config: input, changed: false }
  }

  return {
    config: {
      ...input,
      rigs: nextRigs,
      schemaVersion: CURRENT_RIGS_SCHEMA_VERSION,
    },
    changed: true,
  }
}
