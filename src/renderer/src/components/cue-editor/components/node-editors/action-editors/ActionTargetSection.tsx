import React from 'react';
import type { ActionNode } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes';
import { LIGHT_TARGET_OPTIONS } from '../../../../../../../photonics-dmx/constants/options';
import ValueSourceEditor from '../../shared/ValueSourceEditor';
import TargetGroupsMultiSelectEditor from '../../shared/TargetGroupsMultiSelectEditor';

type ActionTargetSectionProps = {
  node: ActionNode;
  availableVariables: { name: string; type: string; scope: 'cue' | 'cue-group' }[];
  updateNode: (updates: Partial<ActionNode>) => void;
};

const ActionTargetSection: React.FC<ActionTargetSectionProps> = ({
  node,
  availableVariables,
  updateNode
}) => {
  if (node.effectType === 'blackout') return null;
  return (
    <>
      <TargetGroupsMultiSelectEditor
        label="Target Groups"
        value={node.target.groups}
        onChange={next =>
          updateNode({
            target: { ...node.target, groups: next }
          })
        }
        availableVariables={availableVariables}
      />
      <ValueSourceEditor
        label="Target Filter"
        value={node.target.filter}
        onChange={next =>
          updateNode({
            target: { ...node.target, filter: next }
          })
        }
        expected="string"
        validLiterals={LIGHT_TARGET_OPTIONS}
        availableVariables={availableVariables}
      />
    </>
  );
};

export default ActionTargetSection;
