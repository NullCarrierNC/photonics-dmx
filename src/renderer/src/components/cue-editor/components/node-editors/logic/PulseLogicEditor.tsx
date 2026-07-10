import React from 'react'
import type { PulseLogicNode } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import ValueSourceEditor from '../../shared/ValueSourceEditor'
import type { LogicEditorCommonProps } from './LogicNodeEditorShared'

export interface PulseLogicEditorProps extends LogicEditorCommonProps {
  node: PulseLogicNode
}

const PulseLogicEditor: React.FC<PulseLogicEditorProps> = ({
  node,
  availableVariables,
  updateNode,
}) => (
  <div className="space-y-2 text-xs">
    <ValueSourceEditor
      label="Interval (ms per cycle — feed beat-duration-ms for tempo)"
      value={node.interval}
      onChange={(next) => updateNode({ interval: next })}
      expected="number"
      availableVariables={availableVariables}
    />
    <label className="flex flex-col font-medium">
      Anchor Variable (holds the cycle origin; resets each activation)
      <select
        className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
        value={node.anchorVar}
        onChange={(event) => updateNode({ anchorVar: event.target.value })}>
        <option value="">-- select variable --</option>
        {availableVariables.map((v) => (
          <option key={v.name} value={v.name}>
            {v.name} ({v.type}, {v.scope})
          </option>
        ))}
      </select>
    </label>
    <label className="flex flex-col font-medium">
      Assign Index To (integer cycles since anchor)
      <select
        className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
        value={node.assignTo}
        onChange={(event) => updateNode({ assignTo: event.target.value })}>
        <option value="">-- select variable --</option>
        {availableVariables.map((v) => (
          <option key={v.name} value={v.name}>
            {v.name} ({v.type}, {v.scope})
          </option>
        ))}
      </select>
    </label>
    <label className="flex flex-col font-medium">
      Assign Phase To (optional; fraction 0–1 within the cycle)
      <select
        className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
        value={node.assignPhase ?? ''}
        onChange={(event) =>
          updateNode({ assignPhase: event.target.value === '' ? undefined : event.target.value })
        }>
        <option value="">-- none --</option>
        {availableVariables.map((v) => (
          <option key={v.name} value={v.name}>
            {v.name} ({v.type}, {v.scope})
          </option>
        ))}
      </select>
    </label>
  </div>
)

export default PulseLogicEditor
