/**
 * Tests for GraphExecutionEngine (cue-graph policy). Key scenarios ported from
 * NodeExecutionEngine.test.ts to assert identical sequencer behaviour.
 * Includes regression coverage for sustained strobe/Frenzy (repeated same-cue).
 */

import { beforeEach, describe, expect, it } from '@jest/globals'
import { NodeCueCompiler } from '../../../../cues/node/compiler/NodeCueCompiler'
import type {
  YargNodeCueDefinition,
  YargEventNode,
  ActionNode,
} from '../../../../cues/types/nodeCueTypes'
import { CueType } from '../../../../cues/types/cueTypes'
import { GraphExecutionEngine } from '../../../../cues/node/v2/GraphExecutionEngine'
import { cueGraphPolicy } from '../../../../cues/node/v2/GraphExecutionPolicy'
import { CueSession } from '../../../../cues/node/v2/CueSession'
import { EffectRegistry } from '../../../../cues/node/runtime/EffectRegistry'
import { DmxLightManager } from '../../../../controllers/DmxLightManager'
import { createMockLightingConfig } from '../../../helpers/testFixtures'
import type { ILightingController } from '../../../../controllers/sequencer/interfaces'
import type { CueData } from '../../../../cues/types/cueTypes'
import type { NodeRuntimeCallbacks } from '../../../../cues/node/runtime/executionTypes'

const noopCallbacks: NodeRuntimeCallbacks = { emit: () => {} }

function minimalCueDefinition(): YargNodeCueDefinition {
  const eventNode: YargEventNode = {
    id: 'event1',
    type: 'event',
    eventType: 'cue-started',
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
    id: 'test-cue',
    name: 'Test Cue',
    cueType: CueType.Sweep,
    style: 'primary',
    nodes: { events: [eventNode], actions: [actionNode], logic: [] },
    connections: [{ from: 'event1', to: 'action1' }],
  }
}

/** Cue with cue-started (setup) and cue-called (action): setup runs once, cue-called runs every execute (sustain pattern). */
function sustainPatternCueDefinition(): YargNodeCueDefinition {
  const eventStart: YargEventNode = { id: 'ev-start', type: 'event', eventType: 'cue-started' }
  const eventCalled: YargEventNode = { id: 'ev-called', type: 'event', eventType: 'cue-called' }
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
      duration: { source: 'literal', value: 0 },
      waitUntilCondition: { source: 'literal', value: 'none' },
      waitUntilTime: { source: 'literal', value: 0 },
      easing: 'linear',
    },
  }
  return {
    id: 'sustain-cue',
    name: 'Sustain Cue',
    cueType: CueType.Sweep,
    style: 'primary',
    nodes: {
      events: [eventStart, eventCalled],
      actions: [actionNode],
      logic: [],
    },
    connections: [
      { from: 'ev-start', to: 'action1' },
      { from: 'ev-called', to: 'action1' },
    ],
  }
}

