import React from 'react';
import type { ActionNode, NodeEffectType, NodeCueMode } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes';
import { NODE_EFFECT_TYPES } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes';
import { createDefaultActionTiming } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes';
import ValueSourceEditor from '../shared/ValueSourceEditor';
import ActionTargetSection from './action-editors/ActionTargetSection';
import ActionColorFields from './action-editors/ActionColorFields';
import ActionEffectConfigs from './action-editors/ActionEffectConfigs';
import ActionTimingSection from './action-editors/ActionTimingSection';

interface ActionNodeEditorProps {
  node: ActionNode;
  activeMode: NodeCueMode;
  selectedActionHasEventParent: boolean;
  availableVariables: { name: string; type: string; scope: 'cue' | 'cue-group' }[];
  updateNode: (updates: Partial<ActionNode>) => void;
}

const ActionNodeEditor: React.FC<ActionNodeEditorProps> = ({
  node,
  activeMode,
  selectedActionHasEventParent,
  availableVariables,
  updateNode
}) => {
  const currentTiming = node.timing ?? createDefaultActionTiming();
  const updateTiming = (partial: Partial<ActionNode['timing']>) =>
    updateNode({
      timing: { ...currentTiming, ...partial }
    });

  const setEffectType = (v: NodeEffectType) => {
    if (v === 'chase') {
      updateNode({
        effectType: 'chase',
        config: {
          ...node.config,
          perLightOffsetMs: node.config?.perLightOffsetMs ?? 50,
          order: node.config?.order ?? 'linear'
        }
      });
    } else if (v === 'sweep') {
      updateNode({
        effectType: 'sweep',
        config: {
          ...node.config,
          sweepTime: 900,
          sweepFadeInDuration: 300,
          sweepFadeOutDuration: 600,
          sweepLightOverlap: 70,
          sweepBetweenDelay: 0,
          sweepDirection: 'forward'
        }
      });
    } else if (v === 'rotation') {
      updateNode({
        effectType: 'rotation',
        config: {
          ...node.config,
          rotationDirection: 'clockwise',
          beatsPerCycle: 1,
          startOffset: 0
        }
      });
    } else if (v === 'flash') {
      updateNode({
        effectType: 'flash',
        config: {
          ...node.config,
          holdTime: 100,
          flashDurationIn: 50,
          flashDurationOut: 100
        }
      });
    } else if (v === 'cycle') {
      updateNode({
        effectType: 'cycle',
        config: {
          ...node.config,
          cycleTransitionDuration: 100,
          cycleStepTrigger: 'beat',
          cycleBaseColor: 'transparent',
          cycleBaseBrightness: 'low'
        }
      });
    } else if (v === 'dual-mode-rotation') {
      updateNode({
        effectType: 'dual-mode-rotation',
        config: {
          ...node.config,
          beatsPerCycle: 2,
          dualModeSolidColor: 'green',
          dualModeSwitchCondition: 'measure',
          dualModeIsLargeVenue: true
        }
      });
    } else if (v === 'alternating-pattern') {
      updateNode({
        effectType: 'alternating-pattern',
        config: {
          ...node.config,
          switchCondition: 'keyframe',
          completeCondition: 'beat'
        }
      });
    } else {
      updateNode({ effectType: v });
    }
  };

  return (
    <div className="space-y-3 text-xs">
      <label className="flex flex-col font-medium">
        Effect Type
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.effectType}
          onChange={event => setEffectType(event.target.value as NodeEffectType)}
        >
          {NODE_EFFECT_TYPES.map(effect => (
            <option key={effect} value={effect}>
              {effect}
            </option>
          ))}
        </select>
      </label>

      <ActionTargetSection
        node={node}
        availableVariables={availableVariables}
        updateNode={updateNode}
      />

      <ActionColorFields
        node={node}
        availableVariables={availableVariables}
        updateNode={updateNode}
      />

      <ActionEffectConfigs
        node={node}
        activeMode={activeMode}
        availableVariables={availableVariables}
        updateNode={updateNode}
      />

      {node.effectType !== 'blackout' && (
        <ValueSourceEditor
          label="Layer"
          value={node.layer}
          onChange={next => updateNode({ layer: next })}
          expected="number"
          integerOnly={true}
          availableVariables={availableVariables}
        />
      )}

      <ActionTimingSection
        node={node}
        currentTiming={currentTiming}
        updateTiming={updateTiming}
        activeMode={activeMode}
        selectedActionHasEventParent={selectedActionHasEventParent}
        availableVariables={availableVariables}
      />
    </div>
  );
};

export default ActionNodeEditor;
