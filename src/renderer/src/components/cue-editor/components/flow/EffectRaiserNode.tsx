import React from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import type { EditorNodeData } from '../../lib/types'
import { FONT_COURIER_NEW } from '../../lib/styles'
import type {
  EffectRaiserNode,
  ValueSource,
  VariableDefinition,
} from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { useActiveNodesContext } from '../../context/ActiveNodesContext'

const EffectRaiserNode: React.FC<NodeProps<EditorNodeData>> = ({ id, data, selected }) => {
  const activeNodeIds = useActiveNodesContext()
  const isActive = activeNodeIds.has(id)
  if (data.kind !== 'effect-raiser') return null
  const raiserPayload = data.payload as EffectRaiserNode
  const effectName = data.effectName || '(select effect)'
  const parameterDefinitions = data.parameterDefinitions
  const selectedStyles = selected
    ? 'shadow-[0_0_18px_16px_rgba(59,130,246,0.8)] ring-[5px] ring-blue-400'
    : ''
  const activeStyles = isActive
    ? 'shadow-[0_0_20px_12px_rgba(34,197,94,0.7)] ring-[3px] ring-green-400 brightness-125 transition-shadow duration-150'
    : 'transition-shadow duration-300'

  // Format a ValueSource for display
  const formatValueSource = (valueSource: ValueSource | undefined): string => {
    if (!valueSource) return ''
    if (valueSource.source === 'literal') {
      if (typeof valueSource.value === 'string') {
        return `"${valueSource.value}"`
      }
      if (typeof valueSource.value === 'boolean') {
        return valueSource.value ? 'true' : 'false'
      }
      return String(valueSource.value)
    } else {
      return `var:${valueSource.name}`
    }
  }

  // Get parameter values
  const parameterValues = raiserPayload.parameterValues ?? {}
  const paramEntries = Object.entries(parameterValues)

  // Create a map of all parameters (defined parameters + set values)
  const allParams = new Map<string, { definition?: VariableDefinition; value?: ValueSource }>()

  // Add parameter definitions
  if (parameterDefinitions) {
    parameterDefinitions.forEach((def) => {
      allParams.set(def.name, { definition: def })
    })
  }

  // Add/update with set values
  paramEntries.forEach(([name, value]) => {
    const existing = allParams.get(name) || {}
    allParams.set(name, { ...existing, value })
  })

  const hasParams = allParams.size > 0
  const hasSetValues = paramEntries.length > 0

  return (
    <div
      className={`px-3 py-2 rounded-lg border-2 border-cyan-400 bg-cyan-50 dark:bg-cyan-900/40 text-xs shadow-sm min-w-[140px] max-w-[200px] ${selectedStyles} ${activeStyles}`}>
      <Handle type="target" position={Position.Top} />
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1 font-semibold text-cyan-800 dark:text-cyan-100">
          <span role="img" aria-label="raise effect">
            ✨
          </span>
          <span className="truncate">
            {raiserPayload.effectId ? (
              <>
                Effect · <span style={FONT_COURIER_NEW}>{effectName}</span>
              </>
            ) : (
              'Raise Effect'
            )}
          </span>
        </div>
        {hasParams && (
          <div className="mt-1 pt-1 border-t border-cyan-300 dark:border-cyan-700 space-y-0.5">
            <div className="text-[10px] font-medium text-cyan-700 dark:text-cyan-300">
              Parameters{' '}
              {hasSetValues ? `(${paramEntries.length}/${allParams.size})` : `(${allParams.size})`}:
            </div>
            {Array.from(allParams.entries()).map(([paramName, { definition, value }]) => {
              const isSet = value !== undefined
              const paramType = definition?.type || 'unknown'
              return (
                <div key={paramName} className="text-[10px] text-cyan-600 dark:text-cyan-400">
                  <div className="truncate">
                    <span
                      className={`font-medium ${isSet ? '' : 'opacity-60'}`}
                      style={FONT_COURIER_NEW}>
                      {paramName}
                    </span>
                    {definition && (
                      <span className="text-cyan-500 dark:text-cyan-500 opacity-70">
                        {' '}
                        ({paramType})
                      </span>
                    )}
                    {isSet && (
                      <>
                        <span className="text-cyan-700 dark:text-cyan-300">: </span>
                        <span className="text-cyan-500 dark:text-cyan-500" style={FONT_COURIER_NEW}>
                          {formatValueSource(value)}
                        </span>
                      </>
                    )}
                    {!isSet && (
                      <span className="text-cyan-500 dark:text-cyan-500 opacity-50 italic">
                        {' '}
                        (not set)
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {!hasParams && raiserPayload.effectId && (
          <div className="mt-1 pt-1 border-t border-cyan-300 dark:border-cyan-700">
            <div className="text-[10px] text-cyan-600 dark:text-cyan-400 italic">No parameters</div>
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

export default EffectRaiserNode
