import React from 'react'
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
      <label className="flex flex-col font-medium">
        Event Name
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.eventName}
          onChange={(event) => updateNode({ eventName: event.target.value })}>
          <option value="">-- Select Event --</option>
          {availableEvents.map((eventName) => (
            <option key={eventName} value={eventName}>
              {eventName}
            </option>
          ))}
        </select>
      </label>
      <p className="text-[10px] text-gray-500">
        Listens for the selected event. When the event is raised, this listener executes its child
        node chain.
      </p>
    </div>
  )
}

export default EventListenerEditor
