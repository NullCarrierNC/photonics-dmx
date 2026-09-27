import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { describe, it, expect, jest } from '@jest/globals'
import { CueSimulator } from '../../sim/CueSimulator'
import type { AudioCueHandler } from '../../cueHandlers/AudioCueHandler'
import { beatStartChase } from '../helpers/beatStartChase'

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

  it('starts a chase waiting for a beat on the beat frame it opens on', async () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-beat-chase-'))
    try {
      const cues = path.join(baseDir, 'node-data', 'cues', 'audio')
      fs.mkdirSync(cues, { recursive: true })
      const library = {
        version: 1,
        cueVersion: 1,
        mode: 'audio',
        group: { id: 'beat-chase', name: 'Beat chase', description: '' },
        cues: [beatStartChase('beat-chase', 'primary')],
      }
      fs.writeFileSync(path.join(cues, 'beat-chase.json'), JSON.stringify(library))
      const sim = await CueSimulator.create({
        library: 'beat-chase',
        domain: 'audio',
        baseDir,
        frontCount: 2,
        backCount: 0,
        bpm: 120,
        sampleIntervalMs: 10,
      })
      try {
        sim.setCue('beat-chase')
        const timeline = await sim.run(20)

        const [first, second] = timeline.lightOrder.front
        // The timeline keeps a row only when something changes, so the last row at or before a
        // time is what the rig showed then.
        const shown = timeline.samples.filter((s) => s.timeMs <= 10).at(-1)
        expect([shown?.lights[first]?.red ?? 0, shown?.lights[second]?.red ?? 0]).toEqual([255, 0])
      } finally {
        sim.dispose()
      }
    } finally {
      fs.rmSync(baseDir, { recursive: true, force: true })
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

  it('refuses a cue that only the default audio library carries', async () => {
    const sim = await CueSimulator.create({ library: LIBRARY, domain: 'audio' })
    try {
      expect(() => sim.setCue('audio-70s-bass-cymbal')).toThrow(
        /Unknown audio cue 'audio-70s-bass-cymbal' in 'audio-stagekit'/,
      )
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
