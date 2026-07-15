import React from 'react'
import type { LedChangedLogicNode } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { LogicEditorCommonProps } from './LogicNodeEditorShared'

export interface LedChangedLogicEditorProps extends LogicEditorCommonProps {
  node: LedChangedLogicNode
}

/** Fans out over the StageKit LED positions whose colour changed since the previous frame, running the
 *  `each` branch once per changed position. Replaces the eight per-LED event lanes an RB3 cue repeats. */
const LedChangedLogicEditor: React.FC<LedChangedLogicEditorProps> = ({ node, updateNode }) => {
  const field = (
    label: string,
    key: 'assignIndex' | 'assignColor' | 'assignEdge',
    placeholder: string,
    optional: boolean,
  ) => (
    <label className="flex flex-col font-medium">
      {label}
      <input
        type="text"
        className="mt-1 rounded border px-2 py-1 font-mono bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
        value={node[key] ?? ''}
        spellCheck={false}
        placeholder={placeholder}
        onChange={(event) =>
          updateNode({ [key]: optional ? event.target.value || undefined : event.target.value })
        }
      />
    </label>
  )

  return (
    <div className="space-y-2 text-xs">
      {field('Position index → variable', 'assignIndex', 'ledIndex', false)}
      {field('Colour → variable (optional)', 'assignColor', 'ledColor', true)}
      {field('Edge → variable (optional)', 'assignEdge', 'ledEdge', true)}
      <p className="text-[10px] text-gray-500">
        Wire the <span className="font-semibold">each</span> port to the per-position body and{' '}
        <span className="font-semibold">done</span> to what runs after. Edge is{' '}
        <span className="font-mono">on</span>, <span className="font-mono">off</span>, or{' '}
        <span className="font-mono">color</span>. Colour is a palette name (
        <span className="font-mono">transparent</span> when the position turned off).
      </p>
    </div>
  )
}

export default LedChangedLogicEditor
