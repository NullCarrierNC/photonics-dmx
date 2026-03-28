import React from 'react'
import type {
  VariableDefinition,
  VariableType,
  NodeCueMode,
} from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { TrackedLight } from '../../../../../../photonics-dmx/types'
import { COLOR_OPTIONS } from '../../../../../../photonics-dmx/constants/options'
import {
  AUDIO_EVENT_OPTIONS,
  YARG_EVENT_OPTIONS_CATEGORIZED,
  getDefaultEventOption,
} from '../../lib/options'

type VariableFormDialogProps = {
  isOpen: boolean
  title: string
  formData: Partial<VariableDefinition>
  onFormDataChange: (data: Partial<VariableDefinition>) => void
  onSave: () => void
  onCancel: () => void
  activeMode: NodeCueMode
  isEffectMode: boolean
  editingVar: VariableDefinition | null
}

function getInitialValueInput(
  type: VariableType,
  value: number | boolean | string | TrackedLight[] | undefined,
  onChange: (val: number | boolean | string | TrackedLight[]) => void,
  activeMode: NodeCueMode,
) {
  const defaultEventValue = getDefaultEventOption(activeMode)?.value ?? ''
  const eventOptionValues =
    activeMode === 'yarg'
      ? YARG_EVENT_OPTIONS_CATEGORIZED.flatMap((category) =>
          category.events.map((event) => event.value),
        )
      : AUDIO_EVENT_OPTIONS.map((option) => option.value)
  const selectedEventValue =
    typeof value === 'string' && eventOptionValues.includes(value) ? value : defaultEventValue

  switch (type) {
    case 'boolean':
      return (
        <select
          className="rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={value === true ? 'true' : 'false'}
          onChange={(e) => onChange(e.target.value === 'true')}>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      )
    case 'string':
    case 'cue-type':
      return (
        <input
          type="text"
          className="rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'color':
      return (
        <select
          className="rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={(value as string) ?? 'blue'}
          onChange={(e) => onChange(e.target.value)}>
          {COLOR_OPTIONS.map((color) => (
            <option key={color} value={color}>
              {color}
            </option>
          ))}
        </select>
      )
    case 'event':
      return (
        <select
          className="rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={selectedEventValue}
          onChange={(e) => onChange(e.target.value)}>
          {activeMode === 'yarg'
            ? YARG_EVENT_OPTIONS_CATEGORIZED.map((category) => (
                <optgroup key={category.category} label={category.category}>
                  {category.events.map((event) => (
                    <option key={event.value} value={event.value}>
                      {event.label}
                    </option>
                  ))}
                </optgroup>
              ))
            : AUDIO_EVENT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
        </select>
      )
    case 'light-array':
      return (
        <div className="text-xs text-gray-500 italic py-1">
          Empty array (populated via config-data node)
        </div>
      )
    case 'number':
    default:
      return (
        <input
          type="number"
          step="0.1"
          className="rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={(value as number) ?? 0}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        />
      )
  }
}

const VariableFormDialog: React.FC<VariableFormDialogProps> = ({
  isOpen,
  title,
  formData,
  onFormDataChange,
  onSave,
  onCancel,
  activeMode,
  isEffectMode,
  editingVar,
}) => {
  if (!isOpen) return null

  const handleTypeChange = (newType: VariableType) => {
    let newValue: number | boolean | string | TrackedLight[] = 0
    if (newType === 'boolean') newValue = false
    else if (newType === 'string' || newType === 'cue-type') newValue = ''
    else if (newType === 'event') newValue = getDefaultEventOption(activeMode)?.value ?? ''
    else if (newType === 'color') newValue = 'blue'
    else if (newType === 'light-array') newValue = []
    onFormDataChange({ ...formData, type: newType, initialValue: newValue })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-96 max-w-full">
        <h3 className="font-semibold text-lg mb-4">{title}</h3>
        <div className="space-y-3">
          <label className="flex flex-col font-medium text-sm">
            Name
            <input
              type="text"
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={formData.name ?? ''}
              onChange={(e) => onFormDataChange({ ...formData, name: e.target.value })}
              placeholder="variableName"
              pattern="[a-zA-Z_][a-zA-Z0-9_]*"
              disabled={!!editingVar}
            />
            <span className="text-[10px] text-gray-500 mt-1">
              Must start with letter or underscore
            </span>
          </label>

          <label className="flex flex-col font-medium text-sm">
            Type
            <select
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={formData.type ?? 'number'}
              onChange={(e) => handleTypeChange(e.target.value as VariableType)}>
              <option value="number">Number</option>
              <option value="boolean">Boolean</option>
              <option value="string">String</option>
              <option value="color">Color</option>
              <option value="light-array">Light Array</option>
              <option value="cue-type">Cue Type</option>
              <option value="event">Event</option>
            </select>
          </label>

          <label className="flex flex-col font-medium text-sm">
            Initial Value
            {getInitialValueInput(
              (formData.type as VariableType) ?? 'number',
              formData.initialValue,
              (val) => onFormDataChange({ ...formData, initialValue: val }),
              activeMode,
            )}
          </label>

          <label className="flex flex-col font-medium text-sm">
            Description (optional)
            <input
              type="text"
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={formData.description ?? ''}
              onChange={(e) => onFormDataChange({ ...formData, description: e.target.value })}
              placeholder="What this variable is for"
            />
          </label>

          {isEffectMode && (
            <label className="flex items-center gap-2 font-medium text-sm">
              <input
                type="checkbox"
                checked={formData.isParameter ?? false}
                onChange={(e) => onFormDataChange({ ...formData, isParameter: e.target.checked })}
                className="rounded"
              />
              <span>Is Parameter</span>
              <span className="text-[10px] text-gray-500 font-normal">
                (Expose as effect input)
              </span>
            </label>
          )}
        </div>

        <div className="flex gap-2 mt-6">
          <button
            className="flex-1 px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-500"
            onClick={onSave}>
            Save
          </button>
          <button
            className="px-3 py-2 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
            onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default VariableFormDialog
