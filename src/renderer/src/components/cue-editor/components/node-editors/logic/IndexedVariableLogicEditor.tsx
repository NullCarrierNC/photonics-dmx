import React from 'react'
import type {
  IndexedVariableLogicNode,
  VariableType,
} from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { VARIABLE_TYPES } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import ValueSourceEditor from '../../shared/ValueSourceEditor'
import type { LogicEditorCommonProps } from './LogicNodeEditorShared'

export interface IndexedVariableLogicEditorProps extends LogicEditorCommonProps {
  node: IndexedVariableLogicNode
}

/** Reads or writes one slot of a `${varName}#${index}` variable family, giving a cue a small per-position
 *  array (e.g. a lit latch per LED) without declaring a separate variable for every slot. */
const IndexedVariableLogicEditor: React.FC<IndexedVariableLogicEditorProps> = ({
  node,
  availableVariables,
  updateNode,
}) => (
  <div className="space-y-2 text-xs">
    <label className="flex flex-col font-medium">
      Mode
      <select
        className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
        value={node.mode}
        onChange={(event) => updateNode({ mode: event.target.value as 'get' | 'set' })}>
        <option value="set">set</option>
        <option value="get">get</option>
      </select>
    </label>

    <label className="flex flex-col font-medium">
      Family name
      <input
        type="text"
        className="mt-1 rounded border px-2 py-1 font-mono bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
        value={node.varName}
        spellCheck={false}
        placeholder="e.g. lit"
        onChange={(event) => updateNode({ varName: event.target.value })}
      />
    </label>

    <ValueSourceEditor
      label="Index"
      value={node.index}
      onChange={(next) => updateNode({ index: next })}
      expected="number"
      availableVariables={availableVariables}
    />

    <label className="flex flex-col font-medium">
      Value type
      <select
        className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
        value={node.valueType ?? 'number'}
        onChange={(event) => updateNode({ valueType: event.target.value as VariableType })}>
        {VARIABLE_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </label>

    {node.mode === 'set' ? (
      <ValueSourceEditor
        label="Value"
        value={node.value}
        onChange={(next) => updateNode({ value: next })}
        expected={node.valueType ?? 'number'}
        availableVariables={availableVariables}
      />
    ) : (
      <label className="flex flex-col font-medium">
        Read into variable
        <input
          type="text"
          className="mt-1 rounded border px-2 py-1 font-mono bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.assignTo ?? ''}
          spellCheck={false}
          placeholder="e.g. lit_current"
          onChange={(event) => updateNode({ assignTo: event.target.value || undefined })}
        />
      </label>
    )}
    <p className="text-[10px] text-gray-500">
      Slots live under <span className="font-mono">{node.varName || 'name'}#index</span> in the same
      scope as the family name. An empty slot reads as the type zero.
    </p>
  </div>
)

export default IndexedVariableLogicEditor
