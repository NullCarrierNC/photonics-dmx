import React, { useEffect, useState, useCallback } from 'react';
import { EffectSelector } from 'src/photonics-dmx/types';
import { addIpcListener, removeIpcListener } from '../utils/ipcHelpers';
import { LIGHT, RENDERER_RECEIVE } from '../../../shared/ipcChannels';

interface EffectsDropdownProps {
  groupId: string;
  onSelect: (effect: EffectSelector) => void;
  value?: string;
  disabled?: boolean;
  autoSelectFirst?: boolean;
}

export const EffectsDropdown: React.FC<EffectsDropdownProps> = ({
  groupId = 'stagekit',
  onSelect,
  value,
  disabled = false,
  autoSelectFirst = false
}) => {
  const [effects, setEffects] = useState<EffectSelector[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEffect, setSelectedEffect] = useState<EffectSelector | null>(null);

  // Use stable callback to avoid infinite loops
  const fetchEffects = useCallback(async () => {
    if (!groupId) {
      // No group selected
      setEffects([]);
      setSelectedEffect(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      // Clear current selection when switching groups
      setSelectedEffect(null);
      // This retrieves cues from the specified group without changing the active group state
      const availableEffects = await window.electron.ipcRenderer.invoke(LIGHT.GET_AVAILABLE_CUES, groupId);
      
      if (Array.isArray(availableEffects) && availableEffects.length > 0) {
        // Sort effects by ID in ascending order for consistent display
        const sortedEffects = availableEffects.sort((a, b) => a.id.localeCompare(b.id));
        setEffects(sortedEffects);
        
        // Note: Auto-selection of first effect is handled by the useEffect below
        // that watches value and effects. 
      } else {
        setEffects([]);
        setSelectedEffect(null);
      }
    } catch (error) {
      console.error('Error fetching effects:', error);
      setEffects([]);
      setSelectedEffect(null);
    } finally {
      setLoading(false);
    }
  }, [groupId, onSelect]); // Removed 'value' dependency to avoid interference with the useEffect below

  // Fetch effects when group changes
  useEffect(() => {
    fetchEffects();
  }, [fetchEffects]);

  useEffect(() => {
    const handleNodeCuesChanged = () => {
      fetchEffects();
    };
    addIpcListener(RENDERER_RECEIVE.NODE_CUES_CHANGED, handleNodeCuesChanged);
    addIpcListener(RENDERER_RECEIVE.EFFECTS_CHANGED, handleNodeCuesChanged);
    return () => {
      removeIpcListener(RENDERER_RECEIVE.NODE_CUES_CHANGED, handleNodeCuesChanged);
      removeIpcListener(RENDERER_RECEIVE.EFFECTS_CHANGED, handleNodeCuesChanged);
    };
  }, [fetchEffects]);

  // Update selected effect when value prop changes
  useEffect(() => {
    if (value && effects.length > 0) {
      const matchingEffect = effects.find(effect => effect.id === value);
      if (matchingEffect) {
        setSelectedEffect(matchingEffect);
      }
    } else if (!value && effects.length > 0 && autoSelectFirst) {
      // Only auto-select the first one if autoSelectFirst is enabled
      const firstEffect = effects[0];
      setSelectedEffect(firstEffect);
      onSelect(firstEffect);
    } else if (!value) {
      // Clear internal selection when parent clears selection
      setSelectedEffect(null);
    }
  }, [value, effects, onSelect, autoSelectFirst]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    const effect = effects.find(effect => effect.id === selectedId);
    if (effect) {
      setSelectedEffect(effect);
      onSelect(effect);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Cue
      </label>
      <select
        onChange={handleChange}
        className="p-2 border rounded dark:bg-gray-700 dark:text-gray-200"
        value={value || selectedEffect?.id || ''}
        style={{ width: '200px' }}
        disabled={loading || effects.length === 0 || disabled}
      >
        {loading ? (
          <option value="" disabled>Loading effects...</option>
        ) : !groupId ? (
          <option value="" disabled>Select a group first</option>
        ) : effects.length === 0 ? (
          <option value="" disabled>No effects available</option>
        ) : (
          <>
            <option value="">- Select -</option>
            {effects.map((effect) => (
              <option key={effect.id} value={effect.id}>
                {effect.id}
              </option>
            ))}
          </>
        )}
      </select>
    </div>
  );
};

export default EffectsDropdown;