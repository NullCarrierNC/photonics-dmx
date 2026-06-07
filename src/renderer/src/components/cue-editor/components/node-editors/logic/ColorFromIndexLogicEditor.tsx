import React from 'react'
import type { ColorFromIndexLogicNode } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import ValueSourceEditor from '../../shared/ValueSourceEditor'
import type { LogicEditorCommonProps } from './LogicNodeEditorShared'

export interface ColorFromIndexLogicEditorProps extends LogicEditorCommonProps {
  node: ColorFromIndexLogicNode
}

const ColorFromIndexLogicEditor: React.FC<ColorFromIndexLogicEditorProps> = ({
  node,
  availableVariables,
  updateNode,
}) => {
  const colorVars = availableVariables.filter((v) => v.type === 'color' || v.type === 'string')

  return (
    <div className="space-y-2 text-xs">
      <ValueSourceEditor
        label="Palette (inline list or color-array variable)"
        value={node.colors}
        onChange={(next) => updateNode({ colors: next })}
        expected="color-array"
        availableVariables={availableVariables}
      />

      <ValueSourceEditor
        label="Index (number or variable; wraps modulo palette length)"
        value={node.index}
        onChange={(next) => updateNode({ index: next })}
        expected="number"
        availableVariables={availableVariables}
      />

      <label className="flex flex-col font-medium">
        Assign To (colour variable)
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.assignTo}
          onChange={(event) => updateNode({ assignTo: event.target.value })}>
          <option value="">-- Select variable --</option>
          {colorVars.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name} ({v.type}, {v.scope})
            </option>
          ))}
        </select>
      </label>

      <p className="text-[10px] text-gray-500 italic">
        Picks the colour at the given index from the palette (wrapping around) and writes it to the
        chosen colour variable. Pair with a set-color action that reads its colour from that
        variable.
      </p>
    </div>
  )
}

export default ColorFromIndexLogicEditor
