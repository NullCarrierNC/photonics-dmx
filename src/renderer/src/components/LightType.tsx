import React, { useState, useEffect } from 'react';
import { FixtureTypes, LightTypes } from '../../../photonics-dmx/types';

interface LightTypeProps {
  selectedType: FixtureTypes; // Currently selected light type
  onTypeChange: (type: FixtureTypes) => void; 
}

const LightType: React.FC<LightTypeProps> = ({ selectedType, onTypeChange }) => {
  const [currentType, setCurrentType] = useState<FixtureTypes>(selectedType);

  useEffect(() => {
    // Update local state when the selectedType prop changes
    setCurrentType(selectedType);
  }, [selectedType]);

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = e.target.value as FixtureTypes;
    setCurrentType(newType);
    onTypeChange(newType);
  };

  return (
    <label className="flex flex-col items-start w-full">
      <span className="mb-2">Light Type</span>
      <select
        value={currentType}
        onChange={handleTypeChange}
        className="p-2 border border-gray-300 rounded w-full text-black"
      >
        {LightTypes.map((lightType) => (
          <option key={lightType.fixture} value={lightType.fixture}>
            {lightType.label}
          </option>
        ))}
      </select>
    </label>
  );
};

export default LightType;