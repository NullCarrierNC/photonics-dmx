/**
 * Regression tests for the fix that makes a `waitForCondition` gate block downstream graph
 * execution (previously only `waitUntilCondition` did). An action gated solely by `waitFor`
 * must submit via the blocking (...WithCallback) path and must not run downstream nodes
 * until the effect's completion callback fires. Covers both the cue (NodeExecutionEngine)
 * and effect (EffectExecutionEngine) engines, single-action and chain.
 */
import { jest } from '@jest/globals'
import { NodeExecutionEngine } from '../../../../cues/node/runtime/NodeExecutionEngine'
import { EffectExecutionEngine } from '../../../../cues/node/runtime/EffectExecutionEngine'
import { NodeCueCompiler } from '../../../../cues/node/compiler/NodeCueCompiler'
import { EffectCompiler } from '../../../../cues/node/compiler/EffectCompiler'
import { EffectRegistry } from '../../../../cues/node/runtime/EffectRegistry'
import type {
  ActionNode,
  Connection,
  YargEventNode,
  YargNodeCueDefinition,
  YargEffectDefinition,
} from '../../../../cues/types/nodeCueTypes'
import { CueType, defaultCueData, type CueData } from '../../../../cues'
import type { ILightingController } from '../../../../controllers/sequencer/interfaces'
import type { DmxLightManager } from '../../../../controllers/DmxLightManager'
import { noopRuntimeBroadcaster } from '../../../../runtime/broadcaster'

/** set-color action; pass timing overrides to set waitFor/waitUntil. */
const colorAction = (
  id: string,
  timing: { waitFor?: string; waitForTime?: number; waitUntil?: string } = {},
): ActionNode =>
  ({
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
    },
    timing: {
      waitForCondition: { source: 'literal', value: timing.waitFor ?? 'none' },
      waitForTime: { source: 'literal', value: timing.waitForTime ?? 0 },
      duration: { source: 'literal', value: 0 },
      waitUntilCondition: { source: 'literal', value: timing.waitUntil ?? 'none' },
      waitUntilTime: { source: 'literal', value: 0 },
    },
    layer: { source: 'literal', value: 2 },
  }) as unknown as ActionNode

/** motion-pattern action — used as a non-chainable downstream node to break action-chaining. */
const motionAction = (id: string): ActionNode =>
  ({
    id,
    type: 'action',
    effectType: 'motion-pattern',
    target: {
      groups: { source: 'literal', value: 'front' },
      filter: { source: 'literal', value: 'all' },
    },
    motionPattern: {
      pattern: { source: 'literal', value: 'circle' },
      speed: { source: 'literal', value: 0.5 },
      size: { source: 'literal', value: 30 },
    },
    timing: {
      waitForCondition: { source: 'literal', value: 'none' },
      waitForTime: { source: 'literal', value: 0 },
      duration: { source: 'literal', value: 0 },
      waitUntilCondition: { source: 'literal', value: 'none' },
      waitUntilTime: { source: 'literal', value: 0 },
    },
    layer: { source: 'literal', value: 3 },
  }) as unknown as ActionNode

const makeMockSequencer = (): jest.Mocked<ILightingController> =>
  ({
    addEffect: jest.fn(),
    replaceEffect: jest.fn(),
    setEffect: jest.fn(),
    addEffectWithCallback: jest.fn(),
    setEffectWithCallback: jest.fn(),
    addEffectUnblockedName: jest.fn().mockReturnValue(true),
    setEffectUnblockedName: jest.fn().mockReturnValue(true),
    addEffectUnblockedNameWithCallback: jest.fn(),
    setEffectUnblockedNameWithCallback: jest.fn(),
    removeEffectCallback: jest.fn(),
    removeEffect: jest.fn(),
    cancelPanTiltClear: jest.fn(),
    schedulePanTiltClear: jest.fn(),
    addMotionPattern: jest.fn(),
    getMotionPattern: jest.fn().mockReturnValue(undefined),
    removeMotionPattern: jest.fn(),
    updateMotionPatternConfig: jest.fn(),
  }) as unknown as jest.Mocked<ILightingController>

const makeMockLightManager = (): jest.Mocked<DmxLightManager> =>
  ({
    getLights: jest.fn(() => [{ id: 'light1', group: 'front', location: 'left' }]),
  }) as unknown as jest.Mocked<DmxLightManager>

const cueData = (): CueData => ({ ...defaultCueData, lightingCue: CueType.Default })

/** Capture the callback passed to addEffectUnblockedNameWithCallback so the block can be released. */
function captureBlockingCallbacks(sequencer: jest.Mocked<ILightingController>): Array<() => void> {
  const callbacks: Array<() => void> = []
  ;(sequencer.addEffectUnblockedNameWithCallback as jest.Mock).mockImplementation(
    (_name, _effect, cb) => {
      if (cb) callbacks.push(cb as () => void)
    },
  )
  return callbacks
}

