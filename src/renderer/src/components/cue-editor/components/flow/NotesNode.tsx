import React from 'react';
import { type NodeProps } from 'reactflow';
import type { EditorNodeData } from '../../lib/types';

const NotesNode: React.FC<NodeProps<EditorNodeData>> = ({ data, selected }) => {
  if (data.kind !== 'notes') return null;
  const notesPayload = data.payload as { title?: string; note: string; style?: 'notes' | 'info' | 'important' };
  const title = notesPayload.title || '';
  const note = notesPayload.note || '(empty note)';
  const selectedStyles = selected ? 'shadow-[0_0_18px_16px_rgba(59,130,246,0.8)] ring-[5px] ring-blue-400' : '';
  const variant = notesPayload.style ?? 'notes';
  const isInfo = variant === 'info';
  const isImportant = variant === 'important';
  const containerClasses = isImportant
    ? 'bg-red-400 dark:bg-red-500 text-red-950 dark:text-red-950'
    : isInfo
      ? 'bg-blue-400 dark:bg-blue-500 text-blue-950 dark:text-blue-950'
      : 'bg-yellow-200 dark:bg-yellow-300 text-yellow-900 dark:text-yellow-950';
  const titleClasses = isImportant
    ? 'border-red-300 dark:border-red-700'
    : isInfo
      ? 'border-blue-300 dark:border-blue-700'
      : 'border-yellow-400 dark:border-yellow-500';
  
  return (
    <div 
      className={`px-3 py-2.5 rounded-sm text-xs shadow-lg min-w-[320px] max-w-[440px] transform rotate-[-1.5deg] ${containerClasses} ${selectedStyles}`}
      style={{
        boxShadow: selected 
          ? '0 0 18px 16px rgba(59,130,246,0.8), 0 2px 8px rgba(0,0,0,0.15)' 
          : '0 2px 8px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.1)',
        height: 'auto',
        minHeight: title ? '60px' : '50px'
      }}
    >
      {title && (
        <div className={`font-bold mb-1.5 border-b pb-1 text-[11px] ${titleClasses}`}>
          {title}
        </div>
      )}
      <div className="text-[11px] break-words leading-relaxed whitespace-pre-wrap">
        {note}
      </div>
    </div>
  );
};

export default NotesNode;

