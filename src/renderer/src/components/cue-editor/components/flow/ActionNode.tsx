import React from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { EditorNodeData } from '../../lib/types';
import { getConditionLabel, getTextColorForBg } from '../../lib/cueUtils';
import type { ActionNode as ActionPayload, ValueSource } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes';

// Helper to display ValueSource as text
const displayValueSource = (vs: ValueSource | undefined, defaultValue: string = ''): string => {
  if (!vs) return defaultValue;
  if (vs.source === 'literal') {
    return String(vs.value ?? defaultValue);
  }
  return `$${vs.name}`;
};

const ActionNode: React.FC<NodeProps<EditorNodeData>> = ({ data }) => {
  const action = data.payload as ActionPayload;
  
  // Handle color which is now ValueSource
  const colorValue = action.color?.name;
  const colorName = colorValue?.source === 'literal' ? String(colorValue.value) : 'gray';
  const textColor = getTextColorForBg(colorName);
  
  // Handle timing values which are now ValueSource
  const waitForTime = action.timing?.waitForTime;
  const waitForTimeValue = waitForTime?.source === 'literal' ? Number(waitForTime.value) : 0;
  const waitUntilTime = action.timing?.waitUntilTime;
  const waitUntilTimeValue = waitUntilTime?.source === 'literal' ? Number(waitUntilTime.value) : 0;
  const duration = action.timing?.duration;
  const durationValue = duration?.source === 'literal' ? Number(duration.value) : 0;
  
  const waitFor = getConditionLabel(action.timing?.waitForCondition ?? 'none', waitForTimeValue);
  const waitUntil = getConditionLabel(action.timing?.waitUntilCondition ?? 'none', waitUntilTimeValue);
  
  // Handle target groups and filter which are now ValueSource
  const groupsText = displayValueSource(action.target.groups, 'front');
  const filterText = displayValueSource(action.target.filter, 'all');
  const targetText = `${groupsText} | ${filterText}`;
  const durationText = `(${durationValue}ms)`;

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
