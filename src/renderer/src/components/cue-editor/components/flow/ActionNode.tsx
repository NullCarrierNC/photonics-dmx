import React from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { EditorNodeData } from '../../lib/types';
import { getConditionLabel, getTextColorForBg, displayValueSource } from '../../lib/cueUtils';
import { FONT_COURIER_NEW } from '../../lib/styles';
import type { ActionNode as ActionPayload, ValueSource } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes';

const ActionNode: React.FC<NodeProps<EditorNodeData>> = ({ data, selected }) => {
  const action = data.payload as ActionPayload;
  
  // Handle color which is now ValueSource
  const colorValue = action.color?.name;
  const isColorVariable = colorValue?.source === 'variable';
  const colorName = colorValue?.source === 'literal' ? String(colorValue.value) : 'white';
  const colorVarName = isColorVariable ? colorValue.name : null;
  const textColor = isColorVariable ? '#333' : getTextColorForBg(colorName);
  
  // Handle timing values which are now ValueSource
  const waitForTime = action.timing?.waitForTime;
  const waitUntilTime = action.timing?.waitUntilTime;
  const duration = action.timing?.duration;
  const durationValue = duration?.source === 'literal' ? Number(duration.value) : 0;

  const waitFor = getConditionLabel(action.timing?.waitForCondition ?? 'none', waitForTime);
  const waitUntil = getConditionLabel(action.timing?.waitUntilCondition ?? 'none', waitUntilTime);
  
  // Handle brightness, target groups, and filter which are now ValueSource
  const brightnessValue = action.color?.brightness;
  const brightnessText = displayValueSource(brightnessValue, 'high');
  const groupsText = displayValueSource(action.target.groups, 'front');
  const filterText = displayValueSource(action.target.filter, 'all');
  const targetText = `${brightnessText} | ${groupsText} | ${filterText}`;
  const durationText = `(${durationValue}ms)`;

  // Convert brightness to CSS filter brightness value
  // Brightness values: low (40/255≈0.16), medium (100/255≈0.39), high (180/255≈0.71), max (255/255=1.0)
  // Using more visible values for UI: low=0.4, medium=0.6, high=0.8, max=1.0
  const getBrightnessFilter = (brightness: ValueSource | undefined): string => {
    if (!brightness || brightness.source !== 'literal') {
      return 'brightness(1.0)'; // Default to max if variable or undefined
    }
    const brightnessStr = String(brightness.value).toLowerCase();
    const brightnessMap: Record<string, string> = {
      'low': 'brightness(0.4)',
      'medium': 'brightness(0.6)',
      'high': 'brightness(0.8)',
      'max': 'brightness(1.0)'
    };
    return brightnessMap[brightnessStr] || 'brightness(1.0)';
  };

  const layerValue = (action.effectType === 'set-color' || action.effectType === 'chase')
    ? displayValueSource(action.layer, '0')
    : null;
  const baseLabel = data.label;
  const selectedStyles = selected ? 'shadow-[0_0_18px_16px_rgba(59,130,246,0.8)] ring-[5px] ring-blue-400' : '';

  // When transparent is selected, use semi-transparent black (50%) for the node UI so it remains visible
  const bgColorForNode = colorName === 'transparent' ? 'rgba(0,0,0,0.5)' : colorName;
  const textColorForNode = colorName === 'transparent' ? '#f9fafb' : textColor;

  return (
    <div
      className={`px-3 py-2 rounded-lg border text-xs shadow-sm min-w-[160px] relative ${selectedStyles}`}
      style={{
        borderColor: isColorVariable ? '#666' : 'rgba(0,0,0,0.15)',
        borderStyle: isColorVariable ? 'dashed' : 'solid',
        borderWidth: isColorVariable ? '2px' : '1px',
        color: textColorForNode
      }}
    >
      {/* Background layer with brightness filter (omit filter when transparent substitute is used) */}
      <div
        className="absolute inset-0 rounded-lg -z-10"
        style={{
          backgroundColor: bgColorForNode,
          filter: colorName === 'transparent' ? 'none' : getBrightnessFilter(brightnessValue)
        }}
      />
      <Handle type="target" position={Position.Top} />
      <div className="text-[11px] opacity-90">Wait for: <span style={FONT_COURIER_NEW}>{waitFor}</span></div>
      <div className="font-semibold text-sm text-center">
        {baseLabel}
        {layerValue != null ? <> (Layer: <span style={FONT_COURIER_NEW}>{layerValue}</span>)</> : null}
        {colorVarName ? <> (<span style={FONT_COURIER_NEW}>{colorVarName}</span>)</> : null}
      </div>
      <div className="text-[11px] opacity-90 text-center"><span style={FONT_COURIER_NEW}>{targetText} {durationText}</span></div>
      <div className="text-[11px] opacity-90">Wait until: <span style={FONT_COURIER_NEW}>{waitUntil}</span></div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

export default ActionNode;
