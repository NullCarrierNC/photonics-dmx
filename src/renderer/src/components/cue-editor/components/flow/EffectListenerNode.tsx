import React from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { EditorNodeData } from '../../lib/types';

const EffectListenerNode: React.FC<NodeProps<EditorNodeData>> = ({ data, selected }) => {
  if (data.kind !== 'effect-listener') return null;
  const selectedStyles = selected ? 'shadow-[0_0_24px_8px_rgba(59,130,246,0.8)] ring-4 ring-blue-400' : '';
  
  return (
    <div className={`px-3 py-2 rounded-lg border-2 border-cyan-500 bg-cyan-100 dark:bg-cyan-800/60 text-xs shadow-sm min-w-[160px] ${selectedStyles}`}>
      <div className="flex items-center gap-1 font-bold text-cyan-900 dark:text-cyan-50 mb-1">
        <span role="img" aria-label="effect entry">🎯</span>
        <span>Effect Listener</span>
      </div>
      <div className="text-[10px] text-cyan-700 dark:text-cyan-200 italic">
        Entry point
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

export default EffectListenerNode;