describe('GraphExecutionEngine', () => {
  let lightManager: DmxLightManager
  let sequencer: ILightingController
  let session: CueSession
  let compiledCue: ReturnType<typeof NodeCueCompiler.compileYargCue>
  const cueId = 'group1:test-cue'
  const groupId = 'group1'

  beforeEach(() => {
    lightManager = new DmxLightManager(createMockLightingConfig())
    sequencer = {
      addEffect: jest.fn(),
      setEffect: jest.fn(),
      removeEffect: jest.fn(),
      addEffectWithCallback: jest.fn((_name: string, _e: unknown, cb: () => void) => {
        if (cb) setTimeout(cb, 0)
      }),
      setEffectWithCallback: jest.fn((_name: string, _e: unknown, cb: () => void) => {
        if (cb) setTimeout(cb, 0)
      }),
      addEffectUnblockedNameWithCallback: jest.fn((_name: string, _e: unknown, cb: () => void) => {
        if (cb) setTimeout(cb, 0)
      }),
      setEffectUnblockedNameWithCallback: jest.fn((_name: string, _e: unknown, cb: () => void) => {
        if (cb) setTimeout(cb, 0)
      }),
      removeEffectCallback: jest.fn(),
      blackout: jest.fn().mockResolvedValue(undefined),
      onBeat: jest.fn(),
      onMeasure: jest.fn(),
      onKeyframe: jest.fn(),
      addEffectUnblockedName: jest.fn().mockReturnValue(true),
      setEffectUnblockedName: jest.fn().mockReturnValue(true),
      removeEffectByLayer: jest.fn(),
    } as unknown as ILightingController
    session = new CueSession()
    const def = minimalCueDefinition()
    session.initializeVariables(def.variables ?? [], [])
    compiledCue = NodeCueCompiler.compileYargCue(def)
  })

  describe('cue-graph policy', () => {
    it('runs cue-started -> action and produces setEffect (first submission)', () => {
      const policy = cueGraphPolicy(groupId, cueId)
      const engine = GraphExecutionEngine.forCue(
        compiledCue,
        cueId,
        policy,
        session,
        sequencer,
        lightManager,
        new EffectRegistry(),
        compiledCue.definition.variables ?? [],
        noopCallbacks,
      )
      const params: CueData = { beat: 'Strong', strobeState: 'Strobe_Off' } as CueData
      engine.startCueRun(params, { hasCueStartedFired: false })

      expect(sequencer.setEffectUnblockedName).toHaveBeenCalled()
      expect((sequencer.setEffectUnblockedName as jest.Mock).mock.calls[0][0]).toContain(cueId)
    })

    it('cancelAll clears state and removes effects', () => {
      const policy = cueGraphPolicy(groupId, cueId)
      const engine = GraphExecutionEngine.forCue(
        compiledCue,
        cueId,
        policy,
        session,
        sequencer,
        lightManager,
        new EffectRegistry(),
        compiledCue.definition.variables ?? [],
        noopCallbacks,
      )
      const params: CueData = { beat: 'Strong', strobeState: 'Strobe_Off' } as CueData
      engine.startCueRun(params, { hasCueStartedFired: false })
      engine.cancelAll(false)

      expect(sequencer.removeEffectCallback).toHaveBeenCalled()
      expect(engine.hasActiveContexts()).toBe(false)
    })

    it('cancelAll(skipEffectRemoval) does not remove effects', () => {
      const policy = cueGraphPolicy(groupId, cueId)
      const engine = GraphExecutionEngine.forCue(
        compiledCue,
        cueId,
        policy,
        session,
        sequencer,
        lightManager,
        new EffectRegistry(),
        compiledCue.definition.variables ?? [],
        noopCallbacks,
      )
      const params: CueData = { beat: 'Strong', strobeState: 'Strobe_Off' } as CueData
      engine.startCueRun(params, { hasCueStartedFired: false })
      ;(sequencer.removeEffect as jest.Mock).mockClear()
      engine.cancelAll(true)

      expect(sequencer.removeEffectCallback).toHaveBeenCalled()
      expect(sequencer.removeEffect).not.toHaveBeenCalled()
    })
  })

  describe('sustain behaviour (repeated same-cue)', () => {
    it('first run runs cue-started then cue-called; second run with hasCueStartedFired runs only cue-called', () => {
      const def = sustainPatternCueDefinition()
      const compiled = NodeCueCompiler.compileYargCue(def)
      session.initializeVariables(def.variables ?? [], [])
      const policy = cueGraphPolicy(groupId, 'group1:sustain-cue')
      const engine = GraphExecutionEngine.forCue(
        compiled,
        'group1:sustain-cue',
        policy,
        session,
        sequencer,
        lightManager,
        new EffectRegistry(),
        compiled.definition.variables ?? [],
        noopCallbacks,
      )
      const params: CueData = { beat: 'Strong', strobeState: 'Strobe_Off' } as CueData

      engine.startCueRun(params, { hasCueStartedFired: false })
      expect(sequencer.setEffectUnblockedName).toHaveBeenCalledTimes(1)
      expect(sequencer.addEffectUnblockedName).toHaveBeenCalledTimes(1)

      engine.startCueRun(params, { hasCueStartedFired: true })
      expect(sequencer.setEffectUnblockedName).toHaveBeenCalledTimes(1)
      expect(sequencer.addEffectUnblockedName).toHaveBeenCalledTimes(2)
    })

    it('when run is active, second startCueRun queues and replaces previous queue', async () => {
      jest.useFakeTimers()
      const def = sustainPatternCueDefinition()
      const blockingDef: YargNodeCueDefinition = {
        ...def,
        nodes: {
          ...def.nodes,
          actions: [
            {
              ...(def.nodes.actions[0] as ActionNode),
              timing: {
                ...(def.nodes.actions[0] as ActionNode).timing,
                waitUntilCondition: { source: 'literal', value: 'delay' as const },
                waitUntilTime: { source: 'literal', value: 10 },
              },
            },
          ],
        },
      }
      const compiled = NodeCueCompiler.compileYargCue(blockingDef)
      session.initializeVariables(blockingDef.variables ?? [], [])
      const policy = cueGraphPolicy(groupId, 'group1:sustain-cue')
      const engine = GraphExecutionEngine.forCue(
        compiled,
        'group1:sustain-cue',
        policy,
        session,
        sequencer,
        lightManager,
        new EffectRegistry(),
        compiled.definition.variables ?? [],
        noopCallbacks,
      )
      const params: CueData = { beat: 'Strong', strobeState: 'Strobe_Off' } as CueData

      engine.startCueRun(params, { hasCueStartedFired: false })
      engine.startCueRun({ ...params, beat: 'Weak' }, { hasCueStartedFired: false })
      engine.startCueRun({ ...params, beat: 'Measure' }, { hasCueStartedFired: false })
      expect(sequencer.setEffectUnblockedNameWithCallback).toHaveBeenCalledTimes(1)
      await jest.runAllTimersAsync()
      expect(sequencer.setEffectUnblockedNameWithCallback).toHaveBeenCalledTimes(1)
      expect(sequencer.addEffectUnblockedNameWithCallback).toHaveBeenCalledTimes(2)
      jest.useRealTimers()
    })
  })
})
