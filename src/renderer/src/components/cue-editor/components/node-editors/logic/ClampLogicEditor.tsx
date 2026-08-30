import React from 'react'
import type { ClampLogicNode } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import ValueSourceEditor from '../../shared/ValueSourceEditor'
import type { LogicEditorCommonProps } from './LogicNodeEditorShared'

export interface ClampLogicEditorProps extends LogicEditorCommonProps {
  node: ClampLogicNode
}

const ClampLogicEditor: React.FC<ClampLogicEditorProps> = ({
  node,
  availableVariables,
  updateNode,
}) => (
  <div className="space-y-2 text-xs">
    <ValueSourceEditor
      label="Value"
      value={node.value}
      onChange={(next) => updateNode({ value: next })}
      expected="number"
      availableVariables={availableVariables}
    />
    <ValueSourceEditor
      label="Min"
      value={node.min}
      onChange={(next) => updateNode({ min: next })}
      expected="number"
      availableVariables={availableVariables}
    />
    <ValueSourceEditor
      label="Max"
      value={node.max}
      onChange={(next) => updateNode({ max: next })}
      expected="number"
      availableVariables={availableVariables}
    />
    <label className="flex flex-col font-medium">
      Assign To
      <select
        className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
        value={node.assignTo}
        onChange={(event) => updateNode({ assignTo: event.target.value })}>
        <option value="">-- select variable --</option>
        {availableVariables.map((v) => (
          <option key={v.name} value={v.name}>
            {v.name} ({v.type}, {v.scope})
          </option>
        ))}
      </select>
    </label>
  </div>
)

export default ClampLogicEditor
