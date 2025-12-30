import React, { useMemo } from 'react';
import type { 
  LogicNode, 
  VariableLogicNode, 
  MathLogicNode,
  ConditionalLogicNode,
  CueDataLogicNode,
  ConfigDataLogicNode,
  LightsFromIndexLogicNode,
  ConfigDataProperty,
  MathOperator,
  LogicComparator
} from '../../../../../../photonics-dmx/cues/types/nodeCueTypes';
import type { NodeCueMode } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes';
import { getConfigDataPropertiesMeta } from '../../../../../../photonics-dmx/constants/nodeConstants';
import ValueSourceEditor from '../shared/ValueSourceEditor';

interface LogicNodeEditorProps {
  node: LogicNode;
  activeMode: NodeCueMode;
  availableVariables: { name: string; type: string; scope: 'cue' | 'cue-group' }[];
  updateNode: (updates: Partial<LogicNode>) => void;
}

const VariableLogicEditor: React.FC<{
  node: VariableLogicNode;
  availableVariables: { name: string; type: string; scope: 'cue' | 'cue-group' }[];
  updateNode: (updates: Partial<LogicNode>) => void;
}> = ({ node, availableVariables, updateNode }) => {
  const showValue = node.mode !== 'get';

  return (
    <div className="space-y-2 text-xs">
      <label className="flex flex-col font-medium">
        Mode
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.mode}
          onChange={event => updateNode({ mode: event.target.value as VariableLogicNode['mode'] })}
        >
          <option value="set">Set</option>
          <option value="get">Get</option>
          <option value="init">Init</option>
        </select>
      </label>
      <label className="flex flex-col font-medium">
        Variable Name
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.varName}
          onChange={event => updateNode({ varName: event.target.value })}
        >
          <option value="">-- Select Variable --</option>
          {availableVariables.map(v => (
            <option key={v.name} value={v.name}>
              {v.name} ({v.type}, {v.scope})
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col font-medium">
        Type
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.valueType}
          onChange={event => updateNode({ valueType: event.target.value as 'number' | 'boolean' | 'string' })}
        >
          <option value="number">number</option>
          <option value="boolean">boolean</option>
          <option value="string">string</option>
        </select>
      </label>
      {showValue && (
        <ValueSourceEditor
          label="Value"
          value={node.value}
          onChange={next => updateNode({ value: next })}
          expected={node.valueType as 'number' | 'boolean' | 'string'}
          availableVariables={availableVariables}
        />
      )}
    </div>
  );
};

const MathLogicEditor: React.FC<{
  node: MathLogicNode;
  availableVariables: { name: string; type: string; scope: 'cue' | 'cue-group' }[];
  updateNode: (updates: Partial<LogicNode>) => void;
}> = ({ node, availableVariables, updateNode }) => {
  return (
    <div className="space-y-2 text-xs">
      <label className="flex flex-col font-medium">
        Operator
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.operator}
          onChange={event => updateNode({ operator: event.target.value as MathOperator })}
        >
          <option value="add">add</option>
          <option value="subtract">subtract</option>
          <option value="multiply">multiply</option>
          <option value="divide">divide</option>
          <option value="modulus">modulus</option>
        </select>
      </label>
      <ValueSourceEditor
        label="Left"
        value={node.left}
        onChange={next => updateNode({ left: next })}
        expected="number"
        availableVariables={availableVariables}
      />
      <ValueSourceEditor
        label="Right"
        value={node.right}
        onChange={next => updateNode({ right: next })}
        expected="number"
        availableVariables={availableVariables}
      />
      <label className="flex flex-col font-medium">
        Assign To (optional)
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.assignTo ?? ''}
          onChange={event => updateNode({ assignTo: event.target.value || undefined })}
        >
          <option value="">-- None --</option>
          {availableVariables.map(v => (
            <option key={v.name} value={v.name}>
              {v.name} ({v.type}, {v.scope})
            </option>
          ))}
        </select>
      </label>
    </div>
  );
};

