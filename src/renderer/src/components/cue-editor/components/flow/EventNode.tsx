import React from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import type { EditorNodeData } from '../../lib/types'
import { FONT_COURIER_NEW } from '../../lib/styles'
import FlowNodeFrame from './FlowNodeFrame'
import type { AudioTriggerNode } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'

function isAudioTriggerNode(payload: EditorNodeData['payload']): payload is AudioTriggerNode {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'eventType' in payload &&
    (payload as { eventType: string }).eventType === 'audio-trigger'
  )
}

const EventNode: React.FC<NodeProps<EditorNodeData>> = ({ id, data, selected }) => {
  if (data.kind !== 'event') return null
  const eventPayload = data.payload as {
    eventType: string
    frequencyRange?: { minHz: number; maxHz: number }
    nodeLabel?: string
    color?: string
  }
  const eventType = eventPayload.eventType
  const isTrigger = isAudioTriggerNode(data.payload)
  const trigger = isTrigger ? (data.payload as AudioTriggerNode) : null

  const selectedStyles = selected
    ? 'shadow-[0_0_18px_16px_rgba(59,130,246,0.8)] ring-[5px] ring-blue-400'
    : ''
  const baseClasses = 'px-3 py-2 rounded-lg border-2 text-xs shadow-sm min-w-[140px]'
  const defaultClasses = trigger ? '' : ' border-blue-400 bg-blue-50 dark:bg-blue-900/40'
  const bgStyle = trigger?.color
    ? { borderColor: trigger.color, backgroundColor: `${trigger.color}18` }
    : undefined

  return (
    <FlowNodeFrame
      id={id}
      className={`${baseClasses}${defaultClasses} ${selectedStyles}`}
      style={bgStyle}>
      <div
        className={`flex flex-col gap-0.5 font-semibold ${!trigger ? 'text-blue-800 dark:text-blue-100' : ''}`}
        style={trigger?.color ? { color: trigger.color } : undefined}>
        <span className="flex items-center gap-1">
          <span role="img" aria-label="event">
            ⚡
          </span>
          <span>{trigger ? trigger.nodeLabel : `Event · ${eventType}`}</span>
        </span>
        {trigger?.frequencyRange && (
          <span className="text-[10px] font-normal opacity-90" style={FONT_COURIER_NEW}>
            {trigger.frequencyRange.minHz} – {trigger.frequencyRange.maxHz} Hz
          </span>
        )}
      </div>
      {trigger ? (
        <div className="relative mt-5 h-2 w-full">
          {(['enter', 'during', 'exit'] as const).map((port, i) => (
            <React.Fragment key={port}>
              <span
                className={`absolute -top-3 translate-x-[-50%] text-[8px] font-semibold uppercase text-amber-700 dark:text-amber-100`}
                style={{ left: `${[16, 50, 84][i]}%` }}>
                {port}
              </span>
              <Handle
                type="source"
                id={port}
                position={Position.Bottom}
                style={{ left: `${[16, 50, 84][i]}%`, transform: 'translateX(-50%)' }}
              />
            </React.Fragment>
          ))}
        </div>
      ) : (
        <Handle type="source" position={Position.Bottom} />
      )}
    </FlowNodeFrame>
  )
}

export default EventNode
