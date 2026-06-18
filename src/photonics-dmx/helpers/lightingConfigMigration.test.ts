import { describe, expect, it } from '@jest/globals'
import { ConfigStrobeType } from '../types'
import {
  DEFAULT_MOVING_HEAD_FIXTURE_CONFIG,
  DEFAULT_STROBE_CHANNEL_VALUES,
  FixtureTypes,
} from '../types'
import type { DmxFixture, DmxLight, DmxRig } from '../types'
import {
  CURRENT_RIGS_SCHEMA_VERSION,
  migrateDmxRigsConfig,
  migrateFixtureToStrobeChannelSchema,
  migrateLightingConfiguration,
  migrateUserLightsForStrobeChannel,
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

  it('bumps schemaVersion from 3 → current without losing rig.outputs', () => {
    // Per-rig sender routing (v4) — a rig with an explicit `outputs` whitelist must survive a
    // version stamp bump unchanged. The migration adds no transformation for this field; it
    // only marks that code understands it.
    const rig: DmxRig = {
      id: 'rig-routed',
      name: 'Routed',
      active: true,
      config: {
        numLights: 1,
        lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
        strobeType: ConfigStrobeType.None,
        frontLights: [],
        backLights: [],
        strobeLights: [],
      },
      outputs: ['sacn', 'opendmx'],
    }
    const { config, changed } = migrateDmxRigsConfig({ rigs: [rig], schemaVersion: 3 })
    expect(changed).toBe(true) // stamp bumped 3 → 4
    expect(config.schemaVersion).toBe(CURRENT_RIGS_SCHEMA_VERSION)
    expect(config.rigs[0]!.outputs).toEqual(['sacn', 'opendmx'])
  })

  it('rig without outputs migrates 3 → 4 with outputs still undefined (legacy default)', () => {
    const rig: DmxRig = {
      id: 'rig-default',
      name: 'Default',
      active: true,
      config: {
        numLights: 1,
        lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
        strobeType: ConfigStrobeType.None,
        frontLights: [],
        backLights: [],
        strobeLights: [],
      },
    }
    const { config } = migrateDmxRigsConfig({ rigs: [rig], schemaVersion: 3 })
    expect(config.schemaVersion).toBe(CURRENT_RIGS_SCHEMA_VERSION)
    expect(config.rigs[0]!.outputs).toBeUndefined()
  })

  it('bumps schemaVersion 4 → 5 with no data transformation (mirror flags marker)', () => {
    // v5 added optional `DmxRig.mirrorHoriz` / `DmxRig.mirrorVert` flags. Absence = false. A
    // v4 config without the flags must round-trip unchanged except for the stamp; a v4 config
    // that already carries the flags (e.g. user hand-edited the JSON) must preserve them.
    const plainRig: DmxRig = {
      id: 'rig-plain',
      name: 'Plain',
      active: true,
      config: {
        numLights: 1,
        lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
        strobeType: ConfigStrobeType.None,
        frontLights: [],
        backLights: [],
        strobeLights: [],
      },
    }
    const mirroredRig: DmxRig = {
      ...plainRig,
      id: 'rig-mirrored',
      name: 'Mirrored',
      mirrorHoriz: true,
      mirrorVert: true,
    }
    const { config, changed } = migrateDmxRigsConfig({
      rigs: [plainRig, mirroredRig],
      schemaVersion: 4,
    })
    expect(changed).toBe(true) // stamp bumped 4 → 5
    expect(config.schemaVersion).toBe(CURRENT_RIGS_SCHEMA_VERSION)
    expect(config.rigs[0]!.mirrorHoriz).toBeUndefined()
    expect(config.rigs[0]!.mirrorVert).toBeUndefined()
    expect(config.rigs[1]!.mirrorHoriz).toBe(true)
    expect(config.rigs[1]!.mirrorVert).toBe(true)
  })

  it('preserves new semantic front-back on a v3-stamped config (regression for stamp-bump rename guard)', () => {
    // The legacy `front-back` → `two-rows` rename was the v1 migration. A v3-stamped config that
    // *intentionally* uses the new semantic `front-back` layout must NOT be renamed when we bump
    // its stamp to v4 — the rename guard checks "≥ v1" rather than "== current".
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
    const { config } = migrateDmxRigsConfig({ rigs: [rig], schemaVersion: 3 })
    expect(config.rigs[0]!.config.lightLayout.id).toBe('front-back')
    expect(config.schemaVersion).toBe(CURRENT_RIGS_SCHEMA_VERSION)
  })

  it('migrates legacy rgb/s rig lights to rgb + strobeChannel and seeds strobeValues', () => {
    const legacyLight = {
      id: 'rgbs-1',
      fixtureId: 'tpl-rgbs',
      position: 1,
      fixture: 'rgb/s',
      label: 'L',
      name: 'L',
      isStrobeEnabled: true,
      group: 'front',
      channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, strobeSpeed: 6 },
    } as unknown as DmxLight
    const legacyRig: DmxRig = {
      id: 'rig-legacy',
      name: 'Legacy',
      active: true,
      config: {
        numLights: 1,
        lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
        strobeType: ConfigStrobeType.AllCapable,
        frontLights: [legacyLight],
        backLights: [],
        strobeLights: [],
      },
    }
    const { config, changed } = migrateDmxRigsConfig({ rigs: [legacyRig] })
    expect(changed).toBe(true)
    const migratedLight = config.rigs[0]!.config.frontLights[0]!
    expect(migratedLight.fixture).toBe(FixtureTypes.RGB)
    expect((migratedLight.channels as { strobeChannel?: number }).strobeChannel).toBe(6)
    expect((migratedLight.channels as { strobeSpeed?: number }).strobeSpeed).toBeUndefined()
    expect(migratedLight.strobeValues).toEqual(DEFAULT_STROBE_CHANNEL_VALUES)
    expect(config.schemaVersion).toBe(CURRENT_RIGS_SCHEMA_VERSION)
  })
})

