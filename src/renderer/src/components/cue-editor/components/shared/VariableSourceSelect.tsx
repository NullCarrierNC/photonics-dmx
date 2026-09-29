import React from 'react'
import type { ValueIssue } from '../../../../../../photonics-dmx/cues/node/cueValueRules'
import { issueAttributes } from './FieldIssue'

/** A variable a field may read, as the file declares it. */
export interface VariableOption {
  name: string
  type: string
  scope: 'cue' | 'cue-group'
  validValues?: string[]
}

/** The look every select in a node editor's value fields shares. */
export const SELECT_CLASS =
  'rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700'

/**
 * The variable select of a value field. A stored name the candidates leave out stays its selected
 * entry, marked as the wrong type or not declared. Array variables are listed by scope, the rest by
 * type.
 */
const VariableSourceSelect: React.FC<{
  label: string
  selectedName: string
  candidates: readonly VariableOption[]
  availableVariables: readonly VariableOption[]
  placeholder: string
  listByScope: boolean
  onSelect: (name: string) => void
  issue: ValueIssue | null
  issueId: string
}> = ({
  label,
  selectedName,
  candidates,
  availableVariables,
  placeholder,
  listByScope,
  onSelect,
  issue,
  issueId,
}) => {
  const listed = candidates.some((v) => v.name === selectedName)
  return (
    <select
      aria-label={`${label} variable`}
      className={`mt-1 ${SELECT_CLASS}`}
      value={selectedName}
      onChange={(event) => onSelect(event.target.value)}
      {...issueAttributes(issue, issueId)}>
      <option value="">{placeholder}</option>
      {selectedName !== '' && !listed && (
        <option value={selectedName} disabled>
          {selectedName} (
          {availableVariables.some((v) => v.name === selectedName) ? 'wrong type' : 'not declared'})
        </option>
      )}
      {candidates.map((v) => (
        <option key={v.name} value={v.name}>
          {v.name} ({listByScope ? v.scope : v.type})
        </option>
      ))}
    </select>
  )
}

export default VariableSourceSelect
