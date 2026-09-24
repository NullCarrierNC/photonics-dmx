import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
import { NodeCueCompiler } from '../../../../cues/node/compiler/NodeCueCompiler'
import { NodeExecutionEngine } from '../../../../cues/node/runtime/NodeExecutionEngine'
import { EffectRegistry } from '../../../../cues/node/runtime/EffectRegistry'
import { LightingNodeCue } from '../../../../cues/node/runtime/LightingNodeCue'
import { AudioNodeCue } from '../../../../cues/node/runtime/AudioNodeCue'
import type { AudioCueData } from '../../../../cues/types/audioCueTypes'
import type { AudioEventNodeUnion } from '../../../../cues/types/nodeCueTypes'
import { DEFAULT_AUDIO_CONFIG } from '../../../../listeners/Audio/AudioConfig'
import type { NodeCueDebugSwitch } from '../../../../cues/node/runtime/executionTypes'
import type {
  ActionNode,
  NetEventNode,
  NetLightingNodeCueDefinition,
} from '../../../../cues/types/nodeCueTypes'
import { DmxLightManager } from '../../../../controllers/DmxLightManager'
import { createMockLightingConfig } from '../../../helpers/testFixtures'
import { fakeLightingController } from '../../../helpers/fakeLightingController'
import { noopRuntimeBroadcaster } from '../../../../runtime/broadcaster'
import type { CueData } from '../../../../cues/types/cueTypes'
import {
  resetLogConfiguration,
  setLogSink,
  setMinLogLevel,
  type LogEntry,
} from '../../../../../shared/logger'

const called: NetEventNode = { id: 'ev-called', type: 'event', eventType: 'cue-called' }

const definition = {
  kind: 'lighting',
  id: 'debug-cue',
  name: 'Debug cue',
  cueType: 'Chorus',
  style: 'primary',
  variables: [],
  nodes: {
    events: [called],
    actions: [
      {
        id: 'sc1',
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
          waitUntilCondition: { source: 'literal', value: 'none' },
          waitUntilTime: { source: 'literal', value: 0 },
        },
      } as unknown as ActionNode,
    ],
    logic: [],
  },
  connections: [{ from: 'ev-called', to: 'sc1' }],
  layout: { nodePositions: {} },
} as unknown as NetLightingNodeCueDefinition

const cueData = { beatsPerMinute: 120, lightingCue: 'Chorus' } as unknown as CueData

let entries: LogEntry[]

beforeEach(() => {
  entries = []
  setMinLogLevel('debug')
  setLogSink((entry) => {
    entries.push(entry)
  })
})

afterEach(() => {
  resetLogConfiguration()
})

function buildEngine(debug?: NodeCueDebugSwitch): NodeExecutionEngine {
  return new NodeExecutionEngine(
    NodeCueCompiler.compileCue<NetEventNode>(definition, 'yarg'),
    'g1:debug-cue',
    fakeLightingController(),
    new DmxLightManager(createMockLightingConfig()),
    noopRuntimeBroadcaster(),
    new Map(),
    new Map(),
    new EffectRegistry(),
    [],
    { debug },
  )
}

const nodeCueLines = () => entries.filter((entry) => entry.message.startsWith('[NodeCue]'))

describe('node-cue debug switch', () => {
  it('logs only while the switch it was handed is on', () => {
    const debug: NodeCueDebugSwitch = { enabled: false }
    const engine = buildEngine(debug)

    engine.startExecution(called, cueData)
    expect(nodeCueLines()).toEqual([])

    debug.enabled = true
    engine.startExecution(called, cueData)
    expect(nodeCueLines().length).toBeGreaterThan(0)
  })

  it('keeps an engine with no switch quiet', () => {
    const engine = buildEngine()

    engine.startExecution(called, cueData)

    expect(nodeCueLines()).toEqual([])
  })

  it('reaches the engines a lighting cue builds', () => {
    const debug: NodeCueDebugSwitch = { enabled: true }
    const cue = new LightingNodeCue(
      'g1',
      NodeCueCompiler.compileCue(definition, 'yarg'),
      undefined,
      undefined,
      undefined,
      debug,
    )

    cue.execute(cueData, fakeLightingController(), new DmxLightManager(createMockLightingConfig()))

    expect(nodeCueLines().length).toBeGreaterThan(0)
  })

  it('reaches the engines an audio cue builds', async () => {
    const debug: NodeCueDebugSwitch = { enabled: true }
    const audioDefinition = { ...definition, cueTypeId: 'debug-audio' }
    const cue = new AudioNodeCue(
      'g1',
      NodeCueCompiler.compileCue<AudioEventNodeUnion>(audioDefinition as never, 'audio'),
      undefined,
      undefined,
      debug,
    )
    const audioCueData: AudioCueData = {
      timestamp: 0,
      executionCount: 1,
      audioData: { timestamp: 0, overallLevel: 0.5, bpm: 120, beatDetected: false, energy: 0.5 },
      config: DEFAULT_AUDIO_CONFIG,
      enabledBandCount: 0,
    }

    await cue.execute(
      audioCueData,
      fakeLightingController(),
      new DmxLightManager(createMockLightingConfig()),
    )

    expect(nodeCueLines().length).toBeGreaterThan(0)
  })
})
