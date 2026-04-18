/**
 * motion-pattern: re-entry via cue-called must not restart the pattern when the resolved config matches.
 */

import { beforeEach, describe, expect, it } from '@jest/globals'
import { NodeCueCompiler } from '../../../cues/node/compiler/NodeCueCompiler'
import type {
  YargMotionNodeCueDefinition,
  YargEventNode,
  ActionNode,
} from '../../../cues/types/nodeCueTypes'
import type { CueData } from '../../../cues/types/cueTypes'
import type { ActiveMotionPattern } from '../../../controllers/sequencer/interfaces'
import type { ResolvedMotionPatternSetting } from '../../../cues/node/compiler/ActionEffectFactory'
import { GraphExecutionEngine } from '../../../cues/node/runtime/GraphExecutionEngine'
import { motionCueGraphPolicy } from '../../../cues/node/runtime/GraphExecutionPolicy'
import { CueSession } from '../../../cues/node/runtime/CueSession'
import { EffectRegistry } from '../../../cues/node/runtime/EffectRegistry'
import { DmxLightManager } from '../../../controllers/DmxLightManager'
import { createMockLightingConfig } from '../../helpers/testFixtures'
import type { ILightingController } from '../../../controllers/sequencer/interfaces'
import type { NodeRuntimeCallbacks } from '../../../cues/node/runtime/executionTypes'
import type { TrackedLight } from '../../../types'

const noopCallbacks: NodeRuntimeCallbacks = { emit: () => {} }

const minimalParams = (): CueData =>
  ({
    beat: 'Strong',
    strobeState: 'Strobe_Off',
  }) as CueData

function motionPatternOnlyCue(): YargMotionNodeCueDefinition {
  const ev: YargEventNode = { id: 'ev-called', type: 'event', eventType: 'cue-called' }
  const action: ActionNode = {
    id: 'mp1',
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
      duration: { source: 'literal', value: 400 },
      waitUntilCondition: { source: 'literal', value: 'none' },
      waitUntilTime: { source: 'literal', value: 0 },
    },
    layer: { source: 'literal', value: 120 },
  }
  return {
    kind: 'motion',
    id: 'm1',
    name: 'Motion',
    nodes: { events: [ev], actions: [action], logic: [] },
    connections: [{ from: 'ev-called', to: 'mp1' }],
  }
}

