import React from 'react';
import type { NodeCueMode, LogicNode, NodeEffectType } from '../../../../../photonics-dmx/cues/types/nodeCueTypes';
import type { EditorMode } from '../lib/types';
import { NODE_EFFECT_TYPES } from '../../../../../photonics-dmx/cues/types/nodeCueTypes';
import { getDefaultEventOption } from '../lib/options';
import type { EventOption } from '../lib/types';
import type { AudioEventNode } from '../../../../../photonics-dmx/cues/types/nodeCueTypes';
import type { WaitCondition } from '../../../../../photonics-dmx/types';

interface NodeCreationSectionsProps {
  activeMode: NodeCueMode;
  editorMode: EditorMode;
  addEventNode: (option: EventOption<WaitCondition | AudioEventNode['eventType']>) => void;
  addActionNode: (effect: NodeEffectType) => void;
  addLogicNode: (logicType: LogicNode['logicType']) => void;
  addEventRaiserNode?: () => void;
  addEventListenerNode?: () => void;
  addEffectRaiserNode?: () => void;
  addEffectListenerNode?: () => void;
}

const EventNodesSection: React.FC<{
  activeMode: NodeCueMode;
  addEventNode: (option: EventOption<WaitCondition | AudioEventNode['eventType']>) => void;
}> = ({ activeMode, addEventNode }) => (
  <div>
    <h3 className="font-semibold text-sm mb-2">Event Nodes</h3>
    <button
      className="border rounded px-2 py-1 text-xs hover:bg-gray-100 dark:hover:bg-gray-800"
      onClick={() => addEventNode(getDefaultEventOption(activeMode))}
    >
      System Event
    </button>
  </div>
);

const EffectListenerSection: React.FC<{
  addEffectListenerNode: () => void;
}> = ({ addEffectListenerNode }) => (
  <div>
    <h3 className="font-semibold text-sm mb-2">Effect Entry</h3>
    <button
      className="border rounded px-2 py-1 text-xs hover:bg-gray-100 dark:hover:bg-gray-800"
      onClick={() => addEffectListenerNode()}
    >
      Effect Listener
    </button>
  </div>
);

const ActionNodesSection: React.FC<{
  addActionNode: (effect: NodeEffectType) => void;
}> = ({ addActionNode }) => (
  <div>
    <h3 className="font-semibold text-sm mb-2">Action Nodes</h3>
    <div className="grid grid-cols-2 gap-2 text-xs">
      {NODE_EFFECT_TYPES.map(effect => (
        <button
          key={effect}
          className="border rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800"
          onClick={() => addActionNode(effect)}
        >
          {effect}
        </button>
      ))}
    </div>
  </div>
);

const LogicNodesSection: React.FC<{
  addLogicNode: (logicType: LogicNode['logicType']) => void;
}> = ({ addLogicNode }) => (
  <div>
    <h3 className="font-semibold text-sm mb-2">Logic Nodes</h3>
    <div className="grid grid-cols-3 gap-2 text-xs">
      <button
        className="border rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800"
        onClick={() => addLogicNode('variable')}
      >
        Variable
      </button>
      <button
        className="border rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800"
        onClick={() => addLogicNode('conditional')}
      >
        Conditional
      </button>
      <button
        className="border rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800"
        onClick={() => addLogicNode('math')}
      >
        Math
      </button>
      <button
        className="border rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800"
        onClick={() => addLogicNode('cue-data')}
      >
        Cue Data
      </button>
      <button
        className="border rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800"
        onClick={() => addLogicNode('config-data')}
      >
        Config Data
      </button>
      <button
        className="border rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800"
        onClick={() => addLogicNode('lights-from-index')}
      >
        Lights From Index
      </button>
    </div>
  </div>
);

const RuntimeEventsSection: React.FC<{
  addEventRaiserNode: () => void;
  addEventListenerNode: () => void;
}> = ({ addEventRaiserNode, addEventListenerNode }) => (
  <div>
    <h3 className="font-semibold text-sm mb-2">Runtime Events</h3>
    <div className="grid grid-cols-2 gap-2 text-xs">
      <button
        className="border rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800"
        onClick={() => addEventRaiserNode()}
      >
        Event Raiser
      </button>
      <button
        className="border rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800"
        onClick={() => addEventListenerNode()}
      >
        Event Listener
      </button>
    </div>
  </div>
);

const EffectNodesSection: React.FC<{
  addEffectRaiserNode: () => void;
}> = ({ addEffectRaiserNode }) => (
  <div>
    <h3 className="font-semibold text-sm mb-2">Effect Nodes</h3>
    <button
      className="border rounded px-2 py-1 text-xs hover:bg-gray-100 dark:hover:bg-gray-800"
      onClick={() => addEffectRaiserNode()}
    >
      Effect Raiser
    </button>
  </div>
);

const NodeCreationSections: React.FC<NodeCreationSectionsProps> = ({
  activeMode,
  editorMode,
  addEventNode,
  addActionNode,
  addLogicNode,
  addEventRaiserNode,
  addEventListenerNode,
  addEffectRaiserNode,
  addEffectListenerNode
}) => {
  return (
    <>
      {editorMode === 'cue' && (
        <EventNodesSection activeMode={activeMode} addEventNode={addEventNode} />
      )}

      {editorMode === 'effect' && addEffectListenerNode && (
        <EffectListenerSection addEffectListenerNode={addEffectListenerNode} />
      )}

      <ActionNodesSection addActionNode={addActionNode} />

      <LogicNodesSection addLogicNode={addLogicNode} />

      {addEventRaiserNode && addEventListenerNode && (
        <RuntimeEventsSection 
          addEventRaiserNode={addEventRaiserNode} 
          addEventListenerNode={addEventListenerNode} 
        />
      )}

      {editorMode === 'cue' && addEffectRaiserNode && (
        <EffectNodesSection addEffectRaiserNode={addEffectRaiserNode} />
      )}
    </>
  );
};

export default NodeCreationSections;
