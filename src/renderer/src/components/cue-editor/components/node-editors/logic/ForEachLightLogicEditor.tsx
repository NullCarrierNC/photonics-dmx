import React from 'react';
import type { ForEachLightLogicNode } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes';
import type { LogicEditorCommonProps } from './LogicNodeEditorShared';

export interface ForEachLightLogicEditorProps extends LogicEditorCommonProps {
  node: ForEachLightLogicNode;
}

const ForEachLightLogicEditor: React.FC<ForEachLightLogicEditorProps> = ({
  node,
  availableVariables,
  updateNode
}) => {
  const lightArrayVars = availableVariables.filter(v => v.type === 'light-array');
  const numberVars = availableVariables.filter(v => v.type === 'number');

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
            <option key={v.name} value={v.name}>{v.name} ({v.scope})</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col font-medium">
        Current Light Variable (light-array, single light per iteration)
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.currentLightVariable}
          onChange={event => updateNode({ currentLightVariable: event.target.value })}
        >
          <option value="">-- Select variable --</option>
          {lightArrayVars.map(v => (
            <option key={v.name} value={v.name}>{v.name} ({v.scope})</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col font-medium">
        Current Index Variable (number)
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.currentIndexVariable}
          onChange={event => updateNode({ currentIndexVariable: event.target.value })}
        >
          <option value="">-- Select variable --</option>
          {numberVars.map(v => (
            <option key={v.name} value={v.name}>{v.name} ({v.scope})</option>
          ))}
        </select>
      </label>
      <p className="text-[10px] text-gray-500 italic">
        Iterates over each light. Connect &quot;each&quot; to the loop body (then back to this node or to actions). Connect &quot;done&quot; to nodes after the loop.
      </p>
    </div>
  );
};

export default ForEachLightLogicEditor;