function makeCueEngine(
  actions: ActionNode[],
  connections: Connection[],
  sequencer: jest.Mocked<ILightingController>,
): { engine: NodeExecutionEngine; event: YargEventNode } {
  const event = { id: 'event-1', type: 'event', eventType: 'beat' } as YargEventNode
  const def: YargNodeCueDefinition = {
    id: 'wf-cue',
    name: 'WaitFor Cue',
    kind: 'lighting',
    cueType: CueType.Default,
    style: 'primary',
    nodes: {
      events: [event],
      actions,
      logic: [],
      eventRaisers: [],
      eventListeners: [],
      effectRaisers: [],
    },
    connections,
  }
  const engine = new NodeExecutionEngine(
    NodeCueCompiler.compileYargCue(def),
    'group:wf-cue',
    sequencer,
    makeMockLightManager(),
    noopRuntimeBroadcaster(),
    new Map(),
    new Map(),
    new EffectRegistry(),
  )
  return { engine, event }
}

function makeEffectEngine(
  actions: ActionNode[],
  connections: Connection[],
  sequencer: jest.Mocked<ILightingController>,
): EffectExecutionEngine {
  const def = {
    id: 'wf-effect',
    mode: 'yarg',
    name: 'WaitFor Effect',
    description: '',
    variables: [],
    nodes: {
      events: [],
      actions,
      logic: [],
      eventRaisers: [],
      eventListeners: [],
      effectListeners: [
        {
          id: 'listener-1',
          type: 'effect-listener',
          label: 'Entry',
          outputs: [actions[0].id],
        } as never,
      ],
    },
    connections: [{ from: 'listener-1', to: actions[0].id }, ...connections],
    layout: { nodePositions: {} },
  } as unknown as YargEffectDefinition
  return new EffectExecutionEngine(
    EffectCompiler.compile(def as never) as never,
    sequencer,
    makeMockLightManager(),
    noopRuntimeBroadcaster(),
    {},
    cueData(),
  )
}

describe('waitForCondition blocks downstream graph execution', () => {
  describe('cue engine (NodeExecutionEngine)', () => {
    it('single waitFor-only action submits as blocking and gates the downstream node', () => {
      const sequencer = makeMockSequencer()
      const callbacks = captureBlockingCallbacks(sequencer)
      // action1 (set-color, waitFor delay) -> action2 (motion-pattern, breaks chaining)
      const { engine, event } = makeCueEngine(
        [colorAction('a1', { waitFor: 'delay', waitForTime: 100 }), motionAction('a2')],
        [
          { from: 'event-1', to: 'a1' },
          { from: 'a1', to: 'a2' },
        ],
        sequencer,
      )

      engine.startExecution(event, cueData())

      // a1 submitted via the blocking path; a2 (downstream) has NOT run yet.
      expect(sequencer.addEffectUnblockedNameWithCallback).toHaveBeenCalledTimes(1)
      expect(sequencer.addEffect).not.toHaveBeenCalled()
      expect(sequencer.addMotionPattern).not.toHaveBeenCalled()

      // Release the block — now the downstream motion action runs.
      callbacks[0]()
      expect(sequencer.addMotionPattern).toHaveBeenCalledTimes(1)
    })

    it('waitFor-only set-color chain submits as blocking', () => {
      const sequencer = makeMockSequencer()
      captureBlockingCallbacks(sequencer)
      const { engine, event } = makeCueEngine(
        [
          colorAction('c1', { waitFor: 'delay', waitForTime: 100 }),
          colorAction('c2', { waitFor: 'delay', waitForTime: 100 }),
        ],
        [
          { from: 'event-1', to: 'c1' },
          { from: 'c1', to: 'c2' },
        ],
        sequencer,
      )

      engine.startExecution(event, cueData())

      expect(sequencer.addEffectUnblockedNameWithCallback).toHaveBeenCalledTimes(1)
      expect(sequencer.addEffectUnblockedName).not.toHaveBeenCalled()
    })
  })

  describe('effect engine (EffectExecutionEngine)', () => {
    it('single waitFor-only action submits as blocking', () => {
      const sequencer = makeMockSequencer()
      captureBlockingCallbacks(sequencer)
      const engine = makeEffectEngine(
        [colorAction('a1', { waitFor: 'delay', waitForTime: 100 }), motionAction('a2')],
        [{ from: 'a1', to: 'a2' }],
        sequencer,
      )

      engine.triggerEffect(cueData())

      expect(sequencer.addEffectUnblockedNameWithCallback).toHaveBeenCalledTimes(1)
      expect(sequencer.addEffect).not.toHaveBeenCalled()
      expect(sequencer.addMotionPattern).not.toHaveBeenCalled()
    })

    it('waitFor-only set-color chain submits as blocking', () => {
      const sequencer = makeMockSequencer()
      captureBlockingCallbacks(sequencer)
      const engine = makeEffectEngine(
        [
          colorAction('c1', { waitFor: 'delay', waitForTime: 100 }),
          colorAction('c2', { waitFor: 'delay', waitForTime: 100 }),
        ],
        [{ from: 'c1', to: 'c2' }],
        sequencer,
      )

      engine.triggerEffect(cueData())

      expect(sequencer.addEffectUnblockedNameWithCallback).toHaveBeenCalledTimes(1)
      expect(sequencer.addEffectUnblockedName).not.toHaveBeenCalled()
    })
  })
})
