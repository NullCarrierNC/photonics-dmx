import {
  createDefaultActionTiming,
  type ActionNode,
  type AudioNodeCueDefinition,
  type AudioNodeCueFile,
  type NodeCueFile,
  type NodeCueGroupMeta,
  type NodeCueMode,
  type YargEventNode,
  type YargNodeCueDefinition,
  type YargNodeCueFile,
  type AudioEventNode
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes';

const createId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `node-${Math.random().toString(36).slice(2, 10)}`;
};

const buildDefaultAction = (): ActionNode => ({
  id: `action-${createId()}`,
  type: 'action',
  effectType: 'single-color',
  target: {
    groups: ['front'],
    filter: 'all'
  },
  color: {
    name: 'blue',
    brightness: 'medium',
    blendMode: 'replace'
  },
  secondaryColor: {
    name: 'green',
    brightness: 'medium',
    blendMode: 'replace'
  },
  timing: createDefaultActionTiming(),
  layer: 0
});

const buildDefaultYargEvent = (): YargEventNode => ({
  id: `event-${createId()}`,
  type: 'event',
  eventType: 'beat'
});

const buildDefaultAudioEvent = (): AudioEventNode => ({
  id: `event-${createId()}`,
  type: 'event',
  eventType: 'audio-beat',
  threshold: 0.5,
  triggerMode: 'edge'
});

const createDefaultCue = (mode: NodeCueMode): YargNodeCueDefinition | AudioNodeCueDefinition => {
  const eventNode = mode === 'yarg' ? buildDefaultYargEvent() : buildDefaultAudioEvent();
  const actionNode = buildDefaultAction();
  const base = {
    id: `cue-${createId()}`,
    name: 'New Cue',
    description: '',
    nodes: {
      events: [eventNode],
      actions: [actionNode]
    },
    connections: [
      { from: eventNode.id, to: actionNode.id }
    ],
    layout: {
      nodePositions: {}
    }
  };

  if (mode === 'yarg') {
    return {
      ...base,
      cueType: 'Chorus',
      style: 'primary'
    } as YargNodeCueDefinition;
  }

  return {
    ...base,
    cueTypeId: 'custom-audio-cue'
  } as AudioNodeCueDefinition;
};

const createBlankCue = (mode: NodeCueMode): YargNodeCueDefinition | AudioNodeCueDefinition => {
  const base = {
    id: `cue-${createId()}`,
    name: 'New Cue',
    description: '',
    nodes: {
      events: [],
      actions: []
    },
    connections: [],
    layout: {
      nodePositions: {}
    }
  };

  if (mode === 'yarg') {
    return {
      ...base,
      cueType: 'Chorus',
      style: 'primary'
    } as YargNodeCueDefinition;
  }

  return {
    ...base,
    cueTypeId: 'custom-audio-cue'
  } as AudioNodeCueDefinition;
};

const createDefaultFile = (mode: NodeCueMode): NodeCueFile => {
  const group: NodeCueGroupMeta = {
    id: `node-group-${Date.now()}`,
    name: mode === 'yarg' ? 'New YARG Group' : 'New Audio Group',
    description: ''
  };

  if (mode === 'yarg') {
    return {
      version: 1,
      mode,
      group,
      cues: [createDefaultCue('yarg') as YargNodeCueDefinition]
    } as YargNodeCueFile;
  }

  return {
    version: 1,
    mode,
    group,
    cues: [createDefaultCue('audio') as AudioNodeCueDefinition]
  } as AudioNodeCueFile;
};

export {
  buildDefaultAction,
  buildDefaultAudioEvent,
  buildDefaultYargEvent,
  createBlankCue,
  createDefaultCue,
  createDefaultFile,
  createId
};
