/**
 * Engine enhancement: YARG cues in the same group share a single group-level variable store
 * per sequencer, so one cue can hand cue-group-scoped state to another (e.g. Stomp recording
 * its on/off state for Silhouettes_Spotlight). Stores are keyed per sequencer so rigs running
 * the same group in parallel stay isolated.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { NodeCueCompiler } from '../../../../cues/node/compiler/NodeCueCompiler'
import type {
  YargNodeCueDefinition,
  YargEventNode,
  ActionNode,
} from '../../../../cues/types/nodeCueTypes'
import { CueType } from '../../../../cues/types/cueTypes'
import type { CueData } from '../../../../cues/types/cueTypes'
import { YargNodeCue } from '../../../../cues/node/runtime/YargNodeCue'
import type { CueSession } from '../../../../cues/node/runtime/CueSession'
import { DmxLightManager } from '../../../../controllers/DmxLightManager'
import { createMockLightingConfig } from '../../../helpers/testFixtures'
import type { ILightingController } from '../../../../controllers/sequencer/interfaces'

function cueWithSharedGroupVar(id: string, cueType: CueType): YargNodeCueDefinition {
  const event: YargEventNode = { id: 'ev-start', type: 'event', eventType: 'cue-started' }
  const action: ActionNode = {
    id: 'action1',
    type: 'action',
    effectType: 'set-color',
    target: {
      groups: { source: 'literal', value: 'front' },
      filter: { source: 'literal', value: 'all' },
    },
    color: {
      name: { source: 'literal', value: 'red' },
      brightness: { source: 'literal', value: 'high' },
      blendMode: { source: 'literal', value: 'replace' },
    },
    layer: { source: 'literal', value: 0 },
    timing: {
      waitForCondition: { source: 'literal', value: 'none' },
      waitForTime: { source: 'literal', value: 0 },
      duration: { source: 'literal', value: 0 },
      waitUntilCondition: { source: 'literal', value: 'none' },
      waitUntilTime: { source: 'literal', value: 0 },
      easing: { source: 'literal', value: 'linear' },
    },
  }
  return {
    id,
    name: id,
    kind: 'lighting',
    cueType,
    style: 'primary',
    nodes: { events: [event], actions: [action], logic: [] },
    connections: [{ from: 'ev-start', to: 'action1' }],
    variables: [{ name: 'stompState', type: 'number', scope: 'cue-group', initialValue: 0 }],
  }
}

function makeSequencer(): ILightingController {
  return {
    addEffect: jest.fn(),
    setEffect: jest.fn(),
    removeEffect: jest.fn(),
    addEffectUnblockedName: jest.fn().mockReturnValue(true),
    setEffectUnblockedName: jest.fn().mockReturnValue(true),
    removeEffectByLayer: jest.fn(),
    removeEffectCallback: jest.fn(),
    blackout: jest.fn(),
    onBeat: jest.fn(),
    onMeasure: jest.fn(),
    onKeyframe: jest.fn(),
  } as unknown as ILightingController
}

type Internals = { states: Map<ILightingController, { session: CueSession }> }

function groupStoreFor(cue: YargNodeCue, sequencer: ILightingController) {
  const state = (cue as unknown as Internals).states.get(sequencer)
  if (!state) throw new Error('expected run state for sequencer')
  return state.session.getGroupLevelVarStore()
}

describe('YARG group-level variable sharing', () => {
  let lightManager: DmxLightManager
  const params: CueData = { beat: 'Strong', strobeState: 'Strobe_Off' } as CueData

  beforeEach(() => {
    lightManager = new DmxLightManager(createMockLightingConfig())
  })

  it('cues in the same group on the same sequencer share one group store', () => {
    const stomp = new YargNodeCue(
      'g1',
      NodeCueCompiler.compileYargCue(cueWithSharedGroupVar('cue-stomp', CueType.Stomp)),
    )
    const spot = new YargNodeCue(
      'g1',
      NodeCueCompiler.compileYargCue(
        cueWithSharedGroupVar('cue-spot', CueType.Silhouettes_Spotlight),
      ),
    )
    const seq = makeSequencer()

    stomp.execute(params, seq, lightManager)
    spot.execute(params, seq, lightManager)

    const stompStore = groupStoreFor(stomp, seq)
    const spotStore = groupStoreFor(spot, seq)

    // Same Map instance: cue-group state is genuinely shared.
    expect(stompStore).toBe(spotStore)

    // A write by one cue is visible to the other.
    stompStore.set('stompState', { type: 'number', value: 1 })
    expect(spotStore.get('stompState')?.value).toBe(1)
  })

  it('different cue groups do not share state', () => {
    const a = new YargNodeCue(
      'groupA',
      NodeCueCompiler.compileYargCue(cueWithSharedGroupVar('cue-a', CueType.Stomp)),
    )
    const b = new YargNodeCue(
      'groupB',
      NodeCueCompiler.compileYargCue(cueWithSharedGroupVar('cue-b', CueType.Stomp)),
    )
    const seq = makeSequencer()

    a.execute(params, seq, lightManager)
    b.execute(params, seq, lightManager)

    expect(groupStoreFor(a, seq)).not.toBe(groupStoreFor(b, seq))
  })

  it('the same group on different sequencers stays isolated (multi-rig)', () => {
    const cue = new YargNodeCue(
      'g1',
      NodeCueCompiler.compileYargCue(cueWithSharedGroupVar('cue-stomp', CueType.Stomp)),
    )
    const seqA = makeSequencer()
    const seqB = makeSequencer()

    cue.execute(params, seqA, lightManager)
    cue.execute(params, seqB, lightManager)

    expect(groupStoreFor(cue, seqA)).not.toBe(groupStoreFor(cue, seqB))
  })

  it('group state survives a cue restart (onStop preserves group store)', () => {
    const cue = new YargNodeCue(
      'g1',
      NodeCueCompiler.compileYargCue(cueWithSharedGroupVar('cue-stomp', CueType.Stomp)),
    )
    const seq = makeSequencer()

    cue.execute(params, seq, lightManager)
    groupStoreFor(cue, seq).set('stompState', { type: 'number', value: 1 })

    cue.onStop()
    cue.execute(params, seq, lightManager)

    expect(groupStoreFor(cue, seq).get('stompState')?.value).toBe(1)
  })
})