const CueDataLogicEditor: React.FC<{
  node: CueDataLogicNode;
  activeMode: NodeCueMode;
  availableVariables: { name: string; type: string; scope: 'cue' | 'cue-group' }[];
  updateNode: (updates: Partial<LogicNode>) => void;
}> = ({ node, activeMode, availableVariables, updateNode }) => {
  const cueDataProperties = activeMode === 'yarg' ? [
    { id: 'cue-name', label: 'Cue Name', type: 'string' },
    { id: 'cue-type', label: 'Cue Type', type: 'string' },
    { id: 'execution-count', label: 'Execution Count', type: 'number' },
    { id: 'bpm', label: 'BPM', type: 'number' },
    { id: 'song-section', label: 'Song Section', type: 'string' },
    { id: 'current-scene', label: 'Current Scene', type: 'string' },
    { id: 'beat-type', label: 'Beat Type', type: 'string' },
    { id: 'keyframe', label: 'Keyframe', type: 'string' },
    { id: 'venue-size', label: 'Venue Size', type: 'string' },
    { id: 'guitar-note-count', label: 'Guitar Note Count', type: 'number' },
    { id: 'bass-note-count', label: 'Bass Note Count', type: 'number' },
    { id: 'drum-note-count', label: 'Drum Note Count', type: 'number' },
    { id: 'keys-note-count', label: 'Keys Note Count', type: 'number' },
    { id: 'total-score', label: 'Total Score', type: 'number' },
    { id: 'performer', label: 'Performer', type: 'number' },
    { id: 'bonus-effect', label: 'Bonus Effect', type: 'boolean' },
    { id: 'fog-state', label: 'Fog State', type: 'boolean' },
    { id: 'time-since-cue-start', label: 'Time Since Cue Start', type: 'number' },
    { id: 'time-since-last-cue', label: 'Time Since Last Cue', type: 'number' }
  ] : [
    { id: 'cue-name', label: 'Cue Name', type: 'string' },
    { id: 'cue-type-id', label: 'Cue Type ID', type: 'string' },
    { id: 'execution-count', label: 'Execution Count', type: 'number' },
    { id: 'timestamp', label: 'Timestamp', type: 'number' },
    { id: 'overall-level', label: 'Overall Audio Level', type: 'number' },
    { id: 'bpm', label: 'BPM', type: 'number' },
    { id: 'beat-detected', label: 'Beat Detected', type: 'boolean' },
    { id: 'energy', label: 'Energy', type: 'number' },
    { id: 'freq-range1', label: 'Frequency Range 1', type: 'number' },
    { id: 'freq-range2', label: 'Frequency Range 2', type: 'number' },
    { id: 'freq-range3', label: 'Frequency Range 3', type: 'number' },
    { id: 'freq-range4', label: 'Frequency Range 4', type: 'number' },
    { id: 'freq-range5', label: 'Frequency Range 5', type: 'number' },
    { id: 'enabled-band-count', label: 'Enabled Band Count', type: 'number' }
  ];

  return (
    <div className="space-y-2 text-xs">
      <label className="flex flex-col font-medium">
        Data Property
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.dataProperty ?? ''}
          onChange={event => updateNode({ dataProperty: event.target.value as ConfigDataProperty || undefined })}
        >
          <option value="">-- Select Property --</option>
          {cueDataProperties.map(prop => (
            <option key={prop.id} value={prop.id}>
              {prop.label} ({prop.type})
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col font-medium">
        Assign To Variable (optional)
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.assignTo ?? ''}
          onChange={event => updateNode({ assignTo: event.target.value || undefined })}
        >
          <option value="">-- None --</option>
          {availableVariables.map(v => (
            <option key={v.name} value={v.name}>
              {v.name} ({v.type}, {v.scope})
            </option>
          ))}
        </select>
      </label>
    </div>
  );
};

const ConfigDataLogicEditor: React.FC<{
  node: ConfigDataLogicNode;
  availableVariables: { name: string; type: string; scope: 'cue' | 'cue-group' }[];
  updateNode: (updates: Partial<LogicNode>) => void;
}> = ({ node, availableVariables, updateNode }) => {
  // Use shared constants for config data properties
  const configDataProperties = useMemo(() => getConfigDataPropertiesMeta(), []);

  return (
    <div className="space-y-2 text-xs">
      <label className="flex flex-col font-medium">
        Config Property
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.dataProperty ?? ''}
          onChange={event => updateNode({ dataProperty: event.target.value as ConfigDataProperty || undefined })}
        >
          <option value="">-- Select Property --</option>
          {configDataProperties.map(prop => (
            <option key={prop.id} value={prop.id}>
              {prop.label} ({prop.type})
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col font-medium">
        Assign To Variable (optional)
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.assignTo ?? ''}
          onChange={event => updateNode({ assignTo: event.target.value || undefined })}
        >
          <option value="">-- None --</option>
          {availableVariables.map(v => (
            <option key={v.name} value={v.name}>
              {v.name} ({v.type}, {v.scope})
            </option>
          ))}
        </select>
      </label>
    </div>
  );
};

const ConditionalLogicEditor: React.FC<{
  node: ConditionalLogicNode;
  availableVariables: { name: string; type: string; scope: 'cue' | 'cue-group' }[];
  updateNode: (updates: Partial<LogicNode>) => void;
}> = ({ node, availableVariables, updateNode }) => {
  return (
    <div className="space-y-2 text-xs">
      <label className="flex flex-col font-medium">
        Comparator
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.comparator}
          onChange={event => updateNode({ comparator: event.target.value as LogicComparator })}
        >
          <option value=">">&gt;</option>
          <option value=">=">&gt;=</option>
          <option value="<">&lt;</option>
          <option value="<=">&lt;=</option>
          <option value="==">==</option>
          <option value="!=">!=</option>
        </select>
      </label>
      <ValueSourceEditor
        label="Left"
        value={node.left}
        onChange={next => updateNode({ left: next })}
        availableVariables={availableVariables}
      />
      <ValueSourceEditor
        label="Right"
        value={node.right}
        onChange={next => updateNode({ right: next })}
        availableVariables={availableVariables}
      />
      <p className="text-[10px] text-gray-500">First outgoing edge becomes TRUE branch, second becomes FALSE.</p>
    </div>
  );
};

const LightsFromIndexLogicEditor: React.FC<{
  node: LightsFromIndexLogicNode;
  availableVariables: { name: string; type: string; scope: 'cue' | 'cue-group' }[];
  updateNode: (updates: Partial<LogicNode>) => void;
}> = ({ node, availableVariables, updateNode }) => {
  const lightArrayVars = availableVariables.filter(v => v.type === 'light-array');

  return (
    <div className="space-y-2 text-xs">
      <label className="flex flex-col font-medium">
        Source Variable (light-array)
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.sourceVariable}
          onChange={event => updateNode({ sourceVariable: event.target.value })}
        >
          <option value="">-- Select light-array --</option>
          {lightArrayVars.map(v => (
            <option key={v.name} value={v.name}>
              {v.name} ({v.scope})
            </option>
          ))}
        </select>
      </label>

      <ValueSourceEditor
        label="Index (with wraparound)"
        value={node.index}
        onChange={next => updateNode({ index: next })}
        expected="number"
        availableVariables={availableVariables}
      />

      <label className="flex flex-col font-medium">
        Assign To
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.assignTo}
          onChange={event => updateNode({ assignTo: event.target.value })}
        >
          <option value="">-- Select variable --</option>
          {lightArrayVars.map(v => (
            <option key={v.name} value={v.name}>
              {v.name} ({v.scope})
            </option>
          ))}
        </select>
      </label>

      <p className="text-[10px] text-gray-500 italic">
        Extracts a single light from source array. Index wraps around if out of bounds.
      </p>
    </div>
  );
};

