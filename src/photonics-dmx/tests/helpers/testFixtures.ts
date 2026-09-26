import {
  LightingConfiguration,
  TrackedLight,
  RGBIO,
  FixtureTypes,
  DEFAULT_MOVING_HEAD_FIXTURE_CONFIG,
  type RgbFixture,
  type RgbLight,
  type RgbMovingHeadFixture,
  type RgbMovingHeadLight,
  type StrobeFixture,
  type StrobeLight,
} from '../../types'
import { ConfigStrobeType } from '../../types'

const fixtureFields = {
  id: 'test-fixture-1',
  name: 'Test Fixture',
  label: 'Test Fixture',
  isStrobeEnabled: false,
  universe: 1,
  group: 'front',
  position: 1,
}

export const rgbFixture = (overrides: Partial<RgbFixture> = {}): RgbFixture => ({
  ...fixtureFields,
  fixture: FixtureTypes.RGB,
  channels: { red: 1, green: 2, blue: 3, masterDimmer: 4 },
  ...overrides,
})

export const rgbMovingHeadFixture = (
  overrides: Partial<RgbMovingHeadFixture> = {},
): RgbMovingHeadFixture => ({
  ...fixtureFields,
  fixture: FixtureTypes.RGBMH,
  channels: { red: 1, green: 2, blue: 3, masterDimmer: 4, pan: 5, tilt: 6 },
  config: { ...DEFAULT_MOVING_HEAD_FIXTURE_CONFIG },
  ...overrides,
})

export const strobeFixture = (overrides: Partial<StrobeFixture> = {}): StrobeFixture => ({
  ...fixtureFields,
  fixture: FixtureTypes.STROBE,
  channels: { masterDimmer: 1, strobeChannel: 2 },
  ...overrides,
})

export const rgbLight = (overrides: Partial<RgbLight> = {}): RgbLight => ({
  ...rgbFixture(),
  id: fixtureFields.id,
  fixtureId: 'test-fixture-1',
  ...overrides,
})

export const rgbMovingHeadLight = (
  overrides: Partial<RgbMovingHeadLight> = {},
): RgbMovingHeadLight => ({
  ...rgbMovingHeadFixture(),
  id: fixtureFields.id,
  fixtureId: 'test-fixture-1',
  ...overrides,
})

export const strobeLight = (overrides: Partial<StrobeLight> = {}): StrobeLight => ({
  ...strobeFixture(),
  id: fixtureFields.id,
  fixtureId: 'test-fixture-1',
  ...overrides,
})

export const createMockLightingConfig = (
  overrides?: Partial<LightingConfiguration>,
): LightingConfiguration => ({
  numLights: 4,
  lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
  strobeType: ConfigStrobeType.None,
  frontLights: [rgbLight()],
  backLights: [],
  strobeLights: [],
  ...overrides,
})

export const createMockTrackedLight = (overrides?: Partial<TrackedLight>): TrackedLight => ({
  id: 'test-light-1',
  position: 1,
  config: {
    ...DEFAULT_MOVING_HEAD_FIXTURE_CONFIG,
  },
  ...overrides,
})

export const createMockRGBIP = (overrides?: Partial<RGBIO>): RGBIO => ({
  red: 0,
  green: 0,
  blue: 0,
  intensity: 255,
  opacity: 1.0,
  blendMode: 'replace',
  ...overrides,
})
