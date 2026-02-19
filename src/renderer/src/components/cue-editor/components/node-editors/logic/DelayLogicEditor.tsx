import React from 'react'
import type { DelayLogicNode } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import ValueSourceEditor from '../../shared/ValueSourceEditor'
import type { LogicEditorCommonProps } from './LogicNodeEditorShared'

export interface DelayLogicEditorProps extends LogicEditorCommonProps {
  node: DelayLogicNode
}

const DelayLogicEditor: React.FC<DelayLogicEditorProps> = ({
  node,
  availableVariables,
  updateNode,
}) => (
  <div className="space-y-2 text-xs">
    <ValueSourceEditor
      label="Delay Time (ms)"
      value={node.delayTime}
      onChange={(next) => updateNode({ delayTime: next })}
      expected="number"
      availableVariables={availableVariables}
    />
    <p className="text-[10px] text-gray-500 italic">
      Delays execution for the specified time in milliseconds before continuing to the next node.
    </p>
  </div>
)

export default DelayLogicEditor
