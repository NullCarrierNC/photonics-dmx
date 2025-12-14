import React from 'react';
import type { YargEffectDefinition, AudioEffectDefinition } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes';

interface EffectListenerEditorProps {
  currentEffect: YargEffectDefinition | AudioEffectDefinition | null;
}

const EffectListenerEditor: React.FC<EffectListenerEditorProps> = ({ currentEffect }) => {
  if (!currentEffect || !currentEffect.variables) {
    return null;
  }

  const parameterVars = currentEffect.variables.filter(v => v.isParameter);

  if (parameterVars.length === 0) {
    return (
      <div className="space-y-3 text-xs">
        <div className="font-semibold text-cyan-700 dark:text-cyan-300">
          Effect Entry Point
        </div>
        <div className="space-y-2">
          <p className="text-gray-600 dark:text-gray-400">
            This effect has no parameters defined.
          </p>
          <p className="text-[10px] text-gray-500">
            Add variables and toggle "Is Parameter" in the Variables tab to accept inputs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-xs">
      <div className="font-semibold text-cyan-700 dark:text-cyan-300">
        Effect Entry Point
      </div>
      <div className="space-y-2">
        <div className="text-xs font-medium">Effect Parameters</div>
        <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded space-y-1">
          {parameterVars.map(param => (
            <div key={param.name} className="text-[10px]">
              <span className="font-mono font-semibold text-purple-700 dark:text-purple-300">
                {param.name}
              </span>
              <span className="text-gray-500"> ({param.type})</span>
              {param.description && (
                <div className="text-gray-500 italic ml-2">{param.description}</div>
              )}
            </div>
          ))}
        </div>
        <p className="text-[10px] text-gray-500">
          These parameters are automatically mapped to effect variables when the effect is triggered.
          Default: {parameterVars.map(p => `${p.name}=${JSON.stringify(p.initialValue)}`).join(', ')}
        </p>
      </div>
    </div>
  );
};

export default EffectListenerEditor;
