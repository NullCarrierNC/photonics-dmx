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
import { copyDefaultData } from '../utils/copyDefaultData'
import { NodeCueLoader } from '../../photonics-dmx/cues/node/loader/NodeCueLoader'
import { EffectLoader } from '../../photonics-dmx/cues/node/loader/EffectLoader'
import { CueRegistry } from '../../photonics-dmx/cues/registries/CueRegistry'
import { AudioCueRegistry } from '../../photonics-dmx/cues/registries/AudioCueRegistry'
import { noopRuntimeBroadcaster } from '../../photonics-dmx/runtime/broadcaster'

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

/** What loading a set reports, keyed by set id. A set with no entry reports nothing. */
interface Expected {
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

const noKind = (file: string): string =>
  `${file}: Cues stored with no kind now read as lighting cues.`

const harmonyEasing = "yarg-alt1.json: Unknown easing 'sin-out' in 'Harmony' now reads sinInOut."

/** A dedicated strobe row the layout editor gave the channels of an RGB template. */
const strobeRowRepairs = (at: string, withoutStrobeChannel: boolean): string[] => [
  ...(withoutStrobeChannel ? [`repaired: ${at}.channels.strobeChannel is missing`] : []),
  `keysDropped: ${['red', 'green', 'blue']
    .map((channel) => `${at}.channels.${channel} is not a channel of a strobe fixture`)
    .join(', ')}`,
]

const inLayout = (reports: string[]): string[] =>
  reports.map((report) => `lightsLayout.json: ${report}`)
const inRigs = (reports: string[]): string[] => reports.map((report) => `dmxRigs.json: ${report}`)

const EXPECTED: Record<string, Expected> = {
  'v0.0.33-Alpha2': {
    config: inLayout(strobeRowRepairs('strobeLights[0]', true)),
  },
  'v0.4.2': {
    config: [
      ...inLayout(strobeRowRepairs('strobeLights[0]', true)),
      ...inRigs(strobeRowRepairs('rigs[0].config.strobeLights[0]', true)),
    ],
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
    cues: [harmonyEasing],
    retired: ['audio-motion-fast.json', 'yarg-motion-fast.json'],
  },
  'v0.6.1-alpha.6': {
    cues: [harmonyEasing],
    // Seeded by these builds and shipped by none since, so startup retires it. Its action waits on
    // 'audio-trigger', which this build does not read as a wait condition.
    refused: [
      "tests.json: No audio cue in the group compiled. audio cue 'custom-audio-cue': Action 'action-fe655c4d-85a9-4321-ae5c-53a7f125c434' timing.waitForCondition 'audio-trigger' is not a known wait condition.",
    ],
    retired: ['audio-motion-fast.json', 'tests.json'],
  },
  'v0.6.2-alpha.6': {
    retired: ['audio-motion-fast.json'],
    config: [
      ...inLayout(strobeRowRepairs('strobeLights[0]', false)),
      ...inRigs(strobeRowRepairs('rigs[0].config.strobeLights[0]', false)),
    ],
    cues: [harmonyEasing],
  },
  'v0.7.0-alpha.7': { cues: [harmonyEasing] },
  'f3f851db': {
    effects: [
      "my-effects.json: Variable names must use letters, digits and underscores: 'beat-count' is now 'beat_count'.",
    ],
  },
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
  cueCount: number
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
    const cueCount = Object.values(loader.getSummary())
      .flat()
      .reduce((n, s) => n + s.cueCount, 0)
    return {
      errors,
      migrations: { cues: cues.migrations, effects: effects.migrations },
      fileErrors,
      cueCount,
    }
  } finally {
    await loader.dispose()
    await effectLoader.dispose()
    AudioCueRegistry.getInstance().reset()
  }
}

/** Cues in the set's cue files that load, as the build that wrote them stored them. */
const storedCueCount = (set: CorpusSet, refused: string[]): number =>
  set.files
    .filter((file) => file.to.startsWith('node-data/cues/'))
    .filter((file) => !refused.some((error) => error.startsWith(`${path.basename(file.to)}: `)))
    .reduce((n, file) => {
      const data = JSON.parse(fs.readFileSync(path.join(HISTORICAL, file.file), 'utf-8')) as {
        cues: unknown[]
      }
      return n + data.cues.length
    }, 0)

describe.each(sets.map((set) => [set.id, set] as const))('files the %s build wrote', (_id, set) => {
  const expected = EXPECTED[set.id] ?? {}
  let tmp: string
  let baseDir: string

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'info').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'older-release-files-'))
    appData = tmp
    baseDir = path.join(tmp, 'Photonics.rocks')
    fs.mkdirSync(baseDir, { recursive: true })
  })

  afterEach(async () => {
    await settledWrites(baseDir)
    fs.rmSync(tmp, { recursive: true, force: true })
    jest.restoreAllMocks()
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

  it('loads every cue and effect file it left, with every cue compiling', async () => {
    seed(baseDir, set, isNodeData)

    const outcome = await loadNodeFiles(baseDir)

    expect(outcome.errors).toEqual(expected.refused ?? [])
    expect(outcome.fileErrors).toEqual({})
    expect(outcome.cueCount).toBe(storedCueCount(set, expected.refused ?? []))
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
