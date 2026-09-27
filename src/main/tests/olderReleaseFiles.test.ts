import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'

let appData = ''
jest.mock('electron', () => ({
  app: {
    getPath: () => appData,
    isPackaged: false,
    getAppPath: () => path.resolve(__dirname, '../../..'),
  },
}))

import { ConfigurationManager } from '../../services/configuration/ConfigurationManager'
import type { ConfigCorruptInfo } from '../../services/configuration/configCorruptTypes'
import { DEFAULT_PREFERENCES } from '../../services/configuration/configurationDefaults'
import type { DmxFixture, LightingConfiguration } from '../../photonics-dmx/types'
import { isPlainObject } from '../../shared/plainObject'
import { copyDefaultData } from '../utils/copyDefaultData'
import { NodeCueLoader } from '../../photonics-dmx/cues/node/loader/NodeCueLoader'
import { EffectLoader } from '../../photonics-dmx/cues/node/loader/EffectLoader'
import { CueRegistry } from '../../photonics-dmx/cues/registries/CueRegistry'
import { AudioCueRegistry } from '../../photonics-dmx/cues/registries/AudioCueRegistry'
import { noopRuntimeBroadcaster } from '../../photonics-dmx/runtime/broadcaster'

// The cases boot a release's files, some with the whole bundled library, from disk.
jest.setTimeout(20_000)

const HISTORICAL = path.join(__dirname, '../../photonics-dmx/tests/historical')

interface CorpusFile {
  /** Where the file is kept, relative to the historical folder. */
  file: string
  /** Where the build left it, relative to its app data folder. */
  to: string
  /** Seeded by that build's copyDefaultData, which marks the copy as bundled. */
  bundled?: boolean
  source: string
}

interface CorpusSet {
  id: string
  releases: string[]
  files: CorpusFile[]
}

const { sets } = JSON.parse(fs.readFileSync(path.join(HISTORICAL, 'manifest.json'), 'utf-8')) as {
  sets: CorpusSet[]
}

const isNodeData = (file: CorpusFile): boolean => file.to.startsWith('node-data/')

/** What loading a set reports and holds, keyed by set id. A set with no entry reports nothing. */
interface Expected {
  /**
   * Settings the load does not keep as the file stores them, by their path in {@link SETTINGS}.
   * Every other setting is the stored one, or its default where the file has none.
   */
  settings?: Record<string, unknown>
  /** The fixture templates, layout and rigs as loaded, one line per fixture. */
  fixtures?: LoadedFixtures
  /** Settings file repairs, as `<file>: <reason>: <message>`. */
  config?: string[]
  /** Migration notes from the cue files, as `<file>: <note>`. */
  cues?: string[]
  /** Migration notes from the effect files, as `<file>: <note>`. */
  effects?: string[]
  /** Files that do not load at all, as the loader reports them. */
  refused?: string[]
  /** Seeded files this build does not ship, which startup sets aside. */
  retired?: string[]
}

/** The settings a user sets, by their path in prefs.json. */
const SETTINGS = [
  'dmxOutputConfig',
  'sacnConfig',
  'artNetConfig',
  'enttecProConfig',
  'openDmxConfig',
  'brightness',
  'clockRate',
  'globalDmxPublishingRateHz',
  'cueConsistencyWindow',
  'stageKitPrefs.yargPriority',
  'rb3Prefs.processingMode',
  'cueDomains.yarg.enabledGroups',
  'cueDomains.yarg.selectionMode',
  'cueDomains.audio.enabledGroups',
  'cueDomains.yargMotion.enabledGroups',
  'cueDomains.yargMotion.probabilityPercent',
  'cueDomains.audioMotion.probabilityPercent',
] as const

