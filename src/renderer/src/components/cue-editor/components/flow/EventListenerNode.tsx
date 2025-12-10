import React from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { EditorNodeData } from '../../lib/types';

const EventListenerNode: React.FC<NodeProps<EditorNodeData>> = ({ data }) => {
  if (data.kind !== 'event-listener') return null;
  const listenerPayload = data.payload as { eventName: string };
  const eventName = listenerPayload.eventName || '(select event)';
  
  return (
    <div className="px-3 py-2 rounded-lg border-2 border-purple-400 bg-purple-50 dark:bg-purple-900/40 text-xs shadow-sm min-w-[140px]">
      <div className="flex items-center gap-1 font-semibold text-purple-800 dark:text-purple-100">
        <span role="img" aria-label="listen event">👂</span>
        <span>{listenerPayload.eventName ? `Listen · ${eventName}` : 'Listen Event'}</span>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

export default EventListenerNode;
