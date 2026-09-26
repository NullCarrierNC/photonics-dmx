import React from 'react'
import KnownValueSelect from '../shared/KnownValueSelect'
import type { EventListenerNode } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'

interface EventListenerEditorProps {
  node: EventListenerNode
  availableEvents: string[]
  updateNode: (updates: Partial<EventListenerNode>) => void
}

const EventListenerEditor: React.FC<EventListenerEditorProps> = ({
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
        Listens for the selected event. When the event is raised, this listener executes its child
        node chain.
      </p>
    </div>
  )
}

export default EventListenerEditor
