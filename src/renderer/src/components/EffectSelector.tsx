import React, { useEffect, useState, useCallback } from 'react';
import { EffectSelector } from 'src/photonics-dmx/types';

interface EffectsDropdownProps {
  groupId: string;
  onSelect: (effect: EffectSelector) => void;
  value?: string;
  disabled?: boolean;
}

export const EffectsDropdown: React.FC<EffectsDropdownProps> = ({
  groupId = 'stagekit',
  onSelect,
  value,
  disabled = false
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
      // This retrieves cues from the specified group without changing the active group state
      const availableEffects = await window.electron.ipcRenderer.invoke('get-available-cues', groupId);
      
      if (Array.isArray(availableEffects) && availableEffects.length > 0) {
        // Sort effects by ID in ascending order for consistent display
        const sortedEffects = availableEffects.sort((a, b) => a.id.localeCompare(b.id));
        setEffects(sortedEffects);
        
        // If we have a value prop, select that effect
        if (value) {
          const selectedEffect = sortedEffects.find(effect => effect.id === value);
          if (selectedEffect) {
            setSelectedEffect(selectedEffect);
          }
        } 
        // Otherwise select the first effect if there's no current selection
        else if (!selectedEffect && sortedEffects.length > 0) {
          const firstEffect = sortedEffects[0];
          setSelectedEffect(firstEffect);
          onSelect(firstEffect);
        }
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
  }, [groupId, value, onSelect]); // Keep only essential dependencies

  // Fetch effects when group changes
  useEffect(() => {
    fetchEffects();
  }, [fetchEffects]);

  // Update selected effect when value prop changes
  useEffect(() => {
    if (value && effects.length > 0) {
      const matchingEffect = effects.find(effect => effect.id === value);
      if (matchingEffect) {
        setSelectedEffect(matchingEffect);
      }
    } else if (!value && effects.length > 0 && !selectedEffect) {
      // If no value is provided but we have effects, select the first one
      setSelectedEffect(effects[0]);
      onSelect(effects[0]);
    }
  }, [value, effects, onSelect, selectedEffect]);

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
          effects.map((effect) => (
            <option key={effect.id} value={effect.id}>
              {effect.id}
            </option>
          ))
        )}
      </select>
    </div>
  );
};

export default EffectsDropdown;