const valueAt = (data: unknown, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>((value, key) => (isPlainObject(value) ? value[key] : undefined), data)

/** Where the prefs of builds before v4 stored a setting. */
const STORED_BEFORE_V4: Record<string, string> = {
  'cueDomains.yarg.enabledGroups': 'enabledCueGroups',
  'cueDomains.yarg.selectionMode': 'cueGroupSelectionMode',
  'cueDomains.audio.enabledGroups': 'enabledAudioCueGroups',
}

/** The settings a prefs file holds, with a field it lacks at its default. */
function settingsOf(prefs: unknown): Record<string, unknown> {
  return Object.fromEntries(
    SETTINGS.map((path) => {
      const older = STORED_BEFORE_V4[path]
      const value = valueAt(prefs, path) ?? (older ? valueAt(prefs, older) : undefined)
      const fallback = valueAt(DEFAULT_PREFERENCES, path)
      if (isPlainObject(value) && isPlainObject(fallback)) return [path, { ...fallback, ...value }]
      return [path, value ?? fallback]
    }),
  )
}

/** A settings file's content, inside the version envelope when it has one. */
function storedData(file: CorpusFile): unknown {
  const stored: unknown = JSON.parse(fs.readFileSync(path.join(HISTORICAL, file.file), 'utf-8'))
  return isPlainObject(stored) && 'data' in stored ? stored.data : stored
}

/** Settings whose defaults changed in v5, which the load of an older prefs file puts at them. */
const v5Defaults = {
  'cueConsistencyWindow': 10000,
  'stageKitPrefs.yargPriority': 'random',
  'cueDomains.yargMotion.probabilityPercent': 50,
  'cueDomains.audioMotion.probabilityPercent': 50,
}

const noKind = (file: string): string =>
  `${file}: Cues stored with no kind now read as lighting cues.`

const harmonyEasing = "yarg-alt1.json: Unknown easing 'sin-out' in 'Harmony' now reads sinInOut."

/** The note of a Dischord raiser that passed a light array where its effect takes group names. */
const dischordGroupsIn = (file: string): string =>
  `${file}: A light array passed where an effect takes group names now passes the names of its groups: 'Dischord' raiser 'y1-dischord-blue' lights is now 'front,back'.`
const dischordGroups = dischordGroupsIn('yarg-alt1.json')

/**
 * A dedicated strobe row the layout editor gave the channels of an RGB template. The layout reads
 * it as a strobe light, and the rig as its template's RGB light.
 */
const strobeRowRepairs = {
  layout: (withoutStrobeChannel: boolean): string[] => [
    ...(withoutStrobeChannel
      ? ['lightsLayout.json: repaired: strobeLights[0].channels.strobeChannel is missing']
      : []),
    `lightsLayout.json: keysDropped: ${['red', 'green', 'blue']
      .map((channel) => `strobeLights[0].channels.${channel} is not a channel of a strobe fixture`)
      .join(', ')}`,
  ],
  rig: "dmxRigs.json: repaired: rigs[0].config.strobeLights[0].fixture 'strobe' is now its template's 'rgb'",
}

const PAR = 'PAR: rgb masterDimmer=1 red=2 green=3 blue=4'
const STROBE = 'Strobe: strobe masterDimmer=1 strobeChannel=2'
const templatesToV055 = [
  PAR,
  'Spot: rgb/mh masterDimmer=1 red=2 green=3 blue=4 pan=6 tilt=7 +white=5',
  STROBE,
]
const templatesFromV062 = [
  PAR,
  'Spot: rgb/mh masterDimmer=1 red=2 green=3 blue=4 pan=5 tilt=6',
  STROBE,
  'PAR S: rgb masterDimmer=1 red=2 green=3 blue=4 strobeChannel=5',
]

/**
 * The layout editor of builds up to v0.4.2 gave each light its template's channels, whatever its
 * master. The layout keeps them, and the rig places them from the master.
 */
const layoutToV042 = [
  'front[0] rgb masterDimmer=1 red=2 green=3 blue=4',
  'front[1] rgb/mh masterDimmer=11 red=2 green=3 blue=4 pan=6 tilt=7 +white=5',
  'back[0] rgb masterDimmer=21 red=2 green=3 blue=4',
]
const rigToV042 = [
  'front[0] rgb masterDimmer=1 red=2 green=3 blue=4',
  'front[1] rgb/mh masterDimmer=11 red=12 green=13 blue=14 pan=16 tilt=17 +white=15',
  'back[0] rgb masterDimmer=21 red=22 green=23 blue=24',
]
const lightsFromV062 = [
  'front[0] rgb masterDimmer=1 red=2 green=3 blue=4',
  'front[1] rgb/mh masterDimmer=11 red=12 green=13 blue=14 pan=15 tilt=16',
  'back[0] strobe masterDimmer=21 strobeChannel=22',
]

/** The strobe row of {@link strobeRowRepairs}, with its RGB on the channels its master places. */
const strobeRow = {
  layout: 'strobe[0] strobe masterDimmer=31 strobeChannel=0',
  rig: 'strobe[0] rgb masterDimmer=31 red=32 green=33 blue=34',
}

/**
 * The PAR template with its master set to 0, and its rig light, which the template leaves unplaced
 * with every template channel at 0.
 */
const parWithNoMaster = {
  template: 'PAR: rgb masterDimmer=0 red=2 green=3 blue=4',
  rig: 'front[0] rgb masterDimmer=1 red=0 green=0 blue=0',
}

const NO_FIXTURES: LoadedFixtures = { templates: [], layout: [], rigs: {} }

const EXPECTED: Record<string, Expected> = {
  'v0.0.22-alpha.1-fix': {
    fixtures: {
      templates: templatesToV055,
      layout: layoutToV042,
      rigs: { 'Default Rig': rigToV042 },
    },
  },
  'v0.0.33-Alpha2': {
    settings: v5Defaults,
    fixtures: {
      templates: templatesToV055,
      layout: [...layoutToV042, strobeRow.layout],
      rigs: { 'Default Rig': [...rigToV042, strobeRow.rig] },
    },
    config: strobeRowRepairs.layout(true),
  },
  'v0.0.35-Alpha3': {
    settings: v5Defaults,
    fixtures: {
      templates: templatesToV055,
      layout: layoutToV042,
      rigs: { 'Default Rig': rigToV042 },
    },
  },
  'v0.4.2': {
    settings: v5Defaults,
    fixtures: {
      templates: templatesToV055,
      layout: [...layoutToV042, strobeRow.layout],
      rigs: { Stage: [...rigToV042, strobeRow.rig] },
    },
    config: [...strobeRowRepairs.layout(true), strobeRowRepairs.rig],
    cues: [
      noKind('yarg-alt1.json'),
      harmonyEasing,
      noKind('yarg-stagekit.json'),
      "yarg-stagekit.json: A wait count below one on a wait with no condition in 'Default', 'Stomp' is dropped.",
      noKind('audio-70s-light-organs.json'),
      noKind('audio-disco.json'),
      noKind('audio-rock.json'),
      noKind('audio-stagekit.json'),
    ],
  },
  'v0.5.5-alpha.5': {
    settings: v5Defaults,
    fixtures: {
      templates: templatesToV055,
      layout: [
        'front[0] rgb masterDimmer=1 red=2 green=3 blue=4',
        'front[1] rgb/mh masterDimmer=11 red=12 green=13 blue=14 pan=16 tilt=17 +white=15',
        'back[0] strobe masterDimmer=21 strobeChannel=22',
      ],
      rigs: {
        Stage: [
          'front[0] rgb masterDimmer=1 red=2 green=3 blue=4',
          'front[1] rgb/mh masterDimmer=11 red=12 green=13 blue=14 pan=16 tilt=17 +white=15',
          'back[0] strobe masterDimmer=21 strobeChannel=22',
        ],
      },
    },
    cues: [harmonyEasing],
    retired: ['audio-motion-fast.json', 'yarg-motion-fast.json'],
  },
  'v0.6.1-alpha.6': {
    cues: [harmonyEasing, dischordGroups],
    // Seeded by these builds and shipped by none since, so startup retires it. Its action waits on
    // 'audio-trigger', which this build does not read as a wait condition.
    refused: [
      "tests.json: No audio cue in the group compiled. audio cue 'custom-audio-cue': Action 'action-fe655c4d-85a9-4321-ae5c-53a7f125c434' timing.waitForCondition 'audio-trigger' is not a known wait condition.",
    ],
    retired: ['audio-motion-fast.json', 'tests.json'],
  },
  'v0.6.2-alpha.6': {
    fixtures: {
      templates: templatesFromV062,
      layout: [...lightsFromV062, 'strobe[0] strobe masterDimmer=31 strobeChannel=35'],
      rigs: { Stage: [...lightsFromV062, `${strobeRow.rig} strobeChannel=35`] },
    },
    retired: ['audio-motion-fast.json'],
    config: [...strobeRowRepairs.layout(false), strobeRowRepairs.rig],
    cues: [harmonyEasing, dischordGroups],
  },
  'v0.6.2-alpha.6-user': {
    cues: [harmonyEasing, dischordGroups],
    retired: ['audio-motion-fast.json'],
  },
  'v0.7.0-alpha.7': {
    // The v7 prefs upgrade moves every install onto RB3 cue mode.
    settings: { 'rb3Prefs.processingMode': 'cue' },
    fixtures: {
      templates: templatesFromV062,
      layout: lightsFromV062,
      rigs: { Stage: lightsFromV062 },
    },
    cues: [harmonyEasing, dischordGroups],
  },
  'v0.7.0-alpha.7-user': {
    settings: { 'rb3Prefs.processingMode': 'cue' },
    fixtures: {
      templates: [parWithNoMaster.template, ...templatesFromV062.slice(1)],
      layout: lightsFromV062,
      rigs: { Stage: [parWithNoMaster.rig, ...lightsFromV062.slice(1)] },
    },
    cues: [
      "my-alt1.json: Unknown easing 'sin-out' in 'Harmony' now reads sinInOut.",
      dischordGroupsIn('my-alt1.json'),
      harmonyEasing,
      dischordGroups,
    ],
  },
  'f3f851db': {
    fixtures: {
      ...NO_FIXTURES,
      rigs: {
        Main: [1, 11, 21, 31, 41, 51].map(
          (master, i) =>
            `front[${i}] rgb masterDimmer=${master} red=${master + 1} green=${master + 2} blue=${master + 3}`,
        ),
      },
    },
    effects: [
      "my-effects.json: Variable names must use letters, digits and underscores: 'beat-count' is now 'beat_count'.",
    ],
  },
}

interface LoadedFixtures {
  templates: string[]
  layout: string[]
  /** Keyed by rig name. */
  rigs: Record<string, string[]>
}

const CHANNEL_ORDER = ['masterDimmer', 'red', 'green', 'blue', 'pan', 'tilt', 'strobeChannel']

/** A fixture as `<type> <channel>=<n> ...`, then its added channels as `+<type>=<n>`. */
function describeFixture(fixture: DmxFixture): string {
  const channels = Object.entries(fixture.channels)
    .sort(([a], [b]) => CHANNEL_ORDER.indexOf(a) - CHANNEL_ORDER.indexOf(b))
    .map(([name, channel]) => `${name}=${channel}`)
  const extras = (fixture.extraChannels ?? []).map((extra) => `+${extra.type}=${extra.channel}`)
  return [fixture.fixture, ...channels, ...extras].join(' ')
}

const describeRows = (config: LightingConfiguration): string[] =>
  (['front', 'back', 'strobe'] as const).flatMap((row) =>
    config[`${row}Lights`].map((light, i) => `${row}[${i}] ${describeFixture(light)}`),
  )

function loadedFixtures(manager: ConfigurationManager): LoadedFixtures {
  return {
    templates: manager.getUserLights().map((t) => `${t.name}: ${describeFixture(t)}`),
    layout: describeRows(manager.getLightingLayout()),
    rigs: Object.fromEntries(
      manager.getDmxRigs().map((rig) => [rig.name, describeRows(rig.config)]),
    ),
  }
}

/** Writes a set's files where the build that wrote them left them. */
function seed(dir: string, set: CorpusSet, include: (file: CorpusFile) => boolean): void {
  for (const file of set.files.filter(include)) {
    const dest = path.join(dir, file.to)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    const text = fs.readFileSync(path.join(HISTORICAL, file.file), 'utf-8')
    if (file.bundled) {
      const data = JSON.parse(text) as Record<string, unknown>
      if (data.bundled !== true) data.bundled = true
      fs.writeFileSync(dest, JSON.stringify(data, null, 2))
    } else {
      fs.writeFileSync(dest, text)
    }
  }
}

/** Every file under `dir` that a load set aside or copied out of the way. */
function setAside(dir: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, encoding: 'utf-8' })
    .filter((name) => /\.(corrupt|repaired)-/.test(name))
}

