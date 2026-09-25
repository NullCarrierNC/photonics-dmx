import React from 'react'
import type {
  ActionNode,
  NodeCueMode,
} from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { EASING_OPTIONS, getActionWaitOptions } from '../../../lib/options'
import ValueSourceEditor from '../../shared/ValueSourceEditor'

/** The stored condition literal, or 'none' for a condition held in a variable. */
function conditionFromValueSource(
  vs: { source: string; value?: unknown; name?: string } | undefined,
): string {
  if (!vs) return 'none'
  if (vs.source === 'literal') return String(vs.value)
  return 'none'
}

type WaitConditionSelectProps = {
  value: string
  activeMode: NodeCueMode
  disabled?: boolean
  onChange: (value: string) => void
}

/** The mode's wait conditions, showing and flagging a stored one the mode does not offer. */
const WaitConditionSelect: React.FC<WaitConditionSelectProps> = ({
  value,
  activeMode,
  disabled,
  onChange,
}) => {
  const options = getActionWaitOptions(activeMode)
  const isUnknown = !options.some((option) => option.value === value)
  return (
    <>
      <select
        className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}>
        {isUnknown && (
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
      {isUnknown && (
        <span className="text-[10px] text-red-500">
          &apos;{value}&apos; is not a known wait condition
        </span>
      )}
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
            availableVariables={availableVariables}
          />
          <ValueSourceEditor
            label="Wait For Count"
            value={currentTiming.waitForConditionCount}
            onChange={(next) => updateTiming({ waitForConditionCount: next })}
            expected="number"
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
      availableVariables={availableVariables}
    />

    <div className="space-y-2">
      <label className="flex flex-col font-medium">
        Wait Until Condition
        <WaitConditionSelect
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
            availableVariables={availableVariables}
          />
          <ValueSourceEditor
            label="Wait Until Count"
            value={currentTiming.waitUntilConditionCount}
            onChange={(next) => updateTiming({ waitUntilConditionCount: next })}
            expected="number"
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
      validLiterals={[...EASING_OPTIONS]}
      availableVariables={availableVariables}
    />
  </div>
)

export default ActionTimingSection
