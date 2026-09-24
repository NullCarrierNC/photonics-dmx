import { afterEach, describe, expect, it, jest } from '@jest/globals'

import { NodeCueCompiler } from '../../../../cues/node/compiler/NodeCueCompiler'
import { LightingNodeCue } from '../../../../cues/node/runtime/LightingNodeCue'
import { EffectRegistry } from '../../../../cues/node/runtime/EffectRegistry'
import { LIFECYCLE_RUN_EXPIRY_MS } from '../../../../cues/node/runtime/GraphExecutionEngine'
import { CueType, type CueData } from '../../../../cues/types/cueTypes'
import type { NetNodeCueDefinition } from '../../../../cues/types/nodeCueTypes'
import { createSequencerHarness, type SequencerHarness } from '../../../helpers/sequencerHarness'

/** A cue-called graph that paints and then waits for a keyframe the frames never carry. */
function waitsForKeyframe(): NetNodeCueDefinition {
  return {
    id: 'waits',
    name: 'Waits for a keyframe',
    kind: 'lighting',
    cueType: CueType.Default,
    style: 'secondary',
    nodes: {
      events: [{ id: 'called', type: 'event', eventType: 'cue-called' }],
      actions: [
        {
          id: 'paint',
          type: 'action',
          effectType: 'set-color',
          target: {
            groups: { source: 'literal', value: 'front' },
            filter: { source: 'literal', value: 'all' },
          },
          color: {
            name: { source: 'literal', value: 'red' },
            brightness: { source: 'literal', value: 'high' },
          },
          timing: {
            waitForCondition: { source: 'literal', value: 'none' },
            waitForTime: { source: 'literal', value: 0 },
            duration: { source: 'literal', value: 100 },
            waitUntilCondition: { source: 'literal', value: 'keyframe' },
            waitUntilTime: { source: 'literal', value: 0 },
          },
        },
      ],
      logic: [],
    },
    connections: [{ from: 'called', to: 'paint' }],
  }
}

const frame = { beat: 'Off', strobeState: 'Strobe_Off' } as CueData

describe('a lifecycle run that never completes', () => {
  let h: SequencerHarness | null = null
  let cue: LightingNodeCue | null = null

  afterEach(() => {
    cue?.onStop()
    h?.cleanup()
    cue = null
    h = null
    jest.restoreAllMocks()
  })

  it('holds later frames back until it expires, then gives way to the newest frame', () => {
    h = createSequencerHarness({ frontCount: 4, backCount: 0 })
    const harness = h
    cue = new LightingNodeCue(
      'g',
      NodeCueCompiler.compileCue(waitsForKeyframe(), 'yarg'),
      new EffectRegistry(),
      { emit: () => {} },
    )
    const paints = jest.spyOn(harness.sequencer, 'addEffectUnblockedNameWithCallback')

    cue.execute(frame, harness.sequencer, harness.lightManager)
    for (let elapsed = 0; elapsed < LIFECYCLE_RUN_EXPIRY_MS - 1000; elapsed += 1000) {
      harness.advanceBy(1000)
      cue.execute(frame, harness.sequencer, harness.lightManager)
    }
    expect(paints).toHaveBeenCalledTimes(1)

    harness.advanceBy(2000)
    cue.execute(frame, harness.sequencer, harness.lightManager)
    expect(paints).toHaveBeenCalledTimes(2)
  })
})
