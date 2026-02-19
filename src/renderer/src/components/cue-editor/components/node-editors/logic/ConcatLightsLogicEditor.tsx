import React from 'react'
import type { ConcatLightsLogicNode } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { LogicEditorCommonProps } from './LogicNodeEditorShared'

export interface ConcatLightsLogicEditorProps extends LogicEditorCommonProps {
  node: ConcatLightsLogicNode
}

const ConcatLightsLogicEditor: React.FC<ConcatLightsLogicEditorProps> = ({
  node,
  availableVariables,
  updateNode,
}) => {
  const lightArrayVars = availableVariables.filter((v) => v.type === 'light-array')
  const sourceVariables = node.sourceVariables || []

  const addSourceVariable = (varName: string) => {
    if (varName && !sourceVariables.includes(varName)) {
      updateNode({ sourceVariables: [...sourceVariables, varName] })
    }
  }

  const removeSourceVariable = (index: number) => {
    const newVars = [...sourceVariables]
    newVars.splice(index, 1)
    updateNode({ sourceVariables: newVars })
  }

  return (
    <div className="space-y-2 text-xs">
      <label className="flex flex-col font-medium">
        Source Arrays (light-array)
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
            <option value="">-- Add light-array --</option>
            {lightArrayVars
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
        Concatenates multiple light arrays into one. Order matters.
      </p>
    </div>
  )
}

export default ConcatLightsLogicEditor
