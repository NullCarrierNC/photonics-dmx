import { describe, it, expect, jest } from '@jest/globals'
import { CueSimulator } from '../../sim/CueSimulator'
import type { AudioCueHandler } from '../../cueHandlers/AudioCueHandler'

// Loads a cue library and runs many virtual frames, over the 5s default on a slower CI runner.
jest.setTimeout(30000)

const LIBRARY = 'audio-stagekit'

const lit = (sim: CueSimulator, id: string): boolean => {
  const state = sim.getLightState(id)
  return state !== null && state.red + state.green + state.blue > 0 && state.intensity > 0
}

describe('CueSimulator (audio)', () => {
  it('lights an audio cue once the input level rises', async () => {
    const sim = await CueSimulator.create({
      library: LIBRARY,
      domain: 'audio',
      frontCount: 4,
      backCount: 4,
      level: 0,
    })
    try {
      sim.setCue('audio-sk-silhouettes')
      const quiet = await sim.run(500)
      const ids = [...quiet.lightOrder.front, ...quiet.lightOrder.back]
      expect(ids.some((id) => lit(sim, id))).toBe(false)

      sim.loadScenario([{ at: 0, level: 0.8 }])
      await sim.run(500)
      expect(ids.every((id) => lit(sim, id))).toBe(true)
    } finally {
      sim.dispose()
    }
  })

  it('plays an audio strobe cue in the strobe slot over the primary', async () => {
    const sim = await CueSimulator.create({
      library: LIBRARY,
      domain: 'audio',
      frontCount: 4,
      backCount: 4,
      strobeCount: 2,
      sampleIntervalMs: 10,
    })
    try {
      sim.setCue('audio-sk-silhouettes')
      sim.schedule({ at: 400, secondary: 'audio-sk-strobe-fast' })
      const timeline = await sim.run(1000)

      const strobeId = timeline.lightOrder.strobe[0]
      const flashed = timeline.samples.some(
        (s) => s.timeMs >= 400 && (s.lights[strobeId]?.red ?? 0) === 255,
      )
      expect(flashed).toBe(true)
      expect(lit(sim, timeline.lightOrder.front[0])).toBe(true)
    } finally {
      sim.dispose()
    }
  })

  it('opens the warm chase on its first step, held for the beat it starts on', async () => {
    const sim = await CueSimulator.create({
      library: LIBRARY,
      domain: 'audio',
      frontCount: 4,
      backCount: 4,
      bpm: 120,
      level: 0.6,
      sampleIntervalMs: 10,
    })
    try {
      sim.setCue('audio-sk-warm-auto')
      const timeline = await sim.run(700)

      const firstFront = timeline.lightOrder.front[0]
      // The timeline keeps a row only when something changes, so the last row at or before a
      // time is what the rig showed then.
      const litAt = (timeMs: number): boolean => {
        const shown = timeline.samples.filter((s) => s.timeMs <= timeMs).at(-1)
        const light = shown?.lights[firstFront]
        return light !== null && light !== undefined && light.intensity > 0
      }
      expect([litAt(10), litAt(250), litAt(490), litAt(650)]).toEqual([true, true, true, false])
    } finally {
      sim.dispose()
    }
  })

  it('runs no automatic motion cue, as simulated YARG frames do not', async () => {
    const sim = await CueSimulator.create({ library: LIBRARY, domain: 'audio', level: 0.8 })
    try {
      const handler = (sim as unknown as { driver: { handler: AudioCueHandler } }).driver.handler

      expect(handler.isMotionLayerEnabled()).toBe(false)
    } finally {
      sim.dispose()
    }
  })

  it('refuses a cue the audio library does not carry', async () => {
    const sim = await CueSimulator.create({ library: LIBRARY, domain: 'audio' })
    try {
      expect(() => sim.setCue('Menu')).toThrow(/Unknown audio cue/)
    } finally {
      sim.dispose()
    }
  })

  it('refuses a YARG-only scenario event', async () => {
    const sim = await CueSimulator.create({ library: LIBRARY, domain: 'audio' })
    try {
      sim.setCue('audio-sk-silhouettes')
      sim.schedule({ at: 100, event: 'keyframe-next' })
      await expect(sim.run(300)).rejects.toThrow(/beats only/)
    } finally {
      sim.dispose()
    }
  })

  it('names the domain a library from another domain belongs to', async () => {
    await expect(CueSimulator.create({ library: 'rb3-mirror' })).rejects.toThrow(
      /belongs to the rb3 domain/,
    )
  })
})