describe('migrateFixtureToStrobeChannelSchema', () => {
  it('converts rgbw/s template to rgbw with strobeChannel + default strobeValues', () => {
    const legacy = {
      id: 'tpl-rgbws',
      position: 0,
      fixture: 'rgbw/s',
      label: 'RGBW/S',
      name: 'RGBW/S',
      isStrobeEnabled: false,
      channels: { masterDimmer: 0, red: 1, green: 2, blue: 3, white: 4, strobeSpeed: 5 },
    } as unknown as DmxFixture
    const { fixture, changed } = migrateFixtureToStrobeChannelSchema(legacy)
    expect(changed).toBe(true)
    expect(fixture.fixture).toBe(FixtureTypes.RGBW)
    expect((fixture.channels as { strobeChannel?: number }).strobeChannel).toBe(5)
    expect((fixture.channels as { strobeSpeed?: number }).strobeSpeed).toBeUndefined()
    expect(fixture.strobeValues).toEqual(DEFAULT_STROBE_CHANNEL_VALUES)
  })

  it('renames strobeSpeed to strobeChannel on a dedicated strobe fixture but does NOT seed strobeValues', () => {
    // Dedicated STROBE fixtures are a separate device class from the RGB+S "Strobe Channel?"
    // feature — they intrinsically carry a strobe channel and don't consume `strobeValues`. The
    // migration only corrects the legacy channel key name.
    const legacy = {
      id: 'tpl-strobe',
      position: 0,
      fixture: FixtureTypes.STROBE,
      label: 'S',
      name: 'S',
      isStrobeEnabled: false,
      channels: { masterDimmer: 1, strobeSpeed: 2 } as unknown as DmxFixture['channels'],
    } as DmxFixture
    const { fixture, changed } = migrateFixtureToStrobeChannelSchema(legacy)
    expect(changed).toBe(true)
    expect((fixture.channels as { strobeChannel: number }).strobeChannel).toBe(2)
    expect((fixture.channels as { strobeSpeed?: number }).strobeSpeed).toBeUndefined()
    expect(fixture.strobeValues).toBeUndefined()
  })

  it('leaves a clean dedicated strobe fixture unchanged', () => {
    const strobe: DmxFixture = {
      id: 'tpl-strobe',
      position: 0,
      fixture: FixtureTypes.STROBE,
      label: 'S',
      name: 'S',
      isStrobeEnabled: false,
      channels: { masterDimmer: 1, strobeChannel: 2 } as unknown as DmxFixture['channels'],
    }
    const { fixture, changed } = migrateFixtureToStrobeChannelSchema(strobe)
    expect(changed).toBe(false)
    expect(fixture).toBe(strobe)
  })

  it('leaves a plain rgb fixture unchanged', () => {
    const rgb: DmxFixture = {
      id: 'tpl-rgb',
      position: 0,
      fixture: FixtureTypes.RGB,
      label: 'R',
      name: 'R',
      isStrobeEnabled: false,
      channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 },
    }
    const { fixture, changed } = migrateFixtureToStrobeChannelSchema(rgb)
    expect(changed).toBe(false)
    expect(fixture).toBe(rgb)
  })
})

describe('migrateUserLightsForStrobeChannel', () => {
  it('returns the same array reference when no migration is needed', () => {
    const lights: DmxFixture[] = [
      {
        id: 'tpl-rgb',
        position: 0,
        fixture: FixtureTypes.RGB,
        label: 'R',
        name: 'R',
        isStrobeEnabled: false,
        channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 },
      },
    ]
    const { lights: next, changed } = migrateUserLightsForStrobeChannel(lights)
    expect(changed).toBe(false)
    expect(next).toBe(lights)
  })

  it('migrates only the legacy entries and preserves untouched ones by reference', () => {
    const rgb: DmxFixture = {
      id: 'tpl-rgb',
      position: 0,
      fixture: FixtureTypes.RGB,
      label: 'R',
      name: 'R',
      isStrobeEnabled: false,
      channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 },
    }
    const legacy = {
      id: 'tpl-rgbs',
      position: 0,
      fixture: 'rgb/s',
      label: 'RGB/S',
      name: 'RGB/S',
      isStrobeEnabled: true,
      channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, strobeSpeed: 5 },
    } as unknown as DmxFixture
    const { lights, changed } = migrateUserLightsForStrobeChannel([rgb, legacy])
    expect(changed).toBe(true)
    expect(lights[0]).toBe(rgb)
    expect(lights[1]!.fixture).toBe(FixtureTypes.RGB)
    expect((lights[1]!.channels as { strobeChannel?: number }).strobeChannel).toBe(5)
  })
})
