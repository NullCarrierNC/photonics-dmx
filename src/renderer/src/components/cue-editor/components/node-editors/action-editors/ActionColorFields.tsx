import React from 'react'
import type {
  ActionNode,
  NodeEffectType,
} from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import {
  BLEND_MODE_OPTIONS,
  BRIGHTNESS_OPTIONS,
  COLOR_OPTIONS,
} from '../../../../../../../photonics-dmx/constants/options'
import ValueSourceEditor from '../../shared/ValueSourceEditor'

const EFFECT_TYPES_WITH_COLOR: NodeEffectType[] = ['set-color']

type ActionColorFieldsProps = {
  node: ActionNode
  availableVariables: { name: string; type: string; scope: 'cue' | 'cue-group' }[]
  updateNode: (updates: Partial<ActionNode>) => void
}

const ActionColorFields: React.FC<ActionColorFieldsProps> = ({
  node,
  availableVariables,
  updateNode,
}) => {
  if (!EFFECT_TYPES_WITH_COLOR.includes(node.effectType)) return null
  return (
    <>
      <ValueSourceEditor
        label="Color"
        value={node.color.name}
        onChange={(next) =>
          updateNode({
            color: { ...node.color, name: next },
          })
        }
        expected="string"
        validLiterals={COLOR_OPTIONS}
        availableVariables={availableVariables}
      />
      <ValueSourceEditor
        label="Brightness"
        value={node.color.brightness}
        onChange={(next) =>
          updateNode({
            color: { ...node.color, brightness: next },
          })
        }
        expected="string"
        validLiterals={BRIGHTNESS_OPTIONS}
        availableVariables={availableVariables}
      />
      <ValueSourceEditor
        label="Blend Mode"
        value={node.color.blendMode}
        onChange={(next) =>
          updateNode({
            color: { ...node.color, blendMode: next },
          })
        }
        expected="string"
        validLiterals={BLEND_MODE_OPTIONS}
        availableVariables={availableVariables}
      />
      <ValueSourceEditor
        label="Opacity (0.0 - 1.0)"
        value={node.color.opacity}
        onChange={(next) =>
          updateNode({
            color: { ...node.color, opacity: next },
          })
        }
        expected="number"
        availableVariables={availableVariables}
      />
    </>
  )
}

export default ActionColorFields
