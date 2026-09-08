/**
 * What the engine records when the sequencer refuses a submission because the name is already
 * running.
 */
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
import { NodeExecutionEngine } from '../../../../cues/node/runtime/NodeExecutionEngine'
import { EffectRegistry } from '../../../../cues/node/runtime/EffectRegistry'
import type { CompiledNetCue } from '../../../../cues/node/compiler/NodeCueCompiler'
import type {
  ActionNode,
  Connection,
  NetEventNode,
  NetNodeCueDefinition,
} from '../../../../cues/types/nodeCueTypes'
import { CueType, defaultCueData, type CueData } from '../../../../cues'
import { createSequencerHarness } from '../../../helpers/sequencerHarness'
import { noopRuntimeBroadcaster } from '../../../../runtime/broadcaster'
import { getEffectSingleColor } from '../../../../effects/effectSingleColor'
import type { RGBIO } from '../../../../types'
import {
  resetLogConfiguration,
  setLogSink,
  setMinLogLevel,
  type LogEntry,
} from '../../../../../shared/logger'

const CUE_ID = 'test-group:refusal-test'
const ACTION_ID = 'action-move'
/** The name the engine submits that action under, which is what the duplicate-name gate matches. */
const EFFECT_NAME = `${CUE_ID}:${ACTION_ID}`

const WHITE: RGBIO = {
  red: 255,
  green: 255,
  blue: 255,
  intensity: 255,
  opacity: 1,
  blendMode: 'replace',
}

const buildAdjacency = (connections: Connection[]): Map<string, Connection[]> => {
  const adjacency = new Map<string, Connection[]>()
  for (const connection of connections) {
    const list = adjacency.get(connection.from) ?? []
    list.push(connection)
    adjacency.set(connection.from, list)
  }
  return adjacency
}

const compileCue = (definition: NetNodeCueDefinition): CompiledNetCue => ({
  definition,
  mode: 'yarg',
  eventMap: new Map(definition.nodes.events.map((n) => [n.id, n])),
  actionMap: new Map(definition.nodes.actions.map((n) => [n.id, n])),
  logicMap: new Map(),
  eventRaiserMap: new Map(),
  eventListenerMap: new Map(),
  effectRaiserMap: new Map(),
  eventDefinitions: [],
  adjacency: buildAdjacency(definition.connections),
})

const eventNode: NetEventNode = { id: 'event-1', type: 'event', eventType: 'beat' }

/** One non-blocking move, so it takes the branch that submits and continues without waiting. */
const moveAction = {
  id: ACTION_ID,
  type: 'action',
  effectType: 'set-position',
  target: {
    groups: { source: 'literal', value: 'front' },
    filter: { source: 'literal', value: 'all' },
  },
  position: {
    mode: 'direction',
    bearing: { source: 'literal', value: 45 },
    angle: { source: 'literal', value: 20 },
  },
  timing: {
    waitForCondition: { source: 'literal', value: 'none' },
    waitForTime: { source: 'literal', value: 0 },
    duration: { source: 'literal', value: 100 },
    waitUntilCondition: { source: 'literal', value: 'none' },
    waitUntilTime: { source: 'literal', value: 0 },
    easing: { source: 'literal', value: 'linear' },
    level: { source: 'literal', value: 1 },
  },
  layer: { source: 'literal', value: 1 },
} as unknown as ActionNode

const definition: NetNodeCueDefinition = {
  id: 'refusal-test',
  name: 'Refusal Test',
  kind: 'lighting',
  cueType: CueType.Default,
  style: 'primary',
  nodes: {
    events: [eventNode],
    actions: [moveAction],
    logic: [],
    eventRaisers: [],
    eventListeners: [],
    effectRaisers: [],
  },
  connections: [{ from: 'event-1', to: ACTION_ID }],
}

const cueData = (): CueData => ({
  ...defaultCueData,
  lightingCue: CueType.Default,
  venueSize: 'Large',
  beatsPerMinute: 120,
})

describe('a set-position the sequencer refuses', () => {
  let harness: ReturnType<typeof createSequencerHarness>
  let entries: LogEntry[]

  beforeEach(() => {
    harness = createSequencerHarness({ frontCount: 2, backCount: 0, movingHead: true })
    entries = []
    setMinLogLevel('debug')
    setLogSink((entry) => entries.push(entry))
  })

  afterEach(() => {
    resetLogConfiguration()
    harness.cleanup()
  })

  /** The engine holds the settled-position record, so both attempts must run on one instance. */
  const makeEngine = (firstSubmissionUsesSetEffect: boolean): NodeExecutionEngine =>
    new NodeExecutionEngine(
      compileCue(definition),
      CUE_ID,
      harness.sequencer,
      harness.lightManager,
      noopRuntimeBroadcaster(),
      new Map(),
      new Map(),
      new EffectRegistry(),
      [],
      { firstSubmissionUsesSetEffectRef: { use: firstSubmissionUsesSetEffect } },
    )

  const refusalCount = (): number =>
    entries.filter((e) => e.message.includes('already running')).length

  const pan = (): number | undefined => harness.getLightState(harness.frontLightIds[0])?.pan

  /** Holds the name the action submits under, so the next submission of it is refused. */
  const occupyEffectName = (): void => {
    harness.sequencer.addEffect(
      EFFECT_NAME,
      getEffectSingleColor({
        color: WHITE,
        duration: 5000,
        lights: harness.lightManager.getLights(['front'], 'all'),
        layer: 1,
      }),
    )
    harness.advanceBy(20)
  }

  it('moves the light when nothing refuses it', () => {
    makeEngine(true).startExecution(eventNode, cueData())
    harness.advanceBy(200)

    expect(refusalCount()).toBe(0)
    expect(typeof pan()).toBe('number')
  })

  it('does not count as a position the light reached', () => {
    occupyEffectName()

    const engine = makeEngine(true)
    engine.startExecution(eventNode, cueData())
    harness.advanceBy(20)
    expect(refusalCount()).toBe(1)

    // Clear what refused it, then ask for the very same position again.
    harness.sequencer.removeAllEffects()
    harness.advanceBy(20)
    engine.startExecution(eventNode, cueData())
    harness.advanceBy(200)

    expect(typeof pan()).toBe('number')
  })
})
