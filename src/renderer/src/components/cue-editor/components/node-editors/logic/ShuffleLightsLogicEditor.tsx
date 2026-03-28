import React from 'react'
import type { ShuffleLightsLogicNode } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { LogicEditorCommonProps } from './LogicNodeEditorShared'

export interface ShuffleLightsLogicEditorProps extends LogicEditorCommonProps {
  node: ShuffleLightsLogicNode
}

const ShuffleLightsLogicEditor: React.FC<ShuffleLightsLogicEditorProps> = ({
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
      <label className="flex flex-col font-medium">
        Assign To (light-array variable)
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
        Randomly reorders the lights in the array. Combined with for-each-light or iteration, useful
        for per-light random assignment.
      </p>
    </div>
  )
}

export default ShuffleLightsLogicEditor
