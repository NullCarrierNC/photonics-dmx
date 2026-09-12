import React from 'react'
import type { SelectFromListLogicNode } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import ValueSourceEditor from '../../shared/ValueSourceEditor'
import type { LogicEditorCommonProps } from './LogicNodeEditorShared'
import VariableSelect from './VariableSelect'

export interface SelectFromListLogicEditorProps extends LogicEditorCommonProps {
  node: SelectFromListLogicNode
}

const SelectFromListLogicEditor: React.FC<SelectFromListLogicEditorProps> = ({
  node,
  availableVariables,
  updateNode,
}) => (
  <div className="space-y-2 text-xs">
    <label className="flex flex-col font-medium">
      List (comma-separated numbers)
      <input
        className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
        value={node.list.join(', ')}
        onChange={(event) =>
          updateNode({
            list: event.target.value
              .split(',')
              .map((entry) => Number(entry.trim()))
              .filter((n) => !Number.isNaN(n)),
          })
        }
      />
    </label>
    <ValueSourceEditor
      label="Index"
      value={node.index}
      onChange={(next) => updateNode({ index: next })}
      expected="number"
      availableVariables={availableVariables}
    />
    <VariableSelect
      label="Assign To"
      value={node.assignTo}
      onChange={(name) => updateNode({ assignTo: name })}
      variables={availableVariables}
      showType
    />
  </div>
)

export default SelectFromListLogicEditor
