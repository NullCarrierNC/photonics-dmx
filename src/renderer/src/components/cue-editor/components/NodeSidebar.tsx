import React from 'react';
import type {
  ActionNode,
  AudioEventNode,
  EventRaiserNode,
  EventListenerNode,
  EffectRaiserNode,
  EffectEventListenerNode,
  EffectDefinition,
  LogicNode,
  NodeCueMode,
  NodeEffectType,
  YargEventNode,
  YargEffectDefinition,
  AudioEffectDefinition,
  NotesNode
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes';
import type { EditorMode } from '../lib/types';
import type { EditorNode, EventOption } from '../lib/types';
import NodeCreationSections from './NodeCreationSections';
import EffectRaiserEditor from './node-editors/EffectRaiserEditor';
import EffectListenerEditor from './node-editors/EffectListenerEditor';
import EventRaiserEditor from './node-editors/EventRaiserEditor';
import EventListenerEditor from './node-editors/EventListenerEditor';
import EventNodeEditor from './node-editors/EventNodeEditor';
import LogicNodeEditor from './node-editors/LogicNodeEditor';
import ActionNodeEditor from './node-editors/ActionNodeEditor';
import NotesNodeEditor from './node-editors/NotesNodeEditor';

type Props = {
  activeMode: NodeCueMode;
  editorMode: EditorMode;
  selectedNode: EditorNode | null;
  selectedActionHasEventParent: boolean;
  availableVariables: { name: string; type: string; scope: 'cue' | 'cue-group' }[];
  availableEvents?: string[];
  availableEffects?: { id: string; name: string; definition?: EffectDefinition }[];
  currentEffect?: YargEffectDefinition | AudioEffectDefinition | null;
  addEventNode: (option: EventOption<YargEventNode['eventType'] | AudioEventNode['eventType']>) => void;
  addActionNode: (effect: NodeEffectType) => void;
  addLogicNode: (logicType: LogicNode['logicType']) => void;
  addEventRaiserNode?: () => void;
  addEventListenerNode?: () => void;
  addEffectRaiserNode?: () => void;
  addEffectListenerNode?: () => void;
  addNotesNode?: () => void;
  updateSelectedNode: <T extends YargEventNode | AudioEventNode | ActionNode | LogicNode | EventRaiserNode | EventListenerNode | EffectRaiserNode | EffectEventListenerNode | NotesNode>(updates: Partial<T>) => void;
};

const NodeSidebar: React.FC<Props> = ({
  activeMode,
  editorMode,
  selectedNode,
  selectedActionHasEventParent,
  availableVariables,
  availableEvents = [],
  availableEffects = [],
  currentEffect,
  addEventNode,
  addActionNode,
  addLogicNode,
  addEventRaiserNode,
  addEventListenerNode,
  addEffectRaiserNode,
  addEffectListenerNode,
  addNotesNode,
  updateSelectedNode
}) => {
  return (
    <aside className="bg-white dark:bg-gray-900 rounded-lg shadow-inner h-full flex flex-col overflow-hidden">
      <div className="p-3 flex-1 overflow-y-auto space-y-4">
        {!selectedNode ? (
          <NodeCreationSections
            activeMode={activeMode}
            editorMode={editorMode}
            addEventNode={addEventNode}
            addActionNode={addActionNode}
            addLogicNode={addLogicNode}
            addEventRaiserNode={addEventRaiserNode}
            addEventListenerNode={addEventListenerNode}
            addEffectRaiserNode={addEffectRaiserNode}
            addEffectListenerNode={addEffectListenerNode}
            addNotesNode={addNotesNode}
          />
        ) : (
          <>
            <div>
              <h3 className="font-semibold text-sm mb-2">Selected Node</h3>
              {selectedNode.data.kind === 'effect-raiser' && (
                <EffectRaiserEditor
                  node={selectedNode.data.payload as EffectRaiserNode}
                  availableEffects={availableEffects}
                  availableVariables={availableVariables}
                  updateNode={(updates) => updateSelectedNode<EffectRaiserNode>(updates)}
                />
              )}
              {selectedNode.data.kind === 'effect-listener' && (
                <EffectListenerEditor currentEffect={currentEffect ?? null} />
              )}
              {selectedNode.data.kind === 'event-raiser' && (
                <EventRaiserEditor
                  node={selectedNode.data.payload as EventRaiserNode}
                  availableEvents={availableEvents}
                  updateNode={(updates) => updateSelectedNode<EventRaiserNode>(updates)}
                />
              )}
              {selectedNode.data.kind === 'event-listener' && (
                <EventListenerEditor
                  node={selectedNode.data.payload as EventListenerNode}
                  availableEvents={availableEvents}
                  updateNode={(updates) => updateSelectedNode<EventListenerNode>(updates)}
                />
              )}
              {selectedNode.data.kind === 'event' && (
                <EventNodeEditor
                  node={selectedNode.data.payload as YargEventNode | AudioEventNode}
                  activeMode={activeMode}
                  updateYargNode={(updates) => updateSelectedNode<YargEventNode>(updates)}
                  updateAudioNode={(updates) => updateSelectedNode<AudioEventNode>(updates)}
                />
              )}
              {selectedNode.data.kind === 'logic' && (
                <LogicNodeEditor
                  node={selectedNode.data.payload as LogicNode}
                  activeMode={activeMode}
                  availableVariables={availableVariables}
                  updateNode={(updates) => updateSelectedNode<LogicNode>(updates)}
                />
              )}
              {selectedNode.data.kind === 'action' && (
                <ActionNodeEditor
                  node={selectedNode.data.payload as ActionNode}
                  activeMode={activeMode}
                  selectedActionHasEventParent={selectedActionHasEventParent}
                  availableVariables={availableVariables}
                  updateNode={(updates) => updateSelectedNode<ActionNode>(updates)}
                />
              )}
              {selectedNode.data.kind === 'notes' && (
                <NotesNodeEditor
                  node={selectedNode.data.payload as NotesNode}
                  updateNode={(updates) => updateSelectedNode<NotesNode>(updates)}
                />
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
};

export default NodeSidebar;
