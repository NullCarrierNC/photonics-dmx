/**
 * The fixture template editor's edits to a template's channels and fixture type, each building the
 * channel map of the template's own fixture type.
 */
import {
  DEFAULT_STROBE_CHANNEL_VALUES,
  FixtureTypes,
  LightTypes,
  normalizeFixtureConfig,
  type DmxFixture,
  type FixtureChannelLayout,
} from '../../../photonics-dmx/types'

/** The channel map with one of its own channels set. A name it does not have leaves it as it is. */
function setChannel<C extends object>(channels: C, name: string, value: number): C {
  return Object.hasOwn(channels, name) ? { ...channels, [name]: value } : channels
}

/** The template with one of its channels set to a new DMX channel number. */
export function withChannelNumber(fixture: DmxFixture, name: string, value: number): DmxFixture {
  switch (fixture.fixture) {
    case FixtureTypes.RGB:
      return { ...fixture, channels: setChannel(fixture.channels, name, value) }
    case FixtureTypes.RGBMH:
      return { ...fixture, channels: setChannel(fixture.channels, name, value) }
    case FixtureTypes.STROBE:
      return { ...fixture, channels: setChannel(fixture.channels, name, value) }
  }
}

/**
 * The template with its "Strobe Channel?" option set. Only the RGB family has the option, since a
 * dedicated strobe always carries its strobe channel. Turning it on seeds the strobe speeds.
 */
export function withStrobeChannelOption(fixture: DmxFixture, enabled: boolean): DmxFixture {
  const strobeValues = enabled
    ? fixture.strobeValues ?? { ...DEFAULT_STROBE_CHANNEL_VALUES }
    : undefined
  switch (fixture.fixture) {
    case FixtureTypes.STROBE:
      return fixture
    case FixtureTypes.RGB: {
      const { strobeChannel, ...channels } = fixture.channels
      return enabled
        ? { ...fixture, channels: { ...channels, strobeChannel: strobeChannel ?? 0 }, strobeValues }
        : { ...fixture, channels, strobeValues }
    }
    case FixtureTypes.RGBMH: {
      const { strobeChannel, ...channels } = fixture.channels
      return enabled
        ? { ...fixture, channels: { ...channels, strobeChannel: strobeChannel ?? 0 }, strobeValues }
        : { ...fixture, channels, strobeValues }
    }
  }
}

/**
 * The unassigned channel map of a fixture type's entry in {@link LightTypes}, carrying a strobe
 * channel number onto an RGB-family type. A dedicated strobe keeps its default strobe channel.
 */
function defaultLayout(
  typeDefaults: DmxFixture,
  strobeChannel: number | undefined,
): FixtureChannelLayout {
  switch (typeDefaults.fixture) {
    case FixtureTypes.STROBE:
      return { fixture: typeDefaults.fixture, channels: { ...typeDefaults.channels } }
    case FixtureTypes.RGB:
      return {
        fixture: typeDefaults.fixture,
        channels:
          strobeChannel === undefined
            ? { ...typeDefaults.channels }
            : { ...typeDefaults.channels, strobeChannel },
      }
    case FixtureTypes.RGBMH:
      return {
        fixture: typeDefaults.fixture,
        channels:
          strobeChannel === undefined
            ? { ...typeDefaults.channels }
            : { ...typeDefaults.channels, strobeChannel },
      }
  }
}

/**
 * The template switched to another fixture type, with that type's unassigned channels. A strobe
 * channel and its speeds carry across the RGB family. A dedicated strobe is colour-less, so only
 * fixed (mode) channels carry onto it and its brightness trim goes.
 */
export function withFixtureType(fixture: DmxFixture, fixtureType: FixtureTypes): DmxFixture {
  const typeDefaults = LightTypes.find((type) => type.fixture === fixtureType)
  if (!typeDefaults) return fixture
  const toStrobe = fixtureType === FixtureTypes.STROBE
  const carriedStrobe =
    toStrobe || fixture.fixture === FixtureTypes.STROBE ? undefined : fixture.channels.strobeChannel

  const next: DmxFixture = {
    ...fixture,
    ...defaultLayout(typeDefaults, carriedStrobe),
    config: typeDefaults.config ? normalizeFixtureConfig(typeDefaults.config) : undefined,
    strobeValues:
      carriedStrobe === undefined
        ? undefined
        : fixture.strobeValues ?? { ...DEFAULT_STROBE_CHANNEL_VALUES },
  }

  // An empty extra-channel list is stored as no key at all.
  const extras = toStrobe
    ? (fixture.extraChannels ?? []).filter((extra) => extra.type === 'fixed')
    : fixture.extraChannels ?? []
  if (extras.length > 0) next.extraChannels = extras
  else delete next.extraChannels
  if (toStrobe) delete next.brightnessScaling
  return next
}
