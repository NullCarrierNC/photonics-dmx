import { DmxFixture, LightingConfiguration, TrackedLight, RGBIO, FixtureTypes, DmxLight } from '../../types';
import { ConfigStrobeType } from '../../types';

export const createMockDmxFixture = (overrides?: Partial<DmxFixture>): DmxFixture => ({
  id: 'test-fixture-1',
  name: 'Test Fixture',
  label: 'Test Fixture',
  isStrobeEnabled: false,
  universe: 1,
  fixture: FixtureTypes.RGB,
  group: 'front',
  position: 1,
  channels: {
    red: 1,
    green: 2,
    blue: 3,
    masterDimmer: 4
  },
  ...overrides
});

const createMockDmxLight = (overrides?: Partial<DmxLight>): DmxLight => ({
  ...createMockDmxFixture(),
  fixtureId: 'test-fixture-1',
  ...overrides
});

export const createMockLightingConfig = (overrides?: Partial<LightingConfiguration>): LightingConfiguration => ({
  numLights: 4,
  lightLayout: { id: 'front-back', label: 'Front and Back' },
  strobeType: ConfigStrobeType.None,
  frontLights: [createMockDmxLight()],
  backLights: [],
  strobeLights: [],
  ...overrides
});

export const createMockTrackedLight = (overrides?: Partial<TrackedLight>): TrackedLight => ({
  id: 'test-light-1',
  position: 1,
  config: {
    panHome: 0,
    panMin: 0,
    panMax: 255,
    tiltHome: 0,
    tiltMin: 0,
    tiltMax: 255,
    invert: false
  },
  ...overrides
});

export const createMockRGBIP = (overrides?: Partial<RGBIO>): RGBIO => ({
  red: 0,
  green: 0,
  blue: 0,
  intensity: 255,
  opacity: 1.0,
  blendMode: 'replace',
  ...overrides
}); 