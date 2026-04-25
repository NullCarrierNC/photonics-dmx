import React from 'react'
import type {
  ActionNode,
  NodeEffectType,
  NodeCueMode,
  NodePositionSetting,
  PositionMode,
} from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { NODE_EFFECT_TYPES } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { createDefaultActionTiming } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import ValueSourceEditor from '../shared/ValueSourceEditor'
import ActionTargetSection from './action-editors/ActionTargetSection'
import ActionColorFields from './action-editors/ActionColorFields'
import ActionTimingSection from './action-editors/ActionTimingSection'
import {
  STAGE_DIRECTION_OPTIONS,
  bearingLiteralToCanonicalSelectValue,
} from '../../../../../../photonics-dmx/helpers/stageDirections'

const STAGE_BEARING_VALID_LITERALS = STAGE_DIRECTION_OPTIONS.map((o) => o.value)
import {
  LINEAR_SWEEP_AXES,
  MOTION_PATTERN_TYPES,
  WAVEFORM_TYPES,
} from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import {
  buildDefaultMotionPatternAction,
  buildDefaultSetPositionAction,
} from '../../lib/cueDefaults'

interface ActionNodeEditorProps {
  node: ActionNode
  activeMode: NodeCueMode
  selectedActionHasEventParent: boolean
  availableVariables: { name: string; type: string; scope: 'cue' | 'cue-group' }[]
  updateNode: (updates: Partial<ActionNode>) => void
}

