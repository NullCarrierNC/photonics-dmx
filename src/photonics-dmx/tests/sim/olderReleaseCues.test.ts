import { createHash } from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { beforeAll, describe, expect, it, jest } from '@jest/globals'
import type { SimDomain, SimTimeline } from '../../sim/types'

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  SETTINGS,
  SCENARIOS,
  seededRandom,
  cuesInLibrary,
  reduceTimeline,
  fingerprintOf,
} = require('../../../../tools/cueSimCore.cjs')
/* eslint-enable @typescript-eslint/no-require-imports */

// Each set runs every cue it holds through a fresh simulator.
jest.setTimeout(120000)

const HISTORICAL = path.join(__dirname, '../historical')

interface CorpusFile {
  file: string
  to: string
}

interface CorpusSet {
  id: string
  files: CorpusFile[]
}

interface SimCue {
  key: string
  domain: SimDomain
  library: string
  cue: string
}

const { sets } = JSON.parse(fs.readFileSync(path.join(HISTORICAL, 'manifest.json'), 'utf-8')) as {
  sets: CorpusSet[]
}

/** Cues that light nothing through the fixed run by design, keyed by `<library> <cue>`. */
const DARK_BY_DESIGN = new Set([
  // Lights only when it follows Dischord, Intro or Stomp.
  'yarg-stagekit Silhouettes_Spotlight',
])

/** Cue libraries that do not load, keyed by set id. */
const UNLOADED: Record<string, string[]> = {
  // Its one audio cue waits on a condition this build does not know.
  'v0.6.1-alpha.6': ['audio tests'],
}

/**
 * A digest of each corpus cue file's seeded timelines, keyed by its corpus path. A change that
 * moves how an older file plays moves its digest, and the new digest goes here in the same commit.
 */
const TIMELINES: Record<string, string> = {
  'v0.4.0/audio-70s-light-organs.json': 'a87b11511f4a',
  'v0.4.0/audio-disco.json': '5e9e85426417',
  'v0.4.0/audio-rock.json': '6bced6fe2f5f',
  'v0.4.0/audio-stagekit.json': '1ea01cc60d19',
  'v0.4.0/yarg-alt1.json': '0bf0acebc9f3',
  'v0.4.0/yarg-stagekit.json': '2f48444cebd6',
  'v0.5.5-alpha.5/audio-70s-light-organs.json': '0780e26125bf',
  'v0.5.5-alpha.5/audio-disco.json': '5e9e85426417',
  'v0.5.5-alpha.5/audio-rock.json': '6bced6fe2f5f',
  'v0.5.5-alpha.5/audio-stagekit.json': 'd8a41054b301',
  'v0.5.5-alpha.5/yarg-alt1.json': '0bf0acebc9f3',
  'v0.5.5-alpha.5/yarg-stagekit.json': 'c70b50194385',
  'v0.6.0-alpha.6/audio-70s-light-organs.json': '59a0ee9ca7ec',
  'v0.6.0-alpha.6/audio-disco.json': '794418f4c111',
  'v0.6.0-alpha.6/audio-rock.json': '10c21c4f2d21',
  'v0.6.0-alpha.6/stage-kit-alt-1.json': '3d92a447ced3',
  'v0.6.0-alpha.6/yarg-alt1.json': '80d9879e2e76',
  'v0.6.0-alpha.6/yarg-fade.json': '0446adc34e8e',
  'v0.6.0-alpha.6/yarg-stagekit.json': '85a18d44c151',
  'v0.6.2-alpha.6/audio-stagekit.json': '003933d6d68e',
  'v0.7.0-alpha.7/audio-stagekit.json': '003933d6d68e',
  'v0.7.0-alpha.7/rb3-bloom.json': '55a7c89e3491',
  'v0.7.0-alpha.7/rb3-glow.json': '190cf9e9fc23',
  'v0.7.0-alpha.7/rb3-mirror-blended.json': '9d4c79a26f65',
  'v0.7.0-alpha.7/rb3-mirror.json': '7b06ce890da4',
  'v0.7.0-alpha.7/rb3-stagekit-reversed.json': '302d47fbd87f',
  'v0.7.0-alpha.7/rb3-stagekit-wash.json': 'a29adbba813a',
  'v0.7.0-alpha.7/rb3-stagekit.json': '7b33efbeafc4',
  'v0.7.0-alpha.7/rb3-trail.json': '9072b861f165',
  'v0.7.0-alpha.7/stage-kit-alt-1.json': '3d92a447ced3',
  'v0.7.0-alpha.7/yarg-alt1.json': '80d9879e2e76',
  'v0.7.0-alpha.7/yarg-fade.json': '0446adc34e8e',
  'v0.7.0-alpha.7/yarg-stagekit.json': '85a18d44c151',
  'v0.7.0-alpha.7-user/my-alt1.json': 'f34cdffd85fd',
  'v0.7.0-alpha.7-user/yarg-alt1.json': 'af58e37297a0',
}

/** The cue files each set holds, each distinct file under the first set that holds it. */
function firstSetOfEachCueFile(): Array<[string, CorpusSet, CorpusFile[]]> {
  const seen = new Set<string>()
  return sets.flatMap((set): Array<[string, CorpusSet, CorpusFile[]]> => {
    const files = set.files.filter((file) => {
      if (!file.to.startsWith('node-data/cues/')) return false
      const text = fs.readFileSync(path.join(HISTORICAL, file.file), 'utf-8')
      if (seen.has(text)) return false
      seen.add(text)
      return true
    })
    return files.length > 0 ? [[set.id, set, files]] : []
  })
}

