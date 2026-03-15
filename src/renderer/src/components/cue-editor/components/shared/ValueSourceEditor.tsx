import React from 'react'
import type {
  ValueSource,
  NodeCueMode,
} from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { isVariableSource } from './nodeEditorUtils'
import {
  COLOR_OPTIONS,
  YARG_EVENT_OPTIONS,
  AUDIO_EVENT_OPTIONS,
} from '../../../../../../photonics-dmx/constants/options'
import { CueType } from '../../../../../../photonics-dmx/cues/types/cueTypes'

const CUE_TYPE_VALUES = Object.values(CueType) as string[]

interface ValueSourceEditorProps {
  label: string
  value: ValueSource | undefined
  onChange: (next: ValueSource) => void
  expected?:
    | 'number'
    | 'boolean'
    | 'string'
    | 'color'
    | 'cue-type'
    | 'light-array'
    | 'event'
    | 'either'
  validLiterals?: string[]
  availableVariables: {
    name: string
    type: string
    scope: 'cue' | 'cue-group'
    validValues?: string[]
  }[]
  integerOnly?: boolean // For number fields that should only accept integers
  /** When set, enables built-in event-option fallback for expected="event" (yarg vs audio). */
  activeMode?: NodeCueMode
}

const ValueSourceEditor: React.FC<ValueSourceEditorProps> = ({
  label,
  value,
  onChange,
  expected = 'either',
  validLiterals,
  availableVariables,
  integerOnly = false,
  activeMode,
}) => {
  const isLightArray = expected === 'light-array'
  const effectiveValidLiterals = (() => {
    if (validLiterals) return validLiterals
    if (expected === 'color') return COLOR_OPTIONS
    if (expected === 'cue-type') return CUE_TYPE_VALUES
    if (expected === 'event' && activeMode) {
      return activeMode === 'yarg' ? [...YARG_EVENT_OPTIONS] : [...AUDIO_EVENT_OPTIONS]
    }
    return undefined
  })()

  const source = value ?? {
    source: 'literal',
    value:
      expected === 'boolean'
        ? false
        : expected === 'string' ||
            expected === 'color' ||
            expected === 'event' ||
            expected === 'cue-type' ||
            expected === 'either'
          ? ''
          : 0,
  }
  const isLiteral = source.source === 'literal'
  const isBoolean = expected === 'boolean'
  const isString =
    expected === 'string' || expected === 'color' || expected === 'event' || expected === 'cue-type'
  const allowTextInput = isString || expected === 'either'

  if (isLightArray) {
    const lightArrayVars = availableVariables.filter((v) => v.type === 'light-array')
    const selectedName = isVariableSource(source) ? source.name ?? '' : ''

    return (
      <div className="space-y-1">
        <label className="flex items-center justify-between font-medium text-xs">
          <span>{label}</span>
        </label>
        <label className="flex flex-col font-medium text-xs">
          Variable
          <select
            className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
            value={selectedName}
            onChange={(event) =>
              onChange({
                source: 'variable',
                name: event.target.value || '',
              })
            }>
            <option value="">-- Select light-array --</option>
            {lightArrayVars.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name} ({v.scope})
              </option>
            ))}
          </select>
        </label>
        <p className="text-[10px] text-gray-500">Light arrays must be provided by variables.</p>
      </div>
    )
  }

  // Filter variables by expected type (color and string are compatible, cue-type and string are compatible)
  const compatibleVariables =
    expected === 'either'
      ? availableVariables
      : availableVariables.filter(
          (v) =>
            v.type === expected ||
            (expected === 'color' && v.type === 'string') ||
            (expected === 'string' &&
              (v.type === 'color' || v.type === 'cue-type' || v.type === 'event')) ||
            (expected === 'cue-type' && (v.type === 'string' || v.type === 'cue-type')) ||
            (expected === 'event' && v.type === 'event'),
        )

  const handleToggleVar = (checked: boolean) => {
    if (checked) {
      // Switch to variable mode
      onChange({
        source: 'variable',
        name: isVariableSource(source) ? source.name ?? 'var1' : 'var1',
      })
    } else {
      // Switch to literal mode
      const defaultValue = isBoolean ? false : isString ? effectiveValidLiterals?.[0] ?? '' : 0
      onChange({ source: 'literal', value: defaultValue })
    }
  }

  return (
    <div className="space-y-1">
      <label className="flex items-center justify-between font-medium text-xs">
        <span>{label}</span>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-xs text-gray-600 dark:text-gray-400">Use Variable</span>
          <input
            type="checkbox"
            checked={!isLiteral}
            onChange={(e) => handleToggleVar(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-600 dark:bg-gray-700"
          />
        </label>
      </label>
      {isLiteral ? (
        // Literal mode: just the input
        <div className="mt-1">
          {isBoolean ? (
            <select
              className="w-full rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={source.value === true ? 'true' : 'false'}
              onChange={(event) => onChange({ ...source, value: event.target.value === 'true' })}>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : effectiveValidLiterals ? (
            // Show dropdown for constrained literals (e.g., colours, brightness levels)
            <select
              className="w-full rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={String(source.value)}
              onChange={(event) => onChange({ ...source, value: event.target.value })}>
              {effectiveValidLiterals.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={allowTextInput ? 'text' : 'number'}
              step={allowTextInput ? undefined : integerOnly ? '1' : '0.1'}
              className="w-full rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={
                allowTextInput
                  ? String(source.value ?? '')
                  : typeof source.value === 'number'
                    ? source.value
                    : 0
              }
              onChange={(event) => {
                if (allowTextInput) {
                  // For string or either type, store as string (allows comma-separated values)
                  onChange({ ...source, value: event.target.value })
                } else {
                  let newValue = Number(event.target.value)
                  // Round to integer if integerOnly is true
                  if (integerOnly && typeof newValue === 'number') {
                    newValue = Math.round(newValue)
                  }
                  onChange({ ...source, value: newValue })
                }
              }}
            />
          )}
        </div>
      ) : (
        // Variable mode: variable dropdown only
        <div className="mt-1">
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
              {compatibleVariables.map((v) => (
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

export default ValueSourceEditor
