import { describe, it, expect } from '@jest/globals'
import { CueSimulator } from '../../sim/CueSimulator'
import type { SimSample, SimTimeline } from '../../sim/types'

/**
 * Self-verification for the cue simulation harness. These exercise the real loader, registry,
 * YargCueHandler, Sequencer and LightStateManager against the bundled Stage Kit v2 library, so
 * they double as the first automated cue-behaviour regression tests.
 */

const LIBRARY = 'yarg-stagekit'

function sampleNearest(timeline: SimTimeline, timeMs: number): SimSample {
  let best = timeline.samples[0]
  for (const sample of timeline.samples) {
    if (Math.abs(sample.timeMs - timeMs) < Math.abs(best.timeMs - timeMs)) {
      best = sample
    }
  }
  return best
}

describe('CueSimulator', () => {
  // Static washes (Intro, Silhouettes) author a single `replace` on the base layer, which the
  // sequencer holds for the life of the cue. This pins that persistence: a v2 Silhouettes green
  // wash must still be fully lit at the end of the run.
  it('captures a stable green wash for a persistent base-layer cue', async () => {
    const sim = await CueSimulator.create({
      library: LIBRARY,
      frontCount: 4,
      backCount: 4,
      bpm: 0,
    })
    try {
      sim.setCue('Silhouettes')
      const timeline = await sim.run(1000)

      const allIds = [...timeline.lightOrder.front, ...timeline.lightOrder.back]
      for (const id of allIds) {
        const state = sim.getLightState(id)
        expect(state).not.toBeNull()
        expect(state!.green).toBeGreaterThan(0)
        expect(state!.red).toBe(0)
        expect(state!.blue).toBe(0)
      }

      // The wash is stable: the final sampled frame matches the live state for every light.
      const finalSample = timeline.samples[timeline.samples.length - 1]
      for (const id of allIds) {
        expect(finalSample.lights[id]?.green).toBeGreaterThan(0)
      }
    } finally {
      sim.dispose()
    }
  })

  it('chases a single blue light around the ring for Menu', async () => {
    const sim = await CueSimulator.create({
      library: LIBRARY,
      frontCount: 4,
      backCount: 4,
      bpm: 0,
      sampleIntervalMs: 25,
    })
    try {
      sim.setCue('Menu')
      const timeline = await sim.run(2200)

      const ringIds = [...timeline.lightOrder.front, ...timeline.lightOrder.back]
      // Menu sits a low-blue wash on every light (the "off" state), with one bright blue light
      // stepping around the ring on top. Compare effective brightness (blue scaled by intensity and
      // opacity) so the bright chase light is distinguished from the dim floor.
      const litAt = (timeMs: number): string | null => {
        const sample = sampleNearest(timeline, timeMs)
        let bestId: string | null = null
        let bestBlue = 100 // require a clearly-lit blue, brighter than the low-blue floor
        for (const id of ringIds) {
          const light = sample.lights[id]
          const blue = light ? light.blue * (light.intensity / 255) * light.opacity : 0
          if (blue > bestBlue) {
            bestBlue = blue
            bestId = id
          }
        }
        return bestId
      }

      // Something is lit early, and the lit position advances over time (the chase moves).
      const early = litAt(350)
      const later = litAt(1350)
      expect(early).not.toBeNull()
      expect(later).not.toBeNull()
      expect(early).not.toBe(later)

      // The chase should visit several distinct lights across the run.
      const visited = new Set<string>()
      for (let t = 300; t <= 2100; t += 250) {
        const id = litAt(t)
        if (id) {
          visited.add(id)
        }
      }
      expect(visited.size).toBeGreaterThanOrEqual(3)
    } finally {
      sim.dispose()
    }
  })

  it('toggles the Default wash colour on keyframe-next', async () => {
    const sim = await CueSimulator.create({
      library: LIBRARY,
      frontCount: 4,
      backCount: 4,
      venue: 'Large',
      bpm: 0,
    })
    try {
      sim.setCue('Default')
      sim.schedule({ at: 600, event: 'keyframe-next' })
      const timeline = await sim.run(1200)

      const frontId = timeline.lightOrder.front[0]
      const dominant = (timeMs: number): 'red' | 'blue' | 'none' => {
        const light = sampleNearest(timeline, timeMs).lights[frontId]
        if (!light) {
          return 'none'
        }
        if (light.blue > light.red && light.blue > 50) {
          return 'blue'
        }
        if (light.red > light.blue && light.red > 50) {
          return 'red'
        }
        return 'none'
      }

      const before = dominant(450)
      const after = dominant(1050)
      expect(before).not.toBe('none')
      expect(after).not.toBe('none')
      expect(before).not.toBe(after)
    } finally {
      sim.dispose()
    }
  })

  it('toggles the blue odd-light overlay on each vocal note-off in Silhouettes_Spotlight', async () => {
    const sim = await CueSimulator.create({
      library: LIBRARY,
      frontCount: 4,
      backCount: 4,
      venue: 'Large',
      bpm: 0,
    })
    try {
      // Coming from Dischord, the spotlight holds a green wash with blue on the odd lights;
      // each vocal note-off toggles that blue overlay (so an odd light reads cyan, then green).
      sim.setCue('Dischord')
      sim.loadScenario([
        { at: 200, cue: 'Silhouettes_Spotlight' },
        { at: 400, event: 'vocal-note' },
        { at: 600, event: 'vocal-note-off' },
        { at: 900, event: 'vocal-note' },
        { at: 1100, event: 'vocal-note-off' },
      ])
      const timeline = await sim.run(1400)

      // front-2 is an odd (blue) light; front-1 is an even light that stays green throughout.
      const oddId = timeline.lightOrder.front[1]
      const evenId = timeline.lightOrder.front[0]

      const isBlueOn = (timeMs: number): boolean => {
        const light = sampleNearest(timeline, timeMs).lights[oddId]
        return (light?.blue ?? 0) > 100
      }

      // Blue starts on (cyan), drops after the first note-off, returns after the second.
      expect(isBlueOn(300)).toBe(true)
      expect(isBlueOn(700)).toBe(false)
      expect(isBlueOn(1200)).toBe(true)

      // The green wash is always present, and the even light never picks up blue.
      for (const t of [300, 700, 1200]) {
        const odd = sampleNearest(timeline, t).lights[oddId]
        const even = sampleNearest(timeline, t).lights[evenId]
        expect(odd?.green ?? 0).toBeGreaterThan(0)
        expect(even?.green ?? 0).toBeGreaterThan(0)
        expect(even?.blue ?? 0).toBeLessThan(50)
      }
    } finally {
      sim.dispose()
    }
  })
})
