/**
 * Checks a fixture that arrives from outside the app (a config file, a rig import or an IPC
 * payload) field by field against its fixture type. A fault with a safe reading is repaired and
 * reported, and a fixture of a type this build does not know comes back as null.
 */
import equal from 'fast-deep-equal'
import {
  DEFAULT_STROBE_CHANNEL_VALUES,
  DMX_CHANNEL_MAX,
  FixtureTypes,
  FIXTURE_CONFIG_FIELDS,
  isExtraChannelType,
  isFixtureConfigFlagField,
  isFixtureType,
  normalizeFixtureConfig,
} from '../types'
import type {
  BrightnessScaling,
  DmxFixture,
  DmxLight,
  ExtraChannel,
  FixtureChannelLayout,
  FixtureConfig,
  LegacyFixtureConfigFields,
  RgbDmxChannels,
  RgbMovingHeadDmxChannels,
  StrobeChannelValues,
} from '../types'
import { isStorableBrightnessScale, isValidBrightnessScalePercent } from './brightnessScaling'
import { migrateFixtureSchema } from './lightingConfigMigration'
import { isPlainObject } from '../../shared/plainObject'

/**
 * What a fault did to the stored fixture: `reset` put a value back to its default or dropped a
 * value the fixture held, and `dropped` removed a key this build gives no meaning to.
 */
export type FixtureFaultKind = 'reset' | 'dropped'

/** Receives one message per fault, naming the field by its path. */
export type FixtureFaultReport = (message: string, kind: FixtureFaultKind) => void

/** One fault, as {@link parseFixtureList} collects them. */
export interface FixtureFault {
  message: string
  kind: FixtureFaultKind
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
    report(`${path}.channels is missing`, 'reset')
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
      'reset',
    )
    return 0
  }
  const required = (key: string): number => {
    const value = channel(key)
    if (value !== undefined) return value
    if (isPlainObject(raw)) report(`${path}.channels.${key} is missing`, 'reset')
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
    if (!read.has(key)) {
      report(`${path}.channels.${key} is not a channel of a ${fixture} fixture`, 'dropped')
    }
  }
  return layout
}

/** Config keys a stored fixture may carry: the current fields and the legacy `invert` flag. */
const STORED_CONFIG_FIELDS: ReadonlySet<string> = new Set([...FIXTURE_CONFIG_FIELDS, 'invert'])

/**
 * The config fields `source` holds as a flag or a finite number. Any other value, and any key
 * outside `known`, is reported.
 */
function readConfigFields(
  source: Record<string, unknown>,
  known: ReadonlySet<string>,
  path: string,
  report: FixtureFaultReport,
): Partial<FixtureConfig> {
  const fields: Partial<FixtureConfig> = {}
  for (const key of FIXTURE_CONFIG_FIELDS) {
    const value = source[key]
    if (value === undefined) continue
    if (isFixtureConfigFlagField(key)) {
      if (typeof value === 'boolean') fields[key] = value
      else report(`${path}.config.${key} must be true or false`, 'reset')
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      fields[key] = value
    } else {
      report(`${path}.config.${key} must be a number`, 'reset')
    }
  }
  for (const key of Object.keys(source)) {
    if (!known.has(key)) {
      report(`${path}.config.${key} is not a fixture config field`, 'dropped')
    }
  }
  return fields
}

function parseConfig(raw: unknown, path: string, report: FixtureFaultReport): FixtureConfig {
  const source = isPlainObject(raw) ? raw : {}
  const stored: Partial<FixtureConfig> & LegacyFixtureConfigFields = readConfigFields(
    source,
    STORED_CONFIG_FIELDS,
    path,
    report,
  )
  if (typeof source.invert === 'boolean') stored.invert = source.invert
  return normalizeFixtureConfig(stored)
}

const CURRENT_CONFIG_FIELDS: ReadonlySet<string> = new Set(FIXTURE_CONFIG_FIELDS)

/**
 * A config change from an IPC payload: the fields it names, by the same rule a stored config is
 * read with. The legacy `invert` flag is not a field a change can carry. A caller refuses a change
 * with any fault, since nothing here is repaired.
 */
export function parseFixtureConfigPatch(
  raw: unknown,
  path: string,
  report: FixtureFaultReport,
): Partial<FixtureConfig> {
  if (!isPlainObject(raw)) {
    report(`${path}.config must be a plain object`, 'reset')
    return {}
  }
  return readConfigFields(raw, CURRENT_CONFIG_FIELDS, path, report)
}

const STROBE_VALUE_KEYS = ['slow', 'medium', 'fast', 'fastest'] as const

