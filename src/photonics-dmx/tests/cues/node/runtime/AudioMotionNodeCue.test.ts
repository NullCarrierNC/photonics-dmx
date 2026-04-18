/**
 * AudioMotionNodeCue: no lighting `style`, BPM cap for motion safety.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'

jest.mock('../../../../../main/utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
}))
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
import type { AudioCueData } from '../../../../cues/types/audioCueTypes'
import { DEFAULT_AUDIO_CONFIG } from '../../../../listeners/Audio/AudioConfig'

function minimalMotionDefinition(): AudioMotionNodeCueDefinition {
  const ev: AudioEventNodeUnion = {
    id: 'ev-b',
    type: 'event',
    eventType: 'audio-beat',
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
})
