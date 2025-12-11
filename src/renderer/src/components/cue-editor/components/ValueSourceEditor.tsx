import React from 'react';
import type { ValueSource } from '../../../../../photonics-dmx/cues/types/nodeCueTypes';

interface ValueSourceEditorProps {
  value: ValueSource;
  onChange: (value: ValueSource) => void;
  expectedType: 'number' | 'string' | 'boolean';
  availableVariables: Array<{ name: string; type: string }>;
  label?: string;
  placeholder?: string;
}

/**
 * Reusable component for editing a ValueSource - supports both literal values
 * and variable references with type checking.
 */
const ValueSourceEditor: React.FC<ValueSourceEditorProps> = ({
  value,
  onChange,
  expectedType,
  availableVariables,
  label,
  placeholder = 'Enter value'
}) => {
  const isLiteral = value.source === 'literal';
  
  // Filter variables by expected type
  const compatibleVariables = availableVariables.filter(
    v => v.type === expectedType || v.type === 'any'
  );

  const handleSourceTypeChange = (sourceType: 'literal' | 'variable') => {
    if (sourceType === 'literal') {
      onChange({
        source: 'literal',
        value: getDefaultValueForType(expectedType)
      });
    } else {
      onChange({
        source: 'variable',
        name: compatibleVariables[0]?.name || ''
      });
    }
  };

  const handleLiteralChange = (newValue: string) => {
    onChange({
      source: 'literal',
      value: parseValueForType(newValue, expectedType)
    });
  };

  const handleVariableChange = (variableName: string) => {
    onChange({
      source: 'variable',
      name: variableName
    });
  };

  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
          {label}
        </label>
      )}
      
      {/* Source Type Toggle */}
      <div className="flex gap-1 text-xs">
        <button
          type="button"
          onClick={() => handleSourceTypeChange('literal')}
          className={`px-3 py-1 rounded ${
            isLiteral
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}
        >
          Literal
        </button>
        <button
          type="button"
          onClick={() => handleSourceTypeChange('variable')}
          className={`px-3 py-1 rounded ${
            !isLiteral
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}
        >
          Variable
        </button>
      </div>

      {/* Value Input */}
      {isLiteral ? (
        <input
          type={expectedType === 'number' ? 'number' : 'text'}
          value={String(value.value ?? '')}
          onChange={(e) => handleLiteralChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
        />
      ) : (
        <div>
          <select
            value={(value as any).name || ''}
            onChange={(e) => handleVariableChange(e.target.value)}
            className="w-full px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
          >
            <option value="">-- Select Variable --</option>
            {compatibleVariables.map((variable) => (
              <option key={variable.name} value={variable.name}>
                {variable.name} ({variable.type})
              </option>
            ))}
          </select>
          {compatibleVariables.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              No {expectedType} variables available
            </p>
          )}
        </div>
      )}
    </div>
  );
};

function getDefaultValueForType(type: 'number' | 'string' | 'boolean'): number | string | boolean {
  switch (type) {
    case 'number':
      return 0;
    case 'string':
      return '';
    case 'boolean':
      return false;
  }
}

function parseValueForType(
  value: string,
  type: 'number' | 'string' | 'boolean'
): number | string | boolean {
  switch (type) {
    case 'number':
      return parseFloat(value) || 0;
    case 'string':
      return value;
    case 'boolean':
      return value === 'true' || value === '1';
  }
}

export default ValueSourceEditor;
