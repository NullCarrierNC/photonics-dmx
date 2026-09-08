/**
 * How long the context that raised an effect stays alive.
 *
 * A raiser with nodes after it holds its context until the effect goes idle, so those nodes run
 * once per effect run and the cue's lifecycle gate stays closed meanwhile. A raiser with nothing
 * after it takes no hold, leaving the rest of the cue free to run while its effect plays.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { NodeExecutionEngine } from '../../../../cues/node/runtime/NodeExecutionEngine'
import { GraphExecutionEngine } from '../../../../cues/node/runtime/GraphExecutionEngine'
import { cueGraphPolicy } from '../../../../cues/node/runtime/GraphExecutionPolicy'
import { CueSession } from '../../../../cues/node/runtime/CueSession'
import { NodeCueCompiler } from '../../../../cues/node/compiler/NodeCueCompiler'
import { EffectCompiler } from '../../../../cues/node/compiler/EffectCompiler'
import { EffectRegistry } from '../../../../cues/node/runtime/EffectRegistry'
import type {
  ActionNode,
  LogicNode,
  NetEventNode,
  NetNodeCueDefinition,
  YargEffectDefinition,
} from '../../../../cues/types/nodeCueTypes'
import { CueType, type CueData } from '../../../../cues/types/cueTypes'
import type { ILightingController } from '../../../../controllers/sequencer/interfaces'
import type { DmxLightManager } from '../../../../controllers/DmxLightManager'
import type { NodeRuntimeCallbacks } from '../../../../cues/node/runtime/executionTypes'
import { noopRuntimeBroadcaster } from '../../../../runtime/broadcaster'

/** The idle callback is queued as a microtask, so let it run before asserting on it. */
const flushIdle = (): Promise<void> => Promise.resolve()

const EFFECT_ID = 'held-effect'
const RAISER_ID = 'raiser-1'
const CUE_ID = 'test-group:lifetime-cue'
const noopCallbacks: NodeRuntimeCallbacks = { emit: () => {} }

