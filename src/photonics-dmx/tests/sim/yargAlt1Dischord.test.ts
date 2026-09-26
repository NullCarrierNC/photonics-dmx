import { describe, expect, it, jest } from '@jest/globals'
import { CueSimulator } from '../../sim/CueSimulator'

// Loading the library is over the 5s default on a slower CI runner.
jest.setTimeout(30000)

describe('yarg-alt1 Dischord', () => {
  it.each([
    [1, [1]],
    [2, [2]],
    [3, [2]],
    [4, [2, 3]],
    [5, [3, 4]],
    [6, [3, 4]],
    [7, [3, 4, 5]],
    [8, [4, 5, 6]],
    [9, [4, 5, 6]],
  ])(
    'opens with the middle third of the front and of the back lights in blue on %i-light groups',
    async (count, middle) => {
      // A Small venue runs no dual-mode rotation, whose solid white would read as blue here.
      const sim = await CueSimulator.create({
        library: 'yarg-alt1',
        frontCount: count,
        backCount: count,
        bpm: 120,
        venue: 'Small',
      })
      try {
        sim.setCue('Dischord')
        const timeline = await sim.run(100)

        const opening = timeline.samples.find((sample) => sample.timeMs >= 50)!
        const ring = [...timeline.lightOrder.front, ...timeline.lightOrder.back]
        const blue = ring.filter((id) => (opening.lights[id]?.blue ?? 0) > 0)

        expect(blue).toEqual([
          ...middle.map((position) => `front-${position}`),
          ...middle.map((position) => `back-${count + position}`),
        ])
      } finally {
        sim.dispose()
      }
    },
  )
})
