import React from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { EditorNodeData } from '../../lib/types';

const EffectRaiserNode: React.FC<NodeProps<EditorNodeData>> = ({ data, selected }) => {
  if (data.kind !== 'effect-raiser') return null;
  const raiserPayload = data.payload as { effectId: string };
  // Use effectName from data (looked up in cueTransforms) or fall back to showing placeholder
  const effectName = (data as any).effectName || '(select effect)';
  const selectedStyles = selected ? 'shadow-[0_0_18px_16px_rgba(59,130,246,0.8)] ring-[5px] ring-blue-400' : '';
  
  return (
    <div className={`px-3 py-2 rounded-lg border-2 border-cyan-400 bg-cyan-50 dark:bg-cyan-900/40 text-xs shadow-sm min-w-[140px] ${selectedStyles}`}>
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-1 font-semibold text-cyan-800 dark:text-cyan-100">
        <span role="img" aria-label="raise effect">✨</span>
        <span>{raiserPayload.effectId ? `Effect · ${effectName}` : 'Raise Effect'}</span>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

export default EffectRaiserNode;
