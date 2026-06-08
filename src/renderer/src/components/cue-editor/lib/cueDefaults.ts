import {
  createDefaultActionTiming,
  type ActionNode,
  type AudioNodeCueDefinition,
  type AudioNodeCueFile,
  type NodeCueFile,
  type NodeCueGroupMeta,
  type NodeCueKind,
  type NodeCueMode,
  type YargEventNode,
  type YargNodeCueDefinition,
  type YargNodeCueFile,
  type AudioEventNode,
  type AudioTriggerNode,
  type EffectFile,
  type EffectMode,
  type EffectGroupMeta,
  type YargEffectDefinition,
  type AudioEffectDefinition,
  type YargEffectFile,
  type AudioEffectFile,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'

const createId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `node-${Math.random().toString(36).slice(2, 10)}`
}

const buildDefaultSetPositionAction = (): ActionNode => ({
  id: `action-${createId()}`,
  type: 'action',
  effectType: 'set-position',
  target: {
    groups: { source: 'literal', value: 'front' },
    filter: { source: 'literal', value: 'all' },
  },
  position: {
    mode: 'direction',
    bearing: { source: 'literal', value: 'downstage' },
    angle: { source: 'literal', value: 20 },
  },
  timing: createDefaultActionTiming(),
  layer: { source: 'literal', value: 120 },
})

const buildDefaultMotionPatternAction = (): ActionNode => ({
  id: `action-${createId()}`,
  type: 'action',
  effectType: 'motion-pattern',
  target: {
    groups: { source: 'literal', value: 'front' },
    filter: { source: 'literal', value: 'all' },
  },
  motionPattern: {
    pattern: { source: 'literal', value: 'circle' },
    speed: { source: 'literal', value: 0.5 },
    size: { source: 'literal', value: 20 },
    bearing: { source: 'literal', value: 'downstage' },
    fanSpread: { source: 'literal', value: 0 },
    reverse: { source: 'literal', value: false },
  },
  timing: createDefaultActionTiming(),
  layer: { source: 'literal', value: 120 },
})

const buildDefaultAction = (): ActionNode => ({
  id: `action-${createId()}`,
  type: 'action',
  effectType: 'set-color',
  target: {
    groups: { source: 'literal', value: 'front' },
    filter: { source: 'literal', value: 'all' },
  },
  color: {
    name: { source: 'literal', value: 'blue' },
    brightness: { source: 'literal', value: 'medium' },
    blendMode: { source: 'literal', value: 'mix' },
    opacity: { source: 'literal', value: 1.0 },
  },
  timing: createDefaultActionTiming(),
  layer: { source: 'literal', value: 0 },
})

const buildDefaultYargEvent = (): YargEventNode => ({
  id: `event-${createId()}`,
  type: 'event',
  eventType: 'beat',
})

/** Default event for blank cues: Cue Started (once per lifecycle), connected to set-color. */
const buildDefaultYargCueStartedEvent = (): YargEventNode => ({
  id: `event-${createId()}`,
  type: 'event',
  eventType: 'cue-started',
})

const buildDefaultAudioEvent = (): AudioEventNode => ({
  id: `event-${createId()}`,
  type: 'event',
  eventType: 'beat',
  threshold: 0.5,
  triggerMode: 'edge',
})

const DEFAULT_TRIGGER_COLOR = '#60a5fa'

export const buildDefaultAudioTrigger = (id?: string): AudioTriggerNode => ({
  id: id ?? `event-${createId()}`,
  type: 'event',
  eventType: 'audio-trigger',
  frequencyRange: { minHz: 120, maxHz: 500 },
  threshold: 0.5,
  hysteresis: 0.05,
  holdMs: 0,
  smoothing: 0.45,
  spectralGates: undefined,
  color: DEFAULT_TRIGGER_COLOR,
  nodeLabel: 'Audio Trigger',
  outputs: ['enter', 'during', 'exit'],
})

