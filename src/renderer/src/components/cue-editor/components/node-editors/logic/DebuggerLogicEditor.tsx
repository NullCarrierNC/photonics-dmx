import React from 'react'
import type { DebuggerLogicNode } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import ValueSourceEditor from '../../shared/ValueSourceEditor'
import type { LogicEditorCommonProps } from './LogicNodeEditorShared'

export interface DebuggerLogicEditorProps extends LogicEditorCommonProps {
  node: DebuggerLogicNode
}

const DebuggerLogicEditor: React.FC<DebuggerLogicEditorProps> = ({
  node,
  availableVariables,
  updateNode,
}) => {
  const selectedVariables = node.variablesToLog ?? []

  const toggleVariable = (varName: string) => {
    const next = selectedVariables.includes(varName)
      ? selectedVariables.filter((name) => name !== varName)
      : [...selectedVariables, varName]
    updateNode({ variablesToLog: next })
  }

  return (
    <div className="space-y-2 text-xs">
      <ValueSourceEditor
        label="Message"
        value={node.message}
        onChange={(next) => updateNode({ message: next })}
        expected="string"
        availableVariables={availableVariables}
      />
      <div className="space-y-1">
        <p className="font-medium">Variables to log</p>
        {availableVariables.length === 0 && (
          <p className="text-[10px] text-gray-500">No registered variables.</p>
        )}
        {availableVariables.map((variable) => (
          <label key={variable.name} className="flex items-center gap-2">
            <input
              type="checkbox"
              className="rounded border-gray-300"
              checked={selectedVariables.includes(variable.name)}
              onChange={() => toggleVariable(variable.name)}
            />
            <span>
              {variable.name} ({variable.type}, {variable.scope})
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}

export default DebuggerLogicEditor
