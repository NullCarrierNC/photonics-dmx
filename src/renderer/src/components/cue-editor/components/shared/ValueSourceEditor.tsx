import React from 'react';
import type { ValueSource } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes';
import { isVariableSource } from './nodeEditorUtils';
import { COLOR_OPTIONS } from '../../../../../../photonics-dmx/constants/options';

interface ValueSourceEditorProps {
  label: string;
  value: ValueSource | undefined;
  onChange: (next: ValueSource) => void;
  expected?: 'number' | 'boolean' | 'string' | 'color' | 'either';
  validLiterals?: string[];
  availableVariables: { name: string; type: string; scope: 'cue' | 'cue-group' }[];
  integerOnly?: boolean; // For number fields that should only accept integers
}

const ValueSourceEditor: React.FC<ValueSourceEditorProps> = ({
  label,
  value,
  onChange,
  expected = 'either',
  validLiterals,
  availableVariables,
  integerOnly = false
}) => {
  // For color type, use COLOR_OPTIONS if validLiterals not provided
  const effectiveValidLiterals = expected === 'color' && !validLiterals ? COLOR_OPTIONS : validLiterals;
  
  const source = value ?? { 
    source: 'literal', 
    value: expected === 'boolean' ? false : expected === 'string' || expected === 'color' ? '' : 0 
  };
  const isLiteral = source.source === 'literal';
  const isBoolean = expected === 'boolean';
  const isString = expected === 'string' || expected === 'color';

  // Filter variables by expected type (color and string are compatible)
  const compatibleVariables = expected === 'either' 
    ? availableVariables 
    : availableVariables.filter(v => 
        v.type === expected || 
        (expected === 'color' && v.type === 'string') ||
        (expected === 'string' && v.type === 'color')
      );

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
      const defaultValue = isBoolean ? false : isString ? (effectiveValidLiterals?.[0] ?? '') : 0;
      onChange({ source: 'literal', value: defaultValue });
    }
  };

  return (
    <div className="space-y-1">
      <label className="flex items-center justify-between font-medium text-xs">
        <span>{label}</span>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-xs text-gray-600 dark:text-gray-400">Use Variable</span>
          <input
            type="checkbox"
            checked={!isLiteral}
            onChange={(e) => handleToggleVar(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-600 dark:bg-gray-700"
          />
        </label>
      </label>
      {isLiteral ? (
        // Literal mode: just the input
        <div className="mt-1">
          {isBoolean ? (
            <select
              className="w-full rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={source.value === true ? 'true' : 'false'}
              onChange={event => onChange({ ...source, value: event.target.value === 'true' })}
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : effectiveValidLiterals ? (
            // Show dropdown for constrained literals (e.g., colours, brightness levels)
            <select
              className="w-full rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={String(source.value)}
              onChange={event => onChange({ ...source, value: event.target.value })}
            >
              {effectiveValidLiterals.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : (
            <input
              type={isString ? 'text' : 'number'}
              step={isString ? undefined : (integerOnly ? "1" : "0.1")}
              className="w-full rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={isString ? String(source.value ?? '') : (typeof source.value === 'number' ? source.value : 0)}
              onChange={event => {
                let newValue = isString ? event.target.value : Number(event.target.value);
                // Round to integer if integerOnly is true
                if (!isString && integerOnly && typeof newValue === 'number') {
                  newValue = Math.round(newValue);
                }
                onChange({ ...source, value: newValue });
              }}
            />
          )}
        </div>
      ) : (
        // Variable mode: variable dropdown and fallback below
        <div className="space-y-2 mt-1">
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
                {compatibleVariables.map(v => (
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
              ) : effectiveValidLiterals ? (
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
                  {effectiveValidLiterals.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  step={integerOnly ? "1" : "0.1"}
                  className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                  value={isVariableSource(source) && typeof source.fallback === 'number' ? source.fallback : 0}
                  onChange={event => {
                    let fallbackValue = Number(event.target.value);
                    // Round to integer if integerOnly is true
                    if (integerOnly) {
                      fallbackValue = Math.round(fallbackValue);
                    }
                    onChange({ 
                      source: 'variable', 
                      name: isVariableSource(source) ? source.name : 'var1', 
                      fallback: fallbackValue
                    });
                  }}
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
