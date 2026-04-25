import { describe, expect, it } from '@jest/globals'
import { NodeCueCompiler } from '../../../../cues/node/compiler/NodeCueCompiler'
import type {
  ActionNode,
  YargEventNode,
  YargNodeCueDefinition,
} from '../../../../cues/types/nodeCueTypes'
import { CueData, CueType } from '../../../../cues/types/cueTypes'
import { YargNodeCue } from '../../../../cues/node/runtime/YargNodeCue'
import { EffectRegistry } from '../../../../cues/node/runtime/EffectRegistry'
import type { NodeRuntimeCallbacks } from '../../../../cues/node/runtime/executionTypes'
import { DmxLightManager } from '../../../../controllers/DmxLightManager'
import { createMockLightingConfig } from '../../../helpers/testFixtures'
import type { ILightingController } from '../../../../controllers/sequencer/interfaces'

type RecordedCall = { method: 'addEffect' | 'setEffect'; name: string }

function createRecordingSequencer(): { sequencer: ILightingController; recorded: RecordedCall[] } {
  const recorded: RecordedCall[] = []
  const sequencer = {
    addEffect: (name: string) => {
      recorded.push({ method: 'addEffect', name })
    },
    setEffect: (name: string) => {
      recorded.push({ method: 'setEffect', name })
    },
    addEffectUnblockedName: (name: string) => {
      recorded.push({ method: 'addEffect', name })
      return true
    },
    setEffectUnblockedName: (name: string) => {
      recorded.push({ method: 'setEffect', name })
      return true
    },
    removeEffect: () => {},
    addEffectWithCallback: (name: string, _effect: unknown, callback: () => void) => {
      recorded.push({ method: 'addEffect', name })
      callback()
    },
    setEffectWithCallback: (name: string, _effect: unknown, callback: () => void) => {
      recorded.push({ method: 'setEffect', name })
      callback()
    },
    addEffectUnblockedNameWithCallback: (name: string, _effect: unknown, callback: () => void) => {
      recorded.push({ method: 'addEffect', name })
      callback()
    },
    setEffectUnblockedNameWithCallback: (name: string, _effect: unknown, callback: () => void) => {
      recorded.push({ method: 'setEffect', name })
      callback()
    },
    removeEffectCallback: () => {},
    blackout: () => Promise.resolve(),
    onBeat: () => {},
    onMeasure: () => {},
    onKeyframe: () => {},
    removeEffectByLayer: () => {},
  }
  return { sequencer: sequencer as unknown as ILightingController, recorded }
}

function createSetColorAction(duration: number): ActionNode {
  return {
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
      duration: { source: 'literal', value: duration },
      waitUntilCondition: { source: 'literal', value: 'none' },
      waitUntilTime: { source: 'literal', value: 0 },
      easing: { source: 'literal', value: 'linear' },
    },
  }
}

function createCueDefinition(events: YargEventNode[], duration: number): YargNodeCueDefinition {
  return {
    id: 'execution-lifecycle',
    name: 'Execution Lifecycle',
    kind: 'lighting',
    cueType: CueType.Default,
    style: 'primary',
    nodes: {
      events,
      actions: [createSetColorAction(duration)],
      logic: [],
    },
    connections: events.map((event) => ({ from: event.id, to: 'action1' })),
  }
}

const noopCallbacks: NodeRuntimeCallbacks = { emit: () => {} }

const baseCueData: CueData = {
  beat: 'Strong',
  strobeState: 'Strobe_Off',
  venueSize: 'Large',
  beatsPerMinute: 120,
} as CueData

describe('YargNodeCue execution lifecycle', () => {
  it('runs cue-started once and cue-called on every execute', async () => {
    const { sequencer, recorded } = createRecordingSequencer()
    const def = createCueDefinition(
      [
        { id: 'ev-start', type: 'event', eventType: 'cue-started' },
        { id: 'ev-called', type: 'event', eventType: 'cue-called' },
      ],
      0,
    )
    const nodeCue = new YargNodeCue(
      'group1',
      NodeCueCompiler.compileYargCue(def),
      new EffectRegistry(),
      noopCallbacks,
    )
    const lightManager = new DmxLightManager(createMockLightingConfig())

    await nodeCue.execute(baseCueData, sequencer, lightManager)
    await nodeCue.execute(baseCueData, sequencer, lightManager)

    expect(recorded.filter((call) => call.method === 'setEffect')).toHaveLength(1)
    expect(recorded.filter((call) => call.method === 'addEffect')).toHaveLength(2)
  })

  it('re-enters cue-called-only cues on every execute', async () => {
    const { sequencer, recorded } = createRecordingSequencer()
    const def = createCueDefinition(
      [{ id: 'ev-called', type: 'event', eventType: 'cue-called' }],
      200,
    )
    const nodeCue = new YargNodeCue(
      'group1',
      NodeCueCompiler.compileYargCue(def),
      new EffectRegistry(),
      noopCallbacks,
    )
    const lightManager = new DmxLightManager(createMockLightingConfig())

    await nodeCue.execute(baseCueData, sequencer, lightManager)
    await nodeCue.execute(baseCueData, sequencer, lightManager)

    expect(recorded.filter((call) => call.method === 'setEffect')).toHaveLength(1)
    expect(recorded.filter((call) => call.method === 'addEffect')).toHaveLength(1)
  })
})
