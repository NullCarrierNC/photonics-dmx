/**
 * A new lighting cue rolls whether a motion cue plays. When the roll misses, the motion cue that was
 * running stops and every moving head returns home: the merged light state carries no pan or tilt,
 * which DmxPublisher resolves to each fixture's configured home.
 *
 * Driven through a real CueHandler and sequencer with bundled YARG motion cues, covering both
 * kinds of motion program (a parametric pattern and set-position moves) and both ways the next
 * lighting cue can submit (clearing the rig, or adding beside what is already there).
 */
import fs from 'fs'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { CueHandler } from '../../cueHandlers/CueHandler'
import { CueRegistry } from '../../cues/registries/CueRegistry'
import { CueStyle, type INetCue } from '../../cues/interfaces/INetCue'
import { MotionNodeCue } from '../../cues/node/runtime/MotionNodeCue'
import { NodeCueCompiler } from '../../cues/node/compiler/NodeCueCompiler'
import { validateYargNodeCueFile } from '../../cues/node/schema/validation'
import { CueType, defaultCueData, type CueData } from '../../cues/types/cueTypes'
import { getEffectSingleColor } from '../../effects/effectSingleColor'
import { createSequencerHarness, type SequencerHarness } from '../helpers/sequencerHarness'
import type { RGBIO } from '../../types'

const RED: RGBIO = {
  red: 255,
  green: 0,
  blue: 0,
  intensity: 255,
  opacity: 1,
  blendMode: 'replace',
}

function loadMotionCue(id: string): MotionNodeCue {
  const filePath = path.join(
    __dirname,
    '../../../../resources/defaults/node-data/cues/yarg/yarg-motion-default.json',
  )
  const result = validateYargNodeCueFile(JSON.parse(fs.readFileSync(filePath, 'utf8')))
  if (!result.valid) throw new Error('yarg-motion-default.json failed validation')
  const def = result.data.cues.find((c) => c.id === id)
  if (!def) throw new Error(`motion cue ${id} not found`)
  return new MotionNodeCue('yarg-motion-default', NodeCueCompiler.compileCue(def, 'yarg'))
}

type Submission = 'set' | 'add'

/**
 * A colour-only lighting cue, the way a bundled lighting cue paints without touching pan/tilt. Like
 * a node cue, a 'set' cue clears the rig only on the first submission of its activation.
 */
function colourCue(id: string, harness: SequencerHarness, submission: Submission): INetCue {
  let cleared = false
  return {
    cueId: id,
    id,
    description: id,
    style: CueStyle.Primary,
    execute: (_data, sequencer) => {
      const effect = getEffectSingleColor({
        color: RED,
        duration: 0,
        lights: harness.lightManager.getLights(['front', 'back'], 'all'),
        layer: submission === 'set' ? 0 : 1,
      })
      if (submission === 'set' && !cleared) {
        cleared = true
        sequencer.setEffectUnblockedName(`${id}-look`, effect)
      } else {
        sequencer.addEffectUnblockedName(`${id}-look`, effect)
      }
    },
    onStop: () => {
      cleared = false
    },
    onPause: () => {},
  } as INetCue
}

const frame = (lightingCue: CueType, beat: CueData['beat']): CueData => ({
  ...defaultCueData,
  currentScene: 'Gameplay',
  trackMode: 'tracked',
  beatsPerMinute: 120,
  lightingCue,
  beat,
})

describe('motion probability miss', () => {
  let harness: SequencerHarness
  let registry: CueRegistry
  let probability: number
  let handler: CueHandler

  beforeEach(() => {
    harness = createSequencerHarness({ frontCount: 2, backCount: 2, movingHead: true })
    registry = CueRegistry.getInstance()
    jest.restoreAllMocks()
    probability = 100
    handler = new CueHandler(harness.lightManager, harness.sequencer, {
      getMotionCueMinimumHoldMs: () => 0,
      getMotionCueProbabilityPercent: () => probability,
    })
  })

  afterEach(() => {
    handler.shutdown()
    harness.cleanup()
  })

  /** Dispatches a cue for a stretch of frames with beats, the way YARG holds a cue. */
  const holdCue = async (cueType: CueType, frames: number): Promise<void> => {
    for (let i = 0; i < frames; i++) {
      const beat: CueData['beat'] = i % 4 === 0 ? 'Measure' : i % 2 === 0 ? 'Strong' : 'Off'
      if (beat !== 'Off') {
        harness.sequencer.onBeat()
        if (beat === 'Measure') harness.sequencer.onMeasure()
      }
      await handler.handleCue(cueType, frame(cueType, beat))
      harness.advanceBy(50)
    }
  }

  const aims = (): Array<{ pan?: number; tilt?: number }> =>
    harness.allLightIds.map((id) => {
      const state = harness.getLightState(id)
      return { pan: state?.pan, tilt: state?.tilt }
    })

  const cases: Array<[string, Submission]> = [
    ['motion-wave-slow', 'set'],
    ['motion-wave-slow', 'add'],
    ['motion-searchlights', 'set'],
    ['motion-searchlights', 'add'],
    ['motion-vogue-slow', 'set'],
    ['motion-vogue-slow', 'add'],
  ]

  it.each(cases)(
    'homes the heads after %s when the next cue (%s submission) rolls no motion',
    async (motionId, submission) => {
      const motion = loadMotionCue(motionId)
      const verse = colourCue('verse', harness, submission)
      const chorus = colourCue('chorus', harness, submission)
      jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(motion)
      jest
        .spyOn(registry, 'getCueImplementation')
        .mockImplementation((cueType) => (cueType === CueType.Verse ? verse : chorus))

      await holdCue(CueType.Verse, 40)
      expect(aims().some((aim) => aim.pan !== undefined || aim.tilt !== undefined)).toBe(true)

      probability = 0
      await holdCue(CueType.Chorus, 40)

      expect(aims()).toEqual(harness.allLightIds.map(() => ({ pan: undefined, tilt: undefined })))
    },
  )
})
