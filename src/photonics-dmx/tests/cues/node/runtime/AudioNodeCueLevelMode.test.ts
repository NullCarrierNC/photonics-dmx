/**
 * Level-mode audio cues walk to the first action through the shared logic evaluator, so
 * light-deriving logic (config-data, lights-from-index) drives the action target, the level
 * intensity is readable via event-raw-value, and an uninitialized-variable error surfaces to the
 * renderer instead of throwing out of execute().
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'

import { NodeCueCompiler } from '../../../../cues/node/compiler/NodeCueCompiler'
import { ActionEffectFactory } from '../../../../cues/node/compiler/ActionEffectFactory'
import { AudioNodeCue } from '../../../../cues/node/runtime/AudioNodeCue'
import type {
  ActionNode,
  AudioEventNode,
  AudioLightingNodeCueDefinition,
  LogicNode,
} from '../../../../cues/types/nodeCueTypes'
import type { ILightingController } from '../../../../controllers/sequencer/interfaces'
import { DmxLightManager } from '../../../../controllers/DmxLightManager'
import { createMockDmxLight, createMockLightingConfig } from '../../../helpers/testFixtures'
import type { AudioCueData } from '../../../../cues/types/audioCueTypes'
import type { RuntimeBroadcaster } from '../../../../runtime/broadcaster'
import { RENDERER_RECEIVE } from '../../../../../shared/ipcChannels'
import { DEFAULT_AUDIO_CONFIG } from '../../../../listeners/Audio/AudioConfig'
import type { TrackedLight } from '../../../../types'

function makeSequencerStub(): ILightingController {
  return {
    addEffect: jest.fn(),
    setEffect: jest.fn(),
    removeEffect: jest.fn(),
    removeAllEffects: jest.fn(),
    removeEffectByLayer: jest.fn(),
    addEffectUnblockedName: jest.fn(),
    setEffectUnblockedName: jest.fn(),
    addEffectUnblockedNameWithCallback: jest.fn(),
    setEffectUnblockedNameWithCallback: jest.fn(),
    cancelPanTiltClear: jest.fn(),
    addMotionPattern: jest.fn(),
    removeMotionPattern: jest.fn(),
    getMotionPattern: jest.fn(),
    updateMotionPatternConfig: jest.fn(),
    onBeat: jest.fn(),
  } as unknown as ILightingController
}

function fourFrontLightManager(): DmxLightManager {
  const frontLights = Array.from({ length: 4 }, (_, index) =>
    createMockDmxLight({ id: `front-${index + 1}`, group: 'front', position: index + 1 }),
  )
  return new DmxLightManager(
    createMockLightingConfig({ numLights: 4, frontLights, backLights: [] }),
  )
}

function audioCueData(energy: number): AudioCueData {
  return {
    timestamp: 0,
    executionCount: 1,
    audioData: {
      timestamp: 0,
      overallLevel: energy,
      bpm: 120,
      beatDetected: false,
      energy,
    },
    config: DEFAULT_AUDIO_CONFIG,
    enabledBandCount: 0,
  }
}

function levelEnergyEvent(threshold: number): AudioEventNode {
  return {
    id: 'ev-energy',
    type: 'event',
    eventType: 'audio-energy',
    threshold,
    triggerMode: 'level',
  } as AudioEventNode
}

function setColor(id: string, groups: ActionNode['target']['groups']): ActionNode {
  return {
    id,
    type: 'action',
    effectType: 'set-color',
    target: {
      groups,
      filter: { source: 'literal', value: 'all' },
    },
    color: {
      name: { source: 'literal', value: 'red' },
      brightness: { source: 'literal', value: 'high' },
      blendMode: { source: 'literal', value: 'replace' },
      opacity: { source: 'literal', value: 1 },
    },
    timing: {
      waitForCondition: { source: 'literal', value: 'none' },
      waitForTime: { source: 'literal', value: 0 },
      duration: { source: 'literal', value: 100 },
      waitUntilCondition: { source: 'literal', value: 'none' },
      waitUntilTime: { source: 'literal', value: 0 },
    },
    layer: { source: 'literal', value: 0 },
  } as unknown as ActionNode
}

describe('AudioNodeCue level mode', () => {
  let lightManager: DmxLightManager
  let sequencer: ILightingController

  beforeEach(() => {
    lightManager = fourFrontLightManager()
    sequencer = makeSequencerStub()
  })

  it('derives the action target lights from config-data + lights-from-index', async () => {
    const def: AudioLightingNodeCueDefinition = {
      kind: 'lighting',
      id: 'level-derived-target',
      cueTypeId: 'level-derived-target',
      name: 'Level derived target',
      style: 'secondary',
      variables: [
        { name: 'allLights', type: 'light-array', scope: 'cue', initialValue: [] },
        { name: 'selectedLights', type: 'light-array', scope: 'cue', initialValue: [] },
      ],
      nodes: {
        events: [levelEnergyEvent(0.3)],
        actions: [setColor('sc1', { source: 'variable', name: 'selectedLights' })],
        logic: [
          {
            id: 'cd1',
            type: 'logic',
            logicType: 'config-data',
            dataProperty: 'front-lights-array',
            assignTo: 'allLights',
          } as LogicNode,
          {
            id: 'lfi1',
            type: 'logic',
            logicType: 'lights-from-index',
            sourceVariable: 'allLights',
            index: { source: 'literal', value: 1 },
            assignTo: 'selectedLights',
          } as LogicNode,
        ],
      },
      connections: [
        { from: 'ev-energy', to: 'cd1' },
        { from: 'cd1', to: 'lfi1' },
        { from: 'lfi1', to: 'sc1' },
      ],
      layout: { nodePositions: {} },
    } as unknown as AudioLightingNodeCueDefinition

    const compiled = NodeCueCompiler.compileAudioCue(def)
    const cue = new AudioNodeCue('g1', compiled)
    const buildEffectSpy = jest.spyOn(ActionEffectFactory, 'buildEffect')

    await cue.execute(audioCueData(0.5), sequencer, lightManager)

    expect(sequencer.addEffect).toHaveBeenCalledTimes(1)
    expect(buildEffectSpy).toHaveBeenCalledTimes(1)
    const lightsArg = buildEffectSpy.mock.calls[0][0].lights as TrackedLight[]
    const frontLights = lightManager.getLights(['front'], ['all'])
    expect(lightsArg.map((light) => light.id)).toEqual([frontLights[1].id])

    buildEffectSpy.mockRestore()
  })

  it('adds a level effect while active and removes it when the level drops below threshold', async () => {
    const def: AudioLightingNodeCueDefinition = {
      kind: 'lighting',
      id: 'level-hold',
      cueTypeId: 'level-hold',
      name: 'Level hold',
      style: 'secondary',
      variables: [],
      nodes: {
        events: [levelEnergyEvent(0.3)],
        actions: [setColor('sc1', { source: 'literal', value: 'front' })],
        logic: [],
      },
      connections: [{ from: 'ev-energy', to: 'sc1' }],
      layout: { nodePositions: {} },
    } as unknown as AudioLightingNodeCueDefinition

    const compiled = NodeCueCompiler.compileAudioCue(def)
    const cue = new AudioNodeCue('g1', compiled)

    await cue.execute(audioCueData(0.5), sequencer, lightManager)
    expect(sequencer.addEffect).toHaveBeenCalledTimes(1)
    ;(sequencer.removeEffect as jest.Mock).mockClear()

    await cue.execute(audioCueData(0.0), sequencer, lightManager)
    // No new submission once inactive, and the held level effect is removed.
    expect(sequencer.addEffect).toHaveBeenCalledTimes(1)
    expect(sequencer.removeEffect).toHaveBeenCalled()
  })

  it('exposes the level intensity to the graph via event-raw-value', async () => {
    const def: AudioLightingNodeCueDefinition = {
      kind: 'lighting',
      id: 'level-raw-value',
      cueTypeId: 'level-raw-value',
      name: 'Level raw value',
      style: 'secondary',
      variables: [{ name: 'lvl', type: 'number', scope: 'cue', initialValue: 0 }],
      nodes: {
        events: [levelEnergyEvent(0.1)],
        actions: [setColor('sc1', { source: 'literal', value: 'front' })],
        logic: [
          {
            id: 'cd-lvl',
            type: 'logic',
            logicType: 'cue-data',
            dataProperty: 'event-raw-value',
            assignTo: 'lvl',
          } as LogicNode,
          {
            id: 'cond1',
            type: 'logic',
            logicType: 'conditional',
            comparator: '>=',
            left: { source: 'variable', name: 'lvl' },
            right: { source: 'literal', value: 0.05 },
          } as LogicNode,
        ],
      },
      connections: [
        { from: 'ev-energy', to: 'cd-lvl' },
        { from: 'cd-lvl', to: 'cond1' },
        // The action is only reachable when the level intensity (event-raw-value) clears the gate.
        { from: 'cond1', to: 'sc1', fromPort: 'true' },
      ],
      layout: { nodePositions: {} },
    } as unknown as AudioLightingNodeCueDefinition

    const compiled = NodeCueCompiler.compileAudioCue(def)
    const cue = new AudioNodeCue('g1', compiled)

    await cue.execute(audioCueData(0.5), sequencer, lightManager)

    expect(sequencer.addEffect).toHaveBeenCalledTimes(1)
  })

  it('surfaces an uninitialized-variable error to the renderer without throwing out of execute', async () => {
    const emit = jest.fn()
    const broadcaster = { emit } as unknown as RuntimeBroadcaster
    const def: AudioLightingNodeCueDefinition = {
      kind: 'lighting',
      id: 'level-error',
      cueTypeId: 'level-error',
      name: 'Level error',
      style: 'secondary',
      variables: [],
      nodes: {
        events: [levelEnergyEvent(0.1)],
        actions: [setColor('sc1', { source: 'literal', value: 'front' })],
        logic: [
          {
            id: 'math1',
            type: 'logic',
            logicType: 'math',
            operator: 'add',
            left: { source: 'variable', name: 'missing' },
            right: { source: 'literal', value: 1 },
            assignTo: 'sum',
          } as LogicNode,
        ],
      },
      connections: [
        { from: 'ev-energy', to: 'math1' },
        { from: 'math1', to: 'sc1' },
      ],
      layout: { nodePositions: {} },
    } as unknown as AudioLightingNodeCueDefinition

    const compiled = NodeCueCompiler.compileAudioCue(def)
    const cue = new AudioNodeCue('g1', compiled, undefined, broadcaster)

    await expect(cue.execute(audioCueData(0.5), sequencer, lightManager)).resolves.toBeUndefined()
    expect(emit).toHaveBeenCalledWith(
      RENDERER_RECEIVE.NODE_CUE_RUNTIME_ERROR,
      expect.stringContaining('ev-energy'),
    )
    expect(sequencer.addEffect).not.toHaveBeenCalled()
  })
})
