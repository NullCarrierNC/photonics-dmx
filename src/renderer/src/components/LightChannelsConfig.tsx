import React, { useState, useEffect } from 'react';
import {
  DmxFixture,
  DmxLight,
  FixtureTypes,
  RgbDmxChannels,
  RgbStrobeDmxChannels,
  RgbwDmxChannels,
  StrobeDmxChannels,
  FixtureConfig,
} from '../../../photonics-dmx/types';
import { LightIcon } from './LightIcon';
import { castToChannelType } from '../../../photonics-dmx/helpers/dmxHelpers';
import { BsLightningFill } from 'react-icons/bs';

interface LightChannelsConfigProps {
  light: DmxLight | null;
  onChange: (updatedLight: DmxLight) => void;
  onClick: () => void;
  isHighlighted: boolean;
  myLights: DmxFixture[]; // Light templates
}

const channelOrder = ['masterDimmer', 'red', 'green', 'blue', 'white', 'strobeSpeed'];

const getDisplayName = (channelName: string) => {
  if (channelName === 'masterDimmer') return 'Master Dimmer';
  // For other keys, simply capitalize the first letter.
  return channelName.charAt(0).toUpperCase() + channelName.slice(1);
};

/**
 * LightChannelsConfig Component
 * 
 * This component allows configuring DMX channels for a selected light.
 * It handles updating channel values, changing light types, toggling strobe mode,
 * and now also updates config values.
 */
