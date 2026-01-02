import React from 'react';
import type { EventRaiserNode } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes';

interface EventRaiserEditorProps {
  node: EventRaiserNode;
  availableEvents: string[];
  updateNode: (updates: Partial<EventRaiserNode>) => void;
}

const EventRaiserEditor: React.FC<EventRaiserEditorProps> = ({
  node,
  availableEvents,
  updateNode
}) => {
  return (
    <div className="space-y-2 text-xs">
      <label className="flex flex-col font-medium">
        Event Name
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.eventName}
          onChange={event => updateNode({ eventName: event.target.value })}
        >
          <option value="">-- Select Event --</option>
          {availableEvents.map(eventName => (
            <option key={eventName} value={eventName}>{eventName}</option>
          ))}
        </select>
      </label>
      <p className="text-[10px] text-gray-500">
        Raises the selected event when this node is triggered. Execution continues immediately to the next node while listeners run in parallel.
      </p>
    </div>
  );
};

export default EventRaiserEditor;
