import React from 'react'
import type { ConcatColorsLogicNode } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { LogicEditorCommonProps } from './LogicNodeEditorShared'

export interface ConcatColorsLogicEditorProps extends LogicEditorCommonProps {
  node: ConcatColorsLogicNode
}

const ConcatColorsLogicEditor: React.FC<ConcatColorsLogicEditorProps> = ({
  node,
  availableVariables,
  updateNode,
}) => {
  const colorArrayVars = availableVariables.filter((v) => v.type === 'color-array')
  const sourceVariables = node.sourceVariables || []

  const addSourceVariable = (varName: string): void => {
    if (varName && !sourceVariables.includes(varName)) {
      updateNode({ sourceVariables: [...sourceVariables, varName] })
    }
  }

  const removeSourceVariable = (index: number): void => {
    const newVars = [...sourceVariables]
    newVars.splice(index, 1)
    updateNode({ sourceVariables: newVars })
  }

  return (
    <div className="space-y-2 text-xs">
      <label className="flex flex-col font-medium">
        Source Palettes (color-array)
        <div className="mt-1 space-y-1">
          {sourceVariables.map((varName, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="flex-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">
                {varName}
              </span>
              <button
                type="button"
                className="text-red-500 hover:text-red-700 px-1"
                onClick={() => removeSourceVariable(index)}>
                ×
              </button>
            </div>
          ))}
          <select
            className="w-full rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
            value=""
            onChange={(event) => addSourceVariable(event.target.value)}>
            <option value="">-- Add color-array --</option>
            {colorArrayVars
              .filter((v) => !sourceVariables.includes(v.name))
              .map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} ({v.scope})
                </option>
              ))}
          </select>
        </div>
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

      <p className="text-[10px] text-gray-500 italic">
        Concatenates multiple colour palettes into one. Order matters.
      </p>
    </div>
  )
}

export default ConcatColorsLogicEditor
