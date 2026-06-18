import React from 'react'
import type { BuildRingLogicNode } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { LogicEditorCommonProps } from './LogicNodeEditorShared'

export interface BuildRingLogicEditorProps extends LogicEditorCommonProps {
  node: BuildRingLogicNode
}

const BuildRingLogicEditor: React.FC<BuildRingLogicEditorProps> = ({
  node,
  availableVariables,
  updateNode,
}) => {
  const lightArrayVars = availableVariables.filter((v) => v.type === 'light-array')
  const numberVars = availableVariables.filter((v) => v.type === 'number')

  return (
    <div className="space-y-2 text-xs">
      <label className="flex flex-col font-medium">
        Ring (light-array variable)
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.assignTo}
          onChange={(event) => updateNode({ assignTo: event.target.value })}>
          <option value="">-- Select variable --</option>
          {lightArrayVars.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name} ({v.scope})
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col font-medium">
        Group Size (number variable)
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.assignGroupSize}
          onChange={(event) => updateNode({ assignGroupSize: event.target.value })}>
          <option value="">-- Select variable --</option>
          {numberVars.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name} ({v.scope})
            </option>
          ))}
        </select>
      </label>

      <p className="text-[10px] text-gray-500 italic">
        Builds a virtual 8-step LED ring from all lights so chases keep their shape on any rig:
        counts that divide 8 (4, 2…) are repeated, multiples of 8 (16, 24…) are interleaved with a
        matching group size, and other counts are resampled to 8 steps.
      </p>
    </div>
  )
}

export default BuildRingLogicEditor
