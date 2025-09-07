import React from 'react';
import LightType from './../components/LightType';
import DmxChannels from './../components/DmxChannels';
import { DmxFixture, FixtureTypes, LightTypes } from '../../../photonics-dmx/types';

interface LightSettingsProps {
  currentLight: DmxFixture | null;
  setCurrentLight: (light: DmxFixture | null) => void;
}

/**
 * Component for editing light fixture properties
 * @param {LightSettingsProps} props - Component props
 * @param {Light | null} props.currentLight - The light being edited
 * @param {(light: Light | null) => void} props.setCurrentLight - Callback to update light
 * @returns {JSX.Element | null} Form for editing light properties
 */
const LightSettings: React.FC<LightSettingsProps> = ({ currentLight, setCurrentLight }) => {

  if (!currentLight) {
    return null; // Hide form if currentLight is null
  }

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentLight({ ...currentLight, name: e.target.value });
  };

  const handleTypeChange = (newType: FixtureTypes) => {
    const defaultType = LightTypes.find((type) => type.fixture === newType);
    if (!defaultType) return;

    // Update channels and configChannels based on the selected type
    setCurrentLight({
      ...currentLight,
      fixture: newType,
      channels: defaultType.channels,
      config: defaultType.config ? { ...defaultType.config } : undefined,
    });
  };

  // Updated handleChannelChange to accept number | boolean
  const handleChannelChange = (channelName: string, value: number | boolean) => {
    if (currentLight.config && channelName in currentLight.config) {
      // Type assertion to access configChannels properties safely
      setCurrentLight({
        ...currentLight,
        config: {
          ...currentLight.config,
          [channelName]: value,
        },
      });
    } else {
      // Update regular channels
      setCurrentLight({
        ...currentLight,
        channels: {
          ...currentLight.channels,
          [channelName]: value as number, // Type assertion since channels expect number
        },
      });
    }
  };

  return (
    <form className="space-y-4">
      {/* Light Type Field */}
      <div className="flex items-center space-x-2 max-w-[360px]">
        <div className="flex-grow">
          <LightType
            selectedType={currentLight.fixture}
            onTypeChange={(newType) => handleTypeChange(newType as FixtureTypes)}
          />
        </div>
      </div>

      {/* Name Field */}
      <label className="flex flex-col items-start w-full">
        <span className="mb-2 text-gray-700 dark:text-gray-300">Name</span>
        <input
          type="text"
          maxLength={50}
          value={currentLight.name}
          onChange={handleNameChange}
          placeholder="Enter light name"
          className="p-2 border border-gray-300 rounded w-full text-black max-w-[360px]"
        />
      </label>

      {/* DMX Channels Field */}
      <DmxChannels light={currentLight} onChannelChange={handleChannelChange} />
    </form>
  );
};

export default LightSettings;