const ForLoopLogicEditor: React.FC<{
  node: any;
  availableVariables: { name: string; type: string; scope: 'cue' | 'cue-group' }[];
  updateNode: (updates: Partial<LogicNode>) => void;
}> = ({ node, availableVariables, updateNode }) => {
  return (
    <div className="space-y-2 text-xs">
      <ValueSourceEditor
        label="Start (inclusive)"
        value={node.start}
        onChange={next => updateNode({ start: next })}
        expected="number"
        availableVariables={availableVariables}
      />
      <ValueSourceEditor
        label="End (exclusive)"
        value={node.end}
        onChange={next => updateNode({ end: next })}
        expected="number"
        availableVariables={availableVariables}
      />
      <ValueSourceEditor
        label="Step"
        value={node.step}
        onChange={next => updateNode({ step: next })}
        expected="number"
        availableVariables={availableVariables}
      />
      <label className="flex flex-col font-medium">
        Counter Variable
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.counterVariable ?? ''}
          onChange={event => updateNode({ counterVariable: event.target.value })}
        >
          <option value="">-- Select Variable --</option>
          {availableVariables.filter(v => v.type === 'number').map(v => (
            <option key={v.name} value={v.name}>
              {v.name} ({v.scope})
            </option>
          ))}
        </select>
      </label>
      <p className="text-[10px] text-gray-500">Max 1000 iterations. Loop executes downstream nodes synchronously.</p>
    </div>
  );
};

