import React from 'react';
import type { MathLogicNode, MathOperator } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes';
import ValueSourceEditor from '../../shared/ValueSourceEditor';
import type { LogicEditorCommonProps } from './LogicNodeEditorShared';

export interface MathLogicEditorProps extends LogicEditorCommonProps {
  node: MathLogicNode;
}

const MathLogicEditor: React.FC<MathLogicEditorProps> = ({
  node,
  availableVariables,
  updateNode
}) => (
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

export default MathLogicEditor;
