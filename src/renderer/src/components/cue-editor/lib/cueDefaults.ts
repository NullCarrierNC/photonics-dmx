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
  type AudioEventNode,
  type EffectFile,
  type EffectMode,
  type EffectGroupMeta,
  type YargEffectDefinition,
  type AudioEffectDefinition,
  type YargEffectFile,
  type AudioEffectFile
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
  effectType: 'set-color',
  target: {
    groups: { source: 'literal', value: 'front' },
    filter: { source: 'literal', value: 'all' }
  },
  color: {
    name: { source: 'literal', value: 'blue' },
    brightness: { source: 'literal', value: 'medium' },
    blendMode: { source: 'literal', value: 'replace' },
    opacity: { source: 'literal', value: 1.0 }
  },
  secondaryColor: {
    name: { source: 'literal', value: 'green' },
    brightness: { source: 'literal', value: 'medium' },
    blendMode: { source: 'literal', value: 'replace' },
    opacity: { source: 'literal', value: 1.0 }
  },
  timing: createDefaultActionTiming(),
  layer: { source: 'literal', value: 0 }
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

const createDefaultEffect = (mode: EffectMode): YargEffectDefinition | AudioEffectDefinition => {
  const base = {
    id: `effect-${createId()}`,
    mode,
    name: 'New Effect',
    description: '',
    parameters: [],
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
    return base as YargEffectDefinition;
  }

  return base as AudioEffectDefinition;
};

const createDefaultEffectFile = (mode: EffectMode): EffectFile => {
  const group: EffectGroupMeta = {
    id: `effect-group-${Date.now()}`,
    name: mode === 'yarg' ? 'New YARG Effects' : 'New Audio Effects',
    description: ''
  };

  if (mode === 'yarg') {
    return {
      version: 1,
      mode,
      group,
      effects: [createDefaultEffect('yarg') as YargEffectDefinition]
    } as YargEffectFile;
  }

  return {
    version: 1,
    mode,
    group,
    effects: [createDefaultEffect('audio') as AudioEffectDefinition]
  } as AudioEffectFile;
};

export {
  buildDefaultAction,
  buildDefaultAudioEvent,
  buildDefaultYargEvent,
  createBlankCue,
  createDefaultCue,
  createDefaultFile,
  createDefaultEffect,
  createDefaultEffectFile,
  createId
};
