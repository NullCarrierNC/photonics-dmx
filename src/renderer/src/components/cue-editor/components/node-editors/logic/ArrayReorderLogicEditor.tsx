import React from 'react'
import type {
  ReverseColorsLogicNode,
  ReverseLightsLogicNode,
  ShuffleColorsLogicNode,
  ShuffleLightsLogicNode,
} from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { LogicEditorCommonProps } from './LogicNodeEditorShared'
import VariableSelect from './VariableSelect'

export type ArrayReorderLogicNode =
  | ReverseColorsLogicNode
  | ReverseLightsLogicNode
  | ShuffleColorsLogicNode
  | ShuffleLightsLogicNode

/** The array each reorder node works on, and the line of help under its fields. */
const REORDERS: Record<
  ArrayReorderLogicNode['logicType'],
  { arrayType: 'color-array' | 'light-array'; description: string }
> = {
  'reverse-colors': {
    arrayType: 'color-array',
    description: 'Reverses the order of a colour palette.',
  },
  'reverse-lights': {
    arrayType: 'light-array',
    description:
      'Reverses the order of lights in the array. Useful for counter-clockwise patterns.',
  },
  'shuffle-colors': {
    arrayType: 'color-array',
    description: 'Randomises the order of a colour palette.',
  },
  'shuffle-lights': {
    arrayType: 'light-array',
    description:
      'Randomly reorders the lights in the array. Combined with for-each-light or iteration, useful for per-light random assignment.',
  },
}

export interface ArrayReorderLogicEditorProps extends LogicEditorCommonProps {
  node: ArrayReorderLogicNode
}

/** The editor for the nodes that copy an array in a new order: reverse and shuffle, over colours or lights. */
const ArrayReorderLogicEditor: React.FC<ArrayReorderLogicEditorProps> = ({
  node,
  availableVariables,
  updateNode,
}) => {
  const { arrayType, description } = REORDERS[node.logicType]
  return (
    <div className="space-y-2 text-xs">
      <VariableSelect
        label={`Source Variable (${arrayType})`}
        value={node.sourceVariable}
        onChange={(name) => updateNode({ sourceVariable: name })}
        variables={availableVariables}
        types={[arrayType]}
        placeholder={`-- Select ${arrayType} --`}
      />

      <VariableSelect
        label={`Assign To (${arrayType} variable)`}
        value={node.assignTo}
        onChange={(name) => updateNode({ assignTo: name })}
        variables={availableVariables}
        types={[arrayType]}
      />

      <p className="text-[10px] text-gray-500 italic">{description}</p>
    </div>
  )
}

export default ArrayReorderLogicEditor
