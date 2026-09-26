import React from 'react'
import KnownValueSelect from '../shared/KnownValueSelect'
import type { EventRaiserNode } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'

interface EventRaiserEditorProps {
  node: EventRaiserNode
  availableEvents: string[]
  updateNode: (updates: Partial<EventRaiserNode>) => void
}

const EventRaiserEditor: React.FC<EventRaiserEditorProps> = ({
  node,
  availableEvents,
  updateNode,
}) => {
  return (
    <div className="space-y-2 text-xs">
      <KnownValueSelect
        label="Event Name"
        value={node.eventName}
        options={availableEvents.map((eventName) => ({ value: eventName, label: eventName }))}
        onChange={(eventName) => updateNode({ eventName })}
        placeholder="-- Select Event --"
      />
      <p className="text-[10px] text-gray-500">
        Raises the selected event when this node is triggered. Execution continues immediately to
        the next node while listeners run in parallel.
      </p>
    </div>
  )
}

export default EventRaiserEditor
