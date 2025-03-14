import React, { useEffect, useState } from 'react';
import { EffectSelector } from 'src/photonics-dmx/types';



interface EffectsDropdownProps {
  onSelect: (effect: EffectSelector) => void;
}

const EffectsDropdown: React.FC<EffectsDropdownProps> = ({ onSelect }) => {
  const [effects, setEffects] = useState<EffectSelector[]>([]);


  useEffect(() => {
    const loadEffects = async () => {
      const availableEffects = await window.electron.ipcRenderer.invoke('get-available-cues');
      setEffects(availableEffects);
    };
    loadEffects();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    const selectedEffect = effects.find(effect => effect.id === selectedId);
    if (selectedEffect) {
      onSelect(selectedEffect);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <select
        onChange={handleChange}
        className="p-2 border rounded dark:bg-gray-700 dark:text-gray-200"
        defaultValue=""
      >
        <option value="" disabled>
          Select an effect
        </option>
        {effects.map((effect) => (
          <option key={effect.id} value={effect.id}>
            {effect.id}
          </option>
        ))}
      </select>
    </div>
  );
};

export default EffectsDropdown;