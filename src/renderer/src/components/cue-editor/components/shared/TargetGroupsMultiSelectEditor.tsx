import React, { useId } from 'react'
import type { ValueSource } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { isLocationGroup, LOCATION_OPTIONS } from '../../../../../../photonics-dmx/types'
import {
  GROUPS_VARIABLE_TYPES,
  groupNames,
  groupsVariableIssue,
  literalIssue,
} from '../../../../../../photonics-dmx/cues/node/cueValueRules'
import { isVariableSource } from './nodeEditorUtils'
import FieldIssue, { issueAttributes } from './FieldIssue'

interface TargetGroupsMultiSelectEditorProps {
  label: string
  value: ValueSource | undefined
  onChange: (next: ValueSource) => void
  availableVariables: { name: string; type: string; scope: 'cue' | 'cue-group' }[]
}

const TargetGroupsMultiSelectEditor: React.FC<TargetGroupsMultiSelectEditorProps> = ({
  label,
  value,
  onChange,
  availableVariables,
}) => {
  const source = value ?? {
    source: 'literal',
    value: 'front',
  }
  const isLiteral = source.source === 'literal'
  const issueId = useId()

  // The literal's group names, known and unknown. An unknown name stays in the value through every
  // toggle and leaves only by its own Remove button.
  const literalGroups = isLiteral ? groupNames(source.value) : []
  const selectedGroups = literalGroups.filter(isLocationGroup)
  const unknownGroups = literalGroups.filter((g) => !isLocationGroup(g))
  const selectedName = isVariableSource(source) ? source.name : ''
  const offeredVariables = availableVariables.filter((v) => GROUPS_VARIABLE_TYPES.includes(v.type))
  const issue = isLiteral
    ? literalIssue('groups', source.value)
    : groupsVariableIssue(selectedName, availableVariables)

  // Check if group is selected
  const isSelected = (group: (typeof LOCATION_OPTIONS)[number]) => selectedGroups.includes(group)

  /** Store the groups, keeping at least one. */
  const commitGroups = (groups: string[]) => {
    onChange({ source: 'literal', value: (groups.length > 0 ? groups : ['front']).join(',') })
  }

  // Handle group toggle
  const handleGroupToggle = (group: (typeof LOCATION_OPTIONS)[number], checked: boolean) => {
    const known = checked
      ? [...selectedGroups.filter((g) => g !== group), group]
      : selectedGroups.filter((g) => g !== group)
    commitGroups([...known, ...unknownGroups])
  }

  // Handle switch toggle
  const handleToggleVar = (checked: boolean) => {
    if (checked) {
      onChange({ source: 'variable', name: selectedName })
    } else {
      // Switch to literal mode - use current selection or default to front
      const currentValue = isLiteral && typeof source.value === 'string' ? source.value : 'front'
      onChange({ source: 'literal', value: currentValue })
    }
  }

  return (
    <div className="space-y-1">
      <label className="flex flex-col font-medium text-xs">{label}</label>
      {isLiteral ? (
        // Literal mode: switch and checkboxes on same line
        <div className="space-y-2 mt-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-gray-600 dark:text-gray-400">Variable</span>
            <input
              type="checkbox"
              checked={!isLiteral}
              onChange={(e) => handleToggleVar(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-600 dark:bg-gray-700"
            />
          </label>
          <div
            role="group"
            aria-label={label}
            className="flex items-center gap-4"
            {...issueAttributes(issue, issueId)}>
            {LOCATION_OPTIONS.map((group) => (
              <label key={group} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSelected(group)}
                  onChange={(e) => handleGroupToggle(group, e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-600 dark:bg-gray-700"
                />
                <span className="text-xs text-gray-700 dark:text-gray-300 capitalize">{group}</span>
              </label>
            ))}
          </div>
          {issue && (
            <div id={issueId} className="space-y-0.5 text-[10px] text-red-500">
              {unknownGroups.length === 0 && <span className="block">{issue.message}</span>}
              {unknownGroups.map((group, index) => (
                <span key={`${index}:${group}`} className="flex items-center gap-2">
                  {literalIssue('groups', group)?.message}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => commitGroups(literalGroups.filter((g) => g !== group))}>
                    Remove
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        // Variable mode: switch on top, variable dropdown only
        <div className="space-y-2 mt-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-gray-600 dark:text-gray-400">Variable</span>
            <input
              type="checkbox"
              checked={!isLiteral}
              onChange={(e) => handleToggleVar(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-600 dark:bg-gray-700"
            />
          </label>
          <label className="flex flex-col font-medium text-xs">
            Variable
            <select
              aria-label={`${label} variable`}
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={selectedName}
              onChange={(event) => onChange({ source: 'variable', name: event.target.value })}
              {...issueAttributes(issue, issueId)}>
              <option value="">-- Select --</option>
              {selectedName !== '' && !offeredVariables.some((v) => v.name === selectedName) && (
                <option value={selectedName} disabled>
                  {selectedName} (
                  {availableVariables.some((v) => v.name === selectedName)
                    ? 'wrong type'
                    : 'not declared'}
                  )
                </option>
              )}
              {offeredVariables.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} ({v.type})
                </option>
              ))}
            </select>
          </label>
          <FieldIssue issue={issue} id={issueId} />
        </div>
      )}
    </div>
  )
}

export default TargetGroupsMultiSelectEditor
