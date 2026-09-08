/**
 * A blackout action releasing its own active action when the fade ends.
 */
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
import { NodeExecutionEngine } from '../../../../cues/node/runtime/NodeExecutionEngine'
import { EffectRegistry } from '../../../../cues/node/runtime/EffectRegistry'
import type { CompiledNetCue } from '../../../../cues/node/compiler/NodeCueCompiler'
import type {
  ActionNode,
  Connection,
  LogicNode,
  NetEventNode,
  NetNodeCueDefinition,
} from '../../../../cues/types/nodeCueTypes'
import { CueType, defaultCueData, type CueData } from '../../../../cues'
import { createSequencerHarness } from '../../../helpers/sequencerHarness'
import { noopRuntimeBroadcaster } from '../../../../runtime/broadcaster'
import { getEffectSingleColor } from '../../../../effects/effectSingleColor'
import type { RGBIO } from '../../../../types'

const BLACKOUT_MS = 40
/** Completes first, which advances the execution phase while the blackout is still fading. */
const DELAY_MS = 10

const buildAdjacency = (connections: Connection[]): Map<string, Connection[]> => {
  const adjacency = new Map<string, Connection[]>()
  for (const connection of connections) {
    const list = adjacency.get(connection.from) ?? []
    list.push(connection)
    adjacency.set(connection.from, list)
  }
  return adjacency
}

const eventNode: NetEventNode = { id: 'event-1', type: 'event', eventType: 'beat' }

const blackoutAction = {
  id: 'action-blackout',
  type: 'action',
  effectType: 'blackout',
  timing: {
    waitForCondition: { source: 'literal', value: 'none' },
    waitForTime: { source: 'literal', value: 0 },
    duration: { source: 'literal', value: BLACKOUT_MS },
    waitUntilCondition: { source: 'literal', value: 'none' },
    waitUntilTime: { source: 'literal', value: 0 },
  },
} as unknown as ActionNode

const delayNode = {
  id: 'logic-delay',
  type: 'logic',
  logicType: 'delay',
  label: 'delay',
  outputs: [],
  delayTime: { source: 'literal', value: DELAY_MS },
} as unknown as LogicNode

const definition: NetNodeCueDefinition = {
  id: 'blackout-test',
  name: 'Blackout Test',
  kind: 'lighting',
  cueType: CueType.Default,
  style: 'primary',
  nodes: {
    events: [eventNode],
    actions: [blackoutAction],
    logic: [delayNode],
    eventRaisers: [],
    eventListeners: [],
    effectRaisers: [],
  },
  // The event fans out, so the delay and the blackout run in the same batch.
  connections: [
    { from: 'event-1', to: 'action-blackout' },
    { from: 'event-1', to: 'logic-delay' },
  ],
}

const compiled: CompiledNetCue = {
  definition,
  mode: 'yarg',
  eventMap: new Map([[eventNode.id, eventNode]]),
  actionMap: new Map([[blackoutAction.id, blackoutAction]]),
  logicMap: new Map([[delayNode.id, delayNode]]),
  eventRaiserMap: new Map(),
  eventListenerMap: new Map(),
  effectRaiserMap: new Map(),
  eventDefinitions: [],
  adjacency: buildAdjacency(definition.connections),
}

const cueData = (): CueData => ({
  ...defaultCueData,
  lightingCue: CueType.Default,
  venueSize: 'Large',
  beatsPerMinute: 120,
})

const settle = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

describe('a blackout action whose phase advances while it fades', () => {
  let harness: ReturnType<typeof createSequencerHarness>

  beforeEach(() => {
    harness = createSequencerHarness({ frontCount: 2, backCount: 0 })
  })

  afterEach(() => harness.cleanup())

  /** A blackout only takes time when the manager has lights to fade, so light the rig first. */
  const lightTheRig = (): void => {
    const white: RGBIO = {
      red: 255,
      green: 255,
      blue: 255,
      intensity: 255,
      opacity: 1,
      blendMode: 'replace',
    }
    harness.sequencer.addEffect(
      'seed',
      getEffectSingleColor({
        color: white,
        duration: 0,
        lights: harness.lightManager.getLights(['front'], 'all'),
        layer: 0,
      }),
    )
    harness.advanceBy(20)
  }

  it('still completes its run', async () => {
    lightTheRig()
    const engine = new NodeExecutionEngine(
      compiled,
      'test-group:blackout-test',
      harness.sequencer,
      harness.lightManager,
      noopRuntimeBroadcaster(),
      new Map(),
      new Map(),
      new EffectRegistry(),
    )

    let completed = false
    engine.startExecutionWithCallback(eventNode, cueData(), () => {
      completed = true
    })

    await settle(BLACKOUT_MS + 80)

    expect(completed).toBe(true)
  })
})
