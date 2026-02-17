import React from 'react';
import type { CreatePairsLogicNode, CreatePairsType } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes';
import type { LogicEditorCommonProps } from './LogicNodeEditorShared';

export interface CreatePairsLogicEditorProps extends LogicEditorCommonProps {
  node: CreatePairsLogicNode;
}

const CreatePairsLogicEditor: React.FC<CreatePairsLogicEditorProps> = ({
  node,
  availableVariables,
  updateNode
}) => {
  const lightArrayVars = availableVariables.filter(v => v.type === 'light-array');

  return (
    <div className="space-y-2 text-xs">
      <label className="flex flex-col font-medium">
        Pair Type
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.pairType}
          onChange={event => updateNode({ pairType: event.target.value as CreatePairsType })}
        >
          <option value="opposite">Opposite Pairs</option>
          <option value="diagonal">Diagonal Pairs</option>
        </select>
      </label>

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

      <label className="flex flex-col font-medium">
        Assign To (light-array variable)
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
        {node.pairType === 'diagonal'
          ? 'Diagonal: For sweep patterns (6,2 → 5,1 → 4,0 → 3,7)'
          : 'Opposite: Pairs lights across the ring (0,4), (1,5), (2,6), (3,7)'}
      </p>
    </div>
  );
};

export default CreatePairsLogicEditor;
