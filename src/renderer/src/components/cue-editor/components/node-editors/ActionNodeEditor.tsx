import React from 'react';
import type { ActionNode, NodeEffectType, NodeCueMode } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes';
import type { Color, WaitCondition } from '../../../../../../photonics-dmx/types';
import { 
  ACTION_OPTIONS, 
  BLEND_MODE_OPTIONS, 
  BRIGHTNESS_OPTIONS, 
  COLOR_OPTIONS, 
  EASING_OPTIONS, 
  LIGHT_TARGET_OPTIONS,
  ACTION_WAIT_OPTIONS_YARG,
  getActionWaitOptions
} from '../../lib/options';
import { createDefaultActionTiming } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes';
import ValueSourceEditor from '../shared/ValueSourceEditor';
import { extractLiteralValue } from '../shared/nodeEditorUtils';

interface ActionNodeEditorProps {
  node: ActionNode;
  activeMode: NodeCueMode;
  selectedActionHasEventParent: boolean;
  availableVariables: { name: string; type: string; scope: 'cue' | 'cue-group' }[];
  updateNode: (updates: Partial<ActionNode>) => void;
}

const SweepConfigEditor: React.FC<{
  config: NonNullable<ActionNode['config']>['sweep'];
  updateConfig: (partial: Partial<NonNullable<ActionNode['config']>>) => void;
}> = ({ config, updateConfig }) => {
  const cfg = config ?? {};

  return (
    <div className="mt-3 border-t pt-3 space-y-2">
      <div className="font-semibold text-xs">Sweep Settings</div>
      <label className="flex flex-col font-medium text-xs">
        Duration (ms)
        <input
          type="number"
          min={0}
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={extractLiteralValue(cfg.duration, '')}
          onChange={e => updateConfig({ 
            sweep: { 
              ...cfg, 
              duration: e.target.value === '' ? undefined : { source: 'literal', value: Number(e.target.value) } 
            } 
          })}
        />
      </label>
      <label className="flex flex-col font-medium text-xs">
        Fade In (ms)
        <input
          type="number"
          min={0}
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={extractLiteralValue(cfg.fadeIn, '')}
          onChange={e => updateConfig({ 
            sweep: { 
              ...cfg, 
              fadeIn: e.target.value === '' ? undefined : { source: 'literal', value: Number(e.target.value) } 
            } 
          })}
        />
      </label>
      <label className="flex flex-col font-medium text-xs">
        Fade Out (ms)
        <input
          type="number"
          min={0}
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={extractLiteralValue(cfg.fadeOut, '')}
          onChange={e => updateConfig({ 
            sweep: { 
              ...cfg, 
              fadeOut: e.target.value === '' ? undefined : { source: 'literal', value: Number(e.target.value) } 
            } 
          })}
        />
      </label>
      <label className="flex flex-col font-medium text-xs">
        Overlap (%)
        <input
          type="number"
          min={0}
          max={100}
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={extractLiteralValue(cfg.overlap, '')}
          onChange={e => updateConfig({ 
            sweep: { 
              ...cfg, 
              overlap: e.target.value === '' ? undefined : { source: 'literal', value: Number(e.target.value) } 
            } 
          })}
        />
      </label>
      <label className="flex flex-col font-medium text-xs">
        Between Delay (ms)
        <input
          type="number"
          min={0}
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={extractLiteralValue(cfg.betweenDelay, '')}
          onChange={e => updateConfig({ 
            sweep: { 
              ...cfg, 
              betweenDelay: e.target.value === '' ? undefined : { source: 'literal', value: Number(e.target.value) } 
            } 
          })}
        />
      </label>
      <label className="flex flex-col font-medium text-xs">
        Low Colour
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={cfg.lowColor?.name?.source === 'literal' ? cfg.lowColor.name.value as string : 'transparent'}
          onChange={event => updateConfig({
            sweep: {
              ...cfg,
              lowColor: {
                ...(cfg.lowColor ?? { brightness: { source: 'literal', value: 'medium' }, blendMode: { source: 'literal', value: 'replace' } }),
                name: { source: 'literal', value: event.target.value as Color }
              }
            }
          })}
        >
          {COLOR_OPTIONS.map(color => (
            <option key={color} value={color}>{color}</option>
          ))}
        </select>
      </label>
    </div>
  );
};

