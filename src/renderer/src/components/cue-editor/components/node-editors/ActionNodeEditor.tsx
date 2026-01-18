import React from 'react';
import type { ActionNode, NodeChaseOrder, NodeEffectType, NodeCueMode } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes';
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
      {(node.effectType === 'set-color' || node.effectType === 'chase') && (
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
