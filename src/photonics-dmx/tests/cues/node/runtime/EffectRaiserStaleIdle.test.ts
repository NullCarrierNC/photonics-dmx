/**
 * Effect-raiser engine tracking across a microtask boundary. A cue re-called in the same pass as
 * the beat that finished a run retires the engine and tracks a replacement, and the retired
 * engine's queued idle callback runs afterwards.
 */
import { NodeExecutionEngine } from '../../../../cues/node/runtime/NodeExecutionEngine'
import { EffectCompiler } from '../../../../cues/node/compiler/EffectCompiler'
import { EffectRegistry } from '../../../../cues/node/runtime/EffectRegistry'
import type { CompiledNetCue } from '../../../../cues/node/compiler/NodeCueCompiler'
import type {
  ActionNode,
  Connection,
  NetEventNode,
  NetNodeCueDefinition,
  YargEffectDefinition,
} from '../../../../cues/types/nodeCueTypes'
import type { CueData } from '../../../../cues/types/cueTypes'
import { CueType } from '../../../../cues/types/cueTypes'
import type { ILightingController } from '../../../../controllers/sequencer/interfaces'
import type { DmxLightManager } from '../../../../controllers/DmxLightManager'
import { noopRuntimeBroadcaster } from '../../../../runtime/broadcaster'

/** The idle callback is queued as a microtask, so let it run before asserting on it. */
const flushIdle = (): Promise<void> => Promise.resolve()

const EFFECT_ID = 'stale-idle-effect'
const RAISER_ID = 'raiser-1'
const DOWNSTREAM_ID = 'downstream-action'

/** One blocking set-color, so each trigger holds the engine busy and counts one submission. */
const createBlockingEffect = (): YargEffectDefinition =>
  ({
    id: EFFECT_ID,
    mode: 'yarg',
    name: 'Blocking Effect',
    description: '',
    variables: [],
    nodes: {
      events: [],
      actions: [
        {
          id: 'effect-action',
          type: 'action',
          effectType: 'set-color',
          target: {
            groups: { source: 'literal', value: 'front' },
            filter: { source: 'literal', value: 'all' },
          },
          color: {
            name: { source: 'literal', value: 'blue' },
            brightness: { source: 'literal', value: 'medium' },
            blendMode: { source: 'literal', value: 'replace' },
          },
          timing: {
            waitForCondition: { source: 'literal', value: 'none' },
            waitForTime: { source: 'literal', value: 0 },
            duration: { source: 'literal', value: 50 },
            waitUntilCondition: { source: 'literal', value: 'beat' },
            waitUntilTime: { source: 'literal', value: 0 },
            easing: { source: 'literal', value: 'linear' },
            level: { source: 'literal', value: 1 },
          },
          layer: { source: 'literal', value: 0 },
        },
      ],
      logic: [],
      eventRaisers: [],
      eventListeners: [],
      effectListeners: [
        { id: 'effect-listener', type: 'effect-listener', label: 'Entry', outputs: [] },
      ],
    },
    connections: [{ from: 'effect-listener', to: 'effect-action' }],
    layout: { nodePositions: {} },
  }) as unknown as YargEffectDefinition

/** Non-blocking, so it submits through addEffect and continues without waiting. */
const downstreamAction = {
  id: DOWNSTREAM_ID,
  type: 'action',
  effectType: 'set-color',
  target: {
    groups: { source: 'literal', value: 'back' },
    filter: { source: 'literal', value: 'all' },
  },
  color: {
    name: { source: 'literal', value: 'red' },
    brightness: { source: 'literal', value: 'low' },
    blendMode: { source: 'literal', value: 'replace' },
  },
  timing: {
    waitForCondition: { source: 'literal', value: 'none' },
    waitForTime: { source: 'literal', value: 0 },
    duration: { source: 'literal', value: 10 },
    waitUntilCondition: { source: 'literal', value: 'none' },
    waitUntilTime: { source: 'literal', value: 0 },
    easing: { source: 'literal', value: 'linear' },
    level: { source: 'literal', value: 1 },
  },
  layer: { source: 'literal', value: 1 },
} as unknown as ActionNode

const eventNode: NetEventNode = { id: 'event-called', type: 'event', eventType: 'cue-called' }

const buildAdjacency = (connections: Connection[]): Map<string, Connection[]> => {
  const adjacency = new Map<string, Connection[]>()
  for (const connection of connections) {
    const list = adjacency.get(connection.from) ?? []
    list.push(connection)
    adjacency.set(connection.from, list)
  }
  return adjacency
}

/** cue-called -> effect raiser -> a downstream action the raiser only reaches when it goes idle. */
const compileCue = (isPersistent: boolean): CompiledNetCue => {
  const raiserNode = {
    id: RAISER_ID,
    type: 'effect-raiser' as const,
    effectId: EFFECT_ID,
    label: 'Raise Effect',
    outputs: [],
    ...(isPersistent ? { isPersistent: true } : {}),
  }

  const connections: Connection[] = [
    { from: 'event-called', to: RAISER_ID },
    { from: RAISER_ID, to: DOWNSTREAM_ID },
  ]

  const definition = {
    id: 'stale-idle-cue',
    name: 'Stale Idle Cue',
    kind: 'lighting',
    cueType: CueType.Default,
    style: 'primary',
    nodes: {
      events: [eventNode],
      actions: [downstreamAction],
      logic: [],
      eventRaisers: [],
      eventListeners: [],
      effectRaisers: [raiserNode],
    },
    connections,
  } as unknown as NetNodeCueDefinition

  return {
    definition,
    mode: 'yarg',
    eventMap: new Map([['event-called', eventNode]]),
    actionMap: new Map([[DOWNSTREAM_ID, downstreamAction]]),
    logicMap: new Map(),
    eventRaiserMap: new Map(),
    eventListenerMap: new Map(),
    effectRaiserMap: new Map([[RAISER_ID, raiserNode]]),
    eventDefinitions: [],
    adjacency: buildAdjacency(connections),
  } as unknown as CompiledNetCue
}

