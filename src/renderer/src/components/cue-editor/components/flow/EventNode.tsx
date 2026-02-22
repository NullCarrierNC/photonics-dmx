import React from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import type { EditorNodeData } from '../../lib/types'
import { FONT_COURIER_NEW } from '../../lib/styles'
import { useActiveNodesContext } from '../../context/ActiveNodesContext'

const EventNode: React.FC<NodeProps<EditorNodeData>> = ({ id, data, selected }) => {
  const activeNodeIds = useActiveNodesContext()
  const isActive = activeNodeIds.has(id)
  if (data.kind !== 'event') return null
  const eventPayload = data.payload as { eventType: string }
  const eventType = eventPayload.eventType
  const selectedStyles = selected
    ? 'shadow-[0_0_18px_16px_rgba(59,130,246,0.8)] ring-[5px] ring-blue-400'
    : ''
  const activeStyles = isActive
    ? 'shadow-[0_0_20px_12px_rgba(34,197,94,0.7)] ring-[3px] ring-green-400 brightness-125 transition-shadow duration-150'
    : 'transition-shadow duration-300'
  return (
    <div
      className={`px-3 py-2 rounded-lg border-2 border-blue-400 bg-blue-50 dark:bg-blue-900/40 text-xs shadow-sm min-w-[140px] ${selectedStyles} ${activeStyles}`}>
      <div className="flex items-center gap-1 font-semibold text-blue-800 dark:text-blue-100">
        <span role="img" aria-label="event">
          ⚡
        </span>
        <span>
          Event · <span style={FONT_COURIER_NEW}>{eventType}</span>
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

export default EventNode
