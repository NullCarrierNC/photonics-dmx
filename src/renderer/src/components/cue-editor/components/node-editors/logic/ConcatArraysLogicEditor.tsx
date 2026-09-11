import React from 'react'
import type {
  ConcatColorsLogicNode,
  ConcatLightsLogicNode,
} from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { LogicEditorCommonProps } from './LogicNodeEditorShared'
import VariableSelect from './VariableSelect'

export type ConcatArraysLogicNode = ConcatColorsLogicNode | ConcatLightsLogicNode

/** The array each concat node joins, how its sources are labelled, and the line of help under its fields. */
const CONCATS: Record<
  ConcatArraysLogicNode['logicType'],
  { arrayType: 'color-array' | 'light-array'; sourceLabel: string; description: string }
> = {
  'concat-colors': {
    arrayType: 'color-array',
    sourceLabel: 'Source Palettes',
    description: 'Concatenates multiple colour palettes into one. Order matters.',
  },
  'concat-lights': {
    arrayType: 'light-array',
    sourceLabel: 'Source Arrays',
    description: 'Concatenates multiple light arrays into one. Order matters.',
  },
}

export interface ConcatArraysLogicEditorProps extends LogicEditorCommonProps {
  node: ConcatArraysLogicNode
}

/** The editor for the nodes that join arrays end to end, over colours or lights. */
const ConcatArraysLogicEditor: React.FC<ConcatArraysLogicEditorProps> = ({
  node,
  availableVariables,
  updateNode,
}) => {
  const { arrayType, sourceLabel, description } = CONCATS[node.logicType]
  const arrayVars = availableVariables.filter((v) => v.type === arrayType)
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
        {sourceLabel} ({arrayType})
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
            <option value="">-- Add {arrayType} --</option>
            {arrayVars
              .filter((v) => !sourceVariables.includes(v.name))
              .map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} ({v.scope})
                </option>
              ))}
          </select>
        </div>
      </label>

      <VariableSelect
        label={`Assign To (${arrayType} variable)`}
        value={node.assignTo}
        onChange={(name) => updateNode({ assignTo: name })}
        variables={arrayVars}
      />

      <p className="text-[10px] text-gray-500 italic">{description}</p>
    </div>
  )
}

export default ConcatArraysLogicEditor
