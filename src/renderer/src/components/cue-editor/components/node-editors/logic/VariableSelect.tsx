import React from 'react'
import type { LogicEditorCommonProps } from './LogicNodeEditorShared'

export interface VariableSelectProps {
  label: string
  value: string
  onChange: (name: string) => void
  /** Every variable the graph declares. */
  variables: LogicEditorCommonProps['availableVariables']
  /** The variable types the field takes. The select offers every variable when it is left out. */
  types?: readonly string[]
  /** Text of the empty option. */
  placeholder?: string
  /** Show each variable's type beside its scope, for a field that takes more than one type. */
  showType?: boolean
  /** A line of help under the select. */
  hint?: string
}

/**
 * The labelled variable select the logic editors pick their inputs and outputs with. A stored name
 * the select does not offer stays selected under its own name, marked with the type a declared
 * variable has, or as undeclared for a scratch variable a node writes.
 */
const VariableSelect: React.FC<VariableSelectProps> = ({
  label,
  value,
  onChange,
  variables,
  types,
  placeholder = '-- Select variable --',
  showType = false,
  hint,
}) => {
  const offered = types ? variables.filter((v) => types.includes(v.type)) : variables
  const declared = variables.find((v) => v.name === value)
  return (
    <label className="flex flex-col font-medium">
      {label}
      <select
        className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
        value={value}
        onChange={(event) => onChange(event.target.value)}>
        <option value="">{placeholder}</option>
        {value && !offered.some((v) => v.name === value) && (
          <option value={value} disabled>
            {value} ({declared ? `${declared.type}, does not fit this field` : 'not declared here'})
          </option>
        )}
        {offered.map((v) => (
          <option key={v.name} value={v.name}>
            {v.name} ({showType ? `${v.type}, ${v.scope}` : v.scope})
          </option>
        ))}
      </select>
      {hint && <span className="text-[10px] text-gray-500 mt-0.5">{hint}</span>}
    </label>
  )
}

export default VariableSelect
