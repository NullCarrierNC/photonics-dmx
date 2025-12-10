import type { Node } from 'reactflow';
import type {
  ActionNode,
  AudioEventNode,
  EventRaiserNode,
  EventListenerNode,
  LogicNode,
  NodeCueFile,
  YargEventNode
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes';

export type EditorNodeData = {
  kind: 'event' | 'action' | 'logic' | 'event-raiser' | 'event-listener';
  payload: YargEventNode | AudioEventNode | ActionNode | LogicNode | EventRaiserNode | EventListenerNode;
  label: string;
};

export type EditorNode = Node<EditorNodeData>;

export type EditorDocument = {
  file: NodeCueFile;
  path: string | null;
};

export type EventOption<T extends string> = {
  value: T;
  label: string;
};
