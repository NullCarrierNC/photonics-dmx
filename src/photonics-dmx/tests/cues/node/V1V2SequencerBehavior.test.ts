/**
 * Sequencer comparison behavior tests: run the same cue under V1 and V2 and assert sequencer
 * call sequences match. See docs/node-system-v2-analysis.md § Testing Strategy.
 */

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
import { NodeCueCompiler } from '../../../cues/node/compiler/NodeCueCompiler'
import type {
  YargNodeCueDefinition,
  YargEventNode,
  ActionNode,
} from '../../../cues/types/nodeCueTypes'
import { CueType } from '../../../cues/types/cueTypes'
import { YargNodeCue } from '../../../cues/node/runtime/YargNodeCue'
import { YargNodeCueV2 } from '../../../cues/node/v2/YargNodeCueV2'
import { setNodeV2Enabled } from '../../../cues/node/v2/nodeV2FeatureFlag'
import { EffectRegistry } from '../../../cues/node/runtime/EffectRegistry'
import type { NodeRuntimeCallbacks } from '../../../cues/node/runtime/executionTypes'
import { DmxLightManager } from '../../../controllers/DmxLightManager'
import { createMockLightingConfig } from '../../helpers/testFixtures'
import type { ILightingController } from '../../../controllers/sequencer/interfaces'
import type { CueData } from '../../../cues/types/cueTypes'

type RecordedCall = {
  method: 'addEffect' | 'setEffect' | 'removeEffect'
  name: string
  layer?: number
}

function createRecordingSequencer(): { sequencer: ILightingController; recorded: RecordedCall[] } {
  const recorded: RecordedCall[] = []
  const sequencer = {
    addEffect: (name: string) => {
      recorded.push({ method: 'addEffect', name })
    },
    setEffect: (name: string) => {
      recorded.push({ method: 'setEffect', name })
    },
    removeEffect: (name: string, layer?: number) => {
      recorded.push({ method: 'removeEffect', name, layer })
    },
    addEffectWithCallback: (name: string, _e: unknown, cb: () => void) => {
      recorded.push({ method: 'addEffect', name })
      cb()
    },
    setEffectWithCallback: (name: string, _e: unknown, cb: () => void) => {
      recorded.push({ method: 'setEffect', name })
      cb()
    },
    addEffectUnblockedNameWithCallback: (name: string, _e: unknown, cb: () => void) => {
      recorded.push({ method: 'addEffect', name })
      cb()
    },
    setEffectUnblockedNameWithCallback: (name: string, _e: unknown, cb: () => void) => {
      recorded.push({ method: 'setEffect', name })
      cb()
    },
    removeEffectCallback: () => {},
    blackout: () => Promise.resolve(),
    onBeat: () => {},
    onMeasure: () => {},
    onKeyframe: () => {},
    addEffectUnblockedName: (name: string) => {
      recorded.push({ method: 'addEffect', name })
      return true
    },
    setEffectUnblockedName: (name: string) => {
      recorded.push({ method: 'setEffect', name })
      return true
    },
    removeEffectByLayer: () => {},
  }
  return { sequencer: sequencer as unknown as ILightingController, recorded }
}

function minimalCueDefinition(): YargNodeCueDefinition {
  return cueDefinitionWithEventType('cue-started')
}

/** Cue with cue-called as entry (no cue-started); used to extend verification coverage. */
function cueCalledOnlyDefinition(): YargNodeCueDefinition {
  return cueDefinitionWithEventType('cue-called')
}

function cueDefinitionWithEventType(
  eventType: 'cue-started' | 'cue-called',
): YargNodeCueDefinition {
  const eventNode: YargEventNode = {
    id: 'event1',
    type: 'event',
    eventType,
  }
  const actionNode: ActionNode = {
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
      duration: { source: 'literal', value: 200 },
      waitUntilCondition: { source: 'literal', value: 'none' },
      waitUntilTime: { source: 'literal', value: 0 },
      easing: 'linear',
    },
  }
  return {
    id: 'validation-cue',
    name: 'Validation Cue',
    cueType: CueType.Sweep,
    style: 'primary',
    nodes: { events: [eventNode], actions: [actionNode], logic: [] },
    connections: [{ from: 'event1', to: 'action1' }],
  }
}

describe('V1 vs V2 validation behavior', () => {
  let lightManager: DmxLightManager
  let cueDefinition: YargNodeCueDefinition
  let compiledCue: ReturnType<typeof NodeCueCompiler.compileYargCue>

  beforeEach(() => {
    lightManager = new DmxLightManager(createMockLightingConfig())
    cueDefinition = minimalCueDefinition()
    compiledCue = NodeCueCompiler.compileYargCue(cueDefinition)
  })

  afterEach(() => {
    setNodeV2Enabled(null)
  })

  it('same cue produces same sequencer call sequence under V1 and V2', async () => {
    const { sequencer: seqV1, recorded: recordedV1 } = createRecordingSequencer()
    const { sequencer: seqV2, recorded: recordedV2 } = createRecordingSequencer()
    const noopCallbacks: NodeRuntimeCallbacks = { emit: () => {} }

    setNodeV2Enabled(false)
    const cueV1 = new YargNodeCue('group1', compiledCue, new EffectRegistry(), {
      cueLevelVarStore: new Map(),
      groupLevelVarStore: new Map(),
      firstSubmissionUsesSetEffectRef: { use: false },
      runtimeCallbacks: noopCallbacks,
    })
    const params: CueData = {
      beat: 'Strong',
      strobeState: 'Strobe_Off',
    } as CueData
    await cueV1.execute(params, seqV1, lightManager)

    setNodeV2Enabled(true)
    const cueV2 = new YargNodeCueV2('group1', compiledCue, new EffectRegistry(), noopCallbacks)
    await cueV2.execute(params, seqV2, lightManager)

    const normalize = (calls: RecordedCall[]) =>
      calls.map((c) => ({ method: c.method, name: c.name }))
    expect(normalize(recordedV2)).toEqual(normalize(recordedV1))
    expect(recordedV1.length).toBeGreaterThan(0)
  })

  it('cue-called-only cue produces same sequencer call sequence under V1 and V2', async () => {
    const def = cueCalledOnlyDefinition()
    const compiled = NodeCueCompiler.compileYargCue(def)
    const { sequencer: seqV1, recorded: recordedV1 } = createRecordingSequencer()
    const { sequencer: seqV2, recorded: recordedV2 } = createRecordingSequencer()
    const noopCallbacks: NodeRuntimeCallbacks = { emit: () => {} }

    setNodeV2Enabled(false)
    const cueV1 = new YargNodeCue('group1', compiled, new EffectRegistry(), {
      cueLevelVarStore: new Map(),
      groupLevelVarStore: new Map(),
      firstSubmissionUsesSetEffectRef: { use: false },
      runtimeCallbacks: noopCallbacks,
    })
    const params: CueData = { beat: 'Strong', strobeState: 'Strobe_Off' } as CueData
    await cueV1.execute(params, seqV1, lightManager)

    setNodeV2Enabled(true)
    const cueV2 = new YargNodeCueV2('group1', compiled, new EffectRegistry(), noopCallbacks)
    await cueV2.execute(params, seqV2, lightManager)

    const normalize = (calls: RecordedCall[]) =>
      calls.map((c) => ({ method: c.method, name: c.name }))
    expect(normalize(recordedV2)).toEqual(normalize(recordedV1))
    expect(recordedV1.length).toBeGreaterThan(0)
  })
})