/** The files under `dir` that startup retired, by the name they had. */
function retired(dir: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, encoding: 'utf-8' })
    .filter((name) => name.includes('.retired-'))
    .map((name) => path.basename(name).replace(/\.retired-.*$/, ''))
    .sort()
}

/** Waits for the settings files' background saves, which leave a temp file while in flight. */
async function settledWrites(dir: string): Promise<void> {
  for (let quiet = 0, i = 0; quiet < 3 && i < 200; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10))
    const pending = fs.readdirSync(dir).some((name) => name.includes('.tmp.'))
    quiet = pending ? 0 : quiet + 1
  }
}

const describeReport = (r: ConfigCorruptInfo): string => `${r.fileName}: ${r.reason}: ${r.message}`

interface LoadOutcome {
  /** Files that did not load, one entry each. */
  errors: string[]
  migrations: { cues: string[]; effects: string[] }
  /** Compile errors in files that loaded, keyed by file name. */
  fileErrors: Record<string, string[]>
  /** Each cue file that loaded, as `<file>: <group id>, <n> cues`. */
  cueFiles: string[]
}

async function loadNodeFiles(baseDir: string): Promise<LoadOutcome> {
  AudioCueRegistry.getInstance().reset()
  const effectLoader = new EffectLoader({ baseDir })
  const loader = new NodeCueLoader({
    baseDir,
    registries: {
      yarg: CueRegistry.create(),
      rb3: CueRegistry.create(),
      audio: AudioCueRegistry.getInstance(),
    },
    effectLoader,
    runtimeBroadcaster: noopRuntimeBroadcaster(),
  })
  try {
    const effects = await effectLoader.loadAll()
    const cues = await loader.loadAll()
    const errors = [...effects.errors, ...cues.errors]
    const refused = new Set(errors.map((error) => error.slice(0, error.indexOf(': '))))
    const fileErrors: Record<string, string[]> = {}
    const summaries = [
      ...Object.values(effectLoader.getSummary()).flat(),
      ...Object.values(loader.getSummary()).flat(),
    ]
    for (const summary of summaries) {
      const name = path.basename(summary.path)
      if (summary.errors && !refused.has(name)) fileErrors[name] = summary.errors
    }
    const cueFiles = Object.values(loader.getSummary())
      .flat()
      .map((s) => `${path.basename(s.path)}: ${s.groupId}, ${s.cueCount} cues`)
    return {
      errors,
      migrations: { cues: cues.migrations, effects: effects.migrations },
      fileErrors,
      cueFiles: cueFiles.sort(),
    }
  } finally {
    await loader.dispose()
    await effectLoader.dispose()
    AudioCueRegistry.getInstance().reset()
  }
}

