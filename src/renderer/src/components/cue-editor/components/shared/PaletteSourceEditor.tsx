import React, { useId } from 'react'
import type { ColorListValueSource } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import {
  colorListIssue,
  variableIssue,
} from '../../../../../../photonics-dmx/cues/node/cueValueRules'
import ColorListEditor from './ColorListEditor'
import FieldIssue from './FieldIssue'
import VariableSourceSelect, { type VariableOption } from './VariableSourceSelect'

/**
 * A palette: an inline list of colour names or a color-array variable. Only a colour-from-index
 * palette holds a list of its own, so every other colour-array field reads a variable.
 */
const PaletteSourceEditor: React.FC<{
  label: string
  value: ColorListValueSource | undefined
  onChange: (next: ColorListValueSource) => void
  availableVariables: VariableOption[]
}> = ({ label, value, onChange, availableVariables }) => {
  const issueId = useId()
  const useVariable = value?.source === 'variable'
  const selectedName = value?.source === 'variable' ? value.name : ''
  const literalColors = value?.source === 'literal' ? value.value : []
  const issue = useVariable
    ? variableIssue(selectedName, 'color-array', availableVariables)
    : colorListIssue(literalColors)

  return (
    <div className="space-y-1">
      <label className="flex items-center justify-between font-medium text-xs">
        <span>{label}</span>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-xs text-gray-600 dark:text-gray-400">Use Variable</span>
          <input
            type="checkbox"
            checked={useVariable}
            onChange={(e) =>
              e.target.checked
                ? onChange({ source: 'variable', name: selectedName })
                : onChange({ source: 'literal', value: literalColors })
            }
            className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-600 dark:bg-gray-700"
          />
        </label>
      </label>
      {useVariable ? (
        <label className="flex flex-col font-medium text-xs">
          Variable
          <VariableSourceSelect
            label={label}
            selectedName={selectedName}
            candidates={availableVariables.filter((v) => v.type === 'color-array')}
            availableVariables={availableVariables}
            placeholder="-- Select color-array --"
            listByScope
            onSelect={(name) => onChange({ source: 'variable', name })}
            issue={issue}
            issueId={issueId}
          />
        </label>
      ) : (
        <ColorListEditor
          colors={literalColors}
          onColorsChange={(colors) => onChange({ source: 'literal', value: colors })}
        />
      )}
      <FieldIssue issue={issue} id={issueId} />
    </div>
  )
}

export default PaletteSourceEditor
