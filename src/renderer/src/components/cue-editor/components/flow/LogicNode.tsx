import React from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { EditorNodeData } from '../../lib/types';
import type { LogicNode, ValueSource } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes';

const formatValueSource = (value?: ValueSource): string => {
  if (!value) return '';
  if (value.source === 'literal') {
    return `${value.value}`;
  }
  const fallback = value.fallback !== undefined ? ` ?? ${value.fallback}` : '';
  return `${value.name}${fallback}`;
};

const LogicNodeComponent: React.FC<NodeProps<EditorNodeData>> = ({ data }) => {
  if (data.kind !== 'logic') return null;
  const logic = data.payload as LogicNode | any;
  const logicType = (logic as any)?.logicType as string | undefined;
  if (!logicType) return null;

  const renderDetails = () => {
    if (logicType === 'variable') {
      const valueText = formatValueSource(logic.value);
      const base = `${(logic.mode as string).toUpperCase()} ${logic.varName}`;
      return valueText ? `${base} = ${valueText}` : base;
    }
    if (logicType === 'math') {
      return `${(logic.operator as string).toUpperCase()}`;
    }
    if (logicType === 'conditional') {
      const left = formatValueSource(logic.left);
      const right = formatValueSource(logic.right);
      return `IF ${left} ${logic.comparator} ${right}`;
    }
    return logicType;
  };

  const isConditional = logicType === 'conditional';

  return (
    <div className="px-3 py-2 rounded-lg border-2 border-amber-400 bg-amber-50 dark:bg-amber-900/30 text-xs shadow-sm min-w-[150px]">
      <Handle type="target" position={Position.Top} />
      <div className="font-semibold text-amber-800 dark:text-amber-100 text-center">{data.label}</div>
      <div className="text-[11px] text-amber-900 dark:text-amber-50 opacity-90 text-center">{renderDetails()}</div>
      {isConditional ? (
        <div className="relative mt-5 h-2">
          <span className="absolute left-[25%] -top-3 translate-x-[-50%] text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-100">
            true
          </span>
          <span className="absolute left-[75%] -top-3 translate-x-[-50%] text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-100">
            false
          </span>
          <Handle type="source" id="true" position={Position.Bottom} style={{ left: '25%' }} />
          <Handle type="source" id="false" position={Position.Bottom} style={{ left: '75%' }} />
        </div>
      ) : (
        <Handle type="source" position={Position.Bottom} />
      )}
    </div>
  );
};

export default LogicNodeComponent;
