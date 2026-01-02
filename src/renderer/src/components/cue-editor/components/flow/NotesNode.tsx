import React from 'react';
import { type NodeProps } from 'reactflow';
import type { EditorNodeData } from '../../lib/types';

const NotesNode: React.FC<NodeProps<EditorNodeData>> = ({ data, selected }) => {
  if (data.kind !== 'notes') return null;
  const notesPayload = data.payload as { title?: string; note: string };
  const title = notesPayload.title || '';
  const note = notesPayload.note || '(empty note)';
  const selectedStyles = selected ? 'shadow-[0_0_18px_16px_rgba(59,130,246,0.8)] ring-[5px] ring-blue-400' : '';
  
  return (
    <div 
      className={`px-3 py-2.5 rounded-sm bg-yellow-200 dark:bg-yellow-300 text-xs shadow-lg min-w-[320px] max-w-[440px] transform rotate-[-1.5deg] ${selectedStyles}`}
      style={{
        boxShadow: selected 
          ? '0 0 18px 16px rgba(59,130,246,0.8), 0 2px 8px rgba(0,0,0,0.15)' 
          : '0 2px 8px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.1)',
        height: 'auto',
        minHeight: title ? '60px' : '50px'
      }}
    >
      {title && (
        <div className="font-bold text-yellow-900 dark:text-yellow-950 mb-1.5 border-b border-yellow-400 dark:border-yellow-500 pb-1 text-[11px]">
          {title}
        </div>
      )}
      <div className="text-yellow-900 dark:text-yellow-950 text-[11px] break-words leading-relaxed whitespace-pre-wrap">
        {note}
      </div>
    </div>
  );
};

export default NotesNode;

