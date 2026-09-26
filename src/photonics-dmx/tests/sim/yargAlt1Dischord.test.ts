import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { describe, expect, it, jest } from '@jest/globals'
import { CueSimulator } from '../../sim/CueSimulator'

// Loading the library is over the 5s default on a slower CI runner.
jest.setTimeout(30000)

const BUNDLED_EFFECTS = path.resolve(__dirname, '../../../../resources/defaults/node-data/effects')
const RELEASED_ALT1 = path.resolve(__dirname, '../historical/v0.7.0-alpha.7/yarg-alt1.json')

/** The blue lights at the first sample past 50 ms of Dischord on a 4+4 rig at a Small venue. */
async function openingBlue(library: string, baseDir?: string): Promise<string[]> {
  // A Small venue runs no dual-mode rotation, whose solid white would read as blue here.
  const sim = await CueSimulator.create({
    library,
    baseDir,
    frontCount: 4,
    backCount: 4,
    bpm: 120,
    venue: 'Small',
  })
  try {
    sim.setCue('Dischord')
    const timeline = await sim.run(100)

    const opening = timeline.samples.find((sample) => sample.timeMs >= 50)!
    const ring = [...timeline.lightOrder.front, ...timeline.lightOrder.back]
    return ring.filter((id) => (opening.lights[id]?.blue ?? 0) > 0)
  } finally {
    sim.dispose()
  }
}

describe('yarg-alt1 Dischord', () => {
  it('opens with the middle third of the front and of the back lights in blue', async () => {
    expect(await openingBlue('yarg-alt1')).toEqual(['front-2', 'front-3', 'back-6', 'back-7'])
  })

  it('opens the same way from a user copy of the v0.7.0 release file', async () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dischord-user-copy-'))
    try {
      fs.cpSync(BUNDLED_EFFECTS, path.join(baseDir, 'node-data', 'effects'), { recursive: true })
      const cuesDir = path.join(baseDir, 'node-data', 'cues', 'yarg')
      fs.mkdirSync(cuesDir, { recursive: true })
      fs.copyFileSync(RELEASED_ALT1, path.join(cuesDir, 'my-alt1.json'))

      expect(await openingBlue('my-alt1', baseDir)).toEqual([
        'front-2',
        'front-3',
        'back-6',
        'back-7',
      ])
    } finally {
      fs.rmSync(baseDir, { recursive: true, force: true })
    }
  })
})
