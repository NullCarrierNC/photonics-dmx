import React from 'react';
import { DmxFixture } from '../../../photonics-dmx/types';

interface DmxChannelsProps {
  light: DmxFixture;
  onChannelChange: (channelName: string, value: number | boolean) => void;
}

const DmxChannels: React.FC<DmxChannelsProps> = ({ light, onChannelChange }) => {
  /**
   * Helper function to render channels.
   * @param channels - The channels object to render.
   * @param title - Optional title for the channels section.
   * @param allowZero - Flag to determine if zero is allowed as a valid value.
   */
  const renderChannels = (
    channels: Record<string, number | boolean>,
    title?: string,
    allowZero: boolean = false
  ) => {
    // Define the desired order of channel names
    const channelOrder = [
      'masterDimmer',
      'red',
      'green',
      'blue',
      'white',
      'pan',
      'tilt',
    ];

    const sortedChannels = Object.entries(channels).sort((a, b) => {
      const indexA = channelOrder.indexOf(a[0]);
      const indexB = channelOrder.indexOf(b[0]);

      // If the channel is not in the predefined order, place it at the end
      return (
        (indexA === -1 ? channelOrder.length : indexA) -
        (indexB === -1 ? channelOrder.length : indexB)
      );
    });

    return (
      <div>
        {title && <h3 className="text-lg font-semibold mb-2">{title}</h3>}
        {sortedChannels.map(([channelName, value]) => (
          <div key={channelName} className="flex items-center space-x-4 mb-2">
            <label htmlFor={channelName} className="text-sm capitalize w-1/3">
              {channelName}:
            </label>
            {typeof value === 'number' ? (
              <input
                id={channelName}
                type="number"
                min={allowZero ? 0 : 1} // Set min based on allowZero
                max={255}
                value={value}
                onChange={(e) => {
                  let newValue = Number(e.target.value);

                  // Handle invalid inputs (e.g., empty string)
                  if (isNaN(newValue)) {
                    newValue = allowZero ? 0 : 1;
                  }

                  // Clamp the value within the allowed range
                  newValue = Math.min(
                    255,
                    Math.max(allowZero ? 0 : 1, newValue)
                  );

                  onChannelChange(channelName, newValue);
                }}
                className={`p-2 border ${
                  allowZero
                    ? 'border-gray-300'
                    : 'border-gray-300'
                } rounded w-[100px] text-black ${
                  value === 0 && !allowZero ? 'text-red-500 font-bold' : ''
                }`}
              />
            ) : typeof value === 'boolean' ? (
              <input
                id={channelName}
                type="checkbox"
                checked={value}
                onChange={(e) => {
                  const newValue = e.target.checked;
                  onChannelChange(channelName, newValue);
                }}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded"
              />
            ) : null}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Regular Channels - Do not allow zero */}
      {renderChannels(
        light.channels as unknown as Record<string, number | boolean>,
        'Channels',
        false
      )}

      {/* Config Channels - Allow zero if they exist */}
      {light.config &&
        renderChannels(
          light.config as unknown as Record<string, number | boolean>,
          'Config Channels',
          true
        )}
    </div>
  );
};

export default DmxChannels;