const WhileLoopLogicEditor: React.FC<{
  node: any;
  availableVariables: { name: string; type: string; scope: 'cue' | 'cue-group' }[];
  updateNode: (updates: Partial<LogicNode>) => void;
}> = ({ node, availableVariables, updateNode }) => {
  return (
    <div className="space-y-2 text-xs">
      <label className="flex flex-col font-medium">
        Comparator
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.comparator}
          onChange={event => updateNode({ comparator: event.target.value as LogicComparator })}
        >
          <option value=">">&gt;</option>
          <option value=">=">&gt;=</option>
          <option value="<">&lt;</option>
          <option value="<=">&lt;=</option>
          <option value="==">==</option>
          <option value="!=">!=</option>
        </select>
      </label>
      <ValueSourceEditor
        label="Left"
        value={node.left}
        onChange={next => updateNode({ left: next })}
        expected="number"
        availableVariables={availableVariables}
      />
      <ValueSourceEditor
        label="Right"
        value={node.right}
        onChange={next => updateNode({ right: next })}
        expected="number"
        availableVariables={availableVariables}
      />
      <ValueSourceEditor
        label="Max Iterations (default: 1000)"
        value={node.maxIterations}
        onChange={next => updateNode({ maxIterations: next })}
        expected="number"
        availableVariables={availableVariables}
      />
      <p className="text-[10px] text-gray-500">Hard cap at 1000 iterations. Loop executes while condition is true.</p>
    </div>
  );
};

const LogicNodeEditor: React.FC<LogicNodeEditorProps> = ({
  node,
  activeMode,
  availableVariables,
  updateNode
}) => {
  if (node.logicType === 'variable') {
    return (
      <VariableLogicEditor
        node={node as VariableLogicNode}
        availableVariables={availableVariables}
        updateNode={updateNode}
      />
    );
  }

  if (node.logicType === 'math') {
    return (
      <MathLogicEditor
        node={node as MathLogicNode}
        availableVariables={availableVariables}
        updateNode={updateNode}
      />
    );
  }

  if (node.logicType === 'cue-data') {
    return (
      <CueDataLogicEditor
        node={node as CueDataLogicNode}
        activeMode={activeMode}
        availableVariables={availableVariables}
        updateNode={updateNode}
      />
    );
  }

  if (node.logicType === 'config-data') {
    return (
      <ConfigDataLogicEditor
        node={node as ConfigDataLogicNode}
        availableVariables={availableVariables}
        updateNode={updateNode}
      />
    );
  }

  if (node.logicType === 'lights-from-index') {
    return (
      <LightsFromIndexLogicEditor
        node={node as LightsFromIndexLogicNode}
        availableVariables={availableVariables}
        updateNode={updateNode}
      />
    );
  }

  if (node.logicType === 'for-loop') {
    return (
      <ForLoopLogicEditor
        node={node}
        availableVariables={availableVariables}
        updateNode={updateNode}
      />
    );
  }

  if (node.logicType === 'while-loop') {
    return (
      <WhileLoopLogicEditor
        node={node}
        availableVariables={availableVariables}
        updateNode={updateNode}
      />
    );
  }

  if (node.logicType === 'conditional') {
    return (
      <ConditionalLogicEditor
        node={node as ConditionalLogicNode}
        availableVariables={availableVariables}
        updateNode={updateNode}
      />
    );
  }

  return <div className="text-xs text-gray-500">Unknown logic node type</div>;
};

export default LogicNodeEditor;
