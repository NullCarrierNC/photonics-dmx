import React from 'react';
import type { ActionNode, NodeChaseOrder, NodeEffectType, NodeCueMode, SweepDirection, RotationDirection } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes';
import { NODE_EFFECT_TYPES } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes';
import type { WaitCondition } from '../../../../../../photonics-dmx/types';
import {
  BLEND_MODE_OPTIONS,
  BRIGHTNESS_OPTIONS,
  COLOR_OPTIONS,
  LIGHT_TARGET_OPTIONS
} from '../../../../../../photonics-dmx/constants/options';
import { 
  EASING_OPTIONS, 
  getActionWaitOptions
} from '../../lib/options';
import { createDefaultActionTiming } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes';
import ValueSourceEditor from '../shared/ValueSourceEditor';
import TargetGroupsMultiSelectEditor from '../shared/TargetGroupsMultiSelectEditor';

interface ActionNodeEditorProps {
  node: ActionNode;
  activeMode: NodeCueMode;
  selectedActionHasEventParent: boolean;
  availableVariables: { name: string; type: string; scope: 'cue' | 'cue-group' }[];
  updateNode: (updates: Partial<ActionNode>) => void;
}


const ActionNodeEditor: React.FC<ActionNodeEditorProps> = ({
  node,
  activeMode,
  selectedActionHasEventParent,
  availableVariables,
  updateNode
}) => {
  const currentTiming = node.timing ?? createDefaultActionTiming();
  const updateTiming = (partial: Partial<ActionNode['timing']>) =>
    updateNode({
      timing: {
        ...currentTiming,
        ...partial
      }
    });

  return (
    <div className="space-y-3 text-xs">
      <label className="flex flex-col font-medium">
        Effect Type
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.effectType}
          onChange={event => {
            const v = event.target.value as NodeEffectType;
            if (v === 'chase') {
              updateNode({ effectType: 'chase', config: { ...node.config, perLightOffsetMs: node.config?.perLightOffsetMs ?? 50, order: node.config?.order ?? 'linear' } });
            } else if (v === 'sweep') {
              updateNode({ effectType: 'sweep', config: { ...node.config, sweepTime: 900, sweepFadeInDuration: 300, sweepFadeOutDuration: 600, sweepLightOverlap: 70, sweepBetweenDelay: 0, sweepDirection: 'forward' } });
            } else if (v === 'rotation') {
              updateNode({ effectType: 'rotation', config: { ...node.config, rotationDirection: 'clockwise', beatsPerCycle: 1, startOffset: 0 } });
            } else if (v === 'flash') {
              updateNode({ effectType: 'flash', config: { ...node.config, holdTime: 100, flashDurationIn: 50, flashDurationOut: 100 } });
            } else if (v === 'cycle') {
              updateNode({ effectType: 'cycle', config: { ...node.config, cycleTransitionDuration: 100, cycleStepTrigger: 'beat', cycleBaseColor: 'transparent', cycleBaseBrightness: 'low' } });
            } else {
              updateNode({ effectType: v });
            }
          }}
        >
          {NODE_EFFECT_TYPES.map(effect => (
            <option key={effect} value={effect}>{effect}</option>
          ))}
        </select>
      </label>
      {node.effectType !== 'blackout' && (
        <>
          <TargetGroupsMultiSelectEditor
            label="Target Groups"
            value={node.target.groups}
            onChange={next => updateNode({
              target: {
                ...node.target,
                groups: next
              }
            })}
            availableVariables={availableVariables}
          />
          <ValueSourceEditor
            label="Target Filter"
            value={node.target.filter}
            onChange={next => updateNode({
              target: {
                ...node.target,
                filter: next
              }
            })}
            expected="string"
            validLiterals={LIGHT_TARGET_OPTIONS}
            availableVariables={availableVariables}
          />
        </>
      )}
      {(node.effectType === 'set-color' || node.effectType === 'chase' || node.effectType === 'sweep' || node.effectType === 'rotation' || node.effectType === 'flash' || node.effectType === 'cycle') && (
        <>
          <ValueSourceEditor
            label="Color"
            value={node.color.name}
            onChange={next => updateNode({
              color: {
                ...node.color,
                name: next
              }
            })}
            expected="string"
            validLiterals={COLOR_OPTIONS}
            availableVariables={availableVariables}
          />
          <ValueSourceEditor
            label="Brightness"
            value={node.color.brightness}
            onChange={next => updateNode({
              color: {
                ...node.color,
                brightness: next
              }
            })}
            expected="string"
            validLiterals={BRIGHTNESS_OPTIONS}
            availableVariables={availableVariables}
          />
          <ValueSourceEditor
            label="Blend Mode"
            value={node.color.blendMode}
            onChange={next => updateNode({
              color: {
                ...node.color,
                blendMode: next
              }
            })}
            expected="string"
            validLiterals={BLEND_MODE_OPTIONS}
            availableVariables={availableVariables}
          />
          <ValueSourceEditor
            label="Opacity (0.0 - 1.0)"
            value={node.color.opacity}
            onChange={next => updateNode({
              color: {
                ...node.color,
                opacity: next
              }
            })}
            expected="number"
            availableVariables={availableVariables}
          />
        </>
      )}
      {node.effectType === 'chase' && (
        <>
          <label className="flex flex-col font-medium">
            Per-light offset (ms)
            <input
              type="number"
              min={0}
              step={10}
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={node.config?.perLightOffsetMs ?? 50}
              onChange={e => updateNode({ config: { ...node.config, perLightOffsetMs: Number(e.target.value) || 0 } })}
            />
          </label>
          <label className="flex flex-col font-medium">
            Order
            <select
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={node.config?.order ?? 'linear'}
              onChange={e => updateNode({ config: { ...node.config, order: e.target.value as NodeChaseOrder } })}
            >
              <option value="linear">Linear</option>
              <option value="inverse-linear">Inverse linear</option>
            </select>
          </label>
        </>
      )}
      {node.effectType === 'sweep' && (
        <>
          <label className="flex flex-col font-medium">
            Sweep time (ms)
            <input
              type="number"
              min={0}
              step={50}
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={node.config?.sweepTime ?? 900}
              onChange={e => updateNode({ config: { ...node.config, sweepTime: Number(e.target.value) || 0 } })}
            />
          </label>
          <label className="flex flex-col font-medium">
            Fade in (ms)
            <input
              type="number"
              min={0}
              step={10}
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={node.config?.sweepFadeInDuration ?? 300}
              onChange={e => updateNode({ config: { ...node.config, sweepFadeInDuration: Number(e.target.value) || 0 } })}
            />
          </label>
          <label className="flex flex-col font-medium">
            Fade out (ms)
            <input
              type="number"
              min={0}
              step={10}
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={node.config?.sweepFadeOutDuration ?? 600}
              onChange={e => updateNode({ config: { ...node.config, sweepFadeOutDuration: Number(e.target.value) || 0 } })}
            />
          </label>
          <label className="flex flex-col font-medium">
            Light overlap (%)
            <input
              type="number"
              min={0}
              max={100}
              step={5}
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={node.config?.sweepLightOverlap ?? 70}
              onChange={e => updateNode({ config: { ...node.config, sweepLightOverlap: Number(e.target.value) || 0 } })}
            />
          </label>
          <label className="flex flex-col font-medium">
            Between sweep delay (ms)
            <input
              type="number"
              min={0}
              step={100}
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={node.config?.sweepBetweenDelay ?? 0}
              onChange={e => updateNode({ config: { ...node.config, sweepBetweenDelay: Number(e.target.value) || 0 } })}
            />
          </label>
          <label className="flex flex-col font-medium">
            Direction
            <select
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={node.config?.sweepDirection ?? 'forward'}
              onChange={e => updateNode({ config: { ...node.config, sweepDirection: e.target.value as SweepDirection } })}
            >
              <option value="forward">Forward</option>
              <option value="reverse">Reverse</option>
            </select>
          </label>
        </>
      )}
      {node.effectType === 'rotation' && (
        <>
          <label className="flex flex-col font-medium">
            Direction
            <select
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={node.config?.rotationDirection ?? 'clockwise'}
              onChange={e => updateNode({ config: { ...node.config, rotationDirection: e.target.value as RotationDirection } })}
            >
              <option value="clockwise">Clockwise</option>
              <option value="counter-clockwise">Counter-clockwise</option>
            </select>
          </label>
          <label className="flex flex-col font-medium">
            Beats per cycle
            <input
              type="number"
              min={1}
              step={1}
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={node.config?.beatsPerCycle ?? 1}
              onChange={e => updateNode({ config: { ...node.config, beatsPerCycle: Number(e.target.value) || 1 } })}
            />
          </label>
          <label className="flex flex-col font-medium">
            Start offset
            <input
              type="number"
              min={0}
              step={1}
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={node.config?.startOffset ?? 0}
              onChange={e => updateNode({ config: { ...node.config, startOffset: Number(e.target.value) || 0 } })}
            />
          </label>
        </>
      )}
      {node.effectType === 'flash' && (
        <>
          <label className="flex flex-col font-medium">
            Hold time (ms)
            <input
              type="number"
              min={0}
              step={10}
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={node.config?.holdTime ?? 100}
              onChange={e => updateNode({ config: { ...node.config, holdTime: Number(e.target.value) || 0 } })}
            />
          </label>
          <label className="flex flex-col font-medium">
            Fade in (ms)
            <input
              type="number"
              min={0}
              step={10}
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={node.config?.flashDurationIn ?? 50}
              onChange={e => updateNode({ config: { ...node.config, flashDurationIn: Number(e.target.value) || 0 } })}
            />
          </label>
          <label className="flex flex-col font-medium">
            Fade out (ms)
            <input
              type="number"
              min={0}
              step={10}
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={node.config?.flashDurationOut ?? 100}
              onChange={e => updateNode({ config: { ...node.config, flashDurationOut: Number(e.target.value) || 0 } })}
            />
          </label>
        </>
      )}
      {node.effectType === 'cycle' && (
        <>
          <label className="flex flex-col font-medium">
            Transition duration (ms)
            <input
              type="number"
              min={0}
              step={10}
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={node.config?.cycleTransitionDuration ?? 100}
              onChange={e => updateNode({ config: { ...node.config, cycleTransitionDuration: Number(e.target.value) || 0 } })}
            />
          </label>
          <label className="flex flex-col font-medium">
            Step trigger
            <select
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={node.config?.cycleStepTrigger ?? 'beat'}
              onChange={e => updateNode({ config: { ...node.config, cycleStepTrigger: e.target.value as WaitCondition } })}
            >
              {getActionWaitOptions(activeMode).map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col font-medium">
            Base colour (inactive)
            <select
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={node.config?.cycleBaseColor ?? 'transparent'}
              onChange={e => updateNode({ config: { ...node.config, cycleBaseColor: e.target.value } })}
            >
              {COLOR_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col font-medium">
            Base brightness
            <select
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={node.config?.cycleBaseBrightness ?? 'low'}
              onChange={e => updateNode({ config: { ...node.config, cycleBaseBrightness: e.target.value } })}
            >
              {BRIGHTNESS_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </label>
        </>
      )}
      {node.effectType !== 'blackout' && (
        <ValueSourceEditor
          label="Layer"
          value={node.layer}
          onChange={next => updateNode({ layer: next })}
          expected="number"
          integerOnly={true}
          availableVariables={availableVariables}
        />
      )}
      <div className="space-y-3">
        {/* Wait For Section */}
        <div className="space-y-2">
          <label className="flex flex-col font-medium">
            Wait For Condition
            <select
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={currentTiming.waitForCondition}
              onChange={event => updateTiming({ waitForCondition: event.target.value as WaitCondition })}
              disabled={selectedActionHasEventParent}
            >
              {getActionWaitOptions(activeMode).map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            {selectedActionHasEventParent && (
              <span className="text-[10px] text-gray-500">Inherited from event parent</span>
            )}
          </label>
          {(!(node.effectType === 'set-color' && currentTiming.waitForCondition === 'none')) && (
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

        {/* Duration */}
        <ValueSourceEditor
          label="Duration (ms)"
          value={currentTiming.duration}
          onChange={next => updateTiming({ duration: next })}
          expected="number"
          availableVariables={availableVariables}
        />

        {/* Wait Until Section */}
        <div className="space-y-2">
          <label className="flex flex-col font-medium">
            Wait Until Condition
            <select
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={currentTiming.waitUntilCondition}
              onChange={event => updateTiming({ waitUntilCondition: event.target.value as WaitCondition })}
            >
              {getActionWaitOptions(activeMode).map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          {(!(node.effectType === 'set-color' && currentTiming.waitUntilCondition === 'none')) && (
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

        {/* Easing */}
        <label className="flex flex-col font-medium">
          Easing
          <select
            className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
            value={currentTiming.easing ?? 'linear'}
            onChange={event => updateTiming({ easing: event.target.value })}
          >
            {EASING_OPTIONS.map(ease => (
              <option key={ease} value={ease}>{ease}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
};

export default ActionNodeEditor;
