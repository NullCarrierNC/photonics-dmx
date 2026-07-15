import React from 'react'
import type {
  VariableLogicNode,
  NodeCueMode,
  VariableType,
} from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { VARIABLE_TYPES } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import ValueSourceEditor from '../../shared/ValueSourceEditor'
import MultiItemSummary from './MultiItemSummary'
import type { LogicEditorCommonProps } from './LogicNodeEditorShared'

export interface VariableLogicEditorProps extends LogicEditorCommonProps {
  node: VariableLogicNode
  /** When set, enables built-in event-option dropdown for valueType="event". */
  activeMode?: NodeCueMode
}

const VariableLogicEditor: React.FC<VariableLogicEditorProps> = ({
  node,
  availableVariables,
  updateNode,
  activeMode,
}) => {
  const showValue = node.mode !== 'get'
  const selectedVariable = availableVariables.find((v) => v.name === node.varName)
  const validLiteralsFromVariable = selectedVariable?.validValues

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
          onChange={(event) => updateNode({ valueType: event.target.value as VariableType })}>
          {VARIABLE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      {showValue && (
        <ValueSourceEditor
          label="Value"
          value={node.value}
          onChange={(next) => updateNode({ value: next })}
          expected={node.valueType}
          validLiterals={validLiteralsFromVariable}
          activeMode={activeMode}
          availableVariables={availableVariables}
        />
      )}
      {node.assignments && node.assignments.length > 0 && (
        <MultiItemSummary
          header={`Multi-set: ${node.assignments.length} assignments`}
          rows={node.assignments.map((a) => `${node.mode} ${a.varName} (${a.valueType})`)}
          ignoredFieldsLabel="single-variable"
        />
      )}
    </div>
  )
}

export default VariableLogicEditor
