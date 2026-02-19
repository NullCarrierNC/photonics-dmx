import React from 'react';
import type { ActionNode, NodeCueMode } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes';
import type { WaitCondition } from '../../../../../../../photonics-dmx/types';
import { EASING_OPTIONS, getActionWaitOptions } from '../../../lib/options';
import ValueSourceEditor from '../../shared/ValueSourceEditor';

type ActionTimingSectionProps = {
  node: ActionNode;
  currentTiming: NonNullable<ActionNode['timing']>;
  updateTiming: (partial: Partial<ActionNode['timing']>) => void;
  activeMode: NodeCueMode;
  selectedActionHasEventParent: boolean;
  availableVariables: { name: string; type: string; scope: 'cue' | 'cue-group' }[];
};

const ActionTimingSection: React.FC<ActionTimingSectionProps> = ({
  node,
  currentTiming,
  updateTiming,
  activeMode,
  selectedActionHasEventParent,
  availableVariables
}) => (
  <div className="space-y-3">
    <div className="space-y-2">
      <label className="flex flex-col font-medium">
        Wait For Condition
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={currentTiming.waitForCondition}
          onChange={event =>
            updateTiming({ waitForCondition: event.target.value as WaitCondition })
          }
          disabled={selectedActionHasEventParent}
        >
          {getActionWaitOptions(activeMode).map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {selectedActionHasEventParent && (
          <span className="text-[10px] text-gray-500">Inherited from event parent</span>
        )}
      </label>
      {!(
        node.effectType === 'set-color' && currentTiming.waitForCondition === 'none'
      ) && (
        <>
          <ValueSourceEditor
            label="Wait For Time (ms)"
            value={currentTiming.waitForTime}
            onChange={next => updateTiming({ waitForTime: next })}
            expected="number"
            availableVariables={availableVariables}
          />
          <ValueSourceEditor
            label="Wait For Count"
            value={currentTiming.waitForConditionCount}
            onChange={next => updateTiming({ waitForConditionCount: next })}
            expected="number"
            availableVariables={availableVariables}
          />
        </>
      )}
    </div>

    <ValueSourceEditor
      label="Duration (ms)"
      value={currentTiming.duration}
      onChange={next => updateTiming({ duration: next })}
      expected="number"
      availableVariables={availableVariables}
    />

    <div className="space-y-2">
      <label className="flex flex-col font-medium">
        Wait Until Condition
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={currentTiming.waitUntilCondition}
          onChange={event =>
            updateTiming({ waitUntilCondition: event.target.value as WaitCondition })
          }
        >
          {getActionWaitOptions(activeMode).map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {!(
        node.effectType === 'set-color' && currentTiming.waitUntilCondition === 'none'
      ) && (
        <>
          <ValueSourceEditor
            label="Wait Until Time (ms)"
            value={currentTiming.waitUntilTime}
            onChange={next => updateTiming({ waitUntilTime: next })}
            expected="number"
            availableVariables={availableVariables}
          />
          <ValueSourceEditor
            label="Wait Until Count"
            value={currentTiming.waitUntilConditionCount}
            onChange={next => updateTiming({ waitUntilConditionCount: next })}
            expected="number"
            availableVariables={availableVariables}
          />
        </>
      )}
    </div>

    <label className="flex flex-col font-medium">
      Easing
      <select
        className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
        value={currentTiming.easing ?? 'linear'}
        onChange={event => updateTiming({ easing: event.target.value })}
      >
        {EASING_OPTIONS.map(ease => (
          <option key={ease} value={ease}>
            {ease}
          </option>
        ))}
      </select>
    </label>
  </div>
);

export default ActionTimingSection;
