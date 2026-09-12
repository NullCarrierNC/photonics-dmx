import React from 'react'
import type { ForEachLightLogicNode } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { LogicEditorCommonProps } from './LogicNodeEditorShared'
import VariableSelect from './VariableSelect'
import ValueSourceEditor from '../../shared/ValueSourceEditor'

export interface ForEachLightLogicEditorProps extends LogicEditorCommonProps {
  node: ForEachLightLogicNode
}

const ForEachLightLogicEditor: React.FC<ForEachLightLogicEditorProps> = ({
  node,
  availableVariables,
  updateNode,
}) => {
  const lightArrayVars = availableVariables.filter((v) => v.type === 'light-array')
  const numberVars = availableVariables.filter((v) => v.type === 'number')
  const useGroupSize = node.groupSize != null

  return (
    <div className="space-y-2 text-xs">
      <VariableSelect
        label="Source Variable (light-array)"
        value={node.sourceVariable}
        onChange={(name) => updateNode({ sourceVariable: name })}
        variables={lightArrayVars}
        placeholder="-- Select light-array --"
      />
      <VariableSelect
        label="Current Light Variable (light-array)"
        value={node.currentLightVariable}
        onChange={(name) => updateNode({ currentLightVariable: name })}
        variables={lightArrayVars}
        hint="Holds current light(s) for this iteration (one element or a group if Group Size is set)."
      />
      <VariableSelect
        label="Current Index Variable (number)"
        value={node.currentIndexVariable}
        onChange={(name) => updateNode({ currentIndexVariable: name })}
        variables={numberVars}
      />
      <div className="space-y-1">
        <label className="flex items-center gap-2 cursor-pointer font-medium">
          <input
            type="checkbox"
            checked={useGroupSize}
            onChange={(e) =>
              updateNode({
                groupSize: e.target.checked ? { source: 'literal', value: 2 } : undefined,
              })
            }
            className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700"
          />
          <span>Use group size (optional)</span>
        </label>
        {useGroupSize && (
          <ValueSourceEditor
            label="Group size (number or variable)"
            value={node.groupSize ?? { source: 'literal', value: 2 }}
            onChange={(next) => updateNode({ groupSize: next })}
            expected="number"
            availableVariables={availableVariables}
            integerOnly
          />
        )}
      </div>
      <p className="text-[10px] text-gray-500 italic">
        Iterates over the source light-array. If Group Size is set, each iteration processes that
        many lights as a group; otherwise one light per iteration. Connect &quot;each&quot; to the
        loop body, &quot;done&quot; to nodes after the loop.
      </p>
    </div>
  )
}

export default ForEachLightLogicEditor
