import React from 'react'
import type { LightsFromIndexLogicNode } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import ValueSourceEditor from '../../shared/ValueSourceEditor'
import type { LogicEditorCommonProps } from './LogicNodeEditorShared'
import VariableSelect from './VariableSelect'

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
      <VariableSelect
        label="Source Variable (light-array)"
        value={node.sourceVariable}
        onChange={(name) => updateNode({ sourceVariable: name })}
        variables={lightArrayVars}
        placeholder="-- Select light-array --"
      />

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

      <VariableSelect
        label="Assign To"
        value={node.assignTo}
        onChange={(name) => updateNode({ assignTo: name })}
        variables={lightArrayVars}
      />

      <p className="text-[10px] text-gray-500 italic">
        Extracts lights from source array at specified indices. Supports single int, comma-separated
        list (e.g., &quot;0, 2, 5&quot;), or variable (single int or array of ints). Indices wrap
        around if out of bounds.
      </p>
    </div>
  )
}

export default LightsFromIndexLogicEditor