/** The stored strobe values, with each unusable one back at its default. */
function parseStrobeValues(
  raw: unknown,
  path: string,
  report: FixtureFaultReport,
): StrobeChannelValues | undefined {
  if (!isPlainObject(raw)) {
    report(`${path}.strobeValues must be a plain object`, 'reset')
    return undefined
  }
  const values: StrobeChannelValues = { ...DEFAULT_STROBE_CHANNEL_VALUES }
  const bad: string[] = []
  for (const key of STROBE_VALUE_KEYS) {
    const value = raw[key]
    if (isDmxValue(value)) values[key] = value
    else bad.push(key)
  }
  if (bad.length > 0) {
    report(`${path}.strobeValues.${bad.join(', ')} must be an integer between 0 and 255`, 'reset')
  }
  for (const key of Object.keys(raw)) {
    if (!(STROBE_VALUE_KEYS as readonly string[]).includes(key)) {
      report(`${path}.strobeValues.${key} is not a strobe speed`, 'dropped')
    }
  }
  return values
}

function parseExtraChannel(
  raw: unknown,
  path: string,
  report: FixtureFaultReport,
): ExtraChannel | undefined {
  if (!isPlainObject(raw)) {
    report(`${path} must be an object`, 'reset')
    return undefined
  }
  const { type, channel, value, scale } = raw
  if (!isExtraChannelType(type)) {
    report(`${path}.type must be a valid extra-channel type`, 'reset')
    return undefined
  }
  if (!isStoredChannel(channel)) {
    report(
      `${path}.channel must be an integer DMX channel between 0 and ${DMX_CHANNEL_MAX}`,
      'reset',
    )
    return undefined
  }
  const extra: ExtraChannel = { type, channel }
  if (type === 'fixed') {
    if (!isDmxValue(value)) {
      report(`${path}.value must be an integer between 0 and 255 for a fixed channel`, 'reset')
      return undefined
    }
    extra.value = value
    if (scale !== undefined) report(`${path}.scale is not valid on a fixed channel`, 'dropped')
  } else {
    if (value !== undefined) report(`${path}.value is only valid on a fixed channel`, 'dropped')
    if (scale !== undefined && !isValidBrightnessScalePercent(scale)) {
      report(`${path}.scale must be an integer percent between 0 and 100`, 'reset')
    } else if (isStorableBrightnessScale(scale)) {
      extra.scale = scale
    }
  }
  for (const key of Object.keys(raw)) {
    if (!['type', 'channel', 'value', 'scale'].includes(key)) {
      report(`${path}.${key} is not an extra-channel field`, 'dropped')
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
    report(`${path}.brightnessScaling must be a plain object`, 'reset')
    return undefined
  }
  const scaling: BrightnessScaling = {}
  for (const [key, percent] of Object.entries(raw)) {
    if (key !== 'red' && key !== 'green' && key !== 'blue') {
      report(`${path}.brightnessScaling.${key} is not a scalable colour channel`, 'dropped')
    } else if (percent !== undefined && !isValidBrightnessScalePercent(percent)) {
      report(
        `${path}.brightnessScaling.${key} must be an integer percent between 0 and 100`,
        'reset',
      )
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
    report(`${path} must be an object`, 'reset')
    return null
  }
  if (!isFixtureType(raw.fixture)) {
    report(`${path}.fixture '${String(raw.fixture)}' is not a fixture type`, 'reset')
    return null
  }
  const fixtureType = raw.fixture

  // An empty id is a template not yet saved, the same as null.
  let id: string | null = null
  if (typeof raw.id === 'string') id = raw.id === '' ? null : raw.id
  else if (raw.id != null) report(`${path}.id must be a string or null`, 'reset')

  let position = 0
  if (typeof raw.position === 'number' && Number.isFinite(raw.position)) position = raw.position
  else report(`${path}.position must be a number`, 'reset')

  const text = (key: 'label' | 'name'): string => {
    const value = raw[key]
    if (typeof value === 'string') return value
    report(`${path}.${key} must be a string`, 'reset')
    return ''
  }

  let isStrobeEnabled = false
  if (typeof raw.isStrobeEnabled === 'boolean') isStrobeEnabled = raw.isStrobeEnabled
  else report(`${path}.isStrobeEnabled must be true or false`, 'reset')

  const fixture: DmxFixture = {
    id,
    position,
    label: text('label'),
    name: text('name'),
    isStrobeEnabled,
    ...parseChannels(fixtureType, raw.channels, path, report),
  }

  if (typeof raw.group === 'string') fixture.group = raw.group
  else if (raw.group != null) report(`${path}.group must be a string`, 'reset')

  if (typeof raw.universe === 'number' && Number.isFinite(raw.universe)) {
    fixture.universe = raw.universe
  } else if (raw.universe != null) {
    report(`${path}.universe must be a number`, 'reset')
  }

  if (raw.mount === 'floor' || raw.mount === 'ceiling') fixture.mount = raw.mount
  else if (raw.mount != null) report(`${path}.mount must be floor or ceiling`, 'reset')

  if (isPlainObject(raw.config)) fixture.config = parseConfig(raw.config, path, report)
  else if (raw.config != null) report(`${path}.config must be a plain object`, 'reset')

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
    report(`${path}.extraChannels must be an array`, 'reset')
  }

  if (raw.brightnessScaling != null) {
    const scaling = parseBrightnessScaling(raw.brightnessScaling, path, report)
    if (scaling) fixture.brightnessScaling = scaling
  }

  for (const key of Object.keys(raw)) {
    if (!FIXTURE_FIELDS.has(key)) {
      report(`${path}.${key} is not a fixture field`, 'dropped')
    }
  }
  return fixture
}

/** A rig light as it was stored, before a light stored without an id is given one. */
type StoredDmxLight = DmxFixture & { fixtureId: string }

/** Gives a rig light stored without an id its new id. */
type LightIdMint = (stored: StoredDmxLight) => string

const mintRandomLightId = (): string => globalThis.crypto.randomUUID()

/**
 * Mints the new ids for the lights of one lighting config stored without one. A stored light
 * copied into more than one of the config's lists, as the strobe list holds front and back lights,
 * gets one id in all of them. Each list asks for its own mint by name.
 */
export function storedLightIdMint(): (list: string) => LightIdMint {
  const minted: Array<{ stored: StoredDmxLight; id: string; lists: Set<string> }> = []
  return (list) => (stored) => {
    const copy = minted.find((entry) => !entry.lists.has(list) && equal(entry.stored, stored))
    if (copy) {
      copy.lists.add(list)
      return copy.id
    }
    const id = mintRandomLightId()
    minted.push({ stored, id, lists: new Set([list]) })
    return id
  }
}

/**
 * A rig light: a fixture plus the id of the template it came from, and the `unplaced` flag template
 * sync sets. Cues and the publisher find a light by its id, so a light stored without one is
 * reported and given the id `mintId` answers.
 */
export function parseDmxLight(
  raw: unknown,
  path: string,
  report: FixtureFaultReport,
  mintId: LightIdMint = mintRandomLightId,
): DmxLight | null {
  if (!isPlainObject(raw)) {
    report(`${path} must be an object`, 'reset')
    return null
  }
  const { fixtureId, unplaced, ...fields } = raw
  const fixture = parseDmxFixture(fields, path, report)
  if (!fixture) return null
  if (fixture.id === null) {
    report(`${path}.id is missing`, 'reset')
  }
  if (typeof fixtureId !== 'string') {
    report(`${path}.fixtureId must be a string`, 'reset')
  }
  const stored = { ...fixture, fixtureId: typeof fixtureId === 'string' ? fixtureId : '' }
  const light: DmxLight = { ...stored, id: fixture.id ?? mintId(stored) }
  if (unplaced === true) light.unplaced = true
  else if (unplaced != null) report(`${path}.unplaced must be true`, 'dropped')
  return light
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
  mintId?: LightIdMint,
): DmxLight | null {
  return parseDmxLight(migrateStored(raw), path, report, mintId)
}

/** Loads one stored rig light, giving a light stored without an id the id `mintId` answers. */
export type DmxLightLoader = typeof loadDmxLight

/**
 * {@link loadDmxLight} for a rig light whose template, found by its `fixtureId` in `templates`,
 * owns its fixture type and channel layout. A light stored as another fixture type is read as the
 * template's type, so its faults name the channels that type keeps and drops.
 */
export function rigLightLoader(templates: readonly DmxFixture[]): DmxLightLoader {
  return (raw, path, report, mintId) => {
    const stored = migrateStored(raw)
    if (!isPlainObject(stored) || !isFixtureType(stored.fixture)) {
      return parseDmxLight(stored, path, report, mintId)
    }
    const template = templates.find((t) => t.id !== null && t.id === stored.fixtureId)
    if (!template || template.fixture === stored.fixture) {
      return parseDmxLight(stored, path, report, mintId)
    }
    report(
      `${path}.fixture '${stored.fixture}' is now its template's '${template.fixture}'`,
      'reset',
    )
    return parseDmxLight({ ...stored, fixture: template.fixture }, path, report, mintId)
  }
}

/**
 * Parses every entry of a fixture list with `parse`, collecting the faults in `faults`. A list
 * holding a fixture that cannot be parsed fails with that fixture's faults.
 */
export function parseFixtureList<T>(
  raw: readonly unknown[],
  path: string,
  parse: (raw: unknown, path: string, report: FixtureFaultReport) => T | null,
  faults: FixtureFault[],
): { ok: true; value: T[] } | { ok: false; error: string } {
  const value: T[] = []
  for (let i = 0; i < raw.length; i++) {
    const entryFaults: FixtureFault[] = []
    const fixture = parse(raw[i], `${path}[${i}]`, (message, kind) =>
      entryFaults.push({ message, kind }),
    )
    if (!fixture) {
      return { ok: false, error: entryFaults.map((fault) => fault.message).join('; ') }
    }
    faults.push(...entryFaults)
    value.push(fixture)
  }
  return { ok: true, value }
}
