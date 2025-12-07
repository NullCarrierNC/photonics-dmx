import type { Edge } from 'reactflow';
import type {
  ActionNode,
  AudioEventNode,
  NodeCueMode
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes';
import type { WaitCondition } from '../../../../../photonics-dmx/types';
import {
  AUDIO_EVENT_OPTIONS as AUDIO_EVENTS_BASE,
  BRIGHTNESS_OPTIONS,
  COLOR_OPTIONS,
  LIGHT_TARGET_OPTIONS,
  LOCATION_OPTIONS,
  YARG_EVENT_OPTIONS as YARG_EVENTS_BASE,
  BLEND_MODE_OPTIONS
} from '../../../../../photonics-dmx/constants/options';
import type { EditorNode, EventOption } from './types';
import { createDefaultActionTiming } from '../../../../../photonics-dmx/cues/types/nodeCueTypes';

const withDefaultLabels = <T extends string>(values: T[]): EventOption<T>[] =>
  values.map(value => ({ value, label: value }));

const EASING_OPTIONS = [
  'linear',
  'ease',
  'easeIn',
  'easeOut',
  'easeInOut',
  'sinIn',
  'sinOut',
  'sinInOut',
  'quadraticIn',
  'quadraticOut',
  'quadraticInOut',
  'cubicIn',
  'cubicOut',
  'cubicInOut'
] as const;

const ACTION_OPTIONS: ActionNode['effectType'][] = [
  'single-color', 'sweep', 'cycle', 'blackout'
];

const YARG_WAIT_CONDITIONS: WaitCondition[] = [...YARG_EVENTS_BASE];
const YARG_EVENT_OPTIONS: EventOption<WaitCondition>[] = withDefaultLabels(YARG_WAIT_CONDITIONS);
const AUDIO_EVENT_OPTIONS: EventOption<AudioEventNode['eventType']>[] = withDefaultLabels(AUDIO_EVENTS_BASE);

const ACTION_WAIT_OPTIONS_YARG: EventOption<WaitCondition>[] = [
  { value: 'none', label: 'None' },
  { value: 'delay', label: 'Delay' },
  ...withDefaultLabels(YARG_WAIT_CONDITIONS)
];

const ACTION_WAIT_OPTIONS_AUDIO: EventOption<AudioEventNode['eventType'] | 'none' | 'delay'>[] = [
  { value: 'none', label: 'None' },
  { value: 'delay', label: 'Delay' },
  ...withDefaultLabels(AUDIO_EVENTS_BASE)
];

const getYargEventLabel = (eventType: WaitCondition): string =>
  YARG_EVENT_OPTIONS.find(option => option.value === eventType)?.label ?? eventType;

const getAudioEventLabel = (eventType: AudioEventNode['eventType']): string =>
  AUDIO_EVENT_OPTIONS.find(option => option.value === eventType)?.label ?? eventType;

const getActionWaitOptions = (mode: NodeCueMode): EventOption<string>[] =>
  mode === 'yarg' ? ACTION_WAIT_OPTIONS_YARG : ACTION_WAIT_OPTIONS_AUDIO;

const getDefaultEventOption = (mode: NodeCueMode): EventOption<WaitCondition | AudioEventNode['eventType']> =>
  mode === 'yarg' ? YARG_EVENT_OPTIONS[0] : AUDIO_EVENT_OPTIONS[0];

const getConditionLabel = (condition: string, time?: number): string => {
  if (!condition) return 'none';
  if (condition === 'delay' && (time ?? 0) > 0) {
    return `delay (${Math.round(time ?? 0)}ms)`;
  }
  return condition;
};

const getTextColorForBg = (name: string): string => {
  const lightish = ['white', 'yellow', 'amber', 'chartreuse', 'cyan', 'transparent'];
  return lightish.includes(name) ? '#111827' : '#f9fafb';
};

const calculateActionDuration = (action: ActionNode): number => {
  const timing = action.timing ?? createDefaultActionTiming();
  return (
    Math.max(0, timing.waitForTime) +
    Math.max(0, timing.duration) +
    Math.max(0, timing.waitUntilTime)
  );
};

const calculateChainDuration = (
  nodes: EditorNode[],
  edges: Edge[]
): number => {
  const eventNodes = nodes.filter(n => n.data.kind === 'event');
  const actionNodes = nodes.filter(n => n.data.kind === 'action');

  if (eventNodes.length === 0 || actionNodes.length === 0) return 0;

  const actionMap = new Map(actionNodes.map(n => [n.id, n.data.payload as ActionNode]));
  const eventToActions = new Map<string, string[]>();
  const actionToActions = new Map<string, string[]>();

  for (const edge of edges) {
    const sourceNode = nodes.find(n => n.id === edge.source);
    const targetNode = nodes.find(n => n.id === edge.target);
    if (!sourceNode || !targetNode) continue;

    if (sourceNode.data.kind === 'event' && targetNode.data.kind === 'action') {
      const list = eventToActions.get(edge.source) ?? [];
      list.push(edge.target);
      eventToActions.set(edge.source, list);
    } else if (sourceNode.data.kind === 'action' && targetNode.data.kind === 'action') {
      const list = actionToActions.get(edge.source) ?? [];
      list.push(edge.target);
      actionToActions.set(edge.source, list);
    }
  }

  let maxEndTime = 0;

  const traverse = (actionId: string, cumulativeDelay: number, visited: Set<string>): void => {
    if (visited.has(actionId)) return;
    visited.add(actionId);

    const action = actionMap.get(actionId);
    if (!action) return;

    const duration = calculateActionDuration(action);
    const endTime = cumulativeDelay + duration;
    if (endTime > maxEndTime) maxEndTime = endTime;

    const chainedActions = actionToActions.get(actionId) ?? [];
    for (const nextId of chainedActions) {
      traverse(nextId, endTime, visited);
    }
  };

  for (const eventNode of eventNodes) {
    const rootActions = eventToActions.get(eventNode.id) ?? [];
    for (const actionId of rootActions) {
      traverse(actionId, 0, new Set());
    }
  }

  return maxEndTime;
};

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

export {
  ACTION_OPTIONS,
  ACTION_WAIT_OPTIONS_AUDIO,
  ACTION_WAIT_OPTIONS_YARG,
  AUDIO_EVENT_OPTIONS,
  BLEND_MODE_OPTIONS,
  BRIGHTNESS_OPTIONS,
  COLOR_OPTIONS,
  EASING_OPTIONS,
  LIGHT_TARGET_OPTIONS,
  LOCATION_OPTIONS,
  YARG_EVENT_OPTIONS,
  calculateActionDuration,
  calculateChainDuration,
  formatDuration,
  getActionWaitOptions,
  getAudioEventLabel,
  getConditionLabel,
  getDefaultEventOption,
  getTextColorForBg,
  getYargEventLabel,
  withDefaultLabels
};
