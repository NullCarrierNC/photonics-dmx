/**
 * Motion cues with cue-scoped variables must include cue-started so YARG
 * resetCueLevelVariables runs after onStop; audio relies on the same graph pattern.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'

import { NodeCueCompiler } from '../../../../cues/node/compiler/NodeCueCompiler'
import { YargMotionNodeCue } from '../../../../cues/node/runtime/YargMotionNodeCue'
import { AudioMotionNodeCue } from '../../../../cues/node/runtime/AudioMotionNodeCue'
import type {
  ActionNode,
  AudioMotionNodeCueDefinition,
  LogicNode,
  YargEventNode,
  YargMotionNodeCueDefinition,
} from '../../../../cues/types/nodeCueTypes'
import type { ILightingController } from '../../../../controllers/sequencer/interfaces'
import { DmxLightManager } from '../../../../controllers/DmxLightManager'
import { createMockLightingConfig } from '../../../helpers/testFixtures'
import type { CueData } from '../../../../cues/types/cueTypes'
import type { AudioCueData } from '../../../../cues/types/audioCueTypes'
import { DEFAULT_AUDIO_CONFIG } from '../../../../listeners/Audio/AudioConfig'

function minimalYargCueData(overrides?: Partial<CueData>): CueData {
  return {
    datagramVersion: 1,
    platform: 'Unknown',
    currentScene: 'Gameplay',
    pauseState: 'Unpaused',
    venueSize: 'Small',
    beatsPerMinute: 120,
    songSection: 'Verse',
    guitarNotes: [],
    bassNotes: [],
    drumNotes: [],
    keysNotes: [],
    vocalNote: 0,
    harmony0Note: 0,
    harmony1Note: 0,
    harmony2Note: 0,
    lightingCue: 'Chorus',
    postProcessing: 'Default',
    fogState: false,
    strobeState: 'Strobe_Off',
    performer: 1,
    keyframe: 'Off',
    bonusEffect: true,
    beat: 'Strong',
    previousCue: 'Intro',
    executionCount: 1,
    cueStartTime: Date.now() - 1000,
    timeSinceLastCue: 100,
    totalScore: 0,
    ...overrides,
  } as CueData
}

function motionPatternActionUsingTickVar(): ActionNode {
  return {
    id: 'mp1',
    type: 'action',
    effectType: 'motion-pattern',
    target: {
      groups: { source: 'literal', value: 'front' },
      filter: { source: 'literal', value: 'all' },
    },
    motionPattern: {
      pattern: { source: 'literal', value: 'circle' },
      speed: { source: 'variable', name: 'tick' },
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
}

function yargMotionWithCueStarted(): YargMotionNodeCueDefinition {
  const evStart: YargEventNode = { id: 'ev-start', type: 'event', eventType: 'cue-started' }
  const evCalled: YargEventNode = { id: 'ev-called', type: 'event', eventType: 'cue-called' }
  const initTick: LogicNode = {
    id: 'init-tick',
    type: 'logic',
    logicType: 'variable',
    mode: 'set',
    varName: 'tick',
    valueType: 'number',
    value: { source: 'literal', value: 0 },
  }
  const incTick: LogicNode = {
    id: 'inc-tick',
    type: 'logic',
    logicType: 'math',
    operator: 'add',
    left: { source: 'variable', name: 'tick' },
    right: { source: 'literal', value: 1 },
    assignTo: 'tick',
  }
  const action = motionPatternActionUsingTickVar()
  return {
    kind: 'motion',
    id: 'motion-restart-yarg',
    name: 'YARG motion restart',
    variables: [{ name: 'tick', type: 'number', scope: 'cue', initialValue: 0 }],
    nodes: {
      events: [evStart, evCalled],
      actions: [action],
      logic: [initTick, incTick],
    },
    connections: [
      { from: 'ev-start', to: 'init-tick' },
      { from: 'ev-called', to: 'inc-tick' },
      { from: 'inc-tick', to: 'mp1' },
    ],
    layout: { nodePositions: {} },
  }
}

function yargMotionWithoutCueStarted(): YargMotionNodeCueDefinition {
  const def = yargMotionWithCueStarted()
  return {
    ...def,
    id: 'motion-restart-yarg-no-start',
    nodes: {
      events: def.nodes.events.filter((e) => e.id !== 'ev-start'),
      actions: def.nodes.actions,
      logic: def.nodes.logic,
    },
    connections: def.connections.filter((c) => c.from !== 'ev-start' && c.to !== 'init-tick'),
  }
}

describe('YargMotionNodeCue stop/start variable lifecycle', () => {
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

  it('second activation after onStop does not reach motion-pattern when cue-started is missing (tick uninitialized)', () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const compiled = NodeCueCompiler.compileYargCue(yargMotionWithoutCueStarted())
      const cue = new YargMotionNodeCue('g1', compiled)
      const data = minimalYargCueData()
      cue.execute(data, sequencer, lightManager)
      expect(sequencer.addMotionPattern).toHaveBeenCalledTimes(1)
      cue.onStop()
      cue.execute(data, sequencer, lightManager)
      expect(sequencer.addMotionPattern).toHaveBeenCalledTimes(1)
    } finally {
      errSpy.mockRestore()
    }
  })

  it('second activation after onStop runs motion-pattern when cue-started re-inits tick', () => {
    const compiled = NodeCueCompiler.compileYargCue(yargMotionWithCueStarted())
    const cue = new YargMotionNodeCue('g1', compiled)
    const data = minimalYargCueData()
    cue.execute(data, sequencer, lightManager)
    expect(sequencer.addMotionPattern).toHaveBeenCalledTimes(1)
    cue.onStop()
    cue.execute(data, sequencer, lightManager)
    expect(sequencer.addMotionPattern).toHaveBeenCalledTimes(2)
  })
})

function audioMotionWithCueStarted(): AudioMotionNodeCueDefinition {
  const evStart = {
    id: 'ev-start',
    type: 'event' as const,
    eventType: 'cue-started' as const,
    threshold: 0.5,
    triggerMode: 'edge' as const,
  }
  const evCalled = {
    id: 'ev-called',
    type: 'event' as const,
    eventType: 'cue-called' as const,
    threshold: 0,
    triggerMode: 'edge' as const,
  }
  const initTick: LogicNode = {
    id: 'init-tick',
    type: 'logic',
    logicType: 'variable',
    mode: 'set',
    varName: 'tick',
    valueType: 'number',
    value: { source: 'literal', value: 0 },
  }
  const incTick: LogicNode = {
    id: 'inc-tick',
    type: 'logic',
    logicType: 'math',
    operator: 'add',
    left: { source: 'variable', name: 'tick' },
    right: { source: 'literal', value: 1 },
    assignTo: 'tick',
  }
  const action = motionPatternActionUsingTickVar()
  return {
    kind: 'motion',
    id: 'motion-restart-audio',
    name: 'Audio motion restart',
    variables: [{ name: 'tick', type: 'number', scope: 'cue', initialValue: 0 }],
    nodes: {
      events: [evStart, evCalled],
      actions: [action],
      logic: [initTick, incTick],
    },
    connections: [
      { from: 'ev-start', to: 'init-tick' },
      { from: 'ev-called', to: 'inc-tick' },
      { from: 'inc-tick', to: 'mp1' },
    ],
    layout: { nodePositions: {} },
  }
}

describe('AudioMotionNodeCue stop/start variable lifecycle', () => {
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

  it('second activation after onStop runs cue-started then cue-called (motion-pattern twice)', async () => {
    const compiled = NodeCueCompiler.compileAudioCue(audioMotionWithCueStarted())
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
    await cue.execute(data, sequencer, lightManager)
    expect(sequencer.addMotionPattern).toHaveBeenCalledTimes(1)
    cue.onStop()
    await cue.execute(data, sequencer, lightManager)
    expect(sequencer.addMotionPattern).toHaveBeenCalledTimes(2)
  })
})
