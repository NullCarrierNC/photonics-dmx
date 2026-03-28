import React from 'react'
import type {
  ActionNode,
  NodeEffectType,
  NodeCueMode,
} from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { NODE_EFFECT_TYPES } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { createDefaultActionTiming } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import ValueSourceEditor from '../shared/ValueSourceEditor'
import ActionTargetSection from './action-editors/ActionTargetSection'
import ActionColorFields from './action-editors/ActionColorFields'
import ActionTimingSection from './action-editors/ActionTimingSection'

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
    updateNode({ effectType: v })
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