const LightChannelsConfig: React.FC<LightChannelsConfigProps> = ({
  light,
  onChange,
  onClick,
  isHighlighted,
  myLights,
}) => {
  const [localChannels, setLocalChannels] = useState<
    RgbDmxChannels | RgbStrobeDmxChannels | RgbwDmxChannels | StrobeDmxChannels | null
  >(null);

  // State for the light's config (if available)
  const [localConfig, setLocalConfig] = useState<FixtureConfig | null>(null);

  useEffect(() => {
    if (light) {
      const fixtureTemplate = myLights.find((fixture) => fixture.id === light.fixtureId);

      if (!fixtureTemplate) {
        console.warn(`fixtureId (${light.fixtureId}) not found in myLights.`);
        setLocalChannels(null);
        setLocalConfig(null);
        return;
      }

      // Handle Main Channels
      const templateChannels = fixtureTemplate.channels;
      // Calculate offsets based on masterDimmer for main channels
      const offsets: { [key: string]: number } = {};
      Object.entries(templateChannels).forEach(([channelName, value]) => {
        if (channelName !== 'masterDimmer') {
          offsets[channelName] = value - templateChannels.masterDimmer;
        }
      });

      const existingMasterDimmer = light.channels.masterDimmer;
      const recalculatedChannels: { [key: string]: number } = {};
      Object.entries(templateChannels).forEach(([channelName, _]) => {
        if (channelName === 'masterDimmer') {
          recalculatedChannels[channelName] = existingMasterDimmer;
        } else {
          recalculatedChannels[channelName] = existingMasterDimmer + (offsets[channelName] || 0);
        }
      });

      const castChannels = castToChannelType(fixtureTemplate.fixture, recalculatedChannels);
      setLocalChannels(castChannels);

      // Handle Config
      // Copy the config from the light (no master dimmer logic here)
      if (light.config) {
        setLocalConfig(light.config);
      } else {
        setLocalConfig(null);
      }
    } else {
      setLocalChannels(null);
      setLocalConfig(null);
    }
  }, [light, myLights]);

  /**
   * Handles changes to the main Master Dimmer channel.
   */
  const handleMasterDimmerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (light && localChannels) {
      const newMasterValue = Number(e.target.value);
      
      // Find the fixture template to get the original offsets
      const fixtureTemplate = myLights.find((fixture) => fixture.id === light.fixtureId);
      if (!fixtureTemplate) {
        console.warn(`fixtureId (${light.fixtureId}) not found in myLights.`);
        return;
      }

      // Calculate offsets from the fixture template (not the current light)
      const templateChannels = fixtureTemplate.channels;
      const offsets: { [key: string]: number } = {};
      Object.entries(templateChannels).forEach(([channelName, value]) => {
        if (channelName !== 'masterDimmer') {
          offsets[channelName] = value - templateChannels.masterDimmer;
        }
      });

      // Apply the new master dimmer value and recalculate all channels using template offsets
      const updatedChannels: { [key: string]: number } = {};
      Object.entries(templateChannels).forEach(([channelName, _]) => {
        if (channelName === 'masterDimmer') {
          updatedChannels[channelName] = newMasterValue;
        } else {
          updatedChannels[channelName] = newMasterValue + (offsets[channelName] || 0);
        }
      });

      const castChannels = castToChannelType(fixtureTemplate.fixture, updatedChannels);
      setLocalChannels({ ...castChannels });

      const updatedLight: DmxLight = {
        ...light,
        channels: { ...castChannels },
      };
      onChange(updatedLight);
    }
  };

  /**
   * Handles updates for any property in the config.
   * For number fields, the value is parsed to a number.
   * For boolean fields (like 'invert'), the value is taken from the checkbox.
   */
  const handleConfigChange = (key: keyof FixtureConfig, value: string | boolean) => {
    if (light && localConfig) {
      let updatedValue: any = value;
      if (key !== 'invert') {
        updatedValue = Number(value);
      }
      const updatedConfig = { ...localConfig, [key]: updatedValue };
      setLocalConfig(updatedConfig);
      const updatedLight: DmxLight = { ...light, config: updatedConfig };
      onChange(updatedLight);
    }
  };

  /**
   * Handles changes to the light type via the select dropdown.
   */
  const handleLightTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedFixtureId = e.target.value;
    if (!selectedFixtureId) return;

    const selectedFixture = myLights.find((fixture) => fixture.id === selectedFixtureId);
    if (!selectedFixture || !light) return;

    const existingMasterDimmer = light.channels.masterDimmer;
    const templateChannels = selectedFixture.channels;

    const offsets: { [key: string]: number } = {};
    Object.entries(templateChannels).forEach(([channelName, value]) => {
      if (channelName !== 'masterDimmer') {
        offsets[channelName] = value - templateChannels.masterDimmer;
      }
    });

    const recalculatedChannels: { [key: string]: number } = {};
    Object.entries(templateChannels).forEach(([channelName, _]) => {
      if (channelName === 'masterDimmer') {
        recalculatedChannels[channelName] = existingMasterDimmer;
      } else {
        recalculatedChannels[channelName] = existingMasterDimmer + (offsets[channelName] || 0);
      }
    });

    const castChannels = castToChannelType(selectedFixture.fixture, recalculatedChannels);
    setLocalChannels({ ...castChannels });

    const updatedLight: DmxLight = {
      ...light,
      fixtureId: selectedFixture.id!,
      fixture: selectedFixture.fixture,
      label: selectedFixture.label,
      name: selectedFixture.name,
      isStrobeEnabled: selectedFixture.isStrobeEnabled,
      channels: { ...castChannels },
    };

    // For config, if the new fixture has a config template, use it.
    if (selectedFixture.config) {
      setLocalConfig(selectedFixture.config);
      updatedLight.config = { ...selectedFixture.config };
    } else {
      setLocalConfig(null);
      updatedLight.config = undefined;
    }

    onChange(updatedLight);
  };

  /**
   * Handles toggling the strobe mode.
   */
  const handleStrobeToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (light) {
      const updatedLight: DmxLight = {
        ...light,
        isStrobeEnabled: e.target.checked,
      };
      onChange(updatedLight);
    }
  };

  const isFixtureInMyLights = myLights.some((fixture) => fixture.id === light?.fixtureId);

  return (
    <div
      onClick={onClick}
      className={`flex flex-col flex-grow items-center space-y-2 p-4 max-w-[240px] rounded-lg shadow cursor-pointer 
                  text-gray-800 dark:text-gray-200 
                  ${
                    isHighlighted
                      ? 'bg-yellow-500 dark:bg-yellow-600'
                      : 'bg-gray-300 dark:bg-[#303548] hover:bg-gray-200 dark:hover:bg-[#40465a]'
                  }`}
    >
      {/* Light Type Selector */}
      <select
        value={isFixtureInMyLights ? light?.fixtureId : myLights[0]?.id || ''}
        onChange={handleLightTypeChange}
        className="p-2 border border-gray-300 dark:border-gray-700 rounded w-full text-black dark:text-white dark:bg-gray-700"
      >
        {myLights.map((availableFixture) => (
          <option key={availableFixture.id!} value={availableFixture.id!}>
            {availableFixture.name}
          </option>
        ))}
        {!isFixtureInMyLights && light && (
          <option value={light.fixtureId} hidden>
            {light.name}
          </option>
        )}
      </select>

      {/* Light Icon and Strobe Indicator */}
      <div className="flex items-center justify-center">
        {light && <LightIcon type={light} />}
        {light?.isStrobeEnabled && (
          <BsLightningFill size={24} className="text-yellow-500 dark:text-yellow-400 ml-2" />
        )}
      </div>

      {/* Light Name */}
      {light && <span className="text-sm">{light.name}</span>}

      {/* Main Channels Configuration */}
      {light && localChannels && (
        <div className="mt-2 w-full">
          <ul className="text-sm space-y-1">
            {Object.entries(localChannels)
              .sort(([keyA], [keyB]) => {
                const indexA = channelOrder.indexOf(keyA);
                const indexB = channelOrder.indexOf(keyB);
                if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                if (indexA !== -1) return -1;
                if (indexB !== -1) return 1;
                return keyA.localeCompare(keyB);
              })
              .map(([channelName, value]) => (
                <li key={channelName} className="flex justify-between items-center">
                  <span className="capitalize">{getDisplayName(channelName)}:</span>
                  {channelName === 'masterDimmer' ? (
                    <input
                      type="number"
                      value={value || 0}
                      onChange={handleMasterDimmerChange}
                      className="w-16 p-1 border border-gray-300 dark:border-gray-700 rounded text-black dark:text-white dark:bg-gray-700 text-right"
                    />
                  ) : (
                    <span>{value}</span>
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* Config Section */}
      {light && localConfig && (
        <div className="mt-2 w-full">
          <h3 className="text-lg font-bold">Config</h3>
          <ul className="text-sm space-y-1">
            {Object.entries(localConfig).map(([key, value]) => {
              // Determine input type based on value type.
              const inputType = typeof value === 'boolean' ? 'checkbox' : 'number';
              return (
                <li key={key} className="flex justify-between items-center">
                  <span className="capitalize">{getDisplayName(key)}</span>
                  {inputType === 'checkbox' ? (
                    <input
                      type="checkbox"
                      checked={value as boolean}
                      onChange={(e) =>
                        handleConfigChange(key as keyof FixtureConfig, e.target.checked)
                      }
                      className="ml-2"
                    />
                  ) : (
                    <input
                      type="number"
                      value={value as number}
                      onChange={(e) =>
                        handleConfigChange(key as keyof FixtureConfig, e.target.value)
                      }
                      className="w-16 p-1 border border-gray-300 dark:border-gray-700 rounded text-black dark:text-white dark:bg-gray-700 text-right"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Separator for moving head fixtures if present */}
      {light?.fixture === FixtureTypes.RGBMH || light?.fixture === FixtureTypes.RGBWMH ? <hr /> : null}

      {/* Strobe Toggle */}
      {light && (
        <label className="flex items-center space-x-2 w-full mt-2">
          <input
            type="checkbox"
            checked={light.isStrobeEnabled}
            onChange={handleStrobeToggle}
            className="shrink-0"
          />
          <span className="text-left w-full">Use as strobe</span>
        </label>
      )}
    </div>
  );
};

export default LightChannelsConfig;