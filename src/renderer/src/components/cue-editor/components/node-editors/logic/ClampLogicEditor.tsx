import React from 'react'
import type { ClampLogicNode } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import ValueSourceEditor from '../../shared/ValueSourceEditor'
import type { LogicEditorCommonProps } from './LogicNodeEditorShared'
import VariableSelect from './VariableSelect'

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
    <VariableSelect
      label="Assign To"
      value={node.assignTo}
      onChange={(name) => updateNode({ assignTo: name })}
      variables={availableVariables}
      placeholder="-- select variable --"
      showType
    />
  </div>
)

export default ClampLogicEditor
