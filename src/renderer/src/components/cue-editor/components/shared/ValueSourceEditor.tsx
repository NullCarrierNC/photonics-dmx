import React, { useId } from 'react'
import type {
  ValueSource,
  NodeCueMode,
} from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import {
  choiceIssue,
  colorListIssue,
  literalChoices,
  literalDefault,
  literalIssue,
  variableIssue,
  variableTypeFits,
} from '../../../../../../photonics-dmx/cues/node/cueValueRules'
import type {
  LiteralRule,
  ValueIssue,
} from '../../../../../../photonics-dmx/cues/node/cueValueRules'
import { isVariableSource } from './nodeEditorUtils'
import ColorListEditor from './ColorListEditor'
import FieldIssue, { issueAttributes } from './FieldIssue'
import { AUDIO_EVENT_OPTIONS } from '../../../../../../photonics-dmx/constants/options'
import { CueType } from '../../../../../../photonics-dmx/cues/types/cueTypes'
import { YARG_EVENT_TYPES, RB3_EVENT_OPTIONS } from '../../lib/options'

const CUE_TYPE_VALUES = Object.values(CueType) as string[]
// Per-mode event value lists: YARG (RB3 conditions filtered out) and the curated RB3 set.
const YARG_EVENT_VALUES = [...YARG_EVENT_TYPES]
const RB3_EVENT_VALUES = RB3_EVENT_OPTIONS.map((o) => o.value)

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
    | 'color-array'
    | 'event'
    | 'either'
  /**
   * The cue value rule a literal here must meet, which also supplies the choices. A colour field
   * meets the colour rule unless it names another.
   */
  rule?: LiteralRule
  /** The field may be left out of the file, and the runtime then uses the rule's default. */
  optional?: boolean
  /** An issue the caller judged from the cue value rules, shown in place of the field's own. */
  issue?: ValueIssue | null
  /**
   * A colour-array field that can hold an inline colour list. Only a colour-from-index palette can,
   * so any other colour-array field takes a color-array variable.
   */
  listLiteral?: boolean
  validLiterals?: readonly string[]
  /** When set, constrained literal dropdown uses these labels instead of repeating the stored value as the label (takes precedence over {@link validLiterals}). */
  validLiteralOptions?: ReadonlyArray<{ value: string; label: string }>
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

const SELECT_CLASS = 'rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700'