/** The set's cue files as the build that wrote them stored them, with no cue from a refused one. */
const storedCueFiles = (set: CorpusSet, refused: string[]): string[] =>
  set.files
    .filter((file) => file.to.startsWith('node-data/cues/'))
    .map((file) => {
      const name = path.basename(file.to)
      const data = JSON.parse(fs.readFileSync(path.join(HISTORICAL, file.file), 'utf-8')) as {
        group: { id: string }
        cues: unknown[]
      }
      const loads = !refused.some((error) => error.startsWith(`${name}: `))
      return `${name}: ${data.group.id}, ${loads ? data.cues.length : 0} cues`
    })
    .sort()

/** Makes an empty app data folder for the mocked electron app, returning its Photonics folder. */
function freshAppData(): string {
  for (const level of ['log', 'info', 'warn', 'error'] as const) {
    jest.spyOn(console, level).mockImplementation(() => {})
  }
  appData = fs.mkdtempSync(path.join(os.tmpdir(), 'older-release-files-'))
  const baseDir = path.join(appData, 'Photonics.rocks')
  fs.mkdirSync(baseDir, { recursive: true })
  return baseDir
}

async function removeAppData(baseDir: string): Promise<void> {
  await settledWrites(baseDir)
  fs.rmSync(appData, { recursive: true, force: true })
  jest.restoreAllMocks()
}

