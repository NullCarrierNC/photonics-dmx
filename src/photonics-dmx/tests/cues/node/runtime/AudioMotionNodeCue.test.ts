/**
 * AudioMotionNodeCue: no lighting `style`, BPM cap for motion safety.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'

import { NodeCueCompiler } from '../../../../cues/node/compiler/NodeCueCompiler'
import {
  AUDIO_MOTION_MAX_BPM,
  AudioMotionNodeCue,
  withMotionSafeAudioData,
} from '../../../../cues/node/runtime/AudioMotionNodeCue'
import type {
  ActionNode,
  AudioEventNodeUnion,
  AudioMotionNodeCueDefinition,
  LogicNode,
} from '../../../../cues/types/nodeCueTypes'
import { ILightingController } from '../../../../controllers/sequencer/interfaces'
import { DmxLightManager } from '../../../../controllers/DmxLightManager'
import { createMockLightingConfig } from '../../../helpers/testFixtures'
import { createSequencerHarness } from '../../../helpers/sequencerHarness'
import type { AudioCueData } from '../../../../cues/types/audioCueTypes'
import { DEFAULT_AUDIO_CONFIG } from '../../../../listeners/Audio/AudioConfig'

function minimalMotionDefinition(): AudioMotionNodeCueDefinition {
  const ev: AudioEventNodeUnion = {
    id: 'ev-b',
    type: 'event',
    eventType: 'beat',
    threshold: 0.5,
    triggerMode: 'edge',
  }
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
    id: 'motion-test-1',
    name: 'Motion test',
    nodes: { events: [ev], actions: [action], logic: [] },
    connections: [{ from: 'ev-b', to: 'mp1' }],
    layout: { nodePositions: {} },
  }
}

describe('withMotionSafeAudioData', () => {
  it('caps bpm at AUDIO_MOTION_MAX_BPM', () => {
    const base: AudioCueData = {
      timestamp: 0,
      executionCount: 1,
      audioData: {
        timestamp: 0,
        overallLevel: 0.5,
        bpm: 180,
        beatDetected: false,
        energy: 0.5,
      },
      config: DEFAULT_AUDIO_CONFIG,
      enabledBandCount: 0,
    }
    const out = withMotionSafeAudioData(base)
    expect(out.audioData.bpm).toBe(AUDIO_MOTION_MAX_BPM)
  })
})

describe('AudioMotionNodeCue', () => {
  let lightManager: DmxLightManager
  let sequencer: ILightingController

  beforeEach(() => {
    const config = createMockLightingConfig()
    lightManager = new DmxLightManager(config)
    sequencer = {
      addEffect: jest.fn(),
      setEffect: jest.fn(),
      removeEffect: jest.fn(),
      removeAllEffects: jest.fn(),
      removeEffectByLayer: jest.fn(),
      addEffectUnblockedName: jest.fn(),
      setEffectUnblockedName: jest.fn(),
      cancelPanTiltClear: jest.fn(),
      addMotionPattern: jest.fn(),
      removeMotionPattern: jest.fn(),
      getMotionPattern: jest.fn(),
      updateMotionPatternConfig: jest.fn(),
      onBeat: jest.fn(),
    } as unknown as ILightingController
  })

  it('omits lighting style (not primary/secondary/strobe)', () => {
    const def = minimalMotionDefinition()
    const compiled = NodeCueCompiler.compileAudioCue(def)
    const cue = new AudioMotionNodeCue('g1', compiled)
    expect('style' in cue).toBe(false)
    expect((cue as { style?: string }).style).toBeUndefined()
  })

  it('uses motion id as cueType', () => {
    const def = minimalMotionDefinition()
    const compiled = NodeCueCompiler.compileAudioCue(def)
    const cue = new AudioMotionNodeCue('g1', compiled)
    expect(cue.cueType).toBe('motion-test-1')
  })

  it('caps BPM before cue-data and motion-pattern resolution when execute() receives bpm 180', async () => {
    const evStart: AudioEventNodeUnion = {
      id: 'ev-start',
      type: 'event',
      eventType: 'cue-started',
      threshold: 0.5,
      triggerMode: 'edge',
    }
    const cueDataNode: LogicNode = {
      id: 'logic-bpm',
      type: 'logic',
      logicType: 'cue-data',
      dataProperty: 'audio-bpm',
      assignTo: 'bpmVar',
    }
    const action: ActionNode = {
      id: 'mp-bpm',
      type: 'action',
      effectType: 'motion-pattern',
      target: {
        groups: { source: 'literal', value: 'front' },
        filter: { source: 'literal', value: 'all' },
      },
      motionPattern: {
        pattern: { source: 'literal', value: 'circle' },
        speed: { source: 'variable', name: 'bpmVar' },
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
    const def: AudioMotionNodeCueDefinition = {
      kind: 'motion',
      id: 'motion-bpm-cap-integration',
      name: 'BPM cap integration',
      nodes: {
        events: [evStart],
        actions: [action],
        logic: [cueDataNode],
      },
      connections: [
        { from: 'ev-start', to: 'logic-bpm' },
        { from: 'logic-bpm', to: 'mp-bpm' },
      ],
      layout: { nodePositions: {} },
      variables: [{ name: 'bpmVar', type: 'number', scope: 'cue', initialValue: 0 }],
    }
    const compiled = NodeCueCompiler.compileAudioCue(def)
    const cue = new AudioMotionNodeCue('g1', compiled)
    const data: AudioCueData = {
      timestamp: 0,
      executionCount: 1,
      audioData: {
        timestamp: 0,
        overallLevel: 0.5,
        bpm: 180,
        beatDetected: false,
        energy: 0.5,
      },
      config: DEFAULT_AUDIO_CONFIG,
      enabledBandCount: 0,
    }
    await cue.execute(data, sequencer, lightManager)
    expect(sequencer.addMotionPattern).toHaveBeenCalled()
    const call = (sequencer.addMotionPattern as jest.Mock).mock.calls[0]
    const resolvedMotion = call[1] as { speedHz: number }
    expect(resolvedMotion.speedHz).toBe(AUDIO_MOTION_MAX_BPM)
  })

  it('resolves audio-beat-duration-ms via cue-data into motion-pattern ramp (500 when bpm 0, 600 when bpm 100)', async () => {
    const evStart: AudioEventNodeUnion = {
      id: 'ev-start',
      type: 'event',
      eventType: 'cue-started',
      threshold: 0.5,
      triggerMode: 'edge',
    }
    const cueDataNode: LogicNode = {
      id: 'logic-beat-ms',
      type: 'logic',
      logicType: 'cue-data',
      dataProperty: 'audio-beat-duration-ms',
      assignTo: 'beatMs',
    }
    const action: ActionNode = {
      id: 'mp-dur',
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
        duration: { source: 'variable', name: 'beatMs' },
        waitUntilCondition: { source: 'literal', value: 'none' },
        waitUntilTime: { source: 'literal', value: 0 },
      },
      layer: { source: 'literal', value: 120 },
    }
    const def: AudioMotionNodeCueDefinition = {
      kind: 'motion',
      id: 'motion-beat-ms-integration',
      name: 'Beat ms integration',
      nodes: {
        events: [evStart],
        actions: [action],
        logic: [cueDataNode],
      },
      connections: [
        { from: 'ev-start', to: 'logic-beat-ms' },
        { from: 'logic-beat-ms', to: 'mp-dur' },
      ],
      layout: { nodePositions: {} },
      variables: [{ name: 'beatMs', type: 'number', scope: 'cue', initialValue: 0 }],
    }
    const compiled = NodeCueCompiler.compileAudioCue(def)
    const cue = new AudioMotionNodeCue('g1', compiled)

    const dataZero: AudioCueData = {
      timestamp: 0,
      executionCount: 1,
      audioData: {
        timestamp: 0,
        overallLevel: 0.5,
        bpm: 0,
        beatDetected: false,
        energy: 0.5,
      },
      config: DEFAULT_AUDIO_CONFIG,
      enabledBandCount: 0,
    }
    await cue.execute(dataZero, sequencer, lightManager)
    expect(sequencer.addMotionPattern).toHaveBeenCalled()
    let ramp = (sequencer.addMotionPattern as jest.Mock).mock.calls[0][4] as number
    expect(ramp).toBe(500)
    ;(sequencer.addMotionPattern as jest.Mock).mockClear()
    const cue100 = new AudioMotionNodeCue('g1', compiled)
    const data100: AudioCueData = {
      ...dataZero,
      audioData: { ...dataZero.audioData, bpm: 100 },
    }
    await cue100.execute(data100, sequencer, lightManager)
    expect(sequencer.addMotionPattern).toHaveBeenCalled()
    ramp = (sequencer.addMotionPattern as jest.Mock).mock.calls[0][4] as number
    expect(ramp).toBe(600)
  })

  it('does not call removeAllEffects on execute', async () => {
    const def = minimalMotionDefinition()
    const compiled = NodeCueCompiler.compileAudioCue(def)
    const cue = new AudioMotionNodeCue('g1', compiled)
    const data: AudioCueData = {
      timestamp: 0,
      executionCount: 1,
      audioData: {
        timestamp: 0,
        overallLevel: 0.5,
        bpm: 120,
        beatDetected: true,
        energy: 0.5,
      },
      config: DEFAULT_AUDIO_CONFIG,
      enabledBandCount: 0,
    }
    await cue.execute(data, sequencer, lightManager)
    expect(sequencer.removeAllEffects).not.toHaveBeenCalled()
  })

  describe('cue-called event lifecycle', () => {
    function audioCueData(executionCount: number): AudioCueData {
      return {
        timestamp: 0,
        executionCount,
        audioData: {
          timestamp: 0,
          overallLevel: 0.5,
          bpm: 120,
          beatDetected: false,
          energy: 0.5,
        },
        config: DEFAULT_AUDIO_CONFIG,
        enabledBandCount: 0,
      }
    }

    function buildCueCalledMotionDefinition(): AudioMotionNodeCueDefinition {
      const evCalled: AudioEventNodeUnion = {
        id: 'ev-called',
        type: 'event',
        eventType: 'cue-called',
        threshold: 0,
        triggerMode: 'edge',
      }
      const action: ActionNode = {
        id: 'mp-called',
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
        id: 'motion-cue-called',
        name: 'Cue called motion',
        nodes: { events: [evCalled], actions: [action], logic: [] },
        connections: [{ from: 'ev-called', to: 'mp-called' }],
        layout: { nodePositions: {} },
      }
    }

    it('fires cue-called downstream action on the first execute (no cue-started gating)', async () => {
      const def = buildCueCalledMotionDefinition()
      const compiled = NodeCueCompiler.compileAudioCue(def)
      const cue = new AudioMotionNodeCue('g1', compiled)
      await cue.execute(audioCueData(1), sequencer, lightManager)
      expect(sequencer.addMotionPattern).toHaveBeenCalledTimes(1)
    })

    it('re-enters cue-called every execute; motion-pattern idempotency still applies', async () => {
      const def = buildCueCalledMotionDefinition()
      const compiled = NodeCueCompiler.compileAudioCue(def)
      const cue = new AudioMotionNodeCue('g1', compiled)
      ;(sequencer.getMotionPattern as jest.Mock).mockReturnValue(undefined)

      await cue.execute(audioCueData(1), sequencer, lightManager)
      expect(sequencer.addMotionPattern).toHaveBeenCalledTimes(1)

      const [submittedName, submittedConfig, submittedLights, submittedLayer, submittedRampMs] = (
        sequencer.addMotionPattern as jest.Mock
      ).mock.calls[0] as unknown[]
      ;(sequencer.getMotionPattern as jest.Mock).mockImplementation((...args: unknown[]) => {
        if (args[0] === submittedName) {
          return {
            name: submittedName,
            config: submittedConfig,
            lights: submittedLights,
            layer: submittedLayer,
            startTime: 0,
            rampUpDurationMs: submittedRampMs,
          }
        }
        return undefined
      })

      await cue.execute(audioCueData(2), sequencer, lightManager)
      expect(sequencer.addMotionPattern).toHaveBeenCalledTimes(1)
    })

    it('runs cue-started exactly once while cue-called fires every frame', async () => {
      const evStart: AudioEventNodeUnion = {
        id: 'ev-start',
        type: 'event',
        eventType: 'cue-started',
        threshold: 0,
        triggerMode: 'edge',
      }
      const evCalled: AudioEventNodeUnion = {
        id: 'ev-called',
        type: 'event',
        eventType: 'cue-called',
        threshold: 0,
        triggerMode: 'edge',
      }
      const startAction: ActionNode = {
        id: 'mp-start',
        type: 'action',
        effectType: 'motion-pattern',
        target: {
          groups: { source: 'literal', value: 'front' },
          filter: { source: 'literal', value: 'all' },
        },
        motionPattern: {
          pattern: { source: 'literal', value: 'circle' },
          speed: { source: 'literal', value: 0.4 },
          size: { source: 'literal', value: 20 },
        },
        timing: {
          waitForCondition: { source: 'literal', value: 'none' },
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 400 },
          waitUntilCondition: { source: 'literal', value: 'none' },
          waitUntilTime: { source: 'literal', value: 0 },
        },
        layer: { source: 'literal', value: 121 },
      }
      const calledAction: ActionNode = {
        id: 'mp-called',
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
        layer: { source: 'literal', value: 122 },
      }
      const def: AudioMotionNodeCueDefinition = {
        kind: 'motion',
        id: 'motion-mixed-lifecycle',
        name: 'Mixed lifecycle',
        nodes: {
          events: [evStart, evCalled],
          actions: [startAction, calledAction],
          logic: [],
        },
        connections: [
          { from: 'ev-start', to: 'mp-start' },
          { from: 'ev-called', to: 'mp-called' },
        ],
        layout: { nodePositions: {} },
      }
      const compiled = NodeCueCompiler.compileAudioCue(def)
      const cue = new AudioMotionNodeCue('g1', compiled)

      ;(sequencer.getMotionPattern as jest.Mock).mockReturnValue(undefined)
      await cue.execute(audioCueData(1), sequencer, lightManager)
      expect(sequencer.addMotionPattern).toHaveBeenCalledTimes(2)
      const firstCallNames = (sequencer.addMotionPattern as jest.Mock).mock.calls.map(
        (call) => call[0],
      )
      expect(firstCallNames).toEqual(
        expect.arrayContaining([
          expect.stringContaining('mp-start'),
          expect.stringContaining('mp-called'),
        ]),
      )

      const calls = (sequencer.addMotionPattern as jest.Mock).mock.calls
      const submittedByName = new Map<string, unknown>()
      for (const call of calls) {
        const [name, config, lights, layer, rampUpDurationMs] = call as unknown[]
        submittedByName.set(name as string, {
          name,
          config,
          lights,
          layer,
          startTime: 0,
          rampUpDurationMs,
        })
      }
      ;(sequencer.getMotionPattern as jest.Mock).mockImplementation((...args: unknown[]) =>
        submittedByName.get(args[0] as string),
      )

      await cue.execute(audioCueData(2), sequencer, lightManager)
      expect(sequencer.addMotionPattern).toHaveBeenCalledTimes(2)
    })
  })
})

describe('AudioMotionNodeCue with real Sequencer', () => {
  it('cue-called set-position waits until beat then effect completes', async () => {
    const harness = createSequencerHarness({ frontCount: 2, backCount: 0 })
    try {
      const evCalled: AudioEventNodeUnion = {
        id: 'ev-called',
        type: 'event',
        eventType: 'cue-called',
        threshold: 0,
        triggerMode: 'edge',
      }
      const action: ActionNode = {
        id: 'sp1',
        type: 'action',
        effectType: 'set-position',
        target: {
          groups: { source: 'literal', value: 'front' },
          filter: { source: 'literal', value: 'all' },
        },
        position: {
          mode: 'direction',
          bearing: { source: 'literal', value: 'stage-right' },
          angle: { source: 'literal', value: 30 },
        },
        timing: {
          waitForCondition: { source: 'literal', value: 'none' },
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 0 },
          waitUntilCondition: { source: 'literal', value: 'beat' },
          waitUntilTime: { source: 'literal', value: 0 },
        },
        layer: { source: 'literal', value: 120 },
      }
      const def: AudioMotionNodeCueDefinition = {
        kind: 'motion',
        id: 'motion-wait-beat',
        name: 'Wait beat',
        nodes: { events: [evCalled], actions: [action], logic: [] },
        connections: [{ from: 'ev-called', to: 'sp1' }],
        layout: { nodePositions: {} },
      }
      const compiled = NodeCueCompiler.compileAudioCue(def)
      const cue = new AudioMotionNodeCue('g1', compiled)
      const data: AudioCueData = {
        timestamp: 0,
        executionCount: 1,
        audioData: {
          timestamp: 0,
          overallLevel: 0.5,
          bpm: 120,
          beatDetected: false,
          energy: 0.5,
        },
        config: DEFAULT_AUDIO_CONFIG,
        enabledBandCount: 0,
      }
      await cue.execute(data, harness.sequencer, harness.lightManager)
      harness.advanceBy(1)
      const lightId = harness.frontLightIds[0]
      expect(harness.sequencer.getActiveEffectsForLight(lightId).has(120)).toBe(true)
      harness.sequencer.onBeat()
      let cleared = false
      for (let i = 0; i < 10; i += 1) {
        harness.advanceBy(10)
        if (!harness.sequencer.getActiveEffectsForLight(lightId).has(120)) {
          cleared = true
          break
        }
      }
      expect(cleared).toBe(true)
    } finally {
      harness.cleanup()
    }
  })
})
