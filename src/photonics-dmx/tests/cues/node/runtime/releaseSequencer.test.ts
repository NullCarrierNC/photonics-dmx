/**
 * `releaseSequencer` drops a cue impl's per-sequencer runtime state so a disposed RigChain's
 * sequencer can be garbage collected. Without this hook the cue instance (a registry
 * singleton) would accumulate one stale state entry per `restartControllers` cycle.
 */
import { describe, expect, it, jest } from '@jest/globals'

import { NodeCueCompiler } from '../../../../cues/node/compiler/NodeCueCompiler'
import { YargNodeCue } from '../../../../cues/node/runtime/YargNodeCue'
import { YargMotionNodeCue } from '../../../../cues/node/runtime/YargMotionNodeCue'
import { AudioNodeCue } from '../../../../cues/node/runtime/AudioNodeCue'
import type {
  ActionNode,
  AudioLightingNodeCueDefinition,
  YargEventNode,
  YargLightingNodeCueDefinition,
  YargMotionNodeCueDefinition,
} from '../../../../cues/types/nodeCueTypes'
import type { ILightingController } from '../../../../controllers/sequencer/interfaces'
import { DmxLightManager } from '../../../../controllers/DmxLightManager'
import { createMockLightingConfig } from '../../../helpers/testFixtures'
import type { CueData } from '../../../../cues/types/cueTypes'
import type { AudioCueData } from '../../../../cues/types/audioCueTypes'
import { DEFAULT_AUDIO_CONFIG } from '../../../../listeners/Audio/AudioConfig'

function makeSequencerStub(): ILightingController {
  return {
    addEffect: jest.fn(),
    setEffect: jest.fn(),
    removeEffect: jest.fn(),
    removeAllEffects: jest.fn(),
    removeEffectByLayer: jest.fn(),
    removeEffectCallback: jest.fn(),
    addEffectUnblockedName: jest.fn(),
    setEffectUnblockedName: jest.fn(),
    addEffectUnblockedNameWithCallback: jest.fn(),
    setEffectUnblockedNameWithCallback: jest.fn(),
    addEffectWithCallback: jest.fn(),
    setEffectWithCallback: jest.fn(),
    cancelPanTiltClear: jest.fn(),
    schedulePanTiltClear: jest.fn(),
    addMotionPattern: jest.fn(),
    removeMotionPattern: jest.fn(),
    getMotionPattern: jest.fn(),
    updateMotionPatternConfig: jest.fn(),
    onBeat: jest.fn(),
  } as unknown as ILightingController
}

function minimalYargCueData(): CueData {
  return {
    datagramVersion: 1,
    platform: 'Unknown',
    currentScene: 'Gameplay',
    pauseState: 'Unpaused',
    venueSize: 'Small',
    beatsPerMinute: 120,
    songSection: 'Verse',
    guitarNotes: [],
    bassNotes: [],
    drumNotes: [],
    keysNotes: [],
    vocalNote: 0,
    harmony0Note: 0,
    harmony1Note: 0,
    harmony2Note: 0,
    lightingCue: 'Chorus',
    postProcessing: 'Default',
    fogState: false,
    strobeState: 'Strobe_Off',
    performer: 1,
    keyframe: 'Off',
    bonusEffect: true,
    beat: 'Strong',
    executionCount: 1,
    cueStartTime: Date.now() - 1000,
    timeSinceLastCue: 100,
  } as CueData
}

function minimalAudioCueData(): AudioCueData {
  return {
    timestamp: 0,
    executionCount: 1,
    audioData: {
      timestamp: 0,
      overallLevel: 0.5,
      bpm: 120,
      beatDetected: false,
      energy: 0.5,
    },
    config: DEFAULT_AUDIO_CONFIG,
    enabledBandCount: 0,
  }
}

/** Minimal valid set-color action with a literal-source group target so the compiler accepts it. */
function setColorAction(id: string): ActionNode {
  return {
    id,
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
      opacity: { source: 'literal', value: 1 },
    },
    timing: {
      waitForCondition: { source: 'literal', value: 'none' },
      waitForTime: { source: 'literal', value: 0 },
      duration: { source: 'literal', value: 100 },
      waitUntilCondition: { source: 'literal', value: 'none' },
      waitUntilTime: { source: 'literal', value: 0 },
    },
    layer: { source: 'literal', value: 0 },
  } as unknown as ActionNode
}

function motionPatternAction(id: string): ActionNode {
  return {
    id,
    type: 'action',
    effectType: 'motion-pattern',
    target: {
      groups: { source: 'literal', value: 'front' },
      filter: { source: 'literal', value: 'all' },
    },
    motionPattern: {
      pattern: { source: 'literal', value: 'circle' },
      size: { source: 'literal', value: 30 },
    },
    timing: {
      waitForCondition: { source: 'literal', value: 'none' },
      waitForTime: { source: 'literal', value: 0 },
      duration: { source: 'literal', value: 400 },
      waitUntilCondition: { source: 'literal', value: 'none' },
      waitUntilTime: { source: 'literal', value: 0 },
    },
    layer: { source: 'literal', value: 120 },
  } as unknown as ActionNode
}

