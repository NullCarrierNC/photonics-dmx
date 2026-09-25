/**
 * Checks a fixture that arrives from outside the app (a config file, a rig import or an IPC
 * payload) field by field against its fixture type. A fault with a safe reading is repaired and
 * reported, and a fixture of a type this build does not know comes back as null.
 */
import {
  DMX_CHANNEL_MAX,
  EXTRA_CHANNEL_TYPES,
  FixtureTypes,
  FIXTURE_CONFIG_FIELDS,
  isFixtureConfigFlagField,
  isFixtureType,
  normalizeFixtureConfig,
} from '../types'
import type {
  BrightnessScaling,
  DmxFixture,
  DmxLight,
  ExtraChannel,
  ExtraChannelType,
  FixtureChannelLayout,
  FixtureConfig,
  LegacyFixtureConfigFields,
  RgbDmxChannels,
  RgbMovingHeadDmxChannels,
  StrobeChannelValues,
} from '../types'
import { isStorableBrightnessScale, isValidBrightnessScalePercent } from './brightnessScaling'
import { migrateFixtureSchema } from './lightingConfigMigration'

/** Receives one message per fault, naming the field by its path. */
export type FixtureFaultReport = (message: string) => void

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A channel number as stored: 1-512, or 0 for unassigned. */
function isStoredChannel(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= DMX_CHANNEL_MAX
  )
}

function isDmxValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255
}

const EXTRA_CHANNEL_TYPE_SET: ReadonlySet<string> = new Set(EXTRA_CHANNEL_TYPES)

function isExtraChannelType(value: unknown): value is ExtraChannelType {
  return typeof value === 'string' && EXTRA_CHANNEL_TYPE_SET.has(value)
}

const FIXTURE_FIELDS: ReadonlySet<string> = new Set([
  'id',
  'position',
  'fixture',
  'label',
  'name',
  'isStrobeEnabled',
  'group',
  'channels',
  'config',
  'universe',
  'mount',
  'strobeValues',
  'extraChannels',
  'brightnessScaling',
])

function parseChannels(
  fixture: FixtureTypes,
  raw: unknown,
  path: string,
  report: FixtureFaultReport,
): FixtureChannelLayout {
  if (!isPlainObject(raw)) {
    report(`${path}.channels is missing`)
  }
  const source = isPlainObject(raw) ? raw : {}
  const read = new Set<string>()
  const channel = (key: string): number | undefined => {
    read.add(key)
    const value = source[key]
    if (value == null) return undefined
    if (isStoredChannel(value)) return value
    report(
      `${path}.channels.${key} must be an integer DMX channel between 0 and ${DMX_CHANNEL_MAX}`,
    )
    return 0
  }
  const required = (key: string): number => {
    const value = channel(key)
    if (value !== undefined) return value
    if (isPlainObject(raw)) report(`${path}.channels.${key} is missing`)
    return 0
  }

  let layout: FixtureChannelLayout
  switch (fixture) {
    case FixtureTypes.STROBE:
      layout = {
        fixture,
        channels: {
          masterDimmer: required('masterDimmer'),
          strobeChannel: required('strobeChannel'),
        },
      }
      break
    case FixtureTypes.RGB: {
      const rgb: RgbDmxChannels = {
        masterDimmer: required('masterDimmer'),
        red: required('red'),
        green: required('green'),
        blue: required('blue'),
      }
      const strobeChannel = channel('strobeChannel')
      if (strobeChannel !== undefined) rgb.strobeChannel = strobeChannel
      layout = { fixture, channels: rgb }
      break
    }
    case FixtureTypes.RGBMH: {
      const movingHead: RgbMovingHeadDmxChannels = {
        masterDimmer: required('masterDimmer'),
        red: required('red'),
        green: required('green'),
        blue: required('blue'),
        pan: required('pan'),
        tilt: required('tilt'),
      }
      const strobeChannel = channel('strobeChannel')
      if (strobeChannel !== undefined) movingHead.strobeChannel = strobeChannel
      layout = { fixture, channels: movingHead }
      break
    }
  }

  for (const key of Object.keys(source)) {
    if (!read.has(key)) report(`${path}.channels.${key} is not a channel of a ${fixture} fixture`)
  }
  return layout
}