const createDefaultCue = (
  mode: NodeCueMode,
  kind: NodeCueKind,
): YargNodeCueDefinition | AudioNodeCueDefinition => {
  const isYarg = mode === 'yarg'
  const eventNode =
    kind === 'motion' && !isYarg
      ? buildDefaultAudioEvent()
      : isYarg
        ? buildDefaultYargEvent()
        : buildDefaultAudioEvent()
  const actionNode = kind === 'motion' ? buildDefaultSetPositionAction() : buildDefaultAction()
  const base = {
    id: `cue-${createId()}`,
    name: 'New Cue',
    description: '',
    nodes: {
      events: [eventNode],
      actions: [actionNode],
    },
    connections: [{ from: eventNode.id, to: actionNode.id }],
    layout: {
      nodePositions: {},
    },
  }

  if (mode === 'yarg' && kind === 'lighting') {
    return {
      ...base,
      kind: 'lighting',
      cueType: 'Chorus',
      style: 'primary',
    } as YargNodeCueDefinition
  }

  if (mode === 'yarg' && kind === 'motion') {
    return {
      ...base,
      kind: 'motion',
    } as YargNodeCueDefinition
  }

  if (mode === 'audio' && kind === 'lighting') {
    return {
      ...base,
      kind: 'lighting',
      cueTypeId: 'custom-audio-cue',
      style: 'primary',
    } as AudioNodeCueDefinition
  }

  return {
    ...base,
    kind: 'motion',
  } as AudioNodeCueDefinition
}

const createBlankCue = (
  mode: NodeCueMode,
  kind: NodeCueKind,
): YargNodeCueDefinition | AudioNodeCueDefinition => {
  const isYarg = mode === 'yarg'
  const eventNode =
    kind === 'motion' && !isYarg
      ? buildDefaultAudioEvent()
      : isYarg
        ? buildDefaultYargCueStartedEvent()
        : buildDefaultAudioEvent()
  const actionNode = kind === 'motion' ? buildDefaultSetPositionAction() : buildDefaultAction()
  const base = {
    id: `cue-${createId()}`,
    name: 'New Cue',
    description: '',
    nodes: {
      events: [eventNode],
      actions: [actionNode],
    },
    connections: [{ from: eventNode.id, to: actionNode.id }],
    layout: {
      nodePositions: {},
    },
  }

  if (mode === 'yarg' && kind === 'lighting') {
    return {
      ...base,
      kind: 'lighting',
      cueType: 'Chorus',
      style: 'primary',
    } as YargNodeCueDefinition
  }

  if (mode === 'yarg' && kind === 'motion') {
    return {
      ...base,
      kind: 'motion',
    } as YargNodeCueDefinition
  }

  if (mode === 'audio' && kind === 'lighting') {
    return {
      ...base,
      kind: 'lighting',
      cueTypeId: 'custom-audio-cue',
      style: 'primary',
    } as AudioNodeCueDefinition
  }

  return {
    ...base,
    kind: 'motion',
  } as AudioNodeCueDefinition
}

const createDefaultFile = (mode: NodeCueMode, kind: NodeCueKind): NodeCueFile => {
  const group: NodeCueGroupMeta = {
    id: `node-group-${Date.now()}`,
    name:
      mode === 'yarg'
        ? kind === 'motion'
          ? 'New YARG Motion Group'
          : 'New YARG Group'
        : kind === 'motion'
          ? 'New Audio Motion Group'
          : 'New Audio Group',
    description: '',
  }

  if (mode === 'yarg') {
    return {
      version: 1,
      mode,
      group,
      cues: [createBlankCue('yarg', kind) as YargNodeCueDefinition],
      bundled: false,
    } as YargNodeCueFile
  }

  return {
    version: 1,
    mode,
    group,
    cues: [createBlankCue('audio', kind) as AudioNodeCueDefinition],
    bundled: false,
  } as AudioNodeCueFile
}

const createDefaultEffect = (mode: EffectMode): YargEffectDefinition | AudioEffectDefinition => {
  const base = {
    id: `effect-${createId()}`,
    mode,
    name: 'New Effect',
    description: '',
    parameters: [],
    nodes: {
      events: [],
      actions: [],
    },
    connections: [],
    layout: {
      nodePositions: {},
    },
  }

  if (mode === 'yarg') {
    return base as YargEffectDefinition
  }

  return base as AudioEffectDefinition
}

const createDefaultEffectFile = (mode: EffectMode): EffectFile => {
  const group: EffectGroupMeta = {
    id: `effect-group-${Date.now()}`,
    name: mode === 'yarg' ? 'New YARG Effects' : 'New Audio Effects',
    description: '',
  }

  if (mode === 'yarg') {
    return {
      version: 1,
      mode,
      group,
      effects: [createDefaultEffect('yarg') as YargEffectDefinition],
      bundled: false,
    } as YargEffectFile
  }

  return {
    version: 1,
    mode,
    group,
    effects: [createDefaultEffect('audio') as AudioEffectDefinition],
    bundled: false,
  } as AudioEffectFile
}

export {
  buildDefaultAction,
  buildDefaultSetPositionAction,
  buildDefaultMotionPatternAction,
  buildDefaultAudioEvent,
  buildDefaultYargEvent,
  createBlankCue,
  createDefaultCue,
  createDefaultFile,
  createDefaultEffect,
  createDefaultEffectFile,
  createId,
}
