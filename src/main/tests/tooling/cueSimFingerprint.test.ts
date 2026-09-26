import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CueSimulator } from '../../../photonics-dmx/sim/CueSimulator'

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  SETTINGS,
  SIMULATOR_OPTIONS,
  SCENARIOS,
  seededRandom,
  reduceTimeline,
  fingerprintOf,
  compareFingerprints,
} = require('../../../../tools/cueSimCore.cjs')
/* eslint-enable @typescript-eslint/no-require-imports */

jest.setTimeout(60000)

const DEFAULTS = join(__dirname, '../../../../resources/defaults')
const LIBRARY_FILE = 'node-data/cues/yarg/yarg-alt1.json'
const KEY = 'yarg__yarg-alt1__Stomp'

type Action = { id: string; color: { name: { value: string } } }
type Library = { cues: Array<{ cueType?: string; nodes: { actions: Action[] } }> }

let scratch: string

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), 'cue-sim-fingerprint-'))
  cpSync(DEFAULTS, scratch, { recursive: true })
})

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

/** Runs Stomp from the library under `baseDir` as the cue-sim check runs each cue. */
async function stompFingerprint(baseDir: string): Promise<unknown> {
  const realRandom = Math.random
  Math.random = seededRandom(KEY)
  try {
    const sim = await CueSimulator.create({
      library: 'yarg-alt1',
      domain: 'yarg',
      baseDir,
      ...SIMULATOR_OPTIONS,
    })
    try {
      sim.setCue('Stomp')
      sim.loadScenario(SCENARIOS.yarg)
      const timeline = await sim.run(SETTINGS.durationMs)
      return fingerprintOf(reduceTimeline(timeline.samples))
    } finally {
      sim.dispose()
    }
  } finally {
    Math.random = realRandom
  }
}

describe('cue-sim fingerprint', () => {
  it("moves when the colour of a bundled cue's one-frame flash changes", async () => {
    const path = join(scratch, LIBRARY_FILE)
    const library: Library = JSON.parse(readFileSync(path, 'utf8'))
    const flash = library.cues
      .find((cue) => cue.cueType === 'Stomp')
      ?.nodes.actions.find((action) => action.id === 'y1-stomp-a2')
    if (!flash) throw new Error('Stomp has no y1-stomp-a2 action')
    expect(flash.color.name.value).toBe('white')

    const bundled = await stompFingerprint(DEFAULTS)
    flash.color.name.value = 'yellow'
    writeFileSync(path, JSON.stringify(library))
    const edited = await stompFingerprint(scratch)

    expect(compareFingerprints(new Map([[KEY, bundled]]), new Map([[KEY, edited]])).moved).toEqual([
      KEY,
    ])
  })
})
