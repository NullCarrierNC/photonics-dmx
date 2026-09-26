import type {
  ActionNode,
  AudioCueLayerStyle,
  AudioLightingNodeCueDefinition,
} from '../../cues/types/nodeCueTypes'
import type { LightTarget } from '../../types'

function chaseStep(id: string, filter: LightTarget, waitForBeat: boolean): ActionNode {
  return {
    id,
    type: 'action',
    effectType: 'set-color',
    target: {
      groups: { source: 'literal', value: 'front' },
      filter: { source: 'literal', value: filter },
    },
    color: {
      name: { source: 'literal', value: 'red' },
      brightness: { source: 'literal', value: 'max' },
    },
    timing: {
      waitForCondition: { source: 'literal', value: waitForBeat ? 'beat' : 'none' },
      waitForTime: { source: 'literal', value: 0 },
      duration: { source: 'literal', value: 0 },
      waitUntilCondition: { source: 'literal', value: 'beat' },
      waitUntilTime: { source: 'literal', value: 0 },
    },
    layer: { source: 'literal', value: 1 },
  }
}

/**
 * An audio chase over the front row, red on its first half and then its second. The first step
 * waits for a beat to start and each step holds until the next beat, so the frame the first step
 * appears on shows which beat started it.
 */
export function beatStartChase(
  cueTypeId: string,
  style: AudioCueLayerStyle,
): AudioLightingNodeCueDefinition {
  return {
    kind: 'lighting',
    id: cueTypeId,
    cueTypeId,
    name: cueTypeId,
    description: '',
    style,
    nodes: {
      events: [
        { id: 'called', type: 'event', eventType: 'cue-called', triggerMode: 'edge', threshold: 0 },
      ],
      actions: [chaseStep('first', 'half-1', true), chaseStep('second', 'half-2', false)],
      logic: [],
    },
    connections: [
      { from: 'called', to: 'first' },
      { from: 'first', to: 'second' },
    ],
    layout: { nodePositions: {} },
  }
}
