import React, { useMemo } from 'react'
import type {
  ConfigDataLogicNode,
  ConfigDataProperty,
} from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { getConfigDataPropertiesMeta } from '../../../../../../../photonics-dmx/cues/node/utils/configDataUtils'
import type { LogicEditorCommonProps } from './LogicNodeEditorShared'

export interface ConfigDataLogicEditorProps extends LogicEditorCommonProps {
  node: ConfigDataLogicNode
}

const ConfigDataLogicEditor: React.FC<ConfigDataLogicEditorProps> = ({
  node,
  availableVariables,
  updateNode,
}) => {
  const configDataProperties = useMemo(() => getConfigDataPropertiesMeta(), [])

  return (
    <div className="space-y-2 text-xs">
      <label className="flex flex-col font-medium">
        Config Property
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.dataProperty ?? ''}
          onChange={(event) =>
            updateNode({ dataProperty: (event.target.value as ConfigDataProperty) || undefined })
          }>
          <option value="">-- Select Property --</option>
          {configDataProperties.map((prop) => (
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

export default ConfigDataLogicEditor
