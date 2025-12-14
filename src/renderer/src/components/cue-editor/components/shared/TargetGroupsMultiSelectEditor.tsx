import React from 'react';
import type { ValueSource } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes';
import { isVariableSource } from './nodeEditorUtils';

interface TargetGroupsMultiSelectEditorProps {
  label: string;
  value: ValueSource | undefined;
  onChange: (next: ValueSource) => void;
  availableVariables: { name: string; type: string; scope: 'cue' | 'cue-group' }[];
}

const TARGET_GROUPS: Array<'front' | 'back' | 'strobe'> = ['front', 'back', 'strobe'];
const FALLBACK_GROUPS: Array<'front' | 'back'> = ['front', 'back'];

const TargetGroupsMultiSelectEditor: React.FC<TargetGroupsMultiSelectEditorProps> = ({
  label,
  value,
  onChange,
  availableVariables
}) => {
  const source = value ?? { 
    source: 'literal', 
    value: 'front'
  };
  const isLiteral = source.source === 'literal';

  // Parse comma-separated string to array
  const selectedGroups = isLiteral && typeof source.value === 'string'
    ? source.value.split(',').map(g => g.trim()).filter(g => TARGET_GROUPS.includes(g as typeof TARGET_GROUPS[number]))
    : [];

  // Check if group is selected
  const isSelected = (group: 'front' | 'back' | 'strobe') => 
    selectedGroups.includes(group);

  // Parse fallback comma-separated string to array (only front/back allowed)
  const fallbackGroups = isVariableSource(source) && typeof source.fallback === 'string'
    ? source.fallback.split(',').map(g => g.trim()).filter(g => FALLBACK_GROUPS.includes(g as typeof FALLBACK_GROUPS[number]))
    : [];

  // Check if fallback group is selected
  const isFallbackSelected = (group: 'front' | 'back') => 
    fallbackGroups.includes(group);

  // Handle group toggle
  const handleGroupToggle = (group: 'front' | 'back' | 'strobe', checked: boolean) => {
    const updated = checked 
      ? [...selectedGroups.filter(g => g !== group), group]
      : selectedGroups.filter(g => g !== group);
    
    // Ensure at least one group is selected
    if (updated.length === 0) {
      updated.push('front');
    }
    
    onChange({ source: 'literal', value: updated.join(',') });
  };

  // Handle fallback group toggle
  const handleFallbackToggle = (group: 'front' | 'back', checked: boolean) => {
    const updated = checked 
      ? [...fallbackGroups.filter(g => g !== group), group]
      : fallbackGroups.filter(g => g !== group);
    
    // Ensure at least one group is selected
    if (updated.length === 0) {
      updated.push('front');
    }
    
    onChange({ 
      source: 'variable', 
      name: isVariableSource(source) ? source.name : 'var1', 
      fallback: updated.join(',')
    });
  };

  // Handle switch toggle
  const handleToggleVar = (checked: boolean) => {
    if (checked) {
      // Switch to variable mode - default fallback to "front,back" if not set
      const fallbackValue = isVariableSource(source) && typeof source.fallback === 'string'
        ? source.fallback
        : 'front,back';
      onChange({ 
        source: 'variable', 
        name: isVariableSource(source) ? (source.name ?? 'var1') : 'var1', 
        fallback: fallbackValue
      });
    } else {
      // Switch to literal mode - use current selection or default to front
      const currentValue = isLiteral && typeof source.value === 'string' 
        ? source.value 
        : 'front';
      onChange({ source: 'literal', value: currentValue });
    }
  };

  return (
    <div className="space-y-1">
      <label className="flex flex-col font-medium text-xs">
        {label}
      </label>
      {isLiteral ? (
        // Literal mode: switch and checkboxes on same line
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
          <div className="flex items-center gap-4">
            {TARGET_GROUPS.map((group) => (
              <label key={group} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSelected(group)}
                  onChange={(e) => handleGroupToggle(group, e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-600 dark:bg-gray-700"
                />
                <span className="text-xs text-gray-700 dark:text-gray-300 capitalize">{group}</span>
              </label>
            ))}
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
                onChange={event => {
                  const currentFallback = isVariableSource(source) && typeof source.fallback === 'string'
                    ? source.fallback
                    : 'front,back';
                  onChange({ 
                    source: 'variable', 
                    name: event.target.value || 'var1', 
                    fallback: currentFallback
                  });
                }}
              >
                <option value="">-- Select --</option>
                {availableVariables
                  .filter(v => v.type === 'string' || v.type === 'light-array')
                  .map(v => (
                    <option key={v.name} value={v.name}>
                      {v.name} ({v.type})
                    </option>
                  ))}
              </select>
            </label>
            <div className="flex flex-col font-medium text-xs">
              <span className="mb-1">Fallback</span>
              <div className="flex items-center gap-4 mt-1">
                {FALLBACK_GROUPS.map((group) => (
                  <label key={group} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isFallbackSelected(group)}
                      onChange={(e) => handleFallbackToggle(group, e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-600 dark:bg-gray-700"
                    />
                    <span className="text-xs text-gray-700 dark:text-gray-300 capitalize">{group}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TargetGroupsMultiSelectEditor;
