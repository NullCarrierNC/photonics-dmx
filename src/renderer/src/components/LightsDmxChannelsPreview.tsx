import React from 'react';
import { LightingConfiguration, DmxFixture } from '../../../photonics-dmx/types';

interface LightsDmxChannelsPreviewProps {
  lightingConfig: LightingConfiguration; // Lighting configuration containing the lights
  dmxValues: Record<number, number>; // Record of DMX channel values. I.e. channe:value.
}

/**
 * Displays channel names and their live DMX values for each light.
 * @param {LightsDmxChannelsPreviewProps} props - Component props
 * @param {LightingConfiguration} props.lightingConfig - The lighting configuration
 * @param {Record<number, number>} props.dmxValues - Live DMX channel values
 * @returns {JSX.Element} A table displaying each light's channels and their DMX values
 */
const LightsDmxChannelsPreview: React.FC<LightsDmxChannelsPreviewProps> = ({
  lightingConfig,
  dmxValues,
}) => {
  /**
   * Helper function to render a single light's channels and values.
   */
  const renderLightChannels = (light: DmxFixture) => {
    const channelEntries = Object.entries(light.channels);

    // Find the 'md' channel entry, if it exists
    const mdEntry = channelEntries.find(([channelName]) => channelName === 'md');

    // Filter out the 'md' channel from the other channels
    const otherEntries = channelEntries.filter(([channelName]) => channelName !== 'md');

    // Combine the other channels with the 'md' channel at the end (if it exists)
    const sortedEntries = mdEntry ? [...otherEntries, mdEntry] : otherEntries;

    return (
      <div
        key={light.id || `light-${light.position}`}
        className="p-4 border rounded-lg shadow mb-4"
      >
        <h3 className="text-lg font-semibold mb-2">
          {light.name} (#{light.position})
        </h3>
        <ul className="list-disc list-inside space-y-1">
          {sortedEntries.map(([channelName, channelNumber]) => (
            <li key={channelName} className="flex justify-between">
              {/* Conditionally render "MasterDimmer" instead of "md" */}
              <span className="capitalize">
                {channelName === 'md' ? 'MasterDimmer' : channelName}:
              </span>
              <span>{dmxValues[channelNumber] || 0}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  /**
   * Helper function to render a group of lights.
   */
  const renderLightsGroup = (lights: DmxFixture[], title: string) => (
    <div className="mb-6" key={title}>
      <h2 className="text-xl font-semibold mb-4">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {lights.map((light) => renderLightChannels(light))}
      </div>
    </div>
  );

  return (
    <div className="pt-6 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-200 rounded-lg">
      {/* Front Lights Group */}
      {lightingConfig?.frontLights.length > 0 &&
        renderLightsGroup(lightingConfig.frontLights, 'Front Lights')}

      {/* Back Lights Group */}
      {lightingConfig?.backLights.length > 0 &&
        renderLightsGroup(lightingConfig.backLights, 'Back Lights')}

      {/* Strobe Lights Group (if strobeType is 'dedicated')
      {lightingConfig.strobeType === 'dedicated' &&
        lightingConfig.strobeLights.length > 0 &&
        renderLightsGroup(lightingConfig.strobeLights, 'Strobe Lights')}
 */}
      {/* Effect Lights Group - not using these right now */}
      {/*lightingConfig.effectLights.length > 0 &&
        renderLightsGroup(lightingConfig.effectLights, 'Effect Lights') */}
    </div>
  );
};

export default LightsDmxChannelsPreview;