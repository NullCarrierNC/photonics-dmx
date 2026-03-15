import React from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import type { EditorNodeData } from '../../lib/types'
import { FONT_COURIER_NEW } from '../../lib/styles'
import FlowNodeFrame from './FlowNodeFrame'

const EventRaiserNode: React.FC<NodeProps<EditorNodeData>> = ({ id, data, selected }) => {
  if (data.kind !== 'event-raiser') return null
  const raiserPayload = data.payload as { eventName: string }
  const eventName = raiserPayload.eventName || '(select event)'
  const selectedStyles = selected
    ? 'shadow-[0_0_18px_16px_rgba(59,130,246,0.8)] ring-[5px] ring-blue-400'
    : ''
  return (
    <FlowNodeFrame
      id={id}
      className={`px-3 py-2 rounded-lg border-2 border-purple-400 bg-purple-50 dark:bg-purple-900/40 text-xs shadow-sm min-w-[140px] ${selectedStyles}`}>
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-1 font-semibold text-purple-800 dark:text-purple-100">
        <span role="img" aria-label="raise event">
          📢
        </span>
        <span>
          {raiserPayload.eventName ? (
            <>
              Raise · <span style={FONT_COURIER_NEW}>{eventName}</span>
            </>
          ) : (
            'Raise Event'
          )}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </FlowNodeFrame>
  )
}

export default EventRaiserNode
