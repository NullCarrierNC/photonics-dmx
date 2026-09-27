import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import * as fs from 'fs'
import * as path from 'path'
import { CueHandler } from '../../cueHandlers/CueHandler'
import { CueRegistry } from '../../cues/registries/CueRegistry'
import { CueStyle, type INetCue } from '../../cues/interfaces/INetCue'
import { MotionNodeCue } from '../../cues/node/runtime/MotionNodeCue'
import { NodeCueCompiler } from '../../cues/node/compiler/NodeCueCompiler'
import { CueType, defaultCueData, type CueData } from '../../cues/types/cueTypes'
import type { NetMotionNodeCueDefinition } from '../../cues/types/nodeCueTypes'
import { createSequencerHarness, type SequencerHarness } from '../helpers/sequencerHarness'

const MOTION_FILE = path.join(
  __dirname,
  '../../../../resources/defaults/node-data/cues/yarg/yarg-motion-default.json',
)

const FRAME_MS = 1000 / 30

const frame: CueData = {
  ...defaultCueData,
  currentScene: 'Gameplay',
  trackMode: 'tracked',
  beatsPerMinute: 120,
  lightingCue: CueType.Verse,
}

function bundledMotionCue(id: string): MotionNodeCue {
  const file = JSON.parse(fs.readFileSync(MOTION_FILE, 'utf8')) as {
    group: string
    cues: NetMotionNodeCueDefinition[]
  }
  const definition = file.cues.find((cue) => cue.id === id)
  if (!definition) throw new Error(`${id} is not in ${MOTION_FILE}`)
  return new MotionNodeCue(file.group, NodeCueCompiler.compileCue(definition, 'yarg'))
}

/** A lighting cue that awaits before it draws, as a node cue does, and draws nothing. */
const lightingCue: INetCue = {
  cueId: 'lighting',
  id: 'lighting',
  style: CueStyle.Primary,
  execute: async () => {
    await Promise.resolve()
  },
}

/** The times a head's pan crosses halfway between the two bearings it swings between. */
function midSwings(pans: Array<{ t: number; pan: number }>): number[] {
  const values = pans.map((sample) => sample.pan)
  const mid = (Math.min(...values) + Math.max(...values)) / 2
  const crossings: number[] = []
  for (let i = 1; i < pans.length; i++) {
    if (pans[i - 1]!.pan < mid !== pans[i]!.pan < mid) crossings.push(pans[i]!.t)
  }
  return crossings
}

describe('the bundled YARG Cross Beat Half motion cue', () => {
  let harness: SequencerHarness
  let handler: CueHandler

  beforeEach(() => {
    harness = createSequencerHarness({ frontCount: 2, backCount: 0, movingHead: true })
    jest
      .spyOn(CueRegistry.getInstance(), 'getRandomMotionCue')
      .mockReturnValue(bundledMotionCue('motion-crossbeat-half'))
  })

  afterEach(() => {
    handler.shutdown()
    harness.cleanup()
    jest.restoreAllMocks()
  })

  /**
   * Plays 30 frames a second at 120 BPM for `durationMs`, with a beat on the frame at or after each
   * beat time and every fourth beat a measure, dispatched as YargNetworkListener does, and records
   * each head's pan every 10 ms.
   */
  async function play(durationMs: number): Promise<Array<Array<{ t: number; pan: number }>>> {
    const heads = harness.frontLightIds.map(() => [] as Array<{ t: number; pan: number }>)
    let nextFrame = 0
    let beats = 0
    for (let t = 0; t < durationMs; t += 10) {
      if (t >= nextFrame) {
        let beat: CueData['beat'] = 'Off'
        if (t >= beats * 500) {
          beat = beats % 4 === 0 ? 'Measure' : 'Strong'
          beats += 1
        }
        const dispatched = handler.handleCue(CueType.Verse, { ...frame, beat })
        if (beat === 'Measure') handler.handleMeasure()
        if (beat === 'Strong') handler.handleBeat()
        await dispatched
        nextFrame += FRAME_MS
      }
      harness.advanceBy(10)
      harness.frontLightIds.forEach((id, i) => {
        const pan = harness.getLightState(id)?.pan
        if (pan !== undefined) heads[i]!.push({ t: t + 10, pan })
      })
    }
    return heads
  }

  it.each([
    ['with a lighting cue', lightingCue],
    ['with no lighting cue', null],
  ])('moves on the first beat and every second beat after it %s', async (_label, lighting) => {
    jest.spyOn(CueRegistry.getInstance(), 'getCueImplementation').mockReturnValue(lighting)
    handler = new CueHandler(harness.lightManager, harness.sequencer, {
      getMotionCueMinimumHoldMs: () => 0,
      getMotionCueProbabilityPercent: () => 100,
    })

    const heads = await play(6500)

    for (const pans of heads) {
      const panAt = (t: number): number | undefined => pans.find((sample) => sample.t === t)?.pan
      // The first beat aims the head, and it holds that bearing until the third beat.
      expect(panAt(100)).toBe(panAt(900))
      expect(panAt(100)).not.toBe(panAt(1900))
      const swings = midSwings(pans).filter((t) => t > 200)
      expect(Math.round(swings[0]! / 500)).toBe(3)
      const beatsApart = swings.slice(1).map((swing, i) => Math.round((swing - swings[i]!) / 500))
      expect(beatsApart).toEqual(beatsApart.map(() => 2))
    }
  })
})
