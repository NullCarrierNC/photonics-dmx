import React from 'react'
import type { VariableLogicNode } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import ValueSourceEditor from '../../shared/ValueSourceEditor'
import type { LogicEditorCommonProps } from './LogicNodeEditorShared'

export interface VariableLogicEditorProps extends LogicEditorCommonProps {
  node: VariableLogicNode
}

const VariableLogicEditor: React.FC<VariableLogicEditorProps> = ({
  node,
  availableVariables,
  updateNode,
}) => {
  const showValue = node.mode !== 'get'

  return (
    <div className="space-y-2 text-xs">
      <label className="flex flex-col font-medium">
        Mode
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.mode}
          onChange={(event) =>
            updateNode({ mode: event.target.value as VariableLogicNode['mode'] })
          }>
          <option value="set">Set</option>
          <option value="get">Get</option>
          <option value="init">Init</option>
        </select>
      </label>
      <label className="flex flex-col font-medium">
        Variable Name
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.varName}
          onChange={(event) => updateNode({ varName: event.target.value })}>
          <option value="">-- Select Variable --</option>
          {availableVariables.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name} ({v.type}, {v.scope})
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col font-medium">
        Type
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.valueType}
          onChange={(event) =>
            updateNode({
              valueType: event.target.value as
                | 'number'
                | 'boolean'
                | 'string'
                | 'color'
                | 'cue-type'
                | 'light-array'
                | 'event',
            })
          }>
          <option value="number">number</option>
          <option value="boolean">boolean</option>
          <option value="string">string</option>
          <option value="color">color</option>
          <option value="cue-type">cue-type</option>
          <option value="light-array">light-array</option>
          <option value="event">event</option>
        </select>
      </label>
      {showValue && (
        <ValueSourceEditor
          label="Value"
          value={node.value}
          onChange={(next) => updateNode({ value: next })}
          expected={
            node.valueType as
              | 'number'
              | 'boolean'
              | 'string'
              | 'color'
              | 'cue-type'
              | 'light-array'
              | 'event'
          }
          availableVariables={availableVariables}
        />
      )}
    </div>
  )
}

export default VariableLogicEditor
