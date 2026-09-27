import { afterEach, describe, expect, it, jest } from '@jest/globals'
import * as fs from 'fs'
import * as path from 'path'

import { validateAudioNodeCueFile } from '../../../../cues/node/schema/validation'
import { buildAudioGroup } from '../../../../cues/node/loader/cueGroupBuilders'
import { EffectRegistry } from '../../../../cues/node/runtime/EffectRegistry'
import type { IAudioCue } from '../../../../cues/interfaces/IAudioCue'
import type { AudioCueData } from '../../../../cues/types/audioCueTypes'
import { DEFAULT_AUDIO_CONFIG } from '../../../../listeners/Audio/AudioConfig'
import { noopRuntimeBroadcaster } from '../../../../runtime/broadcaster'
import { createSequencerHarness, type SequencerHarness } from '../../../helpers/sequencerHarness'

const MOTION_FILE = path.join(
  __dirname,
  '../../../../../../resources/defaults/node-data/cues/audio/audio-motion-default.json',
)

/** Cues whose whole purpose is to hold the heads where they are. */
const STATIONARY_CUES = new Set(['motion-still'])

const FRAME_MS = 1000 / 60
const BEAT_MS = 500

async function loadMotionCues(): Promise<Map<string, IAudioCue>> {
  const validation = validateAudioNodeCueFile(JSON.parse(fs.readFileSync(MOTION_FILE, 'utf8')))
  if (!validation.valid) throw new Error(validation.errors.join('; '))
  expect(validation.warnings).toEqual([])
  const compileErrors: string[] = []
  const group = await buildAudioGroup(validation.data, compileErrors, {
    runtimeBroadcaster: noopRuntimeBroadcaster(),
    buildEffectRegistry: async () => new EffectRegistry(),
  })
  expect(compileErrors).toEqual([])
  return group.motionCues ?? new Map()
}

function frame(beatDetected: boolean): AudioCueData {
  return {
    timestamp: 0,
    executionCount: 1,
    audioData: { timestamp: 0, overallLevel: 0.5, bpm: 120, beatDetected, energy: 0.5 },
    config: DEFAULT_AUDIO_CONFIG,
    enabledBandCount: 8,
  }
}

/**
 * Execute the cue on the 60 Hz audio frame grid with a beat every 500 ms, stepping the sequencer
 * in 10 ms ticks, and hand each tick's time to `sample`.
 */
async function driveAt60Hz(
  cue: IAudioCue,
  h: SequencerHarness,
  durationMs: number,
  sample: (t: number) => void,
  { beatOnFirstFrame = false } = {},
): Promise<void> {
  let lastFrame = -1
  let beatPending = false
  for (let t = 0; t < durationMs; t += 10) {
    if ((t > 0 || beatOnFirstFrame) && t % BEAT_MS === 0) {
      h.sequencer.onBeat()
      beatPending = true
    }
    const frameIdx = Math.floor(t / FRAME_MS)
    if (frameIdx > lastFrame) {
      lastFrame = frameIdx
      await cue.execute(frame(beatPending), h.sequencer, h.lightManager)
      beatPending = false
    }
    h.advanceBy(10)
    sample(t + 10)
  }
}

describe('bundled audio motion cues under 60 Hz audio frames', () => {
  let harness: SequencerHarness | null = null

  afterEach(() => {
    harness?.cleanup()
    harness = null
    jest.restoreAllMocks()
  })

  it('Cross Beat Half sweeps the even heads across their pan range at least twice in 4 s', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    const cue = (await loadMotionCues()).get('motion-crossbeat-half')
    if (!cue) throw new Error('motion-crossbeat-half is missing from the bundled motion library')
    harness = createSequencerHarness({ frontCount: 4, backCount: 0, movingHead: true })
    const h = harness
    const even = h.frontLightIds[1]
    const pans: number[] = []
    await driveAt60Hz(cue, h, 4000, () => {
      const pan = h.getLightState(even)?.pan
      if (pan != null) pans.push(pan)
    })
    cue.onStop?.()

    const min = Math.min(...pans)
    const max = Math.max(...pans)
    expect(max - min).toBeGreaterThan(20)
    // A sweep is a trip from within 10% of one end of the range to within 10% of the other.
    const margin = (max - min) * 0.1
    let lastEnd: 'low' | 'high' | null = null
    let sweeps = 0
    for (const pan of pans) {
      const end = pan <= min + margin ? 'low' : pan >= max - margin ? 'high' : null
      if (end && end !== lastEnd) {
        if (lastEnd) sweeps++
        lastEnd = end
      }
    }
    expect(sweeps).toBeGreaterThanOrEqual(2)
  })

  // The beat-driven cues move on every fourth beat, so 8 s gives each at least one move from a
  // position it has already reached.
  it.each([
    ['motion-crossbeat-half', 2],
    ['motion-searchlights', 4],
    ['motion-vogue-slow', 4],
  ])('%s moves on the first beat, then every %i beats', async (id, beatsPerMove) => {
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    const cue = (await loadMotionCues()).get(id)
    if (!cue) throw new Error(`${id} is missing from the bundled motion library`)
    const h = createSequencerHarness({ frontCount: 4, backCount: 0, movingHead: true })
    harness = h
    // A beat cooldown counts from a last trigger of 0, which a running clock is well past.
    h.advanceBy(1000)
    const head = h.frontLightIds[0]!
    const position = (): string => `${h.getLightState(head)?.pan}/${h.getLightState(head)?.tilt}`
    const home = position()
    const moves: number[] = []
    let last = home
    let settledSince = -Infinity
    await driveAt60Hz(
      cue,
      h,
      4500,
      (t) => {
        const now = position()
        if (now !== last && t - settledSince >= 150) moves.push(t)
        if (now !== last) settledSince = t
        last = now
      },
      { beatOnFirstFrame: true },
    )
    cue.onStop?.()
    expect(moves[0]).toBeLessThanOrEqual(50)
    expect(moves.every((t) => Math.round(t / BEAT_MS) % beatsPerMove === 0)).toBe(true)
  })

  it('every bundled motion cue moves its heads within 8 s', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    const cues = await loadMotionCues()
    expect(cues.size).toBeGreaterThan(0)
    const still: string[] = []
    for (const [id, cue] of cues) {
      if (STATIONARY_CUES.has(id)) continue
      const h = createSequencerHarness({ frontCount: 4, backCount: 4, movingHead: true })
      harness = h
      const range = new Map<string, { min: number; max: number }>()
      await driveAt60Hz(cue, h, 8000, (t) => {
        if (t < 200) return
        for (const lightId of h.allLightIds) {
          const state = h.getLightState(lightId)
          for (const [axis, value] of [
            ['pan', state?.pan],
            ['tilt', state?.tilt],
          ] as const) {
            if (value == null) continue
            const key = `${lightId}:${axis}`
            const r = range.get(key) ?? { min: value, max: value }
            range.set(key, { min: Math.min(r.min, value), max: Math.max(r.max, value) })
          }
        }
      })
      cue.onStop?.()
      h.cleanup()
      harness = null
      const travel = Math.max(0, ...[...range.values()].map((r) => r.max - r.min))
      if (travel < 5) still.push(`${id} (${travel.toFixed(1)})`)
    }
    expect(still).toEqual([])
  })
})
