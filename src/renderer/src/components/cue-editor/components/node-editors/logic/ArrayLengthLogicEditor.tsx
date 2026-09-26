import React from 'react'
import type { ArrayLengthLogicNode } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { LogicEditorCommonProps } from './LogicNodeEditorShared'
import VariableSelect from './VariableSelect'

export interface ArrayLengthLogicEditorProps extends LogicEditorCommonProps {
  node: ArrayLengthLogicNode
}

const ArrayLengthLogicEditor: React.FC<ArrayLengthLogicEditorProps> = ({
  node,
  availableVariables,
  updateNode,
}) => {
  return (
    <div className="space-y-2 text-xs">
      <VariableSelect
        label="Source Variable (light-array or color-array)"
        value={node.sourceVariable}
        onChange={(name) => updateNode({ sourceVariable: name })}
        variables={availableVariables}
        types={['light-array', 'color-array']}
        placeholder="-- Select array --"
        showType
      />

      <VariableSelect
        label="Assign To (number variable)"
        value={node.assignTo}
        onChange={(name) => updateNode({ assignTo: name })}
        variables={availableVariables}
        types={['number']}
      />

      <p className="text-[10px] text-gray-500 italic">
        Gets the number of items in the source array (lights or colours).
      </p>
    </div>
  )
}

export default ArrayLengthLogicEditor
