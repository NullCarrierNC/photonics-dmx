import React from 'react';
import type {
  ActionNode,
  AudioEventNode,
  AudioEventType,
  LogicNode,
  LogicComparator,
  MathOperator,
  NodeCueMode,
  NodeEffectType,
  ValueSource,
  VariableLogicNode,
  YargEventNode
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes';
import type { WaitCondition, Color } from '../../../../../photonics-dmx/types';
import {
  ACTION_OPTIONS,
  ACTION_WAIT_OPTIONS_YARG,
  AUDIO_EVENT_OPTIONS,
  BLEND_MODE_OPTIONS,
  BRIGHTNESS_OPTIONS,
  COLOR_OPTIONS,
  EASING_OPTIONS,
  LIGHT_TARGET_OPTIONS,
  LOCATION_OPTIONS,
  YARG_EVENT_OPTIONS,
  getActionWaitOptions,
  getDefaultEventOption
} from '../lib/options';
import { createDefaultActionTiming } from '../../../../../photonics-dmx/cues/types/nodeCueTypes';
import type { EditorNode, EventOption } from '../lib/types';

type Props = {
  activeMode: NodeCueMode;
  selectedNode: EditorNode | null;
  selectedActionHasEventParent: boolean;
  availableVariables: { name: string; type: string; scope: 'cue' | 'cue-group' }[];
  addEventNode: (option: EventOption<WaitCondition | AudioEventNode['eventType']>) => void;
  addActionNode: (effect: NodeEffectType) => void;
  addLogicNode: (logicType: LogicNode['logicType']) => void;
  updateSelectedNode: <T extends YargEventNode | AudioEventNode | ActionNode | LogicNode>(updates: Partial<T>) => void;
};

const NodeSidebar: React.FC<Props> = ({
  activeMode,
  selectedNode,
  selectedActionHasEventParent,
  availableVariables,
  addEventNode,
  addActionNode,
  addLogicNode,
  updateSelectedNode
}) => {
  const isVariableSource = (src: ValueSource): src is Extract<ValueSource, { source: 'variable' }> => src.source === 'variable';

  const renderValueSourceEditor = (
    label: string,
    value: ValueSource | undefined,
    onChange: (next: ValueSource) => void,
    expected: 'number' | 'boolean' | 'string' | 'either' = 'either'
  ) => {
    const source = value ?? { source: 'literal', value: expected === 'boolean' ? false : expected === 'string' ? '' : 0 };
    const isLiteral = source.source === 'literal';
    const isBoolean = expected === 'boolean';
    const isString = expected === 'string';

    return (
      <div className="space-y-1">
        <label className="flex flex-col font-medium text-xs">
          {label}
          <select
            className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
            value={source.source}
            onChange={event => {
              const nextSource = event.target.value as ValueSource['source'];
              if (nextSource === 'literal') {
                const defaultValue = isBoolean ? false : isString ? '' : 0;
                onChange({ source: 'literal', value: defaultValue });
              } else {
                onChange({ source: 'variable', name: isVariableSource(source) ? (source.name ?? 'var1') : 'var1', fallback: isVariableSource(source) ? source.fallback : undefined });
              }
            }}
          >
            <option value="literal">Literal</option>
            <option value="variable">Variable</option>
          </select>
        </label>
        {isLiteral ? (
          <label className="flex flex-col font-medium text-xs">
            Value
            {isBoolean ? (
              <select
                className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                value={source.value === true ? 'true' : 'false'}
                onChange={event => onChange({ ...source, value: event.target.value === 'true' })}
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : (
              <input
                type="number"
                step="0.1"
                className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                value={typeof source.value === 'number' ? source.value : 0}
                onChange={event => onChange({ ...source, value: Number(event.target.value) })}
              />
            )}
          </label>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col font-medium text-xs">
              Variable
              <select
                className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                value={isVariableSource(source) ? (source.name ?? '') : ''}
                onChange={event => onChange({ source: 'variable', name: event.target.value || 'var1', fallback: isVariableSource(source) ? source.fallback : undefined })}
              >
                <option value="">-- Select --</option>
                {availableVariables.map(v => (
                  <option key={v.name} value={v.name}>
                    {v.name} ({v.type})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col font-medium text-xs">
              Fallback
              {isBoolean ? (
                <select
                  className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                  value={isVariableSource(source) && source.fallback === true ? 'true' : 'false'}
                  onChange={event => onChange({ source: 'variable', name: isVariableSource(source) ? source.name : 'var1', fallback: event.target.value === 'true' })}
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input
                  type="number"
                  step="0.1"
                  className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                  value={isVariableSource(source) && typeof source.fallback === 'number' ? source.fallback : 0}
                  onChange={event => onChange({ source: 'variable', name: isVariableSource(source) ? source.name : 'var1', fallback: Number(event.target.value) })}
                />
              )}
            </label>
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="bg-white dark:bg-gray-900 rounded-lg shadow-inner p-3 overflow-y-auto space-y-4">
      <div>
        <h3 className="font-semibold text-sm mb-2">Event Nodes</h3>
        <button
          className="border rounded px-2 py-1 text-xs hover:bg-gray-100 dark:hover:bg-gray-800"
          onClick={() => addEventNode(getDefaultEventOption(activeMode))}
        >
          Add Event Node
        </button>
      </div>

      <div>
        <h3 className="font-semibold text-sm mb-2">Action Nodes</h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {ACTION_OPTIONS.map(effect => (
            <button
              key={effect}
              className="border rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800"
              onClick={() => addActionNode(effect)}
            >
              {effect}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-sm mb-2">Logic Nodes</h3>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <button
            className="border rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800"
            onClick={() => addLogicNode('variable')}
          >
            Variable
          </button>
          <button
            className="border rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800"
            onClick={() => addLogicNode('conditional')}
          >
            Conditional
          </button>
          <button
            className="border rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800"
            onClick={() => addLogicNode('math')}
          >
            Math
          </button>
        </div>
      </div>

      <div className="border-t border-gray-200 dark:border-gray-800 pt-4">
        <h3 className="font-semibold text-sm mb-2">Selected Node</h3>
        {!selectedNode ? (
          <p className="text-xs text-gray-500">Select a node on the canvas to edit its properties.</p>
        ) : selectedNode.data.kind === 'event' ? (
          <div className="space-y-2 text-xs">
            <label className="flex flex-col font-medium">
              Event Type
              <select
                className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                value={
                  activeMode === 'yarg'
                    ? (selectedNode.data.payload as YargEventNode).eventType
                    : (selectedNode.data.payload as AudioEventNode).eventType
                }
                onChange={event => {
                  if (activeMode === 'yarg') {
                    updateSelectedNode<YargEventNode>({ eventType: event.target.value as WaitCondition });
                  } else {
                    updateSelectedNode<AudioEventNode>({ eventType: event.target.value as AudioEventType });
                  }
                }}
              >
                {(activeMode === 'yarg' ? YARG_EVENT_OPTIONS : AUDIO_EVENT_OPTIONS).map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            {activeMode === 'audio' && (
              <>
                <label className="flex flex-col font-medium">
                  Threshold
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                    value={(selectedNode.data.payload as AudioEventNode).threshold ?? 0.5}
                    onChange={event => updateSelectedNode<AudioEventNode>({ threshold: Number(event.target.value) })}
                  />
                </label>
                <label className="flex flex-col font-medium">
                  Trigger Mode
                  <select
                    className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                    value={(selectedNode.data.payload as AudioEventNode).triggerMode}
                    onChange={event => updateSelectedNode<AudioEventNode>({
                      triggerMode: event.target.value as 'edge' | 'level'
                    })}
                  >
                    <option value="edge">Edge</option>
                    <option value="level">Level</option>
                  </select>
                </label>
              </>
            )}
          </div>
        ) : selectedNode.data.kind === 'logic' ? (
          (() => {
            const logicPayload = selectedNode.data.payload as LogicNode;
            if (logicPayload.logicType === 'variable') {
              const showValue = (logicPayload as VariableLogicNode).mode !== 'get';
              return (
                <div className="space-y-2 text-xs">
                  <label className="flex flex-col font-medium">
                    Mode
                    <select
                      className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                      value={(logicPayload as VariableLogicNode).mode}
                      onChange={event => updateSelectedNode<LogicNode>({ mode: event.target.value as VariableLogicNode['mode'] })}
                    >
                      <option value="set">Set</option>
                      <option value="get">Get</option>
                      <option value="init">Init</option>
                    </select>
                  </label>
                  <label className="flex flex-col font-medium">
                    Variable Name
                    <select
                      className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                      value={(logicPayload as VariableLogicNode).varName}
                      onChange={event => updateSelectedNode<LogicNode>({ varName: event.target.value })}
                    >
                      <option value="">-- Select Variable --</option>
                      {availableVariables.map(v => (
                        <option key={v.name} value={v.name}>
                          {v.name} ({v.type}, {v.scope})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col font-medium">
                    Type
                    <select
                      className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                      value={(logicPayload as VariableLogicNode).valueType}
                      onChange={event => updateSelectedNode<LogicNode>({ valueType: event.target.value as 'number' | 'boolean' | 'string' })}
                    >
                      <option value="number">number</option>
                      <option value="boolean">boolean</option>
                      <option value="string">string</option>
                    </select>
                  </label>
                  {showValue && renderValueSourceEditor(
                    'Value',
                    (logicPayload as VariableLogicNode).value,
                    next => updateSelectedNode<LogicNode>({ value: next }),
                    (logicPayload as VariableLogicNode).valueType
                  )}
                </div>
              );
            }

            if (logicPayload.logicType === 'math') {
              return (
                <div className="space-y-2 text-xs">
                  <label className="flex flex-col font-medium">
                    Operator
                    <select
                      className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                      value={logicPayload.operator}
                      onChange={event => updateSelectedNode<LogicNode>({ operator: event.target.value as MathOperator })}
                    >
                      <option value="add">add</option>
                      <option value="subtract">subtract</option>
                      <option value="multiply">multiply</option>
                      <option value="divide">divide</option>
                      <option value="modulus">modulus</option>
                    </select>
                  </label>
                  {renderValueSourceEditor('Left', logicPayload.left, next => updateSelectedNode<LogicNode>({ left: next }), 'number')}
                  {renderValueSourceEditor('Right', logicPayload.right, next => updateSelectedNode<LogicNode>({ right: next }), 'number')}
                  <label className="flex flex-col font-medium">
                    Assign To (optional)
                    <select
                      className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                      value={logicPayload.assignTo ?? ''}
                      onChange={event => updateSelectedNode<LogicNode>({ assignTo: event.target.value || undefined })}
                    >
                      <option value="">-- None --</option>
                      {availableVariables.map(v => (
                        <option key={v.name} value={v.name}>
                          {v.name} ({v.type}, {v.scope})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              );
            }

            return (
              <div className="space-y-2 text-xs">
                <label className="flex flex-col font-medium">
                  Comparator
                  <select
                    className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                    value={logicPayload.comparator}
                    onChange={event => updateSelectedNode<LogicNode>({ comparator: event.target.value as LogicComparator })}
                  >
                    <option value=">">&gt;</option>
                    <option value=">=">&gt;=</option>
                    <option value="<">&lt;</option>
                    <option value="<=">&lt;=</option>
                    <option value="==">==</option>
                    <option value="!=">!=</option>
                  </select>
                </label>
                {renderValueSourceEditor('Left', logicPayload.left, next => updateSelectedNode<LogicNode>({ left: next }))}
                {renderValueSourceEditor('Right', logicPayload.right, next => updateSelectedNode<LogicNode>({ right: next }))}
                <p className="text-[10px] text-gray-500">First outgoing edge becomes TRUE branch, second becomes FALSE.</p>
              </div>
            );
          })()
        ) : (
          <div className="space-y-3 text-xs">
            <label className="flex flex-col font-medium">
              Effect Type
              <select
                className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                value={(selectedNode.data.payload as ActionNode).effectType}
                onChange={event => updateSelectedNode({ effectType: event.target.value as NodeEffectType })}
              >
                {ACTION_OPTIONS.map(effect => (
                  <option key={effect} value={effect}>{effect}</option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col font-medium">
                Target Groups
                <select
                  multiple
                  className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                  value={(selectedNode.data.payload as ActionNode).target.groups}
                  onChange={event => {
                    const selected = Array.from(event.target.selectedOptions).map(option => option.value);
                    updateSelectedNode({
                      target: {
                        ...(selectedNode.data.payload as ActionNode).target,
                        groups: selected
                      }
                    } as ActionNode);
                  }}
                >
                  {LOCATION_OPTIONS.map(loc => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col font-medium">
                Target Filter
                <select
                  className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                  value={(selectedNode.data.payload as ActionNode).target.filter}
                  onChange={event => updateSelectedNode({
                    target: {
                      ...(selectedNode.data.payload as ActionNode).target,
                      filter: event.target.value
                    }
                  } as ActionNode)}
                >
                  {LIGHT_TARGET_OPTIONS.map(target => (
                    <option key={target} value={target}>{target}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col font-medium">
                Primary Colour
                <select
                  className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                  value={(selectedNode.data.payload as ActionNode).color.name}
                  onChange={event => updateSelectedNode({
                    color: {
                      ...(selectedNode.data.payload as ActionNode).color,
                      name: event.target.value as Color
                    }
                  } as ActionNode)}
                >
                  {COLOR_OPTIONS.map(color => (
                    <option key={color} value={color}>{color}</option>
                  ))}
                </select>
              </label>
              {(((selectedNode.data.payload as ActionNode).effectType === 'sweep') ||
                (selectedNode.data.payload as ActionNode).effectType === 'cycle') && (
                <label className="flex flex-col font-medium">
                  Secondary Colour
                  <select
                    className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                    value={(selectedNode.data.payload as ActionNode).secondaryColor?.name ?? 'transparent'}
                    onChange={event => updateSelectedNode({
                      secondaryColor: {
                        ...(selectedNode.data.payload as ActionNode).secondaryColor ?? { brightness: 'medium', blendMode: 'replace' },
                      name: event.target.value as Color
                      }
                    } as ActionNode)}
                  >
                    {COLOR_OPTIONS.map(color => (
                      <option key={color} value={color}>{color}</option>
                    ))}
                  </select>
                </label>
              )}
              <label className="flex flex-col font-medium">
                Brightness
                <select
                  className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                  value={(selectedNode.data.payload as ActionNode).color.brightness}
                  onChange={event => updateSelectedNode({
                    color: {
                      ...(selectedNode.data.payload as ActionNode).color,
                      brightness: event.target.value
                    }
                  } as ActionNode)}
                >
                  {BRIGHTNESS_OPTIONS.map(brightness => (
                    <option key={brightness} value={brightness}>{brightness}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col font-medium">
                Blend Mode
                <select
                  className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                  value={(selectedNode.data.payload as ActionNode).color.blendMode ?? 'replace'}
                  onChange={event => updateSelectedNode({
                    color: {
                      ...(selectedNode.data.payload as ActionNode).color,
                      blendMode: event.target.value
                    }
                  } as ActionNode)}
                >
                  {BLEND_MODE_OPTIONS.map(mode => (
                    <option key={mode} value={mode}>{mode}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex flex-col font-medium">
              Layer
              <input
                type="number"
                min={0}
                className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                value={(selectedNode.data.payload as ActionNode).layer ?? 0}
                onChange={event => updateSelectedNode({ layer: Number(event.target.value) })}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(() => {
                const actionPayload = selectedNode.data.payload as ActionNode;
                const currentTiming = actionPayload.timing ?? createDefaultActionTiming();
                const updateTiming = (partial: Partial<ActionNode['timing']>) =>
                  updateSelectedNode({
                    timing: {
                      ...currentTiming,
                      ...partial
                    }
                  } as ActionNode);

                return (
                  <>
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
                    <label className={`flex flex-col font-medium ${currentTiming.waitForCondition !== 'delay' ? 'opacity-60 cursor-not-allowed' : ''}`}>
                      Wait For Time (ms)
                      <input
                        type="number"
                        min={0}
                        className={`mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700 ${
                          currentTiming.waitForCondition !== 'delay' ? 'opacity-60 cursor-not-allowed' : ''
                        }`}
                        value={currentTiming.waitForTime}
                        disabled={currentTiming.waitForCondition !== 'delay'}
                        onChange={event => updateTiming({ waitForTime: Number(event.target.value) })}
                      />
                    </label>
                    <label className="flex flex-col font-medium">
                      Wait For Count
                      <input
                        type="number"
                        min={0}
                        className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                        value={currentTiming.waitForConditionCount ?? ''}
                        onChange={event => updateTiming({
                          waitForConditionCount: event.target.value === '' ? undefined : Number(event.target.value)
                        })}
                      />
                    </label>
                    <label className="flex flex-col font-medium">
                      Duration (ms)
                      <input
                        type="number"
                        min={0}
                        className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                        value={currentTiming.duration}
                        onChange={event => updateTiming({ duration: Number(event.target.value) })}
                      />
                    </label>
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
                    <label className={`flex flex-col font-medium ${currentTiming.waitUntilCondition !== 'delay' ? 'opacity-60 cursor-not-allowed' : ''}`}>
                      Wait Until Time (ms)
                      <input
                        type="number"
                        min={0}
                        className={`mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700 ${
                          currentTiming.waitUntilCondition !== 'delay' ? 'opacity-60 cursor-not-allowed' : ''
                        }`}
                        value={currentTiming.waitUntilTime}
                        disabled={currentTiming.waitUntilCondition !== 'delay'}
                        onChange={event => updateTiming({ waitUntilTime: Number(event.target.value) })}
                      />
                    </label>
                    <label className="flex flex-col font-medium">
                      Wait Until Count
                      <input
                        type="number"
                        min={0}
                        className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                        value={currentTiming.waitUntilConditionCount ?? ''}
                        onChange={event => updateTiming({
                          waitUntilConditionCount: event.target.value === '' ? undefined : Number(event.target.value)
                        })}
                      />
                    </label>
                    <label className="flex flex-col font-medium">
                      Level
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                        value={currentTiming.level ?? 1}
                        onChange={event => updateTiming({ level: Number(event.target.value) })}
                      />
                    </label>
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
                  </>
                );
              })()}
            </div>

            {(() => {
              const actionPayload = selectedNode.data.payload as ActionNode;
              const updateConfig = (partial: Partial<NonNullable<ActionNode['config']>>) =>
                updateSelectedNode<ActionNode>({
                  config: {
                    ...(actionPayload.config ?? {}),
                    ...partial
                  }
                });

              if (actionPayload.effectType === 'sweep') {
                const cfg = actionPayload.config?.sweep ?? {};
                return (
                  <div className="mt-3 border-t pt-3 space-y-2">
                    <div className="font-semibold text-xs">Sweep Settings</div>
                    <label className="flex flex-col font-medium text-xs">
                      Duration (ms)
                      <input
                        type="number"
                        min={0}
                        className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                        value={cfg.duration ?? ''}
                        onChange={e => updateConfig({ sweep: { ...cfg, duration: e.target.value === '' ? undefined : Number(e.target.value) } })}
                      />
                    </label>
                    <label className="flex flex-col font-medium text-xs">
                      Fade In (ms)
                      <input
                        type="number"
                        min={0}
                        className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                        value={cfg.fadeIn ?? ''}
                        onChange={e => updateConfig({ sweep: { ...cfg, fadeIn: e.target.value === '' ? undefined : Number(e.target.value) } })}
                      />
                    </label>
                    <label className="flex flex-col font-medium text-xs">
                      Fade Out (ms)
                      <input
                        type="number"
                        min={0}
                        className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                        value={cfg.fadeOut ?? ''}
                        onChange={e => updateConfig({ sweep: { ...cfg, fadeOut: e.target.value === '' ? undefined : Number(e.target.value) } })}
                      />
                    </label>
                    <label className="flex flex-col font-medium text-xs">
                      Overlap (%)
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                        value={cfg.overlap ?? ''}
                        onChange={e => updateConfig({ sweep: { ...cfg, overlap: e.target.value === '' ? undefined : Number(e.target.value) } })}
                      />
                    </label>
                    <label className="flex flex-col font-medium text-xs">
                      Between Delay (ms)
                      <input
                        type="number"
                        min={0}
                        className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                        value={cfg.betweenDelay ?? ''}
                        onChange={e => updateConfig({ sweep: { ...cfg, betweenDelay: e.target.value === '' ? undefined : Number(e.target.value) } })}
                      />
                    </label>
                    <label className="flex flex-col font-medium text-xs">
                      Low Colour
                      <select
                        className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                        value={cfg.lowColor?.name ?? 'transparent'}
                        onChange={event => updateConfig({
                          sweep: {
                            ...cfg,
                            lowColor: {
                              ...(cfg.lowColor ?? { brightness: 'medium', blendMode: 'replace' }),
                              name: event.target.value as Color
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
              }

              if (actionPayload.effectType === 'cycle') {
                const cfg = actionPayload.config?.cycle ?? {};
                return (
                  <div className="mt-3 border-t pt-3 space-y-2">
                    <div className="font-semibold text-xs">Cycle Settings</div>
                    <label className="flex flex-col font-medium text-xs">
                      Base Colour
                      <select
                        className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                        value={cfg.baseColor?.name ?? 'transparent'}
                        onChange={event => updateConfig({
                          cycle: {
                            ...cfg,
                            baseColor: {
                              ...(cfg.baseColor ?? { brightness: 'medium', blendMode: 'replace' }),
                                  name: event.target.value as Color
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
                        value={cfg.transitionDuration ?? ''}
                        onChange={e => updateConfig({ cycle: { ...cfg, transitionDuration: e.target.value === '' ? undefined : Number(e.target.value) } })}
                      />
                    </label>
                    <label className="flex flex-col font-medium text-xs">
                      Trigger
                      <select
                        className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                        value={cfg.trigger ?? 'none'}
                        onChange={event => updateConfig({ cycle: { ...cfg, trigger: event.target.value as WaitCondition } })}
                      >
                        {ACTION_WAIT_OPTIONS_YARG.map(option => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                );
              }

              if (actionPayload.effectType === 'blackout') {
                const cfg = actionPayload.config?.blackout ?? {};
                return (
                  <div className="mt-3 border-t pt-3 space-y-2">
                    <div className="font-semibold text-xs">Blackout Settings</div>
                    <label className="flex flex-col font-medium text-xs">
                      Duration (ms)
                      <input
                        type="number"
                        min={10}
                        className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                        value={cfg.duration ?? ''}
                        onChange={e => updateConfig({ blackout: { ...cfg, duration: e.target.value === '' ? undefined : Number(e.target.value) } })}
                      />
                    </label>
                  </div>
                );
              }

              return null;
            })()}
          </div>
        )}
      </div>
    </aside>
  );
};

export default NodeSidebar;
