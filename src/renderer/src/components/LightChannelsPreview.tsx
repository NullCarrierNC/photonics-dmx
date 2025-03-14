import React from 'react';
import { DmxFixture } from '../../../photonics-dmx/types';
import { LightIcon } from './LightIcon';

interface LightPreviewProps {
  light: DmxFixture;
  onSelect: () => void;
  isHighlighted: boolean; 
}

// Define the channel rendering order
const channelOrder = ['masterDimmer', 'red', 'green', 'blue', 'white', 'strobeSpeed'];

/**
 * Displays a preview card for a light fixture with its properties
 * @param {LightPreviewProps} props - Component props
 * @param {Light} props.light - The light fixture to display
 * @param {() => void} props.onSelect - Callback when the light is selected
 * @param {boolean} props.isHighlighted - Indicates if the light is highlighted
 * @returns {JSX.Element} A card displaying the light's properties
 */
const LightChannelsPreview: React.FC<LightPreviewProps> = ({ light, onSelect, isHighlighted }) => {
  const hasZeroChannel = Object.values(light.channels).some((value) => value === 0);

  return (
    <div
      onClick={onSelect}
      className={`flex flex-col items-center space-y-2 p-4 max-w-[200px] rounded-lg shadow cursor-pointer 
                  text-gray-800 dark:text-gray-200 
                  ${
                    hasZeroChannel
                      ? 'bg-red-500 dark:bg-red-600'
                      : isHighlighted
                      ? 'bg-yellow-500 dark:bg-yellow-600'
                      : 'bg-gray-300 dark:bg-[#303548] hover:bg-gray-200 dark:hover:bg-[#40465a]'
                  }`}
    >
      {/* Light Name */}
      <span className="text-lg font-semibold">{light.name}</span>

      {/* Light Icon */}
      <LightIcon type={light} />

      {/* Channels */}
      <div className="mt-2 w-full">
        <ul className="text-sm space-y-1">
          {Object.entries(light.channels)
            .sort(([keyA], [keyB]) => {
              const indexA = channelOrder.indexOf(keyA);
              const indexB = channelOrder.indexOf(keyB);

              // Prioritize defined order, then alphabetical
              if (indexA !== -1 && indexB !== -1) return indexA - indexB;
              if (indexA !== -1) return -1;
              if (indexB !== -1) return 1;
              return keyA.localeCompare(keyB);
            })
            .map(([channelName, value]) => (
              <li
                key={channelName}
                className={`flex justify-between ${
                  value === 0 ? 'text-yellow-400 font-bold italic' : ''
                }`}
              >
                <span className="capitalize">{channelName}:</span>
                <span>{value}</span>
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
};

export default LightChannelsPreview;