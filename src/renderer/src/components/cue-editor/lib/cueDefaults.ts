import {
  createDefaultActionTiming,
  type ActionNode,
  type AudioNodeCueDefinition,
  type BaseEventNode,
  type NetCueMode,
  type NodeCueFile,
  type NodeCueGroupMeta,
  type NodeCueKind,
  type NodeCueMode,
  type NetEventNode,
  type NetNodeCueDefinition,
  type AudioEventNode,
  type AudioTriggerNode,
  type EffectFile,
  type EffectMode,
  type EffectGroupMeta,
  type YargEffectDefinition,
  type AudioEffectDefinition,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { CueType } from '../../../../../photonics-dmx/cues/types/cueTypes'

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

/** Default event for blank cues: Cue Started (once per lifecycle), connected to set-color. */
const buildDefaultYargCueStartedEvent = (): NetEventNode => ({
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

/** A new cue's graph: one event wired to one action, which sets a position for a motion cue. */
const blankCueGraph = <E extends BaseEventNode>(eventNode: E, kind: NodeCueKind) => {
  const actionNode = kind === 'motion' ? buildDefaultSetPositionAction() : buildDefaultAction()
  return {
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
}

/**
 * A new YARG or RB3 cue, which starts on Cue Started. Motion cues are keyed by id, so they carry
 * no cue type. RB3 lighting is the single fixed always-active gameplay cue, CueType.RB3.
 */
const createBlankNetCue = (mode: NetCueMode, kind: NodeCueKind): NetNodeCueDefinition => {
  const base = blankCueGraph(buildDefaultYargCueStartedEvent(), kind)
  if (kind === 'motion') {
    return { ...base, kind: 'motion' }
  }
  const cueType = mode === 'rb3' ? CueType.RB3 : CueType.Chorus
  return { ...base, kind: 'lighting', style: 'primary', cueType }
}

/**
 * A new audio cue, which starts on a beat. Each new audio lighting cue gets its own id, so two
 * groups built in the editor never collide.
 */
const createBlankAudioCue = (kind: NodeCueKind): AudioNodeCueDefinition => {
  const base = blankCueGraph(buildDefaultAudioEvent(), kind)
  if (kind === 'motion') {
    return { ...base, kind: 'motion' }
  }
  const cueTypeId = `custom-audio-cue-${createId().slice(0, 8)}`
  return { ...base, kind: 'lighting', style: 'primary', cueTypeId }
}

const NEW_GROUP_NAMES: Record<NodeCueMode, Record<NodeCueKind, string>> = {
  yarg: { lighting: 'New YARG Group', motion: 'New YARG Motion Group' },
  rb3: { lighting: 'New RB3 Group', motion: 'New RB3 Motion Group' },
  audio: { lighting: 'New Audio Group', motion: 'New Audio Motion Group' },
}

/** A new cue file holding one blank cue, in a group named for its platform and kind. */
const createDefaultFile = (mode: NodeCueMode, kind: NodeCueKind): NodeCueFile => {
  const group: NodeCueGroupMeta = {
    id: `node-group-${Date.now()}`,
    name: NEW_GROUP_NAMES[mode][kind],
    description: '',
  }
  if (mode === 'audio') {
    return { version: 1, mode, group, cues: [createBlankAudioCue(kind)], bundled: false }
  }
  return { version: 1, mode, group, cues: [createBlankNetCue(mode, kind)], bundled: false }
}

const blankEffect = () => ({
  id: `effect-${createId()}`,
  name: 'New Effect',
  description: '',
  nodes: {
    events: [],
    actions: [],
  },
  connections: [],
  layout: {
    nodePositions: {},
  },
})

const createDefaultYargEffect = (): YargEffectDefinition => ({ ...blankEffect(), mode: 'yarg' })

const createDefaultAudioEffect = (): AudioEffectDefinition => ({ ...blankEffect(), mode: 'audio' })

const createDefaultEffectFile = (mode: EffectMode): EffectFile => {
  const group: EffectGroupMeta = {
    id: `effect-group-${Date.now()}`,
    name: mode === 'yarg' ? 'New YARG Effects' : 'New Audio Effects',
    description: '',
  }
  if (mode === 'yarg') {
    return { version: 1, mode, group, effects: [createDefaultYargEffect()], bundled: false }
  }
  return { version: 1, mode, group, effects: [createDefaultAudioEffect()], bundled: false }
}

export {
  buildDefaultAction,
  buildDefaultSetPositionAction,
  buildDefaultMotionPatternAction,
  buildDefaultAudioEvent,
  createBlankAudioCue,
  createBlankNetCue,
  createDefaultAudioEffect,
  createDefaultFile,
  createDefaultEffectFile,
  createDefaultYargEffect,
  createId,
}
