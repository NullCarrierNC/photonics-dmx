import { describe, expect, it } from '@jest/globals'
import { ConfigStrobeType } from '../types'
import { FixtureTypes, DEFAULT_MOVING_HEAD_FIXTURE_CONFIG } from '../types'
import type { DmxRig } from '../types'
import {
  CURRENT_RIGS_SCHEMA_VERSION,
  migrateDmxRigsConfig,
  migrateLightingConfiguration,
} from './lightingConfigMigration'

describe('migrateLightingConfiguration', () => {
  it('renames legacy front-back to two-rows', () => {
    const { config, changed } = migrateLightingConfiguration({
      numLights: 2,
      lightLayout: { id: 'front-back', label: 'Front and Back' },
      strobeType: ConfigStrobeType.None,
      frontLights: [],
      backLights: [],
      strobeLights: [],
    })
    expect(changed).toBe(true)
    expect(config.lightLayout.id).toBe('two-rows')
    expect(config.lightLayout.label).toBe('Two Rows (one in front of the other)')
  })

  it('sets mount from invert flags on moving heads when mount is missing', () => {
    const { config, changed } = migrateLightingConfiguration({
      numLights: 2,
      lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
      strobeType: ConfigStrobeType.None,
      frontLights: [
        {
          id: 'a',
          fixtureId: 'tpl-1',
          position: 1,
          fixture: FixtureTypes.RGBMH,
          label: 'MH',
          name: 'MH',
          isStrobeEnabled: false,
          group: 'front',
          channels: {
            masterDimmer: 1,
            red: 2,
            green: 3,
            blue: 4,
            pan: 5,
            tilt: 6,
          },
          config: {
            ...DEFAULT_MOVING_HEAD_FIXTURE_CONFIG,
            invertPan: true,
            invertTilt: true,
          },
        },
      ],
      backLights: [],
      strobeLights: [],
    })
    expect(changed).toBe(true)
    expect(config.frontLights[0]!.mount).toBe('ceiling')
  })

  it('returns unchanged when already migrated', () => {
    const input = {
      numLights: 1,
      lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
      strobeType: ConfigStrobeType.None,
      frontLights: [
        {
          id: 'a',
          fixtureId: 'tpl-1',
          position: 1,
          fixture: FixtureTypes.RGB,
          label: 'R',
          name: 'R',
          isStrobeEnabled: false,
          group: 'front',
          channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 },
          mount: 'floor' as const,
        },
      ],
      backLights: [],
      strobeLights: [],
    }
    const { config, changed } = migrateLightingConfiguration(input)
    expect(changed).toBe(false)
    expect(config).toBe(input)
  })

  it('does not rename front-back when skipLegacyRename is true', () => {
    const input = {
      numLights: 2,
      lightLayout: { id: 'front-back', label: 'Front and Back (back behind audience)' },
      strobeType: ConfigStrobeType.None,
      frontLights: [],
      backLights: [],
      strobeLights: [],
    }
    const { config, changed } = migrateLightingConfiguration(input, { skipLegacyRename: true })
    expect(changed).toBe(false)
    expect(config.lightLayout.id).toBe('front-back')
    expect(config).toBe(input)
  })
})

describe('migrateDmxRigsConfig', () => {
  const emptyMigratedConfig = {
    numLights: 1,
    lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
    strobeType: ConfigStrobeType.None,
    frontLights: [],
    backLights: [],
    strobeLights: [],
  }

  it('migrates legacy rigs and leaves already-migrated rigs by reference', () => {
    const legacy: DmxRig = {
      id: 'rig-a',
      name: 'Legacy',
      active: true,
      config: {
        numLights: 2,
        lightLayout: { id: 'front-back', label: 'Front and Back' },
        strobeType: ConfigStrobeType.None,
        frontLights: [],
        backLights: [],
        strobeLights: [],
      },
    }
    const alreadyOk: DmxRig = {
      id: 'rig-b',
      name: 'OK',
      active: true,
      config: emptyMigratedConfig,
    }

    const { config, changed } = migrateDmxRigsConfig({ rigs: [legacy, alreadyOk] })

    expect(changed).toBe(true)
    expect(config.rigs[0]!.config.lightLayout.id).toBe('two-rows')
    expect(config.rigs[1]).toBe(alreadyOk)
    expect(config.schemaVersion).toBe(CURRENT_RIGS_SCHEMA_VERSION)
  })

  it('returns unchanged config when schema is current and no per-rig migration', () => {
    const rig: DmxRig = {
      id: 'rig-only',
      name: 'Only',
      active: true,
      config: emptyMigratedConfig,
    }
    const input = { rigs: [rig], schemaVersion: CURRENT_RIGS_SCHEMA_VERSION }
    const { config, changed } = migrateDmxRigsConfig(input)
    expect(changed).toBe(false)
    expect(config).toBe(input)
  })

  it('preserves new semantic front-back when rigs schemaVersion is current', () => {
    const rig: DmxRig = {
      id: 'rig-fb',
      name: 'FB',
      active: true,
      config: {
        numLights: 2,
        lightLayout: {
          id: 'front-back',
          label: 'Front and Back (back lights behind audience)',
        },
        strobeType: ConfigStrobeType.None,
        frontLights: [],
        backLights: [],
        strobeLights: [],
      },
    }
    const { config, changed } = migrateDmxRigsConfig({
      rigs: [rig],
      schemaVersion: CURRENT_RIGS_SCHEMA_VERSION,
    })
    expect(changed).toBe(false)
    expect(config.rigs[0]!.config.lightLayout.id).toBe('front-back')
    expect(config.rigs[0]).toBe(rig)
  })

  it('stamps schemaVersion on first load even when rigs array is empty', () => {
    const { config, changed } = migrateDmxRigsConfig({ rigs: [] })
    expect(changed).toBe(true)
    expect(config.schemaVersion).toBe(CURRENT_RIGS_SCHEMA_VERSION)
    expect(config.rigs).toEqual([])
  })
})