describe('motion-pattern idempotency (cue-called)', () => {
  let lightManager: DmxLightManager
  let session: CueSession
  let patternStore: Map<string, ActiveMotionPattern>
  let sequencer: ILightingController
  const groupId = 'g'
  const cueId = `${groupId}:m1`

  beforeEach(() => {
    lightManager = new DmxLightManager(createMockLightingConfig())
    session = new CueSession()
    patternStore = new Map<string, ActiveMotionPattern>()

    sequencer = {
      addEffect: jest.fn(),
      setEffect: jest.fn(),
      removeEffect: jest.fn(),
      addEffectWithCallback: jest.fn(),
      setEffectWithCallback: jest.fn(),
      addEffectUnblockedName: jest.fn().mockReturnValue(true),
      setEffectUnblockedName: jest.fn().mockReturnValue(true),
      addEffectUnblockedNameWithCallback: jest.fn(),
      setEffectUnblockedNameWithCallback: jest.fn(),
      removeEffectCallback: jest.fn(),
      removeAllEffects: jest.fn(),
      removeEffectByLayer: jest.fn(),
      getActiveEffectsForLight: jest.fn(),
      isLayerFreeForLight: jest.fn(),
      setState: jest.fn(),
      blackout: jest.fn().mockResolvedValue(undefined),
      onBeat: jest.fn(),
      onMeasure: jest.fn(),
      onKeyframe: jest.fn(),
      cancelPanTiltClear: jest.fn(),
      schedulePanTiltClear: jest.fn(),
      getMotionPattern: jest.fn((name: string) => patternStore.get(name)),
      addMotionPattern: jest.fn(
        (
          name: string,
          config: ResolvedMotionPatternSetting,
          ls: TrackedLight[],
          layer: number,
          rampUpDurationMs: number,
        ) => {
          const run: ActiveMotionPattern = {
            name,
            config,
            lights: ls,
            layer,
            startTime: 0,
            rampUpDurationMs,
          }
          patternStore.set(name, run)
        },
      ),
      removeMotionPattern: jest.fn((name: string) => {
        patternStore.delete(name)
      }),
      updateMotionPatternConfig: jest.fn((name: string, config: ResolvedMotionPatternSetting) => {
        const run = patternStore.get(name)
        if (run) {
          run.config = config
        }
      }),
    } as unknown as ILightingController
  })

  it('does not call addMotionPattern again when config, layer, ramp, and lights match', () => {
    const def = motionPatternOnlyCue()
    session.initializeVariables(def.variables ?? [], [])
    const compiled = NodeCueCompiler.compileYargCue(def)
    const engine = GraphExecutionEngine.forCue(
      compiled,
      cueId,
      motionCueGraphPolicy(groupId, cueId),
      session,
      sequencer,
      lightManager,
      new EffectRegistry(),
      compiled.definition.variables ?? [],
      noopCallbacks,
    )
    const params = minimalParams()
    engine.startCueRun(params, { hasCueStartedFired: true })
    engine.startCueRun(params, { hasCueStartedFired: true })

    expect((sequencer.addMotionPattern as jest.Mock).mock.calls).toHaveLength(1)
  })

  it('calls addMotionPattern again when an existing pattern has a different resolved config', () => {
    const def = motionPatternOnlyCue()
    session.initializeVariables(def.variables ?? [], [])
    const compiled = NodeCueCompiler.compileYargCue(def)
    const engine = GraphExecutionEngine.forCue(
      compiled,
      cueId,
      motionCueGraphPolicy(groupId, cueId),
      session,
      sequencer,
      lightManager,
      new EffectRegistry(),
      compiled.definition.variables ?? [],
      noopCallbacks,
    )
    const params = minimalParams()
    const effectName = `${cueId}:mp1`

    engine.startCueRun(params, { hasCueStartedFired: true })
    expect((sequencer.addMotionPattern as jest.Mock).mock.calls).toHaveLength(1)

    const stored = patternStore.get(effectName)
    expect(stored).toBeDefined()
    const altered: ActiveMotionPattern = {
      ...stored!,
      config: { ...stored!.config, speedHz: 99 },
    }
    patternStore.set(effectName, altered)

    engine.startCueRun(params, { hasCueStartedFired: true })
    expect((sequencer.addMotionPattern as jest.Mock).mock.calls).toHaveLength(2)
  })

  it('updates bearing via updateMotionPatternConfig without restarting when other fields match', () => {
    const def: YargMotionNodeCueDefinition = {
      ...motionPatternOnlyCue(),
      variables: [
        {
          name: 'mb',
          type: 'string',
          scope: 'cue',
          initialValue: '180',
        },
      ],
    }
    def.nodes.actions[0] = {
      ...def.nodes.actions[0]!,
      motionPattern: {
        pattern: { source: 'literal', value: 'circle' },
        speed: { source: 'literal', value: 0.5 },
        size: { source: 'literal', value: 30 },
        bearing: { source: 'variable', name: 'mb' },
      },
    }
    session.initializeVariables(def.variables ?? [], [])
    const compiled = NodeCueCompiler.compileYargCue(def)
    const engine = GraphExecutionEngine.forCue(
      compiled,
      cueId,
      motionCueGraphPolicy(groupId, cueId),
      session,
      sequencer,
      lightManager,
      new EffectRegistry(),
      compiled.definition.variables ?? [],
      noopCallbacks,
    )
    const params = minimalParams()
    engine.startCueRun(params, { hasCueStartedFired: true })
    expect((sequencer.addMotionPattern as jest.Mock).mock.calls).toHaveLength(1)
    session.getCueLevelVarStore().set('mb', { type: 'string', value: '270' })
    engine.startCueRun(params, { hasCueStartedFired: true })
    expect((sequencer.addMotionPattern as jest.Mock).mock.calls).toHaveLength(1)
    expect((sequencer.updateMotionPatternConfig as jest.Mock).mock.calls).toHaveLength(1)
    const effectName = `${cueId}:mp1`
    expect(patternStore.get(effectName)?.config.bearingDeg).toBe(270)
  })
})
