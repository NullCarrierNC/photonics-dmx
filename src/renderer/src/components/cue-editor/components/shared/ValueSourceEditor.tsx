import React from 'react';
import type { ValueSource } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes';
import { isVariableSource } from './nodeEditorUtils';

interface ValueSourceEditorProps {
  label: string;
  value: ValueSource | undefined;
  onChange: (next: ValueSource) => void;
  expected?: 'number' | 'boolean' | 'string' | 'either';
  validLiterals?: string[];
  availableVariables: { name: string; type: string; scope: 'cue' | 'cue-group' }[];
}

const ValueSourceEditor: React.FC<ValueSourceEditorProps> = ({
  label,
  value,
  onChange,
  expected = 'either',
  validLiterals,
  availableVariables
}) => {
  const source = value ?? { 
    source: 'literal', 
    value: expected === 'boolean' ? false : expected === 'string' ? '' : 0 
  };
  const isLiteral = source.source === 'literal';
  const isBoolean = expected === 'boolean';
  const isString = expected === 'string';

  const handleToggleVar = (checked: boolean) => {
    if (checked) {
      // Switch to variable mode
      onChange({ 
        source: 'variable', 
        name: isVariableSource(source) ? (source.name ?? 'var1') : 'var1', 
        fallback: isVariableSource(source) ? source.fallback : undefined 
      });
    } else {
      // Switch to literal mode
      const defaultValue = isBoolean ? false : isString ? (validLiterals?.[0] ?? '') : 0;
      onChange({ source: 'literal', value: defaultValue });
    }
  };

  return (
    <div className="space-y-1">
      <label className="flex flex-col font-medium text-xs">
        {label}
      </label>
      {isLiteral ? (
        // Literal mode: switch and value on same line
        <div className="flex items-center gap-2 mt-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-gray-600 dark:text-gray-400">Variable</span>
            <input
              type="checkbox"
              checked={!isLiteral}
              onChange={(e) => handleToggleVar(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-600 dark:bg-gray-700"
            />
          </label>
          <div className="flex-1">
            {isBoolean ? (
              <select
                className="w-full rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                value={source.value === true ? 'true' : 'false'}
                onChange={event => onChange({ ...source, value: event.target.value === 'true' })}
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : validLiterals ? (
              // Show dropdown for constrained literals (e.g., colours, brightness levels)
              <select
                className="w-full rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                value={String(source.value)}
                onChange={event => onChange({ ...source, value: event.target.value })}
              >
                {validLiterals.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
              <input
                type={isString ? 'text' : 'number'}
                step={isString ? undefined : "0.1"}
                className="w-full rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                value={isString ? String(source.value ?? '') : (typeof source.value === 'number' ? source.value : 0)}
                onChange={event => {
                  const newValue = isString ? event.target.value : Number(event.target.value);
                  onChange({ ...source, value: newValue });
                }}
              />
            )}
          </div>
        </div>
      ) : (
        // Variable mode: switch on top, variable dropdown and fallback below
        <div className="space-y-2 mt-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-gray-600 dark:text-gray-400">Variable</span>
            <input
              type="checkbox"
              checked={!isLiteral}
              onChange={(e) => handleToggleVar(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-600 dark:bg-gray-700"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col font-medium text-xs">
              Variable
              <select
                className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                value={isVariableSource(source) ? (source.name ?? '') : ''}
                onChange={event => onChange({ 
                  source: 'variable', 
                  name: event.target.value || 'var1', 
                  fallback: isVariableSource(source) ? source.fallback : undefined 
                })}
              >
                <option value="">-- Select --</option>
                {availableVariables.map(v => (
                  <option key={v.name} value={v.name}>
                    {v.name} ({v.type})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col font-medium text-xs">
              Fallback
              {isBoolean ? (
                <select
                  className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                  value={isVariableSource(source) && source.fallback === true ? 'true' : 'false'}
                  onChange={event => onChange({ 
                    source: 'variable', 
                    name: isVariableSource(source) ? source.name : 'var1', 
                    fallback: event.target.value === 'true' 
                  })}
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : validLiterals ? (
                // Show dropdown for constrained fallback values
                <select
                  className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                  value={String(isVariableSource(source) ? source.fallback ?? '' : '')}
                  onChange={event => onChange({ 
                    source: 'variable', 
                    name: isVariableSource(source) ? source.name : 'var1', 
                    fallback: event.target.value 
                  })}
                >
                  <option value="">-- None --</option>
                  {validLiterals.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  step="0.1"
                  className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                  value={isVariableSource(source) && typeof source.fallback === 'number' ? source.fallback : 0}
                  onChange={event => onChange({ 
                    source: 'variable', 
                    name: isVariableSource(source) ? source.name : 'var1', 
                    fallback: Number(event.target.value) 
                  })}
                />
              )}
            </label>
          </div>
        </div>
      )}
    </div>
  );
};

export default ValueSourceEditor;
