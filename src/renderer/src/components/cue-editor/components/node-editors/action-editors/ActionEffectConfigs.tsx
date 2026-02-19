import React from 'react';
import type {
  ActionNode,
  NodeChaseOrder,
  NodeCueMode,
  SweepDirection,
  RotationDirection
} from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes';
import type { WaitCondition } from '../../../../../../../photonics-dmx/types';
import {
  BRIGHTNESS_OPTIONS,
  COLOR_OPTIONS,
  LIGHT_TARGET_OPTIONS
} from '../../../../../../../photonics-dmx/constants/options';
import { getActionWaitOptions } from '../../../lib/options';
import ValueSourceEditor from '../../shared/ValueSourceEditor';
import TargetGroupsMultiSelectEditor from '../../shared/TargetGroupsMultiSelectEditor';

type ActionEffectConfigsProps = {
  node: ActionNode;
  activeMode: NodeCueMode;
  availableVariables: { name: string; type: string; scope: 'cue' | 'cue-group' }[];
  updateNode: (updates: Partial<ActionNode>) => void;
};

const ActionEffectConfigs: React.FC<ActionEffectConfigsProps> = ({
  node,
  activeMode,
  availableVariables,
  updateNode
}) => {
  return (
    <>
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
              onChange={e =>
                updateNode({
                  config: { ...node.config, perLightOffsetMs: Number(e.target.value) || 0 }
                })
              }
            />
          </label>
          <label className="flex flex-col font-medium">
            Order
            <select
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={node.config?.order ?? 'linear'}
              onChange={e =>
                updateNode({ config: { ...node.config, order: e.target.value as NodeChaseOrder } })
              }
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
              onChange={e =>
                updateNode({
                  config: { ...node.config, sweepTime: Number(e.target.value) || 0 }
                })
              }
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
              onChange={e =>
                updateNode({
                  config: { ...node.config, sweepFadeInDuration: Number(e.target.value) || 0 }
                })
              }
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
              onChange={e =>
                updateNode({
                  config: { ...node.config, sweepFadeOutDuration: Number(e.target.value) || 0 }
                })
              }
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
              onChange={e =>
                updateNode({
                  config: { ...node.config, sweepLightOverlap: Number(e.target.value) || 0 }
                })
              }
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
              onChange={e =>
                updateNode({
                  config: { ...node.config, sweepBetweenDelay: Number(e.target.value) || 0 }
                })
              }
            />
          </label>
          <label className="flex flex-col font-medium">
            Direction
            <select
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={node.config?.sweepDirection ?? 'forward'}
              onChange={e =>
                updateNode({
                  config: { ...node.config, sweepDirection: e.target.value as SweepDirection }
                })
              }
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
              onChange={e =>
                updateNode({
                  config: {
                    ...node.config,
                    rotationDirection: e.target.value as RotationDirection
                  }
                })
              }
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
              onChange={e =>
                updateNode({
                  config: { ...node.config, beatsPerCycle: Number(e.target.value) || 1 }
                })
              }
            />
          </label>
          <ValueSourceEditor
            label="Start offset"
            expected="number"
            integerOnly={true}
            value={
              typeof node.config?.startOffset === 'object' && node.config?.startOffset !== null
                ? node.config.startOffset
                : { source: 'literal', value: node.config?.startOffset ?? 0 }
            }
            onChange={next => updateNode({ config: { ...node.config, startOffset: next } })}
            availableVariables={availableVariables}
          />
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
              onChange={e =>
                updateNode({
                  config: { ...node.config, holdTime: Number(e.target.value) || 0 }
                })
              }
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
              onChange={e =>
                updateNode({
                  config: { ...node.config, flashDurationIn: Number(e.target.value) || 0 }
                })
              }
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
              onChange={e =>
                updateNode({
                  config: { ...node.config, flashDurationOut: Number(e.target.value) || 0 }
                })
              }
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
              onChange={e =>
                updateNode({
                  config: {
                    ...node.config,
                    cycleTransitionDuration: Number(e.target.value) || 0
                  }
                })
              }
            />
          </label>
          <label className="flex flex-col font-medium">
            Step trigger
            <select
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={node.config?.cycleStepTrigger ?? 'beat'}
              onChange={e =>
                updateNode({
                  config: {
                    ...node.config,
                    cycleStepTrigger: e.target.value as WaitCondition
                  }
                })
              }
            >
              {getActionWaitOptions(activeMode).map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col font-medium">
            Base colour (inactive)
            <select
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={node.config?.cycleBaseColor ?? 'transparent'}
              onChange={e =>
                updateNode({ config: { ...node.config, cycleBaseColor: e.target.value } })
              }
            >
              {COLOR_OPTIONS.map(opt => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col font-medium">
            Base brightness
            <select
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={node.config?.cycleBaseBrightness ?? 'low'}
              onChange={e =>
                updateNode({
                  config: { ...node.config, cycleBaseBrightness: e.target.value }
                })
              }
            >
              {BRIGHTNESS_OPTIONS.map(opt => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      {node.effectType === 'dual-mode-rotation' && (
        <>
          <label className="flex flex-col font-medium">
            Solid colour (when not spinning)
            <select
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={node.config?.dualModeSolidColor ?? 'green'}
              onChange={e =>
                updateNode({
                  config: { ...node.config, dualModeSolidColor: e.target.value }
                })
              }
            >
              {COLOR_OPTIONS.map(opt => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col font-medium">
            Mode switch condition
            <select
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={node.config?.dualModeSwitchCondition ?? 'measure'}
              onChange={e =>
                updateNode({
                  config: {
                    ...node.config,
                    dualModeSwitchCondition: e.target.value as WaitCondition
                  }
                })
              }
            >
              {getActionWaitOptions(activeMode).map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col font-medium">
            Beats per cycle
            <input
              type="number"
              min={1}
              step={1}
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={node.config?.beatsPerCycle ?? 2}
              onChange={e =>
                updateNode({
                  config: { ...node.config, beatsPerCycle: Number(e.target.value) || 2 }
                })
              }
            />
          </label>
          <label className="flex items-center gap-2 font-medium">
            <input
              type="checkbox"
              checked={node.config?.dualModeIsLargeVenue ?? true}
              onChange={e =>
                updateNode({
                  config: { ...node.config, dualModeIsLargeVenue: e.target.checked }
                })
              }
            />
            Large venue (toggle spinning/solid on measure)
          </label>
        </>
      )}
      {node.effectType === 'alternating-pattern' && (
        <>
          <div className="font-medium">Pattern B target (main target is Pattern A)</div>
          <TargetGroupsMultiSelectEditor
            label="Pattern B Groups"
            value={node.config?.patternBTarget?.groups ?? { source: 'literal', value: 'front,back' }}
            onChange={next =>
              updateNode({
                config: {
                  ...node.config,
                  patternBTarget: {
                    groups: next,
                    filter:
                      node.config?.patternBTarget?.filter ?? {
                        source: 'literal',
                        value: 'even'
                      }
                  }
                }
              })
            }
            availableVariables={availableVariables}
          />
          <ValueSourceEditor
            label="Pattern B Filter"
            value={
              node.config?.patternBTarget?.filter ?? { source: 'literal', value: 'even' }
            }
            onChange={next =>
              updateNode({
                config: {
                  ...node.config,
                  patternBTarget: {
                    groups:
                      node.config?.patternBTarget?.groups ?? {
                        source: 'literal',
                        value: 'front,back'
                      },
                    filter: next
                  }
                }
              })
            }
            expected="string"
            validLiterals={LIGHT_TARGET_OPTIONS}
            availableVariables={availableVariables}
          />
          <label className="flex flex-col font-medium">
            Switch condition
            <select
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={node.config?.switchCondition ?? 'keyframe'}
              onChange={e =>
                updateNode({
                  config: {
                    ...node.config,
                    switchCondition: e.target.value as WaitCondition
                  }
                })
              }
            >
              {getActionWaitOptions(activeMode).map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col font-medium">
            Complete condition
            <select
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={node.config?.completeCondition ?? 'beat'}
              onChange={e =>
                updateNode({
                  config: {
                    ...node.config,
                    completeCondition: e.target.value as WaitCondition
                  }
                })
              }
            >
              {getActionWaitOptions(activeMode).map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </>
  );
};

export default ActionEffectConfigs;
