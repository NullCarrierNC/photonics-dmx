import React, { useMemo } from 'react'
import type {
  ConfigDataLogicNode,
  ConfigDataProperty,
} from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { getConfigDataPropertiesMeta } from '../../../../../../../photonics-dmx/cues/node/utils/configDataUtils'
import type { LogicEditorCommonProps } from './LogicNodeEditorShared'
import VariableSelect from './VariableSelect'

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
      <VariableSelect
        label="Assign To Variable (optional)"
        value={node.assignTo ?? ''}
        onChange={(name) => updateNode({ assignTo: name || undefined })}
        variables={availableVariables}
        placeholder="-- None --"
        showType
      />
    </div>
  )
}

export default ConfigDataLogicEditor