/** One blocking set-color, so the raised effect holds its engine busy until the test releases it. */
const blockingEffect = (): YargEffectDefinition =>
  ({
    id: EFFECT_ID,
    mode: 'yarg',
    name: 'Held Effect',
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

/** A set-color on the back lights; non-blocking unless a waitUntil is passed. */
const colorAction = (id: string, waitUntil = 'none'): ActionNode =>
  ({
    id,
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
      waitUntilCondition: { source: 'literal', value: waitUntil },
      waitUntilTime: { source: 'literal', value: 0 },
      easing: { source: 'literal', value: 'linear' },
      level: { source: 'literal', value: 1 },
    },
    layer: { source: 'literal', value: 1 },
  }) as unknown as ActionNode

const delayNode = (id: string, ms: number): LogicNode =>
  ({
    id,
    type: 'logic',
    logicType: 'delay',
    delayTime: { source: 'literal', value: ms },
  }) as unknown as LogicNode

const raiser = (options: { persistent?: boolean; interruptible?: boolean } = {}) => ({
  id: RAISER_ID,
  type: 'effect-raiser' as const,
  effectId: EFFECT_ID,
  label: 'Raise Effect',
  outputs: [],
  ...(options.persistent ? { isPersistent: true } : {}),
  ...(options.interruptible ? { interruptible: true } : {}),
})

/** A cue whose given events feed the given connections, compiled the way the runtime compiles one. */
const buildCue = (
  events: NetEventNode[],
  nodes: { actions?: ActionNode[]; logic?: LogicNode[]; effectRaisers?: unknown[] },
  connections: Array<{ from: string; to: string; fromPort?: string }>,
) => {
  const definition = {
    id: 'lifetime-cue',
    name: 'Lifetime Cue',
    kind: 'lighting',
    cueType: CueType.Default,
    style: 'primary',
    nodes: {
      events,
      actions: nodes.actions ?? [],
      logic: nodes.logic ?? [],
      eventRaisers: [],
      eventListeners: [],
      effectRaisers: nodes.effectRaisers ?? [],
    },
    connections,
    layout: { nodePositions: {} },
  } as unknown as NetNodeCueDefinition
  return NodeCueCompiler.compileCue(definition, 'yarg')
}

const cueData = (): CueData =>
  ({
    beat: 'Strong',
    strobeState: 'Strobe_Off',
    lightingCue: 'default',
    venueSize: 'Small',
  }) as unknown as CueData

describe('the context that raised an effect', () => {
  let sequencer: ILightingController
  let lightManager: DmxLightManager
  /** Completion callbacks for the effect's blocking submissions, one per effect run. */
  let effectRuns: Array<(cancelled?: boolean) => void>

  const registry = (): EffectRegistry => {
    const effectRegistry = new EffectRegistry()
    effectRegistry.registerEffect(EFFECT_ID, EffectCompiler.compile(blockingEffect()))
    return effectRegistry
  }

  beforeEach(() => {
    effectRuns = []
    const holdCallback = (
      _name: string,
      _effect: unknown,
      callback: (cancelled?: boolean) => void,
    ): boolean => {
      effectRuns.push(callback)
      return true
    }
    sequencer = {
      addEffect: jest.fn(),
      setEffect: jest.fn(),
      replaceEffect: jest.fn(),
      addEffectUnblockedName: jest.fn().mockReturnValue(true),
      setEffectUnblockedName: jest.fn().mockReturnValue(true),
      // Hold the effect's callbacks, so the test decides when a run finishes.
      addEffectUnblockedNameWithCallback: jest.fn(holdCallback),
      setEffectUnblockedNameWithCallback: jest.fn(holdCallback),
      removeEffectCallback: jest.fn(),
      removeEffect: jest.fn(),
      removeAllEffects: jest.fn(),
      removeEffectByLayer: jest.fn(),
      removeMotionPattern: jest.fn(),
      cancelPanTiltClear: jest.fn(),
      blackout: jest.fn(),
    } as unknown as ILightingController

    lightManager = {
      getLights: jest.fn().mockReturnValue([
        { id: 'front-1', position: 1, group: 'front', config: {} },
        { id: 'back-1', position: 1, group: 'back', config: {} },
      ]),
    } as unknown as DmxLightManager
  })

  const makeEngine = (compiled: ReturnType<typeof buildCue>): NodeExecutionEngine =>
    new NodeExecutionEngine(
      compiled,
      CUE_ID,
      sequencer,
      lightManager,
      noopRuntimeBroadcaster(),
      new Map(),
      new Map(),
      registry(),
    )

  /** Non-blocking downstream actions submit through addEffect. */
  const downstreamNames = (): string[] =>
    (sequencer.addEffect as jest.Mock).mock.calls.map((call) => call[0] as string)

  /** Every effect name the raised engines submitted; one per engine instance. */
  const raisedNames = (): string[] =>
    [
      ...(sequencer.addEffectUnblockedNameWithCallback as jest.Mock).mock.calls,
      ...(sequencer.setEffectUnblockedNameWithCallback as jest.Mock).mock.calls,
    ].map((call) => call[0] as string)

  const removedNames = (): string[] =>
    (sequencer.removeEffect as jest.Mock).mock.calls.map((call) => call[0] as string)

  describe('with nodes after it', () => {
    it('carries on through a downstream delay once the effect goes idle', async () => {
      jest.useFakeTimers()
      const event: NetEventNode = { id: 'ev', type: 'event', eventType: 'beat' }
      const engine = makeEngine(
        buildCue(
          [event],
          {
            actions: [colorAction('tail')],
            logic: [delayNode('wait', 100)],
            effectRaisers: [raiser()],
          },
          [
            { from: 'ev', to: RAISER_ID },
            { from: RAISER_ID, to: 'wait' },
            { from: 'wait', to: 'tail' },
          ],
        ),
      )

      engine.startExecution(event, cueData())
      expect(effectRuns).toHaveLength(1)

      effectRuns[0](false)
      await flushIdle()
      await jest.advanceTimersByTimeAsync(100)

      expect(downstreamNames()).toEqual([`${CUE_ID}:tail`])
      jest.useRealTimers()
    })

    it('carries on through a downstream blocking action', async () => {
      const event: NetEventNode = { id: 'ev', type: 'event', eventType: 'beat' }
      // A logic node separates the two actions: consecutive set-colors would be composed into one
      // chained submission, which would not exercise the blocking handover.
      const gap = {
        id: 'gap',
        type: 'logic',
        logicType: 'math',
        operator: 'add',
        left: { source: 'literal', value: 0 },
        right: { source: 'literal', value: 0 },
        assignTo: 'scratch',
      } as unknown as LogicNode
      const engine = makeEngine(
        buildCue(
          [event],
          {
            actions: [colorAction('blocking-tail', 'beat'), colorAction('tail')],
            logic: [gap],
            effectRaisers: [raiser()],
          },
          [
            { from: 'ev', to: RAISER_ID },
            { from: RAISER_ID, to: 'blocking-tail' },
            { from: 'blocking-tail', to: 'gap' },
            { from: 'gap', to: 'tail' },
          ],
        ),
      )

      engine.startExecution(event, cueData())
      effectRuns[0](false)
      await flushIdle()

      // The blocking downstream action registered and now holds the context itself.
      expect(effectRuns).toHaveLength(2)
      expect(downstreamNames()).toEqual([])

      effectRuns[1](false)
      expect(downstreamNames()).toEqual([`${CUE_ID}:tail`])
    })

    it('leaves no timer behind when the cue stops mid-delay', async () => {
      jest.useFakeTimers()
      const event: NetEventNode = { id: 'ev', type: 'event', eventType: 'beat' }
      const engine = makeEngine(
        buildCue(
          [event],
          {
            actions: [colorAction('tail')],
            logic: [delayNode('wait', 100)],
            effectRaisers: [raiser()],
          },
          [
            { from: 'ev', to: RAISER_ID },
            { from: RAISER_ID, to: 'wait' },
            { from: 'wait', to: 'tail' },
          ],
        ),
      )

      engine.startExecution(event, cueData())
      effectRuns[0](false)
      await flushIdle()

      engine.cancelAll()
      await jest.advanceTimersByTimeAsync(100)

      expect(downstreamNames()).toEqual([])
      jest.useRealTimers()
    })

    it('survives a stop while the idle callback is still queued', async () => {
      const event: NetEventNode = { id: 'ev', type: 'event', eventType: 'beat' }
      const engine = makeEngine(
        buildCue([event], { actions: [colorAction('tail')], effectRaisers: [raiser()] }, [
          { from: 'ev', to: RAISER_ID },
          { from: RAISER_ID, to: 'tail' },
        ]),
      )
      const onComplete = jest.fn()

      engine.startExecutionWithCallback(event, cueData(), onComplete)
      effectRuns[0](false)
      engine.cancelAll()

      await expect(flushIdle()).resolves.toBeUndefined()
      expect(downstreamNames()).toEqual([])
      expect(onComplete).not.toHaveBeenCalled()
    })

    it('releases the context without running its tail when a newer trigger interrupts it', async () => {
      const event: NetEventNode = { id: 'ev', type: 'event', eventType: 'beat' }
      const engine = makeEngine(
        buildCue(
          [event],
          { actions: [colorAction('tail')], effectRaisers: [raiser({ interruptible: true })] },
          [
            { from: 'ev', to: RAISER_ID },
            { from: RAISER_ID, to: 'tail' },
          ],
        ),
      )
      const firstComplete = jest.fn()

      engine.startExecutionWithCallback(event, cueData(), firstComplete)
      expect(firstComplete).not.toHaveBeenCalled()

      // A second trigger interrupts the running effect and takes the slot.
      engine.startExecution(event, cueData())

      expect(firstComplete).toHaveBeenCalledTimes(1)
      expect(downstreamNames()).toEqual([])

      // Only the replacement's own completion runs a tail.
      effectRuns[effectRuns.length - 1](false)
      await flushIdle()
      expect(downstreamNames()).toEqual([`${CUE_ID}:tail`])
    })

    it('keeps every interrupted engine tracked, so a cue stop leaves nothing running', async () => {
      const called: NetEventNode = { id: 'ev-called', type: 'event', eventType: 'cue-called' }
      const beat: NetEventNode = { id: 'ev-beat', type: 'event', eventType: 'beat' }
      const compiled = buildCue(
        [called, beat],
        { actions: [colorAction('tail')], effectRaisers: [raiser({ interruptible: true })] },
        [
          { from: 'ev-called', to: RAISER_ID },
          { from: 'ev-beat', to: RAISER_ID },
          { from: RAISER_ID, to: 'tail' },
        ],
      )
      const session = new CueSession()
      session.initializeVariables([], [])
      const engine = GraphExecutionEngine.forCue(
        compiled,
        CUE_ID,
        cueGraphPolicy('test-group', CUE_ID),
        session,
        sequencer,
        lightManager,
        noopRuntimeBroadcaster(),
        registry(),
        [],
        noopCallbacks,
      )

      // The first frame's raiser holds its context, closing the gate.
      engine.startCueRun({ ...cueData(), beat: 'Off' } as CueData, { hasCueStartedFired: true })

      // The second frame queues behind the closed gate.
      engine.startCueRun({ ...cueData(), beat: 'Off' } as CueData, { hasCueStartedFired: true })

      // The third frame's beat dispatches inline and interrupts the running effect. Releasing the
      // held context opens the gate, so the queued frame runs and reaches this same raiser again
      // while the interrupt that released it is still in progress.
      engine.startCueRun({ ...cueData(), beat: 'Weak' } as CueData, { hasCueStartedFired: true })

      engine.cancelAll(false)

      expect(raisedNames().length).toBeGreaterThan(1)
      expect([...removedNames()].sort()).toEqual([...raisedNames()].sort())
    })

    it('holds the cue lifecycle gate, so a frame arriving mid-run waits its turn', async () => {
      const called: NetEventNode = { id: 'ev-called', type: 'event', eventType: 'cue-called' }
      const compiled = buildCue(
        [called],
        { actions: [colorAction('tail')], effectRaisers: [raiser()] },
        [
          { from: 'ev-called', to: RAISER_ID },
          { from: RAISER_ID, to: 'tail' },
        ],
      )
      const session = new CueSession()
      session.initializeVariables([], [])
      const engine = GraphExecutionEngine.forCue(
        compiled,
        CUE_ID,
        cueGraphPolicy('test-group', CUE_ID),
        session,
        sequencer,
        lightManager,
        noopRuntimeBroadcaster(),
        registry(),
        [],
        noopCallbacks,
      )

      engine.startCueRun(cueData(), { hasCueStartedFired: true })
      expect(effectRuns).toHaveLength(1)

      // Frames keep arriving while the effect plays; each is queued rather than re-raising.
      engine.startCueRun(cueData(), { hasCueStartedFired: true })
      engine.startCueRun(cueData(), { hasCueStartedFired: true })
      expect(effectRuns).toHaveLength(1)
      expect(downstreamNames()).toEqual([])

      // The run finishes: the tail runs once, then the queued frame raises the effect again.
      effectRuns[0](false)
      await flushIdle()
      expect(downstreamNames()).toEqual([`${CUE_ID}:tail`])
      expect(effectRuns).toHaveLength(2)
    })
  })

  describe('with nothing after it', () => {
    it('completes its context at once, so the rest of the cue is not held up', async () => {
      const started: NetEventNode = { id: 'ev-start', type: 'event', eventType: 'cue-started' }
      const called: NetEventNode = { id: 'ev-called', type: 'event', eventType: 'cue-called' }
      const compiled = buildCue(
        [started, called],
        { actions: [colorAction('called-action')], effectRaisers: [raiser({ persistent: true })] },
        [
          { from: 'ev-start', to: RAISER_ID },
          { from: 'ev-called', to: 'called-action' },
        ],
      )
      const session = new CueSession()
      session.initializeVariables([], [])
      const engine = GraphExecutionEngine.forCue(
        compiled,
        CUE_ID,
        cueGraphPolicy('test-group', CUE_ID),
        session,
        sequencer,
        lightManager,
        noopRuntimeBroadcaster(),
        registry(),
        [],
        noopCallbacks,
      )

      engine.startCueRun(cueData(), { hasCueStartedFired: false })

      // The persistent effect is still running, and the cue-called chain has run anyway.
      expect(effectRuns).toHaveLength(1)
      expect(downstreamNames()).toEqual([`${CUE_ID}:called-action`])
    })
  })

  describe('inside a for-each-light loop', () => {
    it('continues per iteration rather than holding the loop open', async () => {
      const event: NetEventNode = { id: 'ev', type: 'event', eventType: 'beat' }
      const seed = {
        id: 'seed',
        type: 'logic',
        logicType: 'variable',
        mode: 'set',
        varName: 'lights',
        valueType: 'light-array',
        value: {
          source: 'literal',
          value: [
            { id: 'front-1', position: 1, group: 'front', config: {} },
            { id: 'back-1', position: 1, group: 'back', config: {} },
          ],
        },
      } as unknown as LogicNode
      const loop = {
        id: 'loop',
        type: 'logic',
        logicType: 'for-each-light',
        sourceVariable: 'lights',
        currentLightVariable: 'light',
        currentIndexVariable: 'index',
      } as unknown as LogicNode

      const engine = makeEngine(
        buildCue(
          [event],
          {
            actions: [colorAction('tail')],
            logic: [seed, loop],
            effectRaisers: [raiser()],
          },
          [
            { from: 'ev', to: 'seed' },
            { from: 'seed', to: 'loop' },
            { from: 'loop', to: RAISER_ID, fromPort: 'each' },
            { from: RAISER_ID, to: 'tail' },
          ],
        ),
      )

      engine.startExecution(event, cueData())

      // One engine per iteration, and the loop itself finishes without waiting for them.
      expect(effectRuns).toHaveLength(2)
      expect(downstreamNames()).toEqual([])

      effectRuns[0](false)
      effectRuns[1](false)
      await flushIdle()

      // Each iteration's engine carries the tail on when its own run ends. The tail submits under
      // the loop-less name because the iteration index is gone by then: a raiser inside a loop
      // cannot hold its context, so its downstream nodes lose their per-light identity.
      expect(downstreamNames()).toEqual([`${CUE_ID}:tail`, `${CUE_ID}:tail`])
    })
  })
})