const ValueSourceEditor: React.FC<ValueSourceEditorProps> = ({
  label,
  value,
  onChange,
  expected = 'either',
  rule: namedRule,
  optional = false,
  issue: callerIssue,
  listLiteral = false,
  validLiterals,
  validLiteralOptions,
  availableVariables,
  integerOnly = false,
  activeMode,
}) => {
  const issueId = useId()
  const rule = namedRule ?? (expected === 'color' ? 'color' : undefined)
  const isLightArray = expected === 'light-array'
  const isColorArray = expected === 'color-array'
  const effectiveValidLiterals = (() => {
    if (validLiterals) return validLiterals
    if (rule) return literalChoices(rule, activeMode)
    if (expected === 'cue-type') return CUE_TYPE_VALUES
    if (expected === 'event' && activeMode) {
      if (activeMode === 'audio') return [...AUDIO_EVENT_OPTIONS]
      if (activeMode === 'rb3') return [...RB3_EVENT_VALUES]
      return [...YARG_EVENT_VALUES]
    }
    return undefined
  })()

  const constrainedLiteralChoices: ReadonlyArray<{ value: string; label: string }> | undefined =
    validLiteralOptions ??
    (effectiveValidLiterals
      ? effectiveValidLiterals.map((v) => ({ value: v, label: v }))
      : undefined)

  // An optional field left out of the file holds the runtime's default, shown as its own choice.
  const isDefaulted = value === undefined && optional
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
  // A stored literal the choices do not include (from a hand-edited file, say) is shown as it is
  // and flagged.
  const literalText = isLiteral ? String(source.value) : ''
  const isListedLiteral =
    constrainedLiteralChoices?.some((opt) => opt.value === literalText) ?? false
  const literalProblem = ((): ValueIssue | null => {
    if (!isLiteral || isDefaulted) return null
    if (isColorArray) return colorListIssue(source.value)
    if (rule && !validLiterals && !validLiteralOptions) {
      return literalIssue(rule, source.value, activeMode)
    }
    return constrainedLiteralChoices
      ? choiceIssue(
          literalText,
          constrainedLiteralChoices.map((opt) => opt.value),
        )
      : null
  })()
  const literalShown: ValueIssue | null =
    literalProblem && literalText === ''
      ? { ...literalProblem, message: 'Select a value' }
      : literalProblem

  const selectedName = isVariableSource(source) ? source.name ?? '' : ''
  const variableProblem = isLiteral
    ? null
    : variableIssue(selectedName, expected, availableVariables)
  const issue = callerIssue !== undefined ? callerIssue : isLiteral ? literalShown : variableProblem

  /** The variable select, keeping a stored name the list leaves out as its selected entry. */
  const variableSelect = (candidates: typeof availableVariables, placeholder: string) => {
    const listed = candidates.some((v) => v.name === selectedName)
    return (
      <select
        aria-label={`${label} variable`}
        className={`mt-1 ${SELECT_CLASS}`}
        value={selectedName}
        onChange={(event) => onChange({ source: 'variable', name: event.target.value })}
        {...issueAttributes(issue, issueId)}>
        <option value="">{placeholder}</option>
        {selectedName !== '' && !listed && (
          <option value={selectedName} disabled>
            {selectedName} (
            {availableVariables.some((v) => v.name === selectedName)
              ? 'wrong type'
              : 'not declared'}
            )
          </option>
        )}
        {candidates.map((v) => (
          <option key={v.name} value={v.name}>
            {v.name} ({isLightArray || isColorArray ? v.scope : v.type})
          </option>
        ))}
      </select>
    )
  }

  if (isLightArray || (isColorArray && !listLiteral)) {
    const arrayVars = availableVariables.filter((v) => v.type === expected)

    return (
      <div className="space-y-1">
        <label className="flex items-center justify-between font-medium text-xs">
          <span>{label}</span>
        </label>
        <label className="flex flex-col font-medium text-xs">
          Variable
          {variableSelect(arrayVars, `-- Select ${expected} --`)}
        </label>
        <FieldIssue issue={issue} id={issueId} />
        <p className="text-[10px] text-gray-500">
          {isLightArray
            ? 'Light arrays must be provided by variables.'
            : 'A colour list here must come from a color-array variable.'}
        </p>
      </div>
    )
  }

  if (isColorArray) {
    const colorArrayVars = availableVariables.filter((v) => v.type === 'color-array')
    const useVariable = isVariableSource(source)
    const literalColors = !useVariable && Array.isArray(source.value) ? source.value : []

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
            {variableSelect(colorArrayVars, '-- Select color-array --')}
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

  const compatibleVariables = availableVariables.filter((v) => variableTypeFits(expected, v.type))

  const handleToggleVar = (checked: boolean) => {
    if (checked) {
      // Switch to variable mode. Default to an empty (unselected) name rather than a phantom "var1"
      // that references a variable which usually doesn't exist — the empty state is shown as invalid
      // so the author must pick a real variable before saving.
      onChange({ source: 'variable', name: selectedName })
    } else {
      // Switch to literal mode
      const defaultValue = isBoolean
        ? false
        : isString
          ? (rule && literalDefault(rule)) ?? constrainedLiteralChoices?.[0]?.value ?? ''
          : 0
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
              aria-label={label}
              className={`w-full ${SELECT_CLASS}`}
              value={source.value === true ? 'true' : 'false'}
              onChange={(event) => onChange({ ...source, value: event.target.value === 'true' })}>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : constrainedLiteralChoices ? (
            // Show dropdown for constrained literals (e.g., colours, bearing directions)
            <select
              aria-label={label}
              className={`w-full ${SELECT_CLASS}`}
              value={isDefaulted ? '' : literalText}
              onChange={(event) => onChange({ source: 'literal', value: event.target.value })}
              {...issueAttributes(issue, issueId)}>
              {isDefaulted && (
                <option value="" disabled>
                  Default ({(rule && literalDefault(rule)) ?? 'none'})
                </option>
              )}
              {!isDefaulted && !isListedLiteral && (
                <option value={literalText} disabled>
                  {literalText || '-- Select --'}
                </option>
              )}
              {constrainedLiteralChoices.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              aria-label={label}
              type={allowTextInput ? 'text' : 'number'}
              step={allowTextInput ? undefined : integerOnly ? '1' : '0.1'}
              className={`w-full ${SELECT_CLASS}`}
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
              {...issueAttributes(issue, issueId)}
            />
          )}
        </div>
      ) : (
        // Variable mode: variable dropdown only
        <div className="mt-1">
          <label className="flex flex-col font-medium text-xs">
            Variable
            {variableSelect(compatibleVariables, '-- Select --')}
          </label>
        </div>
      )}
      <FieldIssue issue={issue} id={issueId} />
    </div>
  )
}

export default ValueSourceEditor
