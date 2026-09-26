import React from 'react'
import type {
  ActionNode,
  NodeCueKind,
  NodeEffectType,
  NodeCueMode,
  NodePositionSetting,
  PositionMode,
} from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { getEffectTypesForCueKind } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { createDefaultActionTiming } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import ValueSourceEditor from '../shared/ValueSourceEditor'
import KnownValueSelect from '../shared/KnownValueSelect'
import { bearingIssue } from '../../../../../../photonics-dmx/cues/node/cueValueRules'
import ActionTargetSection from './action-editors/ActionTargetSection'
import ActionColorFields from './action-editors/ActionColorFields'
import ActionTimingSection from './action-editors/ActionTimingSection'
import {
  STAGE_DIRECTION_OPTIONS,
  exactBearingSelectValue,
} from '../../../../../../photonics-dmx/helpers/stageDirections'
import type { ValueSource } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'

const listOf = (values: readonly string[]) => values.map((value) => ({ value, label: value }))

/**
 * A bearing as the direction dropdown shows it: a literal naming one of the directions shows as that
 * direction, and any other literal shows as it is stored.
 */
function bearingShown(bearing: ValueSource): ValueSource {
  if (bearing.source !== 'literal') return bearing
  return { source: 'literal', value: exactBearingSelectValue(bearing.value) ?? bearing.value }
}

/** A motion literal's stored text, or `fallback` when the field holds none or a variable. */
function motionLiteral(source: ValueSource | undefined, fallback: string): string {
  return source?.source === 'literal' ? String(source.value) : fallback
}

import {
  LINEAR_SWEEP_AXES,
  MOTION_PATTERN_TYPES,
  WAVEFORM_TYPES,
} from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import {
  buildDefaultMotionPatternAction,
  buildDefaultSetPositionAction,
} from '../../lib/cueDefaults'
import type { EditorMode } from '../../lib/types'

interface ActionNodeEditorProps {
  node: ActionNode
  activeMode: NodeCueMode
  cueKind: NodeCueKind
  editorMode: EditorMode
  selectedActionHasEventParent: boolean
  availableVariables: { name: string; type: string; scope: 'cue' | 'cue-group' }[]
  updateNode: (updates: Partial<ActionNode>) => void
}

const ActionNodeEditor: React.FC<ActionNodeEditorProps> = ({
  node,
  activeMode,
  cueKind,
  editorMode,
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

  const motionPatternLiteral = motionLiteral(node.motionPattern?.pattern, 'circle')

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

  const contextEffectTypes = getEffectTypesForCueKind(
    editorMode === 'effect' ? 'lighting' : cueKind,
  )
  const effectTypeSelectOptions = contextEffectTypes.includes(node.effectType)
    ? contextEffectTypes
    : [...contextEffectTypes, node.effectType]

  return (
    <div className="space-y-3 text-xs">
      <label className="flex flex-col font-medium">
        Effect Type
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.effectType}
          onChange={(event) => setEffectType(event.target.value as NodeEffectType)}>
          {effectTypeSelectOptions.map((effect) => (
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
          <KnownValueSelect
            label="Pattern preset"
            value={motionPatternLiteral}
            options={listOf(MOTION_PATTERN_TYPES)}
            onChange={(v) =>
              updateNode({
                motionPattern: {
                  ...node.motionPattern!,
                  pattern: { source: 'literal', value: v },
                },
              })
            }
          />

          {motionPatternLiteral === 'linear-sweep' && (
            <KnownValueSelect
              label="Linear sweep axis"
              value={motionLiteral(node.motionPattern.linearSweepAxis, 'horizontal')}
              options={listOf(LINEAR_SWEEP_AXES)}
              onChange={(v) =>
                updateNode({
                  motionPattern: {
                    ...node.motionPattern!,
                    linearSweepAxis: { source: 'literal', value: v },
                  },
                })
              }
            />
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
              value={bearingShown(
                node.motionPattern.bearing ?? { source: 'literal', value: 'downstage' },
              )}
              issue={
                node.motionPattern.bearing?.source === 'literal'
                  ? bearingIssue(node.motionPattern.bearing.value)
                  : undefined
              }
              onChange={(next) =>
                updateNode({
                  motionPattern: { ...node.motionPattern!, bearing: next },
                })
              }
              expected="string"
              validLiteralOptions={STAGE_DIRECTION_OPTIONS}
              availableVariables={availableVariables}
            />
          )}

          {motionPatternLiteral === 'custom' && (
            <>
              <KnownValueSelect
                label="Pan waveform"
                value={motionLiteral(node.motionPattern.panWaveform, 'sine')}
                options={listOf(WAVEFORM_TYPES)}
                onChange={(v) =>
                  updateNode({
                    motionPattern: {
                      ...node.motionPattern!,
                      panWaveform: { source: 'literal', value: v },
                    },
                  })
                }
              />
              <KnownValueSelect
                label="Tilt waveform"
                value={motionLiteral(node.motionPattern.tiltWaveform, 'cosine')}
                options={listOf(WAVEFORM_TYPES)}
                onChange={(v) =>
                  updateNode({
                    motionPattern: {
                      ...node.motionPattern!,
                      tiltWaveform: { source: 'literal', value: v },
                    },
                  })
                }
              />
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
                value={bearingShown(
                  node.position?.bearing ?? { source: 'literal', value: 'downstage' },
                )}
                issue={
                  node.position?.bearing?.source === 'literal'
                    ? bearingIssue(node.position.bearing.value)
                    : undefined
                }
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
                validLiteralOptions={STAGE_DIRECTION_OPTIONS}
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
          rule="layer"
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