function trivialYargLightingCueDef(): YargLightingNodeCueDefinition {
  const ev: YargEventNode = { id: 'ev-called', type: 'event', eventType: 'cue-called' }
  return {
    kind: 'lighting',
    id: 'trivial-yarg',
    name: 'Trivial yarg',
    cueType: 'Chorus',
    style: 'primary',
    variables: [],
    nodes: { events: [ev], actions: [setColorAction('sc1')], logic: [] },
    connections: [{ from: 'ev-called', to: 'sc1' }],
    layout: { nodePositions: {} },
  } as unknown as YargLightingNodeCueDefinition
}

function trivialYargMotionCueDef(): YargMotionNodeCueDefinition {
  const ev: YargEventNode = { id: 'ev-called', type: 'event', eventType: 'cue-called' }
  return {
    kind: 'motion',
    id: 'trivial-motion',
    name: 'Trivial motion',
    variables: [],
    nodes: { events: [ev], actions: [motionPatternAction('mp1')], logic: [] },
    connections: [{ from: 'ev-called', to: 'mp1' }],
    layout: { nodePositions: {} },
  } as YargMotionNodeCueDefinition
}

function trivialAudioLightingCueDef(): AudioLightingNodeCueDefinition {
  return {
    kind: 'lighting',
    id: 'trivial-audio',
    cueTypeId: 'trivial-audio',
    name: 'Trivial audio',
    style: 'primary',
    variables: [],
    nodes: {
      events: [{ id: 'ev-called', type: 'event', eventType: 'cue-called' }],
      actions: [setColorAction('sc1')],
      logic: [],
    },
    connections: [{ from: 'ev-called', to: 'sc1' }],
    layout: { nodePositions: {} },
  } as unknown as AudioLightingNodeCueDefinition
}

describe('releaseSequencer drops per-sequencer state', () => {
  const lightManager = new DmxLightManager(createMockLightingConfig())

  it('YargNodeCue: execute populates state, releaseSequencer drops it', () => {
    const compiled = NodeCueCompiler.compileYargCue(trivialYargLightingCueDef())
    const cue = new YargNodeCue('g1', compiled)
    const seqA = makeSequencerStub()
    const seqB = makeSequencerStub()
    cue.execute(minimalYargCueData(), seqA, lightManager)
    cue.execute(minimalYargCueData(), seqB, lightManager)

    // The states map is private; cast to peek for this regression assertion.
    const states = (cue as unknown as { states: Map<ILightingController, unknown> }).states
    expect(states.size).toBe(2)

    cue.releaseSequencer(seqA)
    expect(states.size).toBe(1)
    expect(states.has(seqA)).toBe(false)
    expect(states.has(seqB)).toBe(true)

    cue.releaseSequencer(seqB)
    expect(states.size).toBe(0)
  })

  it('YargMotionNodeCue: releaseSequencer drops per-sequencer state', () => {
    const compiled = NodeCueCompiler.compileYargCue(trivialYargMotionCueDef())
    const cue = new YargMotionNodeCue('g1', compiled)
    const seqA = makeSequencerStub()
    cue.execute(minimalYargCueData(), seqA, lightManager)
    const states = (cue as unknown as { states: Map<ILightingController, unknown> }).states
    expect(states.size).toBe(1)
    cue.releaseSequencer(seqA)
    expect(states.size).toBe(0)
  })

  it('AudioNodeCue: releaseSequencer drops per-sequencer state and per-sequencer group store', async () => {
    const compiled = NodeCueCompiler.compileAudioCue(trivialAudioLightingCueDef())
    const cue = new AudioNodeCue('g1', compiled)
    const seqA = makeSequencerStub()
    await cue.execute(minimalAudioCueData(), seqA, lightManager)
    const states = (cue as unknown as { states: Map<ILightingController, unknown> }).states
    expect(states.size).toBe(1)
    const groupStores = (
      cue.constructor as unknown as {
        groupLevelVarStores: Map<ILightingController, unknown>
      }
    ).groupLevelVarStores
    expect(groupStores.has(seqA)).toBe(true)

    cue.releaseSequencer(seqA)
    expect(states.size).toBe(0)
    expect(groupStores.has(seqA)).toBe(false)
  })

  it('releaseSequencer for an unknown sequencer is a safe no-op', () => {
    const compiled = NodeCueCompiler.compileYargCue(trivialYargLightingCueDef())
    const cue = new YargNodeCue('g1', compiled)
    const unrelated = makeSequencerStub()
    expect(() => cue.releaseSequencer(unrelated)).not.toThrow()
  })

  it('Audio group-var stores are per-sequencer, not shared across rigs', async () => {
    const compiled = NodeCueCompiler.compileAudioCue(trivialAudioLightingCueDef())
    const cue = new AudioNodeCue('g1', compiled)
    const seqA = makeSequencerStub()
    const seqB = makeSequencerStub()
    await cue.execute(minimalAudioCueData(), seqA, lightManager)
    await cue.execute(minimalAudioCueData(), seqB, lightManager)

    const groupStores = (
      cue.constructor as unknown as {
        groupLevelVarStores: Map<ILightingController, Map<string, Map<string, unknown>>>
      }
    ).groupLevelVarStores

    // Each rig has its own per-group-id var map under its own sequencer key. Authors mutate
    // group vars during execute(); sharing the store across rigs would mean rig A's writes
    // bleed into rig B's reads, drifting lockstep operation apart.
    expect(groupStores.has(seqA)).toBe(true)
    expect(groupStores.has(seqB)).toBe(true)
    expect(groupStores.get(seqA)).not.toBe(groupStores.get(seqB))
  })
})
