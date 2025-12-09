import type { Node } from 'reactflow';
import type {
  ActionNode,
  AudioEventNode,
  LogicNode,
  NodeCueFile,
  YargEventNode
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes';

export type EditorNodeData = {
  kind: 'event' | 'action' | 'logic';
  payload: YargEventNode | AudioEventNode | ActionNode | LogicNode;
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
