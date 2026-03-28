import React, { useEffect } from 'react'
import type {
  CueDataLogicNode,
  CueDataProperty,
} from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { NodeCueMode } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import {
  YARG_CUE_DATA_PROPERTY_META,
  AUDIO_CUE_DATA_PROPERTY_META,
  getYargCueDataPropertyMeta,
  getAudioCueDataPropertyMeta,
} from '../../../../../../../photonics-dmx/constants/cueDataPropertyMeta'
import type { LogicEditorCommonProps } from './LogicNodeEditorShared'

export interface CueDataLogicEditorProps extends LogicEditorCommonProps {
  node: CueDataLogicNode
  activeMode: NodeCueMode
  onSyncVariableValidValues?: (
    varName: string,
    scope: 'cue' | 'cue-group',
    validValues: string[],
  ) => void
}

const CueDataLogicEditor: React.FC<CueDataLogicEditorProps> = ({
  node,
  activeMode,
  availableVariables,
  updateNode,
  onSyncVariableValidValues,
}) => {
  const cueDataProperties =
    activeMode === 'yarg' ? YARG_CUE_DATA_PROPERTY_META : AUDIO_CUE_DATA_PROPERTY_META

  useEffect(() => {
    if (!node.assignTo || !node.dataProperty || !onSyncVariableValidValues) return
    const meta =
      activeMode === 'yarg'
        ? getYargCueDataPropertyMeta(node.dataProperty)
        : getAudioCueDataPropertyMeta(node.dataProperty)
    if (!meta?.validValues?.length) return
    const varDef = availableVariables.find((v) => v.name === node.assignTo)
    if (!varDef) return
    if (varDef.validValues != null && varDef.validValues.length > 0) return
    onSyncVariableValidValues(node.assignTo, varDef.scope, [...meta.validValues])
  }, [node.assignTo, node.dataProperty, activeMode, availableVariables, onSyncVariableValidValues])

  return (
    <div className="space-y-2 text-xs">
      <label className="flex flex-col font-medium">
        Data Property
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.dataProperty ?? ''}
          onChange={(event) =>
            updateNode({ dataProperty: (event.target.value as CueDataProperty) || undefined })
          }>
          <option value="">-- Select Property --</option>
          {cueDataProperties.map((prop) => (
            <option key={prop.id} value={prop.id}>
              {prop.label} ({prop.type})
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col font-medium">
        Assign To Variable (optional)
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.assignTo ?? ''}
          onChange={(event) => updateNode({ assignTo: event.target.value || undefined })}>
          <option value="">-- None --</option>
          {availableVariables.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name} ({v.type}, {v.scope})
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

export default CueDataLogicEditor
