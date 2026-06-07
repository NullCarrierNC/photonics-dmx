import React from 'react'
import type { ShuffleColorsLogicNode } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { LogicEditorCommonProps } from './LogicNodeEditorShared'

export interface ShuffleColorsLogicEditorProps extends LogicEditorCommonProps {
  node: ShuffleColorsLogicNode
}

const ShuffleColorsLogicEditor: React.FC<ShuffleColorsLogicEditorProps> = ({
  node,
  availableVariables,
  updateNode,
}) => {
  const colorArrayVars = availableVariables.filter((v) => v.type === 'color-array')

  return (
    <div className="space-y-2 text-xs">
      <label className="flex flex-col font-medium">
        Source Variable (color-array)
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.sourceVariable}
          onChange={(event) => updateNode({ sourceVariable: event.target.value })}>
          <option value="">-- Select color-array --</option>
          {colorArrayVars.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name} ({v.scope})
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col font-medium">
        Assign To (color-array variable)
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.assignTo}
          onChange={(event) => updateNode({ assignTo: event.target.value })}>
          <option value="">-- Select variable --</option>
          {colorArrayVars.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name} ({v.scope})
            </option>
          ))}
        </select>
      </label>

      <p className="text-[10px] text-gray-500 italic">Randomises the order of a colour palette.</p>
    </div>
  )
}

export default ShuffleColorsLogicEditor
