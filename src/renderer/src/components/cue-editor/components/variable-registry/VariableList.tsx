import React from 'react'
import type { VariableDefinition } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'

type VariableListProps = {
  variables: VariableDefinition[]
  onEdit: (varDef: VariableDefinition) => void
  onDelete: (varName: string) => void
  showParameterBadge?: boolean
}

const VariableList: React.FC<VariableListProps> = ({
  variables,
  onEdit,
  onDelete,
  showParameterBadge = false,
}) => {
  if (variables.length === 0) {
    return <p className="text-[10px] text-gray-500 italic">No variables</p>
  }
  const sortedVariables = [...variables].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )
  return (
    <div className="space-y-1">
      {sortedVariables.map((varDef) => (
        <div
          key={varDef.name}
          className="flex items-center gap-2 text-[11px] p-1.5 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex-1 min-w-0">
            <div className="font-mono font-semibold truncate">
              {varDef.name}
              {showParameterBadge && varDef.isParameter && (
                <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded">
                  Parameter
                </span>
              )}
            </div>
            <div className="text-[10px] text-gray-500">
              {varDef.type} = {varDef.type === 'light-array' ? '[]' : String(varDef.initialValue)}
            </div>
          </div>
          <button
            className="text-blue-500 hover:underline text-[10px]"
            onClick={() => onEdit(varDef)}>
            Edit
          </button>
          <button
            className="text-red-500 hover:underline text-[10px]"
            onClick={() => onDelete(varDef.name)}>
            Del
          </button>
        </div>
      ))}
    </div>
  )
}

export default VariableList
