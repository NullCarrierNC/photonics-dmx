import type { Node } from 'reactflow';
import type {
  ActionNode,
  AudioEventNode,
  NodeCueFile,
  YargEventNode
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes';

export type EditorNodeData = {
  kind: 'event' | 'action';
  payload: YargEventNode | AudioEventNode | ActionNode;
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
