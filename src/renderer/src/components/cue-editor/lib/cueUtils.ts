import type { Edge } from 'reactflow';
import type { ActionNode, AudioEventNode } from '../../../../../photonics-dmx/cues/types/nodeCueTypes';
import type { WaitCondition } from '../../../../../photonics-dmx/types';
import type { EditorNode } from './types';
import { createDefaultActionTiming } from '../../../../../photonics-dmx/cues/types/nodeCueTypes';
import {
  AUDIO_EVENT_OPTIONS,
  YARG_EVENT_OPTIONS
} from './options';

const getYargEventLabel = (eventType: WaitCondition): string =>
  YARG_EVENT_OPTIONS.find(option => option.value === eventType)?.label ?? eventType;

const getAudioEventLabel = (eventType: AudioEventNode['eventType']): string =>
  AUDIO_EVENT_OPTIONS.find(option => option.value === eventType)?.label ?? eventType;

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
  const logicNodes = nodes.filter(n => n.data.kind === 'logic');

  if (eventNodes.length === 0 || actionNodes.length === 0) return 0;

  const actionMap = new Map(actionNodes.map(n => [n.id, n.data.payload as ActionNode]));
  const logicSet = new Set(logicNodes.map(n => n.id));
  const adjacency = new Map<string, string[]>();
  edges.forEach(edge => {
    const list = adjacency.get(edge.source) ?? [];
    list.push(edge.target);
    adjacency.set(edge.source, list);
  });

  let maxEndTime = 0;

  const traverse = (nodeId: string, cumulativeDelay: number, visited: Set<string>): void => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    if (actionMap.has(nodeId)) {
      const action = actionMap.get(nodeId)!;
      const duration = calculateActionDuration(action);
      const endTime = cumulativeDelay + duration;
      if (endTime > maxEndTime) maxEndTime = endTime;

      const nextNodes = adjacency.get(nodeId) ?? [];
      for (const nextId of nextNodes) {
        traverse(nextId, endTime, new Set(visited));
      }
      return;
    }

    if (logicSet.has(nodeId)) {
      const nextNodes = adjacency.get(nodeId) ?? [];
      for (const nextId of nextNodes) {
        traverse(nextId, cumulativeDelay, new Set(visited));
      }
    }
  };

  for (const eventNode of eventNodes) {
    const roots = adjacency.get(eventNode.id) ?? [];
    for (const nodeId of roots) {
      traverse(nodeId, 0, new Set());
    }
  }

  return maxEndTime;
};

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

export {
  calculateActionDuration,
  calculateChainDuration,
  formatDuration,
  getAudioEventLabel,
  getConditionLabel,
  getTextColorForBg,
  getYargEventLabel,
};
