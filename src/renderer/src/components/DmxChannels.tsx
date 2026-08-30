import React from 'react'
import {
  DMX_CHANNEL_MAX,
  DmxFixture,
  FixtureConfig,
  fixtureConfigFieldBounds,
  normalizeFixtureConfig,
} from '../../../photonics-dmx/types'
import { sortBaseChannelEntries } from './lightChannelDisplay'

function fixtureConfigLabel(key: string): string {
  if (key === 'panDirectionCW') {
    return 'Pan increases clockwise from above'
  }
  if (key === 'panStageDeg') {
    return 'Pan upstage reference (deg)'
  }
  if (key === 'tiltStageDeg') {
    return 'Tilt vertical reference (deg)'
  }
  return key
}

function channelLabel(key: string): string {
  if (key === 'strobeChannel') {
    return 'Strobe Speed'
  }
  if (key === 'masterDimmer') {
    return 'Master Dimmer'
  }
  return key
}

interface DmxChannelsProps {
  light: DmxFixture
  onChannelChange: (channelName: string, value: number | boolean) => void
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
    allowZero: boolean = false,
  ) => {
    const sortedChannels = sortBaseChannelEntries(Object.entries(channels))

    /**
     * The two callers below edit different quantities, so each gets its own bound: DMX channel
     * *numbers* run 1–512, while config fields are degrees/percent/raw-DMX with their own per-field
     * ranges.
     */
    const boundsFor = (channelName: string): { min: number; max: number } =>
      allowZero
        ? fixtureConfigFieldBounds(
            channelName as keyof FixtureConfig,
            normalizeFixtureConfig(light.config),
          )
        : { min: 1, max: DMX_CHANNEL_MAX }

    return (
      <div>
        {title && (
          <h3 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-200">{title}</h3>
        )}
        {sortedChannels.map(([channelName, value]) => (
          <div key={channelName} className="flex items-center space-x-4 mb-2">
            <label
              htmlFor={channelName}
              className="text-sm capitalize w-1/3 text-gray-700 dark:text-gray-300">
              {allowZero ? fixtureConfigLabel(channelName) : channelLabel(channelName)}:
            </label>
            {typeof value === 'number' ? (
              <input
                id={channelName}
                type="number"
                min={boundsFor(channelName).min}
                max={boundsFor(channelName).max}
                value={value}
                onChange={(e) => {
                  const { min, max } = boundsFor(channelName)
                  let newValue = Number(e.target.value)

                  // Handle invalid inputs (e.g., empty string)
                  if (isNaN(newValue)) {
                    newValue = min
                  }

                  // Clamp the value within the allowed range
                  newValue = Math.min(max, Math.max(min, Math.round(newValue)))

                  onChannelChange(channelName, newValue)
                }}
                className={`p-2 border ${
                  allowZero ? 'border-gray-300' : 'border-gray-300'
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
                  const newValue = e.target.checked
                  onChannelChange(channelName, newValue)
                }}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded"
              />
            ) : null}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Regular Channels - Do not allow zero */}
      {renderChannels(
        light.channels as unknown as Record<string, number | boolean>,
        'Channels',
        false,
      )}

      {/* Config Channels - Allow zero if they exist */}
      {light.config &&
        renderChannels(
          normalizeFixtureConfig(light.config) as unknown as Record<string, number | boolean>,
          'Config Channels',
          true,
        )}
    </div>
  )
}

export default DmxChannels
