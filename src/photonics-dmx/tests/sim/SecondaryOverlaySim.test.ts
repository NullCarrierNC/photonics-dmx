import { describe, it, expect, jest } from '@jest/globals'
import { CueSimulator } from '../../sim/CueSimulator'
import type { SimTimeline } from '../../sim/types'

// Loads a cue library and runs many virtual frames, over the 5s default on a slower CI runner.
jest.setTimeout(30000)

/** Every distinct display colour a light showed in the given window, as hex strings. */
function coloursBetween(timeline: SimTimeline, id: string, fromMs: number, toMs: number): string[] {
  const seen = new Set<string>()
  for (const sample of timeline.samples) {
    if (sample.timeMs < fromMs || sample.timeMs > toMs) continue
    const light = sample.lights[id]
    const scale = light ? (light.intensity / 255) * light.opacity : 0
    const hex = light
      ? [light.red, light.green, light.blue]
          .map((v) =>
            Math.round(v * scale)
              .toString(16)
              .padStart(2, '0'),
          )
          .join('')
      : '000000'
    seen.add(hex)
  }
  return [...seen]
}

describe('CueSimulator secondary step', () => {
  it('flashes a strobe secondary while the held primary keeps its wash', async () => {
    const sim = await CueSimulator.create({
      library: 'yarg-stagekit',
      frontCount: 4,
      backCount: 4,
      strobeCount: 2,
      bpm: 0,
      sampleIntervalMs: 10,
    })
    try {
      sim.setCue('Default')
      sim.schedule({ at: 400, secondary: 'Strobe_Fast' })
      const timeline = await sim.run(1000)

      const strobeId = timeline.lightOrder.strobe[0]
      expect(coloursBetween(timeline, strobeId, 400, 1000)).toContain('ffffff')
      expect(coloursBetween(timeline, timeline.lightOrder.front[0], 400, 1000)).toEqual(['000064'])
    } finally {
      sim.dispose()
    }
  })

  it('keeps the secondary running when the frames return to the primary', async () => {
    const sim = await CueSimulator.create({
      library: 'yarg-fade',
      frontCount: 4,
      backCount: 4,
      sampleIntervalMs: 50,
    })
    try {
      sim.setCue('Cool_Automatic')
      sim.loadScenario([
        { at: 800, secondary: 'Sweep' },
        { at: 1500, secondary: '' },
      ])
      const timeline = await sim.run(2100)

      // The comet reaches the back row after the frames went back to the primary.
      expect(coloursBetween(timeline, timeline.lightOrder.back[0], 1500, 2100)).toContain('ffff00')
      expect(timeline.samples.some((s) => s.events.includes('secondary=Sweep'))).toBe(true)
    } finally {
      sim.dispose()
    }
  })

  it('refuses a primary cue named as a secondary', async () => {
    const sim = await CueSimulator.create({ library: 'yarg-stagekit', bpm: 0 })
    try {
      sim.setCue('Default')
      sim.schedule({ at: 100, secondary: 'Menu' })
      await expect(sim.run(300)).rejects.toThrow(/not a secondary cue/)
    } finally {
      sim.dispose()
    }
  })
})
