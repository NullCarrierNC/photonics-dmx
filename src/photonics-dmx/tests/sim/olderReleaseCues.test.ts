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
 * The yarg-alt1 Dischord raiser of these builds passes the light array of every light where its
 * effect takes group names, which the effect reads as a light group it does not know. Each set
 * reports a text once, so it names the first library in the set to read it.
 */
const DISCHORD_LIGHT_ARRAY: Record<string, string> = {
  'v0.6.1-alpha.6': 'yarg-alt1',
  'v0.7.0-alpha.7': 'yarg-alt1',
  'v0.7.0-alpha.7-user': 'yarg-alt1',
}

/** The light array of the simulated rig's front and back lights, read as text. */
const LIGHT_ARRAY_AS_TEXT = Array(8).fill('[object Object]').join(',')

const dischordReadsLightArray = (library: string): string =>
  `${library} Dischord: Unknown light group "${LIGHT_ARRAY_AS_TEXT}", lighting nothing`

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
}

/**
 * Runs each cue of the set's files through the simulator the cue-sim check uses, sampling every
 * frame, with each file loaded beside the set's effect files. Modules load fresh for each set, so
 * each set's unknown values are reported afresh.
 */
async function runCues(set: CorpusSet, files: CorpusFile[]): Promise<Outcome> {
  const outcome: Outcome = { unloaded: [], dark: [], unknown: [] }
  await jest.isolateModulesAsync(async () => {
    const { CueSimulator } = await import('../../sim/CueSimulator')
    const logger = await import('../../../shared/logger')
    const warnings: string[] = []
    logger.setLogSink((entry) => {
      if (entry.level === 'warn' && entry.message.startsWith('Unknown ')) {
        warnings.push(entry.message)
      }
    })

    const run = async (baseDir: string, cue: SimCue): Promise<void> => {
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
      try {
        warnings.length = 0
        sim.setCue(cue.cue)
        sim.loadScenario(SCENARIOS[cue.domain])
        const timeline = await sim.run(SETTINGS.durationMs)
        const name = `${cue.library} ${cue.cue}`
        if (!lightsSomething(timeline) && !DARK_BY_DESIGN.has(name)) outcome.dark.push(name)
        outcome.unknown.push(...warnings.map((warning) => `${name}: ${warning}`))
      } finally {
        sim.dispose()
      }
    }

    try {
      for (const file of files) {
        const baseDir = seedCueFile(set, file)
        try {
          for (const cue of cuesOf(file)) {
            const realRandom = Math.random
            Math.random = seededRandom(cue.key)
            try {
              await run(baseDir, cue)
            } catch (error) {
              if (!String(error).includes('not found')) throw error
              const unloaded = `${cue.domain} ${cue.library}`
              if (!outcome.unloaded.includes(unloaded)) outcome.unloaded.push(unloaded)
            } finally {
              Math.random = realRandom
            }
          }
        } finally {
          fs.rmSync(baseDir, { recursive: true, force: true })
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

  const dischord = DISCHORD_LIGHT_ARRAY[id]
  if (dischord) {
    it('read only the Dischord light array as a value this build does not know', () => {
      expect(outcome.unknown).toEqual([dischordReadsLightArray(dischord)])
    })
  } else {
    it('read only values this build knows', () => {
      expect(outcome.unknown).toEqual([])
    })
  }
})
