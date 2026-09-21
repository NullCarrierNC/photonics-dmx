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

/** A colour-only lighting cue, the way a bundled lighting cue paints without touching pan/tilt. */
function colourCue(id: string, harness: SequencerHarness): INetCue {
  return {
    cueId: id,
    id,
    description: id,
    style: CueStyle.Primary,
    execute: (_data, sequencer) => {
      sequencer.addEffectUnblockedName(
        `${id}-look`,
        getEffectSingleColor({
          color: RED,
          duration: 0,
          lights: harness.lightManager.getLights(['front', 'back'], 'all'),
          layer: 1,
        }),
      )
    },
    onStop: () => {},
    onPause: () => {},
  } as INetCue
}

const frame = (beat: CueData['beat']): CueData => ({
  ...defaultCueData,
  currentScene: 'Gameplay',
  trackMode: 'tracked',
  beatsPerMinute: 120,
  lightingCue: CueType.Verse,
  beat,
})

describe('Nod (Slow) through a real cue handler', () => {
  let harness: SequencerHarness
  let handler: CueHandler

  beforeEach(() => {
    harness = createSequencerHarness({ frontCount: 2, backCount: 2, movingHead: true })
    jest.restoreAllMocks()
    const registry = CueRegistry.getInstance()
    jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(loadMotionCue('motion-nod-slow'))
    jest.spyOn(registry, 'getCueImplementation').mockReturnValue(colourCue('verse', harness))
    handler = new CueHandler(harness.lightManager, harness.sequencer, {
      getMotionCueMinimumHoldMs: () => 0,
    })
  })

  afterEach(() => {
    handler.shutdown()
    harness.cleanup()
  })

  it('holds pan at home on every head while tilt sweeps', async () => {
    const samples = new Map<string, Array<{ pan?: number; tilt?: number }>>()
    for (const id of harness.allLightIds) samples.set(id, [])

    // 40 frames at 50 ms: the 800 ms ramp and then more than a full period at 120 bpm.
    for (let i = 0; i < 40; i++) {
      const beat: CueData['beat'] = i % 4 === 0 ? 'Measure' : i % 2 === 0 ? 'Strong' : 'Off'
      if (beat !== 'Off') {
        harness.sequencer.onBeat()
        if (beat === 'Measure') harness.sequencer.onMeasure()
      }
      await handler.handleCue(CueType.Verse, frame(beat))
      harness.advanceBy(50)
      for (const id of harness.allLightIds) {
        const state = harness.getLightState(id)
        samples.get(id)!.push({ pan: state?.pan, tilt: state?.tilt })
      }
    }

    for (const [id, frames] of samples) {
      const pans = new Set(frames.map((f) => f.pan))
      const tilts = new Set(frames.slice(20).map((f) => f.tilt))
      expect({ id, pans: [...pans] }).toEqual({ id, pans: [expect.any(Number)] })
      expect(tilts.size).toBeGreaterThanOrEqual(3)
    }
  })
})
