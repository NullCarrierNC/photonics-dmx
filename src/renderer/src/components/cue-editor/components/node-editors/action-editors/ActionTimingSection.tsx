import React, { useId } from 'react'
import type {
  ActionNode,
  NodeCueMode,
} from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { literalIssue } from '../../../../../../../photonics-dmx/cues/node/cueValueRules'
import { getActionWaitOptions } from '../../../lib/options'
import ValueSourceEditor from '../../shared/ValueSourceEditor'
import FieldIssue, { issueAttributes } from '../../shared/FieldIssue'

/** The stored condition literal, or 'none' for a condition held in a variable. */
function conditionFromValueSource(
  vs: { source: string; value?: unknown; name?: string } | undefined,
): string {
  if (!vs) return 'none'
  if (vs.source === 'literal') return String(vs.value)
  return 'none'
}

type WaitConditionSelectProps = {
  label: string
  value: string
  activeMode: NodeCueMode
  disabled?: boolean
  onChange: (value: string) => void
}

/**
 * The mode's wait conditions. A stored condition the mode does not offer stays selected, flagged as
 * the cue value rules judge it.
 */
const WaitConditionSelect: React.FC<WaitConditionSelectProps> = ({
  label,
  value,
  activeMode,
  disabled,
  onChange,
}) => {
  const issueId = useId()
  const options = getActionWaitOptions(activeMode)
  const isOffered = options.some((option) => option.value === value)
  const issue = literalIssue('wait-condition', value, activeMode)
  return (
    <>
      <select
        aria-label={label}
        className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        {...issueAttributes(issue, issueId)}>
        {!isOffered && (
          <option value={value} disabled>
            {value}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldIssue issue={issue} id={issueId} />
    </>
  )
}

type ActionTimingSectionProps = {
  node: ActionNode
  currentTiming: NonNullable<ActionNode['timing']>
  updateTiming: (partial: Partial<ActionNode['timing']>) => void
  activeMode: NodeCueMode
  selectedActionHasEventParent: boolean
  availableVariables: { name: string; type: string; scope: 'cue' | 'cue-group' }[]
}

const ActionTimingSection: React.FC<ActionTimingSectionProps> = ({
  node,
  currentTiming,
  updateTiming,
  activeMode,
  selectedActionHasEventParent,
  availableVariables,
}) => (
  <div className="space-y-3">
    <div className="space-y-2">
      <label className="flex flex-col font-medium">
        Wait For Condition
        <WaitConditionSelect
          label="Wait For Condition"
          value={conditionFromValueSource(currentTiming.waitForCondition)}
          activeMode={activeMode}
          disabled={selectedActionHasEventParent}
          onChange={(value) => updateTiming({ waitForCondition: { source: 'literal', value } })}
        />
        {selectedActionHasEventParent && (
          <span className="text-[10px] text-gray-500">Inherited from event parent</span>
        )}
      </label>
      {!(
        node.effectType === 'set-color' &&
        conditionFromValueSource(currentTiming.waitForCondition) === 'none'
      ) && (
        <>
          <ValueSourceEditor
            label="Wait For Time (ms)"
            value={currentTiming.waitForTime}
            onChange={(next) => updateTiming({ waitForTime: next })}
            expected="number"
            rule="time"
            availableVariables={availableVariables}
          />
          <ValueSourceEditor
            label="Wait For Count"
            value={currentTiming.waitForConditionCount}
            onChange={(next) => updateTiming({ waitForConditionCount: next })}
            expected="number"
            rule="count"
            optional
            availableVariables={availableVariables}
          />
        </>
      )}
    </div>

    <ValueSourceEditor
      label="Duration (ms)"
      value={currentTiming.duration}
      onChange={(next) => updateTiming({ duration: next })}
      expected="number"
      rule="time"
      availableVariables={availableVariables}
    />

    <div className="space-y-2">
      <label className="flex flex-col font-medium">
        Wait Until Condition
        <WaitConditionSelect
          label="Wait Until Condition"
          value={conditionFromValueSource(currentTiming.waitUntilCondition)}
          activeMode={activeMode}
          onChange={(value) =>
            updateTiming({
              waitUntilCondition: { source: 'literal', value },
              ...(value !== 'none' && {
                waitUntilConditionCount: { source: 'literal', value: 1 },
              }),
            })
          }
        />
      </label>
      {!(
        node.effectType === 'set-color' &&
        conditionFromValueSource(currentTiming.waitUntilCondition) === 'none'
      ) && (
        <>
          <ValueSourceEditor
            label="Wait Until Time (ms)"
            value={currentTiming.waitUntilTime}
            onChange={(next) => updateTiming({ waitUntilTime: next })}
            expected="number"
            rule="time"
            availableVariables={availableVariables}
          />
          <ValueSourceEditor
            label="Wait Until Count"
            value={currentTiming.waitUntilConditionCount}
            onChange={(next) => updateTiming({ waitUntilConditionCount: next })}
            expected="number"
            rule="count"
            optional
            availableVariables={availableVariables}
          />
        </>
      )}
    </div>

    <ValueSourceEditor
      label="Easing"
      value={currentTiming.easing}
      onChange={(next) => updateTiming({ easing: next })}
      expected="string"
      rule="easing"
      optional
      availableVariables={availableVariables}
    />
  </div>
)

export default ActionTimingSection
