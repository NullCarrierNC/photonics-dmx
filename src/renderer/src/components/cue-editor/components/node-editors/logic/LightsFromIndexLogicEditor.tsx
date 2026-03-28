import React from 'react'
import type { LightsFromIndexLogicNode } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import ValueSourceEditor from '../../shared/ValueSourceEditor'
import type { LogicEditorCommonProps } from './LogicNodeEditorShared'

export interface LightsFromIndexLogicEditorProps extends LogicEditorCommonProps {
  node: LightsFromIndexLogicNode
}

const LightsFromIndexLogicEditor: React.FC<LightsFromIndexLogicEditorProps> = ({
  node,
  availableVariables,
  updateNode,
}) => {
  const lightArrayVars = availableVariables.filter((v) => v.type === 'light-array')

  return (
    <div className="space-y-2 text-xs">
      <label className="flex flex-col font-medium">
        Source Variable (light-array)
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.sourceVariable}
          onChange={(event) => updateNode({ sourceVariable: event.target.value })}>
          <option value="">-- Select light-array --</option>
          {lightArrayVars.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name} ({v.scope})
            </option>
          ))}
        </select>
      </label>

      <div className="space-y-1">
        <ValueSourceEditor
          label="Index (single int, comma-separated list, or variable)"
          value={node.index}
          onChange={(next) => updateNode({ index: next })}
          expected="either"
          availableVariables={availableVariables}
        />
        {node.index.source === 'literal' &&
          typeof node.index.value === 'string' &&
          node.index.value.includes(',') && (
            <p className="text-[10px] text-gray-500 italic">
              Comma-separated list of integers (e.g., &quot;0, 2, 5&quot;)
            </p>
          )}
      </div>

      <label className="flex flex-col font-medium">
        Assign To
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.assignTo}
          onChange={(event) => updateNode({ assignTo: event.target.value })}>
          <option value="">-- Select variable --</option>
          {lightArrayVars.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name} ({v.scope})
            </option>
          ))}
        </select>
      </label>

      <p className="text-[10px] text-gray-500 italic">
        Extracts lights from source array at specified indices. Supports single int, comma-separated
        list (e.g., &quot;0, 2, 5&quot;), or variable (single int or array of ints). Indices wrap
        around if out of bounds.
      </p>
    </div>
  )
}

export default LightsFromIndexLogicEditor
