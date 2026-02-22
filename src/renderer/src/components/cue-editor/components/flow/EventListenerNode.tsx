import React from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import type { EditorNodeData } from '../../lib/types'
import { FONT_COURIER_NEW } from '../../lib/styles'
import { useActiveNodesContext } from '../../context/ActiveNodesContext'

const EventListenerNode: React.FC<NodeProps<EditorNodeData>> = ({ id, data, selected }) => {
  const activeNodeIds = useActiveNodesContext()
  const isActive = activeNodeIds.has(id)
  if (data.kind !== 'event-listener') return null
  const listenerPayload = data.payload as { eventName: string }
  const eventName = listenerPayload.eventName || '(select event)'
  const selectedStyles = selected
    ? 'shadow-[0_0_18px_16px_rgba(59,130,246,0.8)] ring-[5px] ring-blue-400'
    : ''
  const activeStyles = isActive
    ? 'shadow-[0_0_20px_12px_rgba(34,197,94,0.7)] ring-[3px] ring-green-400 brightness-125 transition-shadow duration-150'
    : 'transition-shadow duration-300'
  return (
    <div
      className={`px-3 py-2 rounded-lg border-2 border-purple-400 bg-purple-50 dark:bg-purple-900/40 text-xs shadow-sm min-w-[140px] ${selectedStyles} ${activeStyles}`}>
      <div className="flex items-center gap-1 font-semibold text-purple-800 dark:text-purple-100">
        <span role="img" aria-label="listen event">
          👂
        </span>
        <span>
          {listenerPayload.eventName ? (
            <>
              Listen · <span style={FONT_COURIER_NEW}>{eventName}</span>
            </>
          ) : (
            'Listen Event'
          )}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

export default EventListenerNode