describe.each(sets.map((set) => [set.id, set] as const))('files the %s build wrote', (_id, set) => {
  const expected = EXPECTED[set.id] ?? {}
  let baseDir: string

  beforeEach(() => {
    baseDir = freshAppData()
  })

  afterEach(async () => {
    await removeAppData(baseDir)
  })

  it('boots on its settings files, reporting only the listed migrations once', async () => {
    seed(baseDir, set, (file) => !isNodeData(file))

    const first = new ConfigurationManager().drainConfigCorruptRecovery()
    await settledWrites(baseDir)
    const second = new ConfigurationManager().drainConfigCorruptRecovery()

    expect(first.map(describeReport)).toEqual(expected.config ?? [])
    expect(second.map(describeReport)).toEqual([])
    expect(setAside(baseDir)).toEqual([])
  })

  it('loads the settings and fixtures its files hold, and the same again once saved', async () => {
    seed(baseDir, set, (file) => !isNodeData(file))
    const prefsFile = set.files.find((file) => file.to === 'prefs.json')

    const manager = new ConfigurationManager()
    await settledWrites(baseDir)
    const reloaded = new ConfigurationManager()

    const settings = {
      ...settingsOf(prefsFile ? storedData(prefsFile) : {}),
      ...expected.settings,
    }
    expect(settingsOf(manager.getAllPreferences())).toEqual(settings)
    expect(loadedFixtures(manager)).toEqual(expected.fixtures ?? NO_FIXTURES)
    expect(settingsOf(reloaded.getAllPreferences())).toEqual(settings)
    expect(loadedFixtures(reloaded)).toEqual(expected.fixtures ?? NO_FIXTURES)
  })

  it('loads every cue and effect file it left, with every cue compiling', async () => {
    seed(baseDir, set, isNodeData)

    const outcome = await loadNodeFiles(baseDir)

    expect(outcome.errors).toEqual(expected.refused ?? [])
    expect(outcome.fileErrors).toEqual({})
    expect(outcome.cueFiles).toEqual(storedCueFiles(set, expected.refused ?? []))
    expect(outcome.migrations.cues).toEqual(expected.cues ?? [])
    expect(outcome.migrations.effects).toEqual(expected.effects ?? [])
    expect(setAside(baseDir)).toEqual([])
  })

  it('starts up on its app data with this build seeding its defaults over it', async () => {
    seed(baseDir, set, () => true)

    new ConfigurationManager().drainConfigCorruptRecovery()
    await copyDefaultData('', baseDir)
    const outcome = await loadNodeFiles(baseDir)

    expect(outcome.errors).toEqual([])
    expect(outcome.fileErrors).toEqual({})
    expect(setAside(baseDir)).toEqual([])
    expect(retired(baseDir)).toEqual(expected.retired ?? [])
  })
})

