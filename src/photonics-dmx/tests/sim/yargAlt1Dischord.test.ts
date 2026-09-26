import { describe, expect, it, jest } from '@jest/globals'
import { CueSimulator } from '../../sim/CueSimulator'

// Loading the library is over the 5s default on a slower CI runner.
jest.setTimeout(30000)

describe('yarg-alt1 Dischord', () => {
  it('opens with the middle third of the front and of the back lights in blue', async () => {
    // A Small venue runs no dual-mode rotation, whose solid white would read as blue here.
    const sim = await CueSimulator.create({
      library: 'yarg-alt1',
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
      const blue = ring.filter((id) => (opening.lights[id]?.blue ?? 0) > 0)

      expect(blue).toEqual(['front-2', 'front-3', 'back-6', 'back-7'])
    } finally {
      sim.dispose()
    }
  })
})
