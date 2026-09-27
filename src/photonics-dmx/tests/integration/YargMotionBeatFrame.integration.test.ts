import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { CueHandler } from '../../cueHandlers/CueHandler'
import { CueRegistry } from '../../cues/registries/CueRegistry'
import { CueStyle, type INetCue } from '../../cues/interfaces/INetCue'
import { MotionNodeCue } from '../../cues/node/runtime/MotionNodeCue'
import { NodeCueCompiler } from '../../cues/node/compiler/NodeCueCompiler'
import { CueType, defaultCueData, type CueData } from '../../cues/types/cueTypes'
import type { NetMotionNodeCueDefinition } from '../../cues/types/nodeCueTypes'
import { createSequencerHarness, type SequencerHarness } from '../helpers/sequencerHarness'

/** Aims every head the moment a beat arrives, and holds the aim until the next one. */
const beatAimDefinition: NetMotionNodeCueDefinition = {
  kind: 'motion',
  id: 'motion-beat-aim',
  name: 'Aim on the beat',
  nodes: {
    events: [{ id: 'started', type: 'event', eventType: 'cue-started' }],
    actions: [
      {
        id: 'aim',
        type: 'action',
        effectType: 'set-position',
        target: {
          groups: { source: 'literal', value: 'front' },
          filter: { source: 'literal', value: 'all' },
        },
        position: {
          mode: 'direction',
          bearing: { source: 'literal', value: 90 },
          angle: { source: 'literal', value: 30 },
        },
        timing: {
          waitForCondition: { source: 'literal', value: 'beat' },
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 0 },
          waitUntilCondition: { source: 'literal', value: 'beat' },
          waitUntilTime: { source: 'literal', value: 0 },
        },
        layer: { source: 'literal', value: 120 },
      },
    ],
    logic: [],
  },
  connections: [{ from: 'started', to: 'aim' }],
  layout: { nodePositions: {} },
}

/** A lighting cue that draws nothing, so the motion cue is all that reaches the heads. */
const darkCue: INetCue = {
  cueId: 'dark',
  id: 'dark',
  style: CueStyle.Primary,
  execute: () => {},
}

const beatFrame: CueData = {
  ...defaultCueData,
  currentScene: 'Gameplay',
  trackMode: 'tracked',
  beatsPerMinute: 120,
  lightingCue: CueType.Verse,
  beat: 'Strong',
}

describe('a YARG motion cue picked on a beat frame', () => {
  let harness: SequencerHarness
  let handler: CueHandler

  beforeEach(() => {
    harness = createSequencerHarness({ frontCount: 2, backCount: 0, movingHead: true })
    const registry = CueRegistry.getInstance()
    const motion = new MotionNodeCue(
      'motion-group',
      NodeCueCompiler.compileCue(beatAimDefinition, 'yarg'),
    )
    jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(motion)
    jest.spyOn(registry, 'getCueImplementation').mockReturnValue(darkCue)
    handler = new CueHandler(harness.lightManager, harness.sequencer, {
      getMotionCueMinimumHoldMs: () => 0,
      getMotionCueProbabilityPercent: () => 100,
    })
  })

  afterEach(() => {
    handler.shutdown()
    harness.cleanup()
    jest.restoreAllMocks()
  })

  it('aims the heads on the beat of that frame', async () => {
    // The frame's cue is dispatched, then its beat raised, as YargNetworkListener does.
    const dispatched = handler.handleCue(CueType.Verse, beatFrame)
    handler.handleBeat()
    await dispatched
    harness.advanceBy(10)

    const pans = harness.frontLightIds.map((id) => harness.getLightState(id)?.pan)
    expect(pans).toEqual([expect.any(Number), expect.any(Number)])
  })
})