function parseConfig(raw: unknown, path: string, report: FixtureFaultReport): FixtureConfig {
  const stored: Partial<FixtureConfig> & LegacyFixtureConfigFields = {}
  const source = isPlainObject(raw) ? raw : {}
  for (const key of FIXTURE_CONFIG_FIELDS) {
    const value = source[key]
    if (value === undefined) continue
    if (isFixtureConfigFlagField(key)) {
      if (typeof value === 'boolean') stored[key] = value
      else report(`${path}.config.${key} must be true or false`)
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      stored[key] = value
    } else {
      report(`${path}.config.${key} must be a number`)
    }
  }
  if (typeof source.invert === 'boolean') stored.invert = source.invert
  return normalizeFixtureConfig(stored)
}

const STROBE_VALUE_KEYS = ['slow', 'medium', 'fast', 'fastest'] as const

function parseStrobeValues(
  raw: unknown,
  path: string,
  report: FixtureFaultReport,
): StrobeChannelValues | undefined {
  if (!isPlainObject(raw)) {
    report(`${path}.strobeValues must be a plain object`)
    return undefined
  }
  const { slow, medium, fast, fastest } = raw
  if (isDmxValue(slow) && isDmxValue(medium) && isDmxValue(fast) && isDmxValue(fastest)) {
    return { slow, medium, fast, fastest }
  }
  const bad = STROBE_VALUE_KEYS.filter((key) => !isDmxValue(raw[key]))
  report(`${path}.strobeValues.${bad.join(', ')} must be an integer between 0 and 255`)
  return undefined
}

function parseExtraChannel(
  raw: unknown,
  path: string,
  report: FixtureFaultReport,
): ExtraChannel | undefined {
  if (!isPlainObject(raw)) {
    report(`${path} must be an object`)
    return undefined
  }
  const { type, channel, value, scale } = raw
  if (!isExtraChannelType(type)) {
    report(`${path}.type must be a valid extra-channel type`)
    return undefined
  }
  if (!isStoredChannel(channel)) {
    report(`${path}.channel must be an integer DMX channel between 0 and ${DMX_CHANNEL_MAX}`)
    return undefined
  }
  const extra: ExtraChannel = { type, channel }
  if (type === 'fixed') {
    if (!isDmxValue(value)) {
      report(`${path}.value must be an integer between 0 and 255 for a fixed channel`)
      return undefined
    }
    extra.value = value
    if (scale !== undefined) report(`${path}.scale is not valid on a fixed channel`)
  } else {
    if (value !== undefined) report(`${path}.value is only valid on a fixed channel`)
    if (scale !== undefined && !isValidBrightnessScalePercent(scale)) {
      report(`${path}.scale must be an integer percent between 0 and 100`)
    } else if (isStorableBrightnessScale(scale)) {
      extra.scale = scale
    }
  }
  for (const key of Object.keys(raw)) {
    if (!['type', 'channel', 'value', 'scale'].includes(key)) {
      report(`${path}.${key} is not an extra-channel field`)
    }
  }
  return extra
}

function parseBrightnessScaling(
  raw: unknown,
  path: string,
  report: FixtureFaultReport,
): BrightnessScaling | undefined {
  if (!isPlainObject(raw)) {
    report(`${path}.brightnessScaling must be a plain object`)
    return undefined
  }
  const scaling: BrightnessScaling = {}
  for (const [key, percent] of Object.entries(raw)) {
    if (key !== 'red' && key !== 'green' && key !== 'blue') {
      report(`${path}.brightnessScaling.${key} is not a scalable colour channel`)
    } else if (percent !== undefined && !isValidBrightnessScalePercent(percent)) {
      report(`${path}.brightnessScaling.${key} must be an integer percent between 0 and 100`)
    } else if (isStorableBrightnessScale(percent)) {
      scaling[key] = percent
    }
  }
  return Object.keys(scaling).length > 0 ? scaling : undefined
}

