import React from 'react'
import type { BuildRingLogicNode } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { LogicEditorCommonProps } from './LogicNodeEditorShared'
import VariableSelect from './VariableSelect'

export interface BuildRingLogicEditorProps extends LogicEditorCommonProps {
  node: BuildRingLogicNode
}

const BuildRingLogicEditor: React.FC<BuildRingLogicEditorProps> = ({
  node,
  availableVariables,
  updateNode,
}) => {
  return (
    <div className="space-y-2 text-xs">
      <VariableSelect
        label="Ring (light-array variable)"
        value={node.assignTo}
        onChange={(name) => updateNode({ assignTo: name })}
        variables={availableVariables}
        types={['light-array']}
      />

      <VariableSelect
        label="Group Size (number variable)"
        value={node.assignGroupSize}
        onChange={(name) => updateNode({ assignGroupSize: name })}
        variables={availableVariables}
        types={['number']}
      />

      <p className="text-[10px] text-gray-500 italic">
        Builds a virtual 8-step LED ring from all lights so chases keep their shape on any rig:
        counts that divide 8 (4, 2…) are repeated, multiples of 8 (16, 24…) are interleaved with a
        matching group size, and other counts are resampled to 8 steps.
      </p>
    </div>
  )
}

export default BuildRingLogicEditor
