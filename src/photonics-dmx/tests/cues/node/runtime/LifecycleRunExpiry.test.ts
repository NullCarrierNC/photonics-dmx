import { afterEach, describe, expect, it, jest } from '@jest/globals'

import { NodeCueCompiler } from '../../../../cues/node/compiler/NodeCueCompiler'
import { LightingNodeCue } from '../../../../cues/node/runtime/LightingNodeCue'
import { EffectRegistry } from '../../../../cues/node/runtime/EffectRegistry'
import { LIFECYCLE_RUN_EXPIRY_MS } from '../../../../cues/node/runtime/GraphExecutionEngine'
import { CueType, type CueData } from '../../../../cues/types/cueTypes'
import type { NetNodeCueDefinition } from '../../../../cues/types/nodeCueTypes'
import { createSequencerHarness, type SequencerHarness } from '../../../helpers/sequencerHarness'

/**
 * A cue-called graph that paints on `layer` and then waits for a keyframe the frames never carry.
 * The first run paints red and every later run paints blue.
 */
function waitsForKeyframe(layer = 0): NetNodeCueDefinition {
  return {
    id: 'waits',
    name: 'Waits for a keyframe',
    kind: 'lighting',
    cueType: CueType.Default,
    style: 'secondary',
    variables: [
      { name: 'shade', type: 'color', scope: 'cue', initialValue: 'red' },
      { name: 'nextShade', type: 'color', scope: 'cue', initialValue: 'red' },
    ],
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
            name: { source: 'variable', name: 'shade' },
            brightness: { source: 'literal', value: 'high' },
          },
          timing: {
            waitForCondition: { source: 'literal', value: 'none' },
            waitForTime: { source: 'literal', value: 0 },
            duration: { source: 'literal', value: 100 },
            waitUntilCondition: { source: 'literal', value: 'keyframe' },
            waitUntilTime: { source: 'literal', value: 0 },
          },
          layer: { source: 'literal', value: layer },
        },
      ],
      logic: [
        {
          id: 'pick',
          type: 'logic',
          logicType: 'variable',
          mode: 'set',
          varName: 'shade',
          valueType: 'color',
          assignments: [
            {
              varName: 'shade',
              valueType: 'color',
              value: { source: 'variable', name: 'nextShade' },
            },
            {
              varName: 'nextShade',
              valueType: 'color',
              value: { source: 'literal', value: 'blue' },
            },
          ],
        },
      ],
    },
    connections: [
      { from: 'called', to: 'pick' },
      { from: 'pick', to: 'paint' },
    ],
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

  it('holds later frames back until it expires, then paints the newest frame', () => {
    h = createSequencerHarness({ frontCount: 4, backCount: 0 })
    const harness = h
    cue = new LightingNodeCue(
      'g',
      NodeCueCompiler.compileCue(waitsForKeyframe(), 'yarg'),
      new EffectRegistry(),
      { emit: () => {} },
    )
    const front = (): { red: number; blue: number } => {
      const state = harness.getLightState(harness.frontLightIds[0])
      return { red: state?.red ?? 0, blue: state?.blue ?? 0 }
    }

    cue.execute(frame, harness.sequencer, harness.lightManager)
    for (let elapsed = 0; elapsed < LIFECYCLE_RUN_EXPIRY_MS - 1000; elapsed += 1000) {
      harness.advanceBy(1000)
      cue.execute(frame, harness.sequencer, harness.lightManager)
    }
    harness.advanceBy(200)
    expect(front()).toEqual({ red: 255, blue: 0 })

    harness.advanceBy(1800)
    cue.execute(frame, harness.sequencer, harness.lightManager)
    harness.advanceBy(200)
    expect(front()).toEqual({ red: 0, blue: 255 })
  })

  it('fades the newest frame in from the look the expired run left showing', () => {
    h = createSequencerHarness({ frontCount: 4, backCount: 0 })
    const harness = h
    cue = new LightingNodeCue(
      'g',
      NodeCueCompiler.compileCue(waitsForKeyframe(1), 'yarg'),
      new EffectRegistry(),
      { emit: () => {} },
    )
    const shown = (): number => {
      const state = harness.getLightState(harness.frontLightIds[0])
      return (state?.red ?? 0) + (state?.blue ?? 0)
    }

    cue.execute(frame, harness.sequencer, harness.lightManager)
    harness.advanceBy(200)
    harness.advanceBy(LIFECYCLE_RUN_EXPIRY_MS)
    expect(shown()).toBe(255)

    cue.execute(frame, harness.sequencer, harness.lightManager)
    const crossfade: number[] = []
    for (let tick = 0; tick < 12; tick++) {
      harness.advanceBy(10)
      crossfade.push(shown())
    }
    expect(Math.min(...crossfade)).toBeGreaterThanOrEqual(250)
    expect(harness.getLightState(harness.frontLightIds[0])?.blue).toBe(255)
  })
})
