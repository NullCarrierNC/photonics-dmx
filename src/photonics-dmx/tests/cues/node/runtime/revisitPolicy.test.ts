/**
 * Proves the GraphExecutionPolicy `revisitPolicy` is load-bearing after the engine
 * consolidation: the value threaded into NodeExecutionEngine decides whether an
 * already-visited action node re-enters (relaxed) or is skipped (strict).
 *
 * Graph (diamond): event -> A, event -> B; A -> {C, A2}; B -> {C, B2}. The fan-out gives
 * A and B two successors each so the action-chain builder treats them as single actions,
 * and the convergence node C is reached from both A and B within one context.
 * - strict (cue default): C runs once.
 * - relaxed (effect policy): C re-enters and runs twice.
 */
import { jest } from '@jest/globals'
import { NodeExecutionEngine } from '../../../../cues/node/runtime/NodeExecutionEngine'
import { NodeCueCompiler } from '../../../../cues/node/compiler/NodeCueCompiler'
import { EffectRegistry } from '../../../../cues/node/runtime/EffectRegistry'
import type {
  ActionNode,
  YargEventNode,
  YargNodeCueDefinition,
} from '../../../../cues/types/nodeCueTypes'
import type { RevisitPolicy } from '../../../../cues/node/runtime/GraphExecutionPolicy'
import { CueType, defaultCueData, type CueData } from '../../../../cues'
import type { ILightingController } from '../../../../controllers/sequencer/interfaces'
import type { DmxLightManager } from '../../../../controllers/DmxLightManager'
import { noopRuntimeBroadcaster } from '../../../../runtime/broadcaster'

const makeAction = (id: string): ActionNode =>
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
      waitForCondition: { source: 'literal', value: 'none' },
      waitForTime: { source: 'literal', value: 0 },
      duration: { source: 'literal', value: 0 },
      waitUntilCondition: { source: 'literal', value: 'none' },
      waitUntilTime: { source: 'literal', value: 0 },
    },
    layer: { source: 'literal', value: 2 },
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

const diamondCue: YargNodeCueDefinition = {
  id: 'revisit-cue',
  name: 'Revisit Cue',
  kind: 'lighting',
  cueType: CueType.Default,
  style: 'primary',
  nodes: {
    events: [{ id: 'event-1', type: 'event', eventType: 'beat' } as YargEventNode],
    actions: [
      makeAction('A'),
      makeAction('B'),
      makeAction('C'),
      makeAction('A2'),
      makeAction('B2'),
    ],
    logic: [],
    eventRaisers: [],
    eventListeners: [],
    effectRaisers: [],
  },
  connections: [
    { from: 'event-1', to: 'A' },
    { from: 'event-1', to: 'B' },
    { from: 'A', to: 'C' },
    { from: 'A', to: 'A2' },
    { from: 'B', to: 'C' },
    { from: 'B', to: 'B2' },
  ],
}

function countSubmissionsForNodeC(revisitPolicy: RevisitPolicy): number {
  const sequencer = makeMockSequencer()
  const compiled = NodeCueCompiler.compileYargCue(diamondCue)
  const engine = new NodeExecutionEngine(
    compiled,
    'group:revisit-cue',
    sequencer,
    makeMockLightManager(),
    noopRuntimeBroadcaster(),
    new Map(),
    new Map(),
    new EffectRegistry(),
    [],
    undefined,
    undefined,
    undefined,
    undefined,
    revisitPolicy,
  )
  engine.startExecution(diamondCue.nodes.events[0], cueData())
  // Non-blocking set-color actions submit via addEffect(effectName, effect).
  return (sequencer.addEffect as jest.Mock).mock.calls.filter(
    (call) => call[0] === 'group:revisit-cue:C',
  ).length
}

describe('revisitPolicy is load-bearing', () => {
  it('strict policy runs a converged action node once', () => {
    expect(countSubmissionsForNodeC('strict')).toBe(1)
  })

  it('relaxed policy re-enters a converged action node', () => {
    expect(countSubmissionsForNodeC('relaxed')).toBe(2)
  })
})
