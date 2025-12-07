import React from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { EditorNodeData } from '../../lib/types';
import { getConditionLabel, getTextColorForBg } from '../../lib/cueUtils';
import type { ActionNode as ActionPayload } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes';

const ActionNode: React.FC<NodeProps<EditorNodeData>> = ({ data }) => {
  const action = data.payload as ActionPayload;
  const colorName = action.color?.name ?? 'gray';
  const textColor = getTextColorForBg(colorName);
  const waitFor = getConditionLabel(action.timing?.waitForCondition ?? 'none', action.timing?.waitForTime);
  const waitUntil = getConditionLabel(action.timing?.waitUntilCondition ?? 'none', action.timing?.waitUntilTime);
  const targetText = `${(action.target.groups ?? []).join(', ')} | ${action.target.filter}`;
  const durationText = `(${action.timing?.duration ?? 0}ms)`;

  return (
    <div
      className="px-3 py-2 rounded-lg border text-xs shadow-sm min-w-[160px]"
      style={{
        backgroundColor: colorName,
        borderColor: 'rgba(0,0,0,0.15)',
        color: textColor
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div className="text-[11px] opacity-90">Wait for: {waitFor}</div>
      <div className="font-semibold text-sm text-center">{data.label}</div>
      <div className="text-[11px] opacity-90 text-center">{targetText} {durationText}</div>
      <div className="text-[11px] opacity-90">Wait until: {waitUntil}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

export default ActionNode;
