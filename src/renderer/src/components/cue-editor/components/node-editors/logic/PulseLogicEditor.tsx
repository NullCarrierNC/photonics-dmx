import React from 'react'
import type { PulseLogicNode } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import ValueSourceEditor from '../../shared/ValueSourceEditor'
import type { LogicEditorCommonProps } from './LogicNodeEditorShared'
import VariableSelect from './VariableSelect'

export interface PulseLogicEditorProps extends LogicEditorCommonProps {
  node: PulseLogicNode
}

const PulseLogicEditor: React.FC<PulseLogicEditorProps> = ({
  node,
  availableVariables,
  updateNode,
}) => (
  <div className="space-y-2 text-xs">
    <ValueSourceEditor
      label="Interval (ms per cycle — feed beat-duration-ms for tempo)"
      value={node.interval}
      onChange={(next) => updateNode({ interval: next })}
      expected="number"
      availableVariables={availableVariables}
    />
    <VariableSelect
      label="Anchor Variable (holds the cycle origin; resets each activation)"
      value={node.anchorVar}
      onChange={(name) => updateNode({ anchorVar: name })}
      variables={availableVariables}
      placeholder="-- select variable --"
      showType
    />
    <VariableSelect
      label="Assign Index To (integer cycles since anchor)"
      value={node.assignTo}
      onChange={(name) => updateNode({ assignTo: name })}
      variables={availableVariables}
      placeholder="-- select variable --"
      showType
    />
    <VariableSelect
      label="Assign Phase To (optional; fraction 0–1 within the cycle)"
      value={node.assignPhase ?? ''}
      onChange={(name) => updateNode({ assignPhase: name || undefined })}
      variables={availableVariables}
      placeholder="-- none --"
      showType
    />
  </div>
)

export default PulseLogicEditor