function corpusSet(id: string): CorpusSet {
  const set = sets.find((candidate) => candidate.id === id)
  if (!set) throw new Error(`No corpus set ${id}`)
  return set
}

/** The bytes the corpus holds for the file `set` left at `to`. */
function corpusText(set: CorpusSet, to: string): string {
  const file = set.files.find((candidate) => candidate.to === to)
  if (!file) throw new Error(`${set.id} leaves nothing at ${to}`)
  return fs.readFileSync(path.join(HISTORICAL, file.file), 'utf-8')
}

/** The copies startup kept beside `file`, named without the time they were kept. */
function keptBeside(file: string): { name: string; text: string }[] {
  const dir = path.dirname(file)
  return fs
    .readdirSync(dir)
    .filter((name) => name.startsWith(`${path.basename(file)}.`))
    .map((name) => ({
      name: name.replace(/-\d{4}-\d\d-\d\dT[\d-]+Z$/, ''),
      text: fs.readFileSync(path.join(dir, name), 'utf-8'),
    }))
}

describe('the files a user saved through the v0.7.0-alpha.7 build', () => {
  const set = corpusSet('v0.7.0-alpha.7-user')
  let baseDir: string

  beforeEach(() => {
    baseDir = freshAppData()
  })

  afterEach(async () => {
    await removeAppData(baseDir)
  })

  it('replaces the edited shipped library with the newer shipped one, keeping the edit beside it', async () => {
    seed(baseDir, set, () => true)
    const alt1 = 'node-data/cues/yarg/yarg-alt1.json'

    new ConfigurationManager().drainConfigCorruptRecovery()
    await copyDefaultData('', baseDir)
    const outcome = await loadNodeFiles(baseDir)

    const shipped = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../../resources/defaults', alt1), 'utf-8'),
    ) as { cues: unknown[] }
    const onDisk: unknown = JSON.parse(fs.readFileSync(path.join(baseDir, alt1), 'utf-8'))
    expect(onDisk).toEqual({ ...shipped, bundled: true })
    expect(keptBeside(path.join(baseDir, alt1))).toEqual([
      { name: 'yarg-alt1.json.v2', text: corpusText(set, alt1) },
    ])
    expect(outcome.cueFiles).toContain(`yarg-alt1.json: yarg-alt1, ${shipped.cues.length} cues`)
  })

  it("keeps the imported library as the user's, under its own group id", async () => {
    seed(baseDir, set, () => true)
    const myAlt1 = 'node-data/cues/yarg/my-alt1.json'

    new ConfigurationManager().drainConfigCorruptRecovery()
    await copyDefaultData('', baseDir)
    const outcome = await loadNodeFiles(baseDir)

    const onDisk: unknown = JSON.parse(fs.readFileSync(path.join(baseDir, myAlt1), 'utf-8'))
    expect(onDisk).not.toHaveProperty('bundled')
    expect(outcome.cueFiles).toContain('my-alt1.json: my-alt1, 24 cues')
  })

  it('leaves the rig light of a template whose master is 0 unplaced, with each template channel at 0', () => {
    seed(baseDir, set, (file) => !isNodeData(file))

    const par = new ConfigurationManager().getDmxRigs()[0].config.frontLights[0]

    expect(par.channels).toEqual({ masterDimmer: 1, red: 0, green: 0, blue: 0 })
    expect(par.unplaced).toBe(true)
  })
})

describe('the files a user saved through the v0.6.2-alpha.6 build', () => {
  const set = corpusSet('v0.6.2-alpha.6-user')
  let baseDir: string

  beforeEach(() => {
    baseDir = freshAppData()
  })

  afterEach(async () => {
    await removeAppData(baseDir)
  })

  it('retires the edited Fast motion library this build does not ship, keeping the edit', async () => {
    seed(baseDir, set, () => true)
    const fast = 'node-data/cues/audio/audio-motion-fast.json'

    await copyDefaultData('', baseDir)

    expect(fs.existsSync(path.join(baseDir, fast))).toBe(false)
    expect(keptBeside(path.join(baseDir, fast))).toEqual([
      { name: 'audio-motion-fast.json.retired', text: corpusText(set, fast) },
    ])
  })
})