const ActionNodeEditor: React.FC<ActionNodeEditorProps> = ({
  node,
  activeMode,
  selectedActionHasEventParent,
  availableVariables,
  updateNode,
}) => {
  const currentTiming = node.timing ?? createDefaultActionTiming()
  const updateTiming = (partial: Partial<ActionNode['timing']>) =>
    updateNode({
      timing: { ...currentTiming, ...partial },
    })

  const setEffectType = (v: NodeEffectType) => {
    if (v === 'motion-pattern') {
      updateNode({
        effectType: v,
        motionPattern: node.motionPattern ?? buildDefaultMotionPatternAction().motionPattern,
        position: undefined,
        color: undefined,
      })
      return
    }
    if (v === 'set-position') {
      updateNode({
        effectType: v,
        motionPattern: undefined,
        position: node.position ?? buildDefaultSetPositionAction().position,
        color: undefined,
      })
      return
    }
    if (v === 'set-color') {
      updateNode({
        effectType: v,
        motionPattern: undefined,
        position: undefined,
      })
      return
    }
    updateNode({ effectType: v, motionPattern: undefined, position: undefined })
  }

  const motionPatternLiteral =
    node.motionPattern?.pattern?.source === 'literal' &&
    typeof node.motionPattern.pattern.value === 'string'
      ? node.motionPattern.pattern.value
      : 'circle'

  const positionMode: PositionMode = node.position?.mode ?? 'absolute'

  const setPositionMode = (mode: PositionMode): void => {
    let next: NodePositionSetting
    if (mode === 'direction') {
      next = {
        mode: 'direction',
        bearing: node.position?.bearing ?? { source: 'literal', value: 'downstage' },
        angle: node.position?.angle ?? { source: 'literal', value: 20 },
      }
    } else if (mode === 'offset') {
      next = {
        mode: 'offset',
        pan: node.position?.pan ?? { source: 'literal', value: 0 },
        tilt: node.position?.tilt ?? { source: 'literal', value: 0 },
      }
    } else {
      next = {
        mode: 'absolute',
        pan: node.position?.pan ?? { source: 'literal', value: 50 },
        tilt: node.position?.tilt ?? { source: 'literal', value: 50 },
      }
    }
    updateNode({ position: next })
  }

  return (
    <div className="space-y-3 text-xs">
      <label className="flex flex-col font-medium">
        Effect Type
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.effectType}
          onChange={(event) => setEffectType(event.target.value as NodeEffectType)}>
          {NODE_EFFECT_TYPES.map((effect) => (
            <option key={effect} value={effect}>
              {effect}
            </option>
          ))}
        </select>
      </label>

      <ActionTargetSection
        node={node}
        availableVariables={availableVariables}
        updateNode={updateNode}
      />

      <ActionColorFields
        node={node}
        availableVariables={availableVariables}
        updateNode={updateNode}
      />

      {node.effectType === 'motion-pattern' && node.motionPattern && (
        <>
          <label className="flex flex-col font-medium">
            Pattern preset
            <select
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={motionPatternLiteral}
              onChange={(e) => {
                const v = e.target.value
                updateNode({
                  motionPattern: {
                    ...node.motionPattern!,
                    pattern: { source: 'literal', value: v },
                  },
                })
              }}>
              {MOTION_PATTERN_TYPES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          {motionPatternLiteral === 'linear-sweep' && (
            <label className="flex flex-col font-medium">
              Linear sweep axis
              <select
                className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                value={
                  node.motionPattern.linearSweepAxis?.source === 'literal' &&
                  typeof node.motionPattern.linearSweepAxis.value === 'string'
                    ? node.motionPattern.linearSweepAxis.value
                    : 'horizontal'
                }
                onChange={(e) =>
                  updateNode({
                    motionPattern: {
                      ...node.motionPattern!,
                      linearSweepAxis: { source: 'literal', value: e.target.value },
                    },
                  })
                }>
                {LINEAR_SWEEP_AXES.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
          )}

          <ValueSourceEditor
            label="Speed (Hz)"
            value={node.motionPattern.speed}
            onChange={(next) =>
              updateNode({
                motionPattern: { ...node.motionPattern!, speed: next },
              })
            }
            expected="number"
            availableVariables={availableVariables}
          />
          <ValueSourceEditor
            label="Size (deg peak from home)"
            value={node.motionPattern.size}
            onChange={(next) =>
              updateNode({
                motionPattern: { ...node.motionPattern!, size: next },
              })
            }
            expected="number"
            availableVariables={availableVariables}
          />
          <ValueSourceEditor
            label="Fan spread (deg across fixtures)"
            value={node.motionPattern.fanSpread ?? { source: 'literal', value: 0 }}
            onChange={(next) =>
              updateNode({
                motionPattern: { ...node.motionPattern!, fanSpread: next },
              })
            }
            expected="number"
            availableVariables={availableVariables}
          />
          <ValueSourceEditor
            label="Reverse direction"
            value={node.motionPattern.reverse ?? { source: 'literal', value: false }}
            onChange={(next) =>
              updateNode({
                motionPattern: { ...node.motionPattern!, reverse: next },
              })
            }
            expected="boolean"
            availableVariables={availableVariables}
          />

          {motionPatternLiteral === 'circle' && (
            <ValueSourceEditor
              label="Circle bearing (near vertical home)"
              value={(() => {
                const b = node.motionPattern.bearing ?? { source: 'literal', value: 'downstage' }
                return b.source === 'literal'
                  ? {
                      source: 'literal' as const,
                      value: bearingLiteralToCanonicalSelectValue(b.value),
                    }
                  : b
              })()}
              onChange={(next) =>
                updateNode({
                  motionPattern: { ...node.motionPattern!, bearing: next },
                })
              }
              expected="string"
              validLiterals={STAGE_BEARING_VALID_LITERALS}
              availableVariables={availableVariables}
            />
          )}

          {motionPatternLiteral === 'custom' && (
            <>
              <label className="flex flex-col font-medium">
                Pan waveform
                <select
                  className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                  value={
                    node.motionPattern.panWaveform?.source === 'literal' &&
                    typeof node.motionPattern.panWaveform.value === 'string'
                      ? node.motionPattern.panWaveform.value
                      : 'sine'
                  }
                  onChange={(e) =>
                    updateNode({
                      motionPattern: {
                        ...node.motionPattern!,
                        panWaveform: { source: 'literal', value: e.target.value },
                      },
                    })
                  }>
                  {WAVEFORM_TYPES.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col font-medium">
                Tilt waveform
                <select
                  className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                  value={
                    node.motionPattern.tiltWaveform?.source === 'literal' &&
                    typeof node.motionPattern.tiltWaveform.value === 'string'
                      ? node.motionPattern.tiltWaveform.value
                      : 'cosine'
                  }
                  onChange={(e) =>
                    updateNode({
                      motionPattern: {
                        ...node.motionPattern!,
                        tiltWaveform: { source: 'literal', value: e.target.value },
                      },
                    })
                  }>
                  {WAVEFORM_TYPES.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </label>
              <ValueSourceEditor
                label="Pan amplitude (deg)"
                value={node.motionPattern.panAmplitude ?? node.motionPattern.size}
                onChange={(next) =>
                  updateNode({
                    motionPattern: { ...node.motionPattern!, panAmplitude: next },
                  })
                }
                expected="number"
                availableVariables={availableVariables}
              />
              <ValueSourceEditor
                label="Tilt amplitude (deg)"
                value={node.motionPattern.tiltAmplitude ?? node.motionPattern.size}
                onChange={(next) =>
                  updateNode({
                    motionPattern: { ...node.motionPattern!, tiltAmplitude: next },
                  })
                }
                expected="number"
                availableVariables={availableVariables}
              />
              <ValueSourceEditor
                label="Pan phase offset (deg)"
                value={node.motionPattern.panPhaseOffset ?? { source: 'literal', value: 0 }}
                onChange={(next) =>
                  updateNode({
                    motionPattern: { ...node.motionPattern!, panPhaseOffset: next },
                  })
                }
                expected="number"
                availableVariables={availableVariables}
              />
            </>
          )}
        </>
      )}

      {node.effectType === 'set-position' && (
        <>
          <label className="flex flex-col font-medium">
            Position mode
            <select
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={positionMode}
              onChange={(e) => setPositionMode(e.target.value as PositionMode)}>
              <option value="direction">Direction (bearing + angle from vertical)</option>
              <option value="offset">Offset (degrees from home)</option>
              <option value="absolute">Absolute (% of DMX range)</option>
            </select>
          </label>

          {positionMode === 'direction' && (
            <>
              <ValueSourceEditor
                label="Bearing"
                value={(() => {
                  const b = node.position?.bearing ?? { source: 'literal', value: 'downstage' }
                  return b.source === 'literal'
                    ? {
                        source: 'literal' as const,
                        value: bearingLiteralToCanonicalSelectValue(b.value),
                      }
                    : b
                })()}
                onChange={(next) =>
                  updateNode({
                    position: {
                      mode: 'direction',
                      bearing: next,
                      angle: node.position?.angle ?? { source: 'literal', value: 20 },
                    },
                  })
                }
                expected="string"
                validLiterals={STAGE_BEARING_VALID_LITERALS}
                availableVariables={availableVariables}
              />
              <ValueSourceEditor
                label="Angle from vertical (°)"
                value={node.position?.angle ?? { source: 'literal', value: 20 }}
                onChange={(next) =>
                  updateNode({
                    position: {
                      mode: 'direction',
                      bearing: node.position?.bearing ?? { source: 'literal', value: 'downstage' },
                      angle: next,
                    },
                  })
                }
                expected="number"
                availableVariables={availableVariables}
              />
            </>
          )}

          {positionMode === 'offset' && (
            <>
              <ValueSourceEditor
                label="Pan offset (° from home)"
                value={node.position?.pan ?? { source: 'literal', value: 0 }}
                onChange={(next) =>
                  updateNode({
                    position: {
                      mode: 'offset',
                      pan: next,
                      tilt: node.position?.tilt ?? { source: 'literal', value: 0 },
                    },
                  })
                }
                expected="number"
                availableVariables={availableVariables}
              />
              <ValueSourceEditor
                label="Tilt offset (° from home)"
                value={node.position?.tilt ?? { source: 'literal', value: 0 }}
                onChange={(next) =>
                  updateNode({
                    position: {
                      mode: 'offset',
                      pan: node.position?.pan ?? { source: 'literal', value: 0 },
                      tilt: next,
                    },
                  })
                }
                expected="number"
                availableVariables={availableVariables}
              />
            </>
          )}

          {positionMode === 'absolute' && (
            <>
              <ValueSourceEditor
                label="Pan (%)"
                value={node.position?.pan ?? { source: 'literal', value: 50 }}
                onChange={(next) =>
                  updateNode({
                    position: {
                      mode: 'absolute',
                      pan: next,
                      tilt: node.position?.tilt ?? { source: 'literal', value: 50 },
                    },
                  })
                }
                expected="number"
                availableVariables={availableVariables}
              />
              <ValueSourceEditor
                label="Tilt (%)"
                value={node.position?.tilt ?? { source: 'literal', value: 50 }}
                onChange={(next) =>
                  updateNode({
                    position: {
                      mode: 'absolute',
                      pan: node.position?.pan ?? { source: 'literal', value: 50 },
                      tilt: next,
                    },
                  })
                }
                expected="number"
                availableVariables={availableVariables}
              />
            </>
          )}
        </>
      )}

      {node.effectType !== 'blackout' && (
        <ValueSourceEditor
          label="Layer"
          value={node.layer}
          onChange={(next) => updateNode({ layer: next })}
          expected="number"
          integerOnly={true}
          availableVariables={availableVariables}
        />
      )}

      <ActionTimingSection
        node={node}
        currentTiming={currentTiming}
        updateTiming={updateTiming}
        activeMode={activeMode}
        selectedActionHasEventParent={selectedActionHasEventParent}
        availableVariables={availableVariables}
      />
    </div>
  )
}

export default ActionNodeEditor
