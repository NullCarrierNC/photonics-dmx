import React from 'react'
import type {
  LogicNode,
  VariableLogicNode,
  MathLogicNode,
  ConditionalLogicNode,
  CueDataLogicNode,
  ConfigDataLogicNode,
  LightsFromIndexLogicNode,
  ArrayLengthLogicNode,
  ReverseLightsLogicNode,
  CreatePairsLogicNode,
  ConcatLightsLogicNode,
  DebuggerLogicNode,
  DelayLogicNode,
  RandomLogicNode,
  ShuffleLightsLogicNode,
  ForEachLightLogicNode,
} from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { NodeCueMode } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'

import VariableLogicEditor from './logic/VariableLogicEditor'
import MathLogicEditor from './logic/MathLogicEditor'
import CueDataLogicEditor from './logic/CueDataLogicEditor'
import ConfigDataLogicEditor from './logic/ConfigDataLogicEditor'
import ConditionalLogicEditor from './logic/ConditionalLogicEditor'
import LightsFromIndexLogicEditor from './logic/LightsFromIndexLogicEditor'
import ArrayLengthLogicEditor from './logic/ArrayLengthLogicEditor'
import ReverseLightsLogicEditor from './logic/ReverseLightsLogicEditor'
import CreatePairsLogicEditor from './logic/CreatePairsLogicEditor'
import ConcatLightsLogicEditor from './logic/ConcatLightsLogicEditor'
import DelayLogicEditor from './logic/DelayLogicEditor'
import RandomLogicEditor from './logic/RandomLogicEditor'
import ShuffleLightsLogicEditor from './logic/ShuffleLightsLogicEditor'
import ForEachLightLogicEditor from './logic/ForEachLightLogicEditor'
import DebuggerLogicEditor from './logic/DebuggerLogicEditor'

export interface LogicNodeEditorProps {
  node: LogicNode
  activeMode: NodeCueMode
  availableVariables: {
    name: string
    type: string
    scope: 'cue' | 'cue-group'
    validValues?: string[]
  }[]
  updateNode: (updates: Partial<LogicNode>) => void
  onSyncVariableValidValues?: (
    varName: string,
    scope: 'cue' | 'cue-group',
    validValues: string[],
  ) => void
}

const LogicNodeEditor: React.FC<LogicNodeEditorProps> = ({
  node,
  activeMode,
  availableVariables,
  updateNode,
  onSyncVariableValidValues,
}) => {
  if (node.logicType === 'variable') {
    return (
      <VariableLogicEditor
        node={node as VariableLogicNode}
        activeMode={activeMode}
        availableVariables={availableVariables}
        updateNode={updateNode}
      />
    )
  }

  if (node.logicType === 'math') {
    return (
      <MathLogicEditor
        node={node as MathLogicNode}
        availableVariables={availableVariables}
        updateNode={updateNode}
      />
    )
  }

  if (node.logicType === 'cue-data') {
    return (
      <CueDataLogicEditor
        node={node as CueDataLogicNode}
        activeMode={activeMode}
        availableVariables={availableVariables}
        updateNode={updateNode}
        onSyncVariableValidValues={onSyncVariableValidValues}
      />
    )
  }

  if (node.logicType === 'config-data') {
    return (
      <ConfigDataLogicEditor
        node={node as ConfigDataLogicNode}
        availableVariables={availableVariables}
        updateNode={updateNode}
      />
    )
  }

  if (node.logicType === 'lights-from-index') {
    return (
      <LightsFromIndexLogicEditor
        node={node as LightsFromIndexLogicNode}
        availableVariables={availableVariables}
        updateNode={updateNode}
      />
    )
  }

  if (node.logicType === 'conditional') {
    return (
      <ConditionalLogicEditor
        node={node as ConditionalLogicNode}
        availableVariables={availableVariables}
        updateNode={updateNode}
      />
    )
  }

  if (node.logicType === 'array-length') {
    return (
      <ArrayLengthLogicEditor
        node={node as ArrayLengthLogicNode}
        availableVariables={availableVariables}
        updateNode={updateNode}
      />
    )
  }

  if (node.logicType === 'reverse-lights') {
    return (
      <ReverseLightsLogicEditor
        node={node as ReverseLightsLogicNode}
        availableVariables={availableVariables}
        updateNode={updateNode}
      />
    )
  }

  if (node.logicType === 'create-pairs') {
    return (
      <CreatePairsLogicEditor
        node={node as CreatePairsLogicNode}
        availableVariables={availableVariables}
        updateNode={updateNode}
      />
    )
  }

  if (node.logicType === 'concat-lights') {
    return (
      <ConcatLightsLogicEditor
        node={node as ConcatLightsLogicNode}
        availableVariables={availableVariables}
        updateNode={updateNode}
      />
    )
  }

  if (node.logicType === 'delay') {
    return (
      <DelayLogicEditor
        node={node as DelayLogicNode}
        availableVariables={availableVariables}
        updateNode={updateNode}
      />
    )
  }

  if (node.logicType === 'random') {
    return (
      <RandomLogicEditor
        node={node as RandomLogicNode}
        availableVariables={availableVariables}
        updateNode={updateNode}
      />
    )
  }

  if (node.logicType === 'shuffle-lights') {
    return (
      <ShuffleLightsLogicEditor
        node={node as ShuffleLightsLogicNode}
        availableVariables={availableVariables}
        updateNode={updateNode}
      />
    )
  }

  if (node.logicType === 'for-each-light') {
    return (
      <ForEachLightLogicEditor
        node={node as ForEachLightLogicNode}
        availableVariables={availableVariables}
        updateNode={updateNode}
      />
    )
  }

  if (node.logicType === 'debugger') {
    return (
      <DebuggerLogicEditor
        node={node as DebuggerLogicNode}
        availableVariables={availableVariables}
        updateNode={updateNode}
      />
    )
  }

  return <div className="text-xs text-gray-500">Unknown logic node type</div>
}

export default LogicNodeEditor
