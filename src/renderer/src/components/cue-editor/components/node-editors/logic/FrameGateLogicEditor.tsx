import React from 'react'
import type { FrameGateLogicNode } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import ValueSourceEditor from '../../shared/ValueSourceEditor'
import type { LogicEditorCommonProps } from './LogicNodeEditorShared'

export interface FrameGateLogicEditorProps extends LogicEditorCommonProps {
  node: FrameGateLogicNode
}

/** A frame-rate divider: fires the `true` port every Nth time it is reached, `false` otherwise. Replaces a
 *  counter + modulus + conditional trio, with the count kept internally (reset each activation). */
const FrameGateLogicEditor: React.FC<FrameGateLogicEditorProps> = ({
  node,
  availableVariables,
  updateNode,
}) => (
  <div className="space-y-2 text-xs">
    <ValueSourceEditor
      label="Divisor (fire every N frames)"
      value={node.divisor}
      onChange={(next) => updateNode({ divisor: next })}
      expected="number"
      availableVariables={availableVariables}
    />
    <p className="text-[10px] text-gray-500">
      Routes flow to the <span className="font-semibold">true</span> port on every Nth evaluation
      and the <span className="font-semibold">false</span> port otherwise. The count resets each
      time the cue activates.
    </p>
  </div>
)

export default FrameGateLogicEditor
