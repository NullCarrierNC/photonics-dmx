import React from 'react'
import { DmxFixture } from '../../../photonics-dmx/types'
import { LightIcon } from './LightIcon'
import {
  extraChannelDisplayLabel,
  fixtureHasZeroChannel,
  sortBaseChannelEntries,
} from './lightChannelDisplay'

interface LightPreviewProps {
  light: DmxFixture
  onSelect: () => void
  isHighlighted: boolean
}

/**
 * Displays a preview card for a light fixture with its properties
 * @param {LightPreviewProps} props - Component props
 * @param {Light} props.light - The light fixture to display
 * @param {() => void} props.onSelect - Callback when the light is selected
 * @param {boolean} props.isHighlighted - Indicates if the light is highlighted
 * @returns {JSX.Element} A card displaying the light's properties
 */
const LightChannelsPreview: React.FC<LightPreviewProps> = ({ light, onSelect, isHighlighted }) => {
  const hasZeroChannel = fixtureHasZeroChannel(light)
  const extraChannels = light.extraChannels ?? []

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
                  }`}>
      {/* Light Name */}
      <span className="text-lg font-semibold">{light.name}</span>

      {/* Light Icon */}
      <LightIcon type={light} />

      {/* Channels */}
      <div className="mt-2 w-full">
        <ul className="text-sm space-y-1">
          {sortBaseChannelEntries(Object.entries(light.channels)).map(([channelName, value]) => (
            <li
              key={channelName}
              className={`flex justify-between ${
                value === 0 ? 'text-yellow-400 font-bold italic' : ''
              }`}>
              <span className="capitalize">{channelName}:</span>
              <span>{value}</span>
            </li>
          ))}
          {/* Added channels, after the base channels in array order. */}
          {extraChannels.map((extra, i) => (
            <li
              key={`extra-${i}`}
              className={`flex justify-between ${
                extra.channel === 0 ? 'text-yellow-400 font-bold italic' : ''
              }`}>
              <span>{extraChannelDisplayLabel(light, i)}:</span>
              <span>
                {extra.type === 'fixed' ? `${extra.channel} = ${extra.value ?? 0}` : extra.channel}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default LightChannelsPreview