const cueData = (): CueData =>
  ({
    datagramVersion: 1,
    platform: 'Unknown',
    currentScene: 'Gameplay',
    pauseState: 'Unpaused',
    venueSize: 'Small',
    beatsPerMinute: 120,
    songSection: 'None',
    guitarNotes: [],
    bassNotes: [],
    drumNotes: [],
    keysNotes: [],
    vocalNote: 0,
    harmony0Note: 0,
    harmony1Note: 0,
    harmony2Note: 0,
    lightingCue: 'default',
    postProcessing: 'Default',
    fogState: false,
    strobeState: 'Strobe_Off',
    performer: 0,
    keyframe: 'Off',
    bonusEffect: false,
    beat: 'Strong',
  }) as unknown as CueData

describe('an effect raiser whose idle arrives after its engine was replaced', () => {
  let mockSequencer: ILightingController
  let mockLightManager: DmxLightManager
  /** Completion callbacks for the blocking submissions, one per effect trigger. */
  let blockingCallbacks: Array<(cancelled?: boolean) => void>

  beforeEach(() => {
    blockingCallbacks = []
    mockSequencer = {
      addEffect: jest.fn(),
      setEffect: jest.fn(),
      replaceEffect: jest.fn(),
      addEffectUnblockedName: jest.fn().mockReturnValue(true),
      setEffectUnblockedName: jest.fn().mockReturnValue(true),
      // Hold the callbacks rather than firing them, so the test decides when a run finishes.
      addEffectUnblockedNameWithCallback: jest.fn((_name, _effect, callback) => {
        blockingCallbacks.push(callback)
        return true
      }),
      setEffectUnblockedNameWithCallback: jest.fn((_name, _effect, callback) => {
        blockingCallbacks.push(callback)
        return true
      }),
      removeEffectCallback: jest.fn(),
      removeEffect: jest.fn(),
      removeAllEffects: jest.fn(),
      removeEffectByLayer: jest.fn(),
      removeMotionPattern: jest.fn(),
      blackout: jest.fn(),
    } as unknown as ILightingController

    mockLightManager = {
      getLights: jest.fn().mockReturnValue([{ id: 'light1', position: 1, config: {} }]),
    } as unknown as DmxLightManager
  })

  const makeEngine = (isPersistent: boolean): NodeExecutionEngine => {
    const effectRegistry = new EffectRegistry()
    effectRegistry.registerEffect(EFFECT_ID, EffectCompiler.compile(createBlockingEffect()))
    return new NodeExecutionEngine(
      compileCue(isPersistent),
      'test-group:stale-idle-cue',
      mockSequencer,
      mockLightManager,
      noopRuntimeBroadcaster(),
      new Map(),
      new Map(),
      effectRegistry,
    )
  }

  /** The frame that ends a run: the completion lands, then the same pass re-calls the cue. */
  const finishRunThenRecall = (engine: NodeExecutionEngine, index: number): void => {
    blockingCallbacks[index](false)
    engine.startExecution(eventNode, cueData())
  }

  const downstreamCount = (): number => (mockSequencer.addEffect as jest.Mock).mock.calls.length

  it('leaves the replacement tracked, so the next call is blocked', async () => {
    const engine = makeEngine(false)

    engine.startExecution(eventNode, cueData())
    expect(blockingCallbacks).toHaveLength(1)

    // Engine 1 completes and the cue is re-called in the same pass: engine 2 takes the slot.
    finishRunThenRecall(engine, 0)
    expect(blockingCallbacks).toHaveLength(2)

    // Engine 1's idle arrives now, after it has already been replaced.
    await flushIdle()

    // Engine 2 is still tracked and still busy, so this call is refused.
    engine.startExecution(eventNode, cueData())
    expect(blockingCallbacks).toHaveLength(2)
  })

  it('does not re-trigger a persistent engine that has been replaced', async () => {
    const engine = makeEngine(true)

    engine.startExecution(eventNode, cueData())
    expect(blockingCallbacks).toHaveLength(1)

    finishRunThenRecall(engine, 0)
    expect(blockingCallbacks).toHaveLength(2)

    // Engine 1 is retired, so its idle leaves the tracked engine 2 to run on alone.
    await flushIdle()
    expect(blockingCallbacks).toHaveLength(2)
  })

  it('re-triggers the persistent engine that holds the slot', async () => {
    const engine = makeEngine(true)

    engine.startExecution(eventNode, cueData())
    finishRunThenRecall(engine, 0)
    await flushIdle()
    expect(blockingCallbacks).toHaveLength(2)

    // Engine 2 owns the slot, so its own completion re-triggers it exactly once.
    blockingCallbacks[1](false)
    await flushIdle()
    expect(blockingCallbacks).toHaveLength(3)
  })

  it("runs the raiser's downstream nodes once, for the tracked engine", async () => {
    const engine = makeEngine(false)

    engine.startExecution(eventNode, cueData())
    finishRunThenRecall(engine, 0)

    // A retired engine's idle leaves the graph where it is.
    await flushIdle()
    expect(downstreamCount()).toBe(0)

    // The tracked engine finishing carries it on.
    blockingCallbacks[1](false)
    await flushIdle()
    expect(downstreamCount()).toBe(1)
  })
})