/** A fixture template on the current schema. */
export function parseDmxFixture(
  raw: unknown,
  path: string,
  report: FixtureFaultReport,
): DmxFixture | null {
  if (!isPlainObject(raw)) {
    report(`${path} must be an object`)
    return null
  }
  if (!isFixtureType(raw.fixture)) {
    report(`${path}.fixture '${String(raw.fixture)}' is not a fixture type`)
    return null
  }
  const fixtureType = raw.fixture

  let id: string | null = null
  if (typeof raw.id === 'string') id = raw.id
  else if (raw.id != null) report(`${path}.id must be a string or null`)

  let position = 0
  if (typeof raw.position === 'number' && Number.isFinite(raw.position)) position = raw.position
  else report(`${path}.position must be a number`)

  const text = (key: 'label' | 'name'): string => {
    const value = raw[key]
    if (typeof value === 'string') return value
    report(`${path}.${key} must be a string`)
    return ''
  }

  let isStrobeEnabled = false
  if (typeof raw.isStrobeEnabled === 'boolean') isStrobeEnabled = raw.isStrobeEnabled
  else report(`${path}.isStrobeEnabled must be true or false`)

  const fixture: DmxFixture = {
    id,
    position,
    label: text('label'),
    name: text('name'),
    isStrobeEnabled,
    ...parseChannels(fixtureType, raw.channels, path, report),
  }

  if (typeof raw.group === 'string') fixture.group = raw.group
  else if (raw.group != null) report(`${path}.group must be a string`)

  if (typeof raw.universe === 'number' && Number.isFinite(raw.universe)) {
    fixture.universe = raw.universe
  } else if (raw.universe != null) {
    report(`${path}.universe must be a number`)
  }

  if (raw.mount === 'floor' || raw.mount === 'ceiling') fixture.mount = raw.mount
  else if (raw.mount != null) report(`${path}.mount must be floor or ceiling`)

  if (isPlainObject(raw.config)) fixture.config = parseConfig(raw.config, path, report)
  else if (raw.config != null) report(`${path}.config must be a plain object`)

  if (raw.strobeValues != null) {
    const strobeValues = parseStrobeValues(raw.strobeValues, path, report)
    if (strobeValues) fixture.strobeValues = strobeValues
  }

  if (Array.isArray(raw.extraChannels)) {
    const extras = raw.extraChannels.flatMap((entry, i) => {
      const extra = parseExtraChannel(entry, `${path}.extraChannels[${i}]`, report)
      return extra ? [extra] : []
    })
    if (extras.length > 0) fixture.extraChannels = extras
  } else if (raw.extraChannels != null) {
    report(`${path}.extraChannels must be an array`)
  }

  if (raw.brightnessScaling != null) {
    const scaling = parseBrightnessScaling(raw.brightnessScaling, path, report)
    if (scaling) fixture.brightnessScaling = scaling
  }

  for (const key of Object.keys(raw)) {
    if (!FIXTURE_FIELDS.has(key)) {
      report(`${path}.${key} is not a fixture field`)
    }
  }
  return fixture
}

/** A rig light: a fixture plus the id of the template it came from. */
export function parseDmxLight(
  raw: unknown,
  path: string,
  report: FixtureFaultReport,
): DmxLight | null {
  if (!isPlainObject(raw)) {
    report(`${path} must be an object`)
    return null
  }
  const { fixtureId, ...fields } = raw
  const fixture = parseDmxFixture(fields, path, report)
  if (!fixture) return null
  if (typeof fixtureId === 'string') return { ...fixture, fixtureId }
  report(`${path}.fixtureId must be a string`)
  return { ...fixture, fixtureId: '' }
}

/** Brings a fixture any build may have written onto the current schema before it is parsed. */
function migrateStored(raw: unknown): unknown {
  if (!isPlainObject(raw) || typeof raw.fixture !== 'string') return raw
  return migrateFixtureSchema({ ...raw, fixture: raw.fixture }).fixture
}

/** {@link parseDmxFixture} for a fixture any build may have stored. */
export function loadDmxFixture(
  raw: unknown,
  path: string,
  report: FixtureFaultReport,
): DmxFixture | null {
  return parseDmxFixture(migrateStored(raw), path, report)
}

/** {@link parseDmxLight} for a rig light any build may have stored. */
export function loadDmxLight(
  raw: unknown,
  path: string,
  report: FixtureFaultReport,
): DmxLight | null {
  return parseDmxLight(migrateStored(raw), path, report)
}

/**
 * Parses every entry of a fixture list with `parse`, collecting the faults in `faults`. A list
 * holding a fixture that cannot be parsed fails with that fixture's faults.
 */
export function parseFixtureList<T>(
  raw: readonly unknown[],
  path: string,
  parse: (raw: unknown, path: string, report: FixtureFaultReport) => T | null,
  faults: string[],
): { ok: true; value: T[] } | { ok: false; error: string } {
  const value: T[] = []
  for (let i = 0; i < raw.length; i++) {
    const entryFaults: string[] = []
    const fixture = parse(raw[i], `${path}[${i}]`, (message) => entryFaults.push(message))
    if (!fixture) {
      return { ok: false, error: entryFaults.join('; ') }
    }
    faults.push(...entryFaults)
    value.push(fixture)
  }
  return { ok: true, value }
}
