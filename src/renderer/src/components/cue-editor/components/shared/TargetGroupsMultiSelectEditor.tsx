import React from 'react'
import type { ValueSource } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { LOCATION_OPTIONS } from '../../../../../../photonics-dmx/constants/options'
import { isVariableSource } from './nodeEditorUtils'

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

  // Parse comma-separated string to array (front, back, strobe; same as runtime resolveLocationGroups)
  const selectedGroups =
    isLiteral && typeof source.value === 'string'
      ? source.value
          .split(',')
          .map((g) => g.trim())
          .filter((g) => LOCATION_OPTIONS.includes(g as (typeof LOCATION_OPTIONS)[number]))
      : []

  // Check if group is selected
  const isSelected = (group: (typeof LOCATION_OPTIONS)[number]) => selectedGroups.includes(group)

  // Handle group toggle
  const handleGroupToggle = (group: (typeof LOCATION_OPTIONS)[number], checked: boolean) => {
    const updated = checked
      ? [...selectedGroups.filter((g) => g !== group), group]
      : selectedGroups.filter((g) => g !== group)

    // Ensure at least one group is selected
    if (updated.length === 0) {
      updated.push('front')
    }

    onChange({ source: 'literal', value: updated.join(',') })
  }

  // Handle switch toggle
  const handleToggleVar = (checked: boolean) => {
    if (checked) {
      onChange({
        source: 'variable',
        name: isVariableSource(source) ? source.name ?? 'var1' : 'var1',
      })
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
          <div className="flex items-center gap-4">
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
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={isVariableSource(source) ? source.name ?? '' : ''}
              onChange={(event) =>
                onChange({
                  source: 'variable',
                  name: event.target.value || 'var1',
                })
              }>
              <option value="">-- Select --</option>
              {availableVariables
                .filter((v) => v.type === 'string' || v.type === 'light-array')
                .map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name} ({v.type})
                  </option>
                ))}
            </select>
          </label>
        </div>
      )}
    </div>
  )
}

export default TargetGroupsMultiSelectEditor
