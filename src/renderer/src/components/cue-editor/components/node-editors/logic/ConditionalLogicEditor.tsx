import React from 'react'
import type {
  ConditionalLogicNode,
  LogicComparator,
} from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import ValueSourceEditor from '../../shared/ValueSourceEditor'
import type { LogicEditorCommonProps } from './LogicNodeEditorShared'

export interface ConditionalLogicEditorProps extends LogicEditorCommonProps {
  node: ConditionalLogicNode
}

const ConditionalLogicEditor: React.FC<ConditionalLogicEditorProps> = ({
  node,
  availableVariables,
  updateNode,
}) => (
  <div className="space-y-2 text-xs">
    <label className="flex flex-col font-medium">
      Comparator
      <select
        className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
        value={node.comparator}
        onChange={(event) => updateNode({ comparator: event.target.value as LogicComparator })}>
        <option value=">">&gt;</option>
        <option value=">=">&gt;=</option>
        <option value="<">&lt;</option>
        <option value="<=">&lt;=</option>
        <option value="==">==</option>
        <option value="!=">!=</option>
      </select>
    </label>
    <ValueSourceEditor
      label="Left"
      value={node.left}
      onChange={(next) => updateNode({ left: next })}
      availableVariables={availableVariables}
    />
    <ValueSourceEditor
      label="Right"
      value={node.right}
      onChange={(next) => updateNode({ right: next })}
      availableVariables={availableVariables}
    />
    <p className="text-[10px] text-gray-500">
      First outgoing edge becomes TRUE branch, second becomes FALSE.
    </p>
  </div>
)

export default ConditionalLogicEditor
