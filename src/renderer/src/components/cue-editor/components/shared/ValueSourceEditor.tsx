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

  return (
    <div className="space-y-1">
      <label className="flex flex-col font-medium text-xs">
        {label}
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={source.source}
          onChange={event => {
            const nextSource = event.target.value as ValueSource['source'];
            if (nextSource === 'literal') {
              const defaultValue = isBoolean ? false : isString ? (validLiterals?.[0] ?? '') : 0;
              onChange({ source: 'literal', value: defaultValue });
            } else {
              onChange({ 
                source: 'variable', 
                name: isVariableSource(source) ? (source.name ?? 'var1') : 'var1', 
                fallback: isVariableSource(source) ? source.fallback : undefined 
              });
            }
          }}
        >
          <option value="literal">Literal</option>
          <option value="variable">Variable</option>
        </select>
      </label>
      {isLiteral ? (
        <label className="flex flex-col font-medium text-xs">
          Value
          {isBoolean ? (
            <select
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={source.value === true ? 'true' : 'false'}
              onChange={event => onChange({ ...source, value: event.target.value === 'true' })}
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : validLiterals ? (
            // Show dropdown for constrained literals (e.g., colours, brightness levels)
            <select
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
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
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={isString ? String(source.value ?? '') : (typeof source.value === 'number' ? source.value : 0)}
              onChange={event => {
                const newValue = isString ? event.target.value : Number(event.target.value);
                onChange({ ...source, value: newValue });
              }}
            />
          )}
        </label>
      ) : (
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
      )}
    </div>
  );
};

export default ValueSourceEditor;