const CycleConfigEditor: React.FC<{
  config: NonNullable<ActionNode['config']>['cycle'];
  updateConfig: (partial: Partial<NonNullable<ActionNode['config']>>) => void;
}> = ({ config, updateConfig }) => {
  const cfg = config ?? {};

  return (
    <div className="mt-3 border-t pt-3 space-y-2">
      <div className="font-semibold text-xs">Cycle Settings</div>
      <label className="flex flex-col font-medium text-xs">
        Base Colour
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={cfg.baseColor?.name?.source === 'literal' ? cfg.baseColor.name.value as string : 'transparent'}
          onChange={event => updateConfig({
            cycle: {
              ...cfg,
              baseColor: {
                ...(cfg.baseColor ?? { brightness: { source: 'literal', value: 'medium' }, blendMode: { source: 'literal', value: 'replace' } }),
                name: { source: 'literal', value: event.target.value as Color }
              }
            }
          })}
        >
          {COLOR_OPTIONS.map(color => (
            <option key={color} value={color}>{color}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col font-medium text-xs">
        Transition Duration (ms)
        <input
          type="number"
          min={0}
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={extractLiteralValue(cfg.transitionDuration, '')}
          onChange={e => updateConfig({ 
            cycle: { 
              ...cfg, 
              transitionDuration: e.target.value === '' ? undefined : { source: 'literal', value: Number(e.target.value) } 
            } 
          })}
        />
      </label>
      <label className="flex flex-col font-medium text-xs">
        Trigger
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={cfg.trigger ?? 'none'}
          onChange={event => updateConfig({ 
            cycle: { 
              ...cfg, 
              trigger: event.target.value as WaitCondition 
            } 
          })}
        >
          {ACTION_WAIT_OPTIONS_YARG.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
    </div>
  );
};

const BlackoutConfigEditor: React.FC<{
  config: NonNullable<ActionNode['config']>['blackout'];
  updateConfig: (partial: Partial<NonNullable<ActionNode['config']>>) => void;
}> = ({ config, updateConfig }) => {
  const cfg = config ?? {};

  return (
    <div className="mt-3 border-t pt-3 space-y-2">
      <div className="font-semibold text-xs">Blackout Settings</div>
      <label className="flex flex-col font-medium text-xs">
        Duration (ms)
        <input
          type="number"
          min={10}
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={extractLiteralValue(cfg.duration, '')}
          onChange={e => updateConfig({ 
            blackout: { 
              ...cfg, 
              duration: e.target.value === '' ? undefined : { source: 'literal', value: Number(e.target.value) } 
            } 
          })}
        />
      </label>
    </div>
  );
};

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

  const updateConfig = (partial: Partial<NonNullable<ActionNode['config']>>) =>
    updateNode({
      config: {
        ...(node.config ?? {}),
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
          onChange={event => updateNode({ effectType: event.target.value as NodeEffectType })}
        >
          {ACTION_OPTIONS.map(effect => (
            <option key={effect} value={effect}>{effect}</option>
          ))}
        </select>
      </label>
      <ValueSourceEditor
        label="Target Groups (comma-separated: front,back,strobe)"
        value={node.target.groups}
        onChange={next => updateNode({
          target: {
            ...node.target,
            groups: next
          }
        })}
        expected="string"
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
      <ValueSourceEditor
        label="Primary Color"
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
        label="Primary Brightness"
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
        label="Primary Blend Mode"
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
      {(node.effectType === 'sweep' || node.effectType === 'cycle') && (
        <>
          <ValueSourceEditor
            label="Secondary Color"
            value={node.secondaryColor?.name}
            onChange={next => updateNode({
              secondaryColor: {
                ...node.secondaryColor ?? { brightness: { source: 'literal', value: 'medium' }, blendMode: { source: 'literal', value: 'replace' } },
                name: next
              }
            })}
            expected="string"
            validLiterals={COLOR_OPTIONS}
            availableVariables={availableVariables}
          />
          <ValueSourceEditor
            label="Secondary Brightness"
            value={node.secondaryColor?.brightness}
            onChange={next => updateNode({
              secondaryColor: {
                ...node.secondaryColor ?? { name: { source: 'literal', value: 'blue' }, blendMode: { source: 'literal', value: 'replace' } },
                brightness: next
              }
            })}
            expected="string"
            validLiterals={BRIGHTNESS_OPTIONS}
            availableVariables={availableVariables}
          />
        </>
      )}
      <ValueSourceEditor
        label="Layer"
        value={node.layer}
        onChange={next => updateNode({ layer: next })}
        expected="number"
        availableVariables={availableVariables}
      />
      <div className="grid grid-cols-2 gap-2">
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
        <ValueSourceEditor
          label="Duration (ms)"
          value={currentTiming.duration}
          onChange={next => updateTiming({ duration: next })}
          expected="number"
          availableVariables={availableVariables}
        />
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
        <ValueSourceEditor
          label="Level (0.0 - 1.0)"
          value={currentTiming.level}
          onChange={next => updateTiming({ level: next })}
          expected="number"
          availableVariables={availableVariables}
        />
        <label className="flex flex-col font-medium">
          Easing
          <select
            className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
            value={currentTiming.easing ?? 'sinInOut'}
            onChange={event => updateTiming({ easing: event.target.value })}
          >
            {EASING_OPTIONS.map(ease => (
              <option key={ease} value={ease}>{ease}</option>
            ))}
          </select>
        </label>
      </div>

      {node.effectType === 'sweep' && (
        <SweepConfigEditor config={node.config?.sweep} updateConfig={updateConfig} />
      )}

      {node.effectType === 'cycle' && (
        <CycleConfigEditor config={node.config?.cycle} updateConfig={updateConfig} />
      )}

      {node.effectType === 'blackout' && (
        <BlackoutConfigEditor config={node.config?.blackout} updateConfig={updateConfig} />
      )}
    </div>
  );
};

export default ActionNodeEditor;