/** A data folder holding one cue file and the effect files of the set that left it. */
function seedCueFile(set: CorpusSet, cueFile: CorpusFile): string {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'older-release-cues-'))
  const effects = set.files.filter((entry) => entry.to.startsWith('node-data/effects/'))
  for (const file of [...effects, cueFile]) {
    const dest = path.join(baseDir, file.to)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(path.join(HISTORICAL, file.file), dest)
  }
  return baseDir
}

function cuesOf(file: CorpusFile): SimCue[] {
  const domain = file.to.split('/')[2] as SimDomain
  const library: unknown = JSON.parse(fs.readFileSync(path.join(HISTORICAL, file.file), 'utf-8'))
  return cuesInLibrary(domain, path.basename(file.to), library)
}

/** A light is lit when it shows some colour at some intensity. */
const lightsSomething = (timeline: SimTimeline): boolean =>
  timeline.samples.some((sample) =>
    Object.values(sample.lights).some(
      (light) =>
        light !== null &&
        light.intensity > 0 &&
        light.opacity > 0 &&
        light.red + light.green + light.blue > 0,
    ),
  )

interface Outcome {
  unloaded: string[]
  dark: string[]
  unknown: string[]
  /** A digest of each file's cue timelines, keyed by its corpus path. */
  timelines: Record<string, string>
}

/**
 * Runs each cue of the set's files through the simulator the cue-sim check uses, sampling every
 * frame, with each file loaded beside the set's effect files. Modules load fresh for each set, so
 * each set's unknown values are reported afresh.
 */
async function runCues(set: CorpusSet, files: CorpusFile[]): Promise<Outcome> {
  const outcome: Outcome = { unloaded: [], dark: [], unknown: [], timelines: {} }
  await jest.isolateModulesAsync(async () => {
    const { CueSimulator } = await import('../../sim/CueSimulator')
    const logger = await import('../../../shared/logger')
    const warnings: string[] = []
    logger.setLogSink((entry) => {
      const unread = ['Unknown ', 'Light-array variable '].some((start) =>
        entry.message.startsWith(start),
      )
      if (entry.level === 'warn' && unread) {
        warnings.push(entry.message)
      }
    })

    const run = async (baseDir: string, cue: SimCue): Promise<string> => {
      const sim = await CueSimulator.create({
        library: cue.library,
        domain: cue.domain,
        baseDir,
        frontCount: SETTINGS.frontCount,
        backCount: SETTINGS.backCount,
        strobeCount: SETTINGS.strobeCount,
        bpm: SETTINGS.bpm,
        level: SETTINGS.level,
        sampleIntervalMs: 10,
      })
      // Seeded once the file has loaded, so what the loader draws never moves the cue's own draws.
      const realRandom = Math.random
      Math.random = seededRandom(cue.key)
      try {
        warnings.length = 0
        sim.setCue(cue.cue)
        sim.loadScenario(SCENARIOS[cue.domain])
        const timeline = await sim.run(SETTINGS.durationMs)
        const name = `${cue.library} ${cue.cue}`
        if (!lightsSomething(timeline) && !DARK_BY_DESIGN.has(name)) outcome.dark.push(name)
        outcome.unknown.push(...warnings.map((warning) => `${name}: ${warning}`))
        return `${cue.cue} ${fingerprintOf(reduceTimeline(timeline.samples)).digest}`
      } finally {
        Math.random = realRandom
        sim.dispose()
      }
    }

    try {
      for (const file of files) {
        const baseDir = seedCueFile(set, file)
        const digests: string[] = []
        try {
          for (const cue of cuesOf(file)) {
            try {
              digests.push(await run(baseDir, cue))
            } catch (error) {
              if (!String(error).includes('not found')) throw error
              const unloaded = `${cue.domain} ${cue.library}`
              if (!outcome.unloaded.includes(unloaded)) outcome.unloaded.push(unloaded)
            }
          }
        } finally {
          fs.rmSync(baseDir, { recursive: true, force: true })
        }
        if (digests.length > 0) {
          outcome.timelines[file.file] = createHash('sha256')
            .update(digests.join('\n'))
            .digest('hex')
            .slice(0, 12)
        }
      }
    } finally {
      logger.resetLogConfiguration()
    }
  })
  return outcome
}

describe.each(firstSetOfEachCueFile())('the cues the %s build left', (id, set, files) => {
  let outcome: Outcome

  beforeAll(async () => {
    outcome = await runCues(set, files)
  })

  it('each light the rig through the cue simulator', () => {
    expect(outcome.unloaded).toEqual(UNLOADED[id] ?? [])
    expect(outcome.dark).toEqual([])
  })

  it('read only values this build knows', () => {
    expect(outcome.unknown).toEqual([])
  })

  it('play as they did when pinned', () => {
    const pinned = Object.fromEntries(
      Object.keys(outcome.timelines).map((file) => [file, TIMELINES[file]]),
    )
    expect(outcome.timelines).toEqual(pinned)
  })
})
