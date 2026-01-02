import type { Node } from 'reactflow';
import type {
  ActionNode,
  AudioEventNode,
  EventRaiserNode,
  EventListenerNode,
  LogicNode,
  NodeCueFile,
  YargEventNode,
  EffectRaiserNode,
  EffectEventListenerNode,
  NotesNode,
  EffectFile
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes';

export type EditorMode = 'cue' | 'effect';

export type EditorNodeData = {
  kind: 'event' | 'action' | 'logic' | 'event-raiser' | 'event-listener' 
        | 'effect-raiser' | 'effect-listener' | 'notes';
  payload: YargEventNode | AudioEventNode | ActionNode | LogicNode 
           | EventRaiserNode | EventListenerNode 
           | EffectRaiserNode | EffectEventListenerNode | NotesNode;
  label: string;
};

export type EditorNode = Node<EditorNodeData>;

export type EditorDocument = {
  mode: EditorMode;
  file: NodeCueFile | EffectFile;
  path: string | null;
};

export type EventOption<T extends string> = {
  value: T;
  label: string;
};
