import React from 'react';
import type { EffectRaiserNode, EffectDefinition } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes';
import ValueSourceEditor from '../shared/ValueSourceEditor';

interface EffectRaiserEditorProps {
  node: EffectRaiserNode;
  availableEffects: { id: string; name: string; definition?: EffectDefinition }[];
  availableVariables: { name: string; type: string; scope: 'cue' | 'cue-group' }[];
  updateNode: (updates: Partial<EffectRaiserNode>) => void;
}

const EffectRaiserEditor: React.FC<EffectRaiserEditorProps> = ({
  node,
  availableEffects,
  availableVariables,
  updateNode
}) => {
  const selectedEffect = availableEffects.find(e => e.id === node.effectId);
  const parameterVars = selectedEffect?.definition?.variables?.filter(v => v.isParameter) ?? [];

  return (
    <div className="space-y-2 text-xs">
      <label className="flex flex-col font-medium">
        Select Effect
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.effectId || ''}
          onChange={event => updateNode({ effectId: event.target.value })}
        >
          <option value="">-- Choose an effect --</option>
          {availableEffects.map(effect => (
            <option key={effect.id} value={effect.id}>
              {effect.name}
            </option>
          ))}
        </select>
      </label>
      {availableEffects.length === 0 && (
        <p className="text-[10px] text-amber-600 dark:text-amber-400">
          No effects imported. Go to the Effects tab to import effects.
        </p>
      )}
      <p className="text-[10px] text-gray-500">
        Triggers the selected effect. Configure parameter values below.
      </p>

      {/* Parameter Values Configuration */}
      {parameterVars.length === 0 ? (
        <div className="mt-3 p-2 bg-gray-50 dark:bg-gray-800 rounded text-[10px] text-gray-500">
          This effect has no parameters defined.
        </div>
      ) : (
        <div className="mt-3 space-y-2 border-t pt-2">
          <div className="font-semibold text-xs">Parameter Values</div>
          {parameterVars.map(param => {
            const currentValue = node.parameterValues?.[param.name];
            const integerOnly = param.type === 'number' && param.name === 'paramLayer';
            return (
              <div key={param.name} className="space-y-1">
                <ValueSourceEditor
                  label={`${param.name} (${param.type})`}
                  value={currentValue}
                  onChange={(newValue) => {
                    const updatedValues = { ...(node.parameterValues ?? {}) };
                    updatedValues[param.name] = newValue;
                    updateNode({ parameterValues: updatedValues });
                  }}
                  expected={param.type as 'number' | 'boolean' | 'string' | 'color' | 'cue-type' | 'light-array' | 'event'}
                  integerOnly={integerOnly}
                  availableVariables={availableVariables}
                />
                {param.description && (
                  <div className="text-[10px] text-gray-500 italic">{param.description}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default EffectRaiserEditor;
