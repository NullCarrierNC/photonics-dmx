import React, { useMemo } from 'react'
import { LightingConfiguration, DmxFixture } from '../../../photonics-dmx/types'
import {
  extraChannelDisplayLabel,
  findSharedChannelNumbersInConfig,
  sortBaseChannelEntries,
} from './lightChannelDisplay'

interface LightsDmxChannelsPreviewProps {
  lightingConfig: LightingConfiguration // Lighting configuration containing the lights
  dmxValues: Record<number, number> // Record of DMX channel values. I.e. channe:value.
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
  // Addresses more than one channel in this rig claims. Values are read straight from the rig's DMX
  // buffer, so a shared address shows the same number on every row pointing at it — which reads as
  // a channel computing wrongly unless the sharing is called out.
  const sharedChannels = useMemo(
    () => new Set(findSharedChannelNumbersInConfig(lightingConfig)),
    [lightingConfig],
  )

  /** Bracketed DMX address in the label; styled smaller so live values do not shift the row. */
  const renderChannelAddress = (channelNumber: number) => {
    const shared = sharedChannels.has(channelNumber)
    return (
      <span
        className={
          shared
            ? 'text-xs text-amber-600 dark:text-amber-400 font-semibold'
            : 'text-xs text-gray-500 dark:text-gray-400'
        }
        title={shared ? 'Another channel in this rig uses the same address' : undefined}>
        {' '}
        (#{channelNumber}
        {shared ? ' ⚠' : ''})
      </span>
    )
  }

  /** Live DMX value for one channel address. */
  const renderChannelValue = (channelNumber: number) => <span>{dmxValues[channelNumber] || 0}</span>

  const baseChannelLabel = (channelName: string): string => {
    if (channelName === 'masterDimmer') return 'Master Dimmer'
    if (channelName === 'strobeChannel') return 'Strobe Speed'
    return channelName
  }

  /**
   * Helper function to render a single light's channels and values.
   */
  const renderLightChannels = (light: DmxFixture) => {
    const sortedEntries = sortBaseChannelEntries(Object.entries(light.channels))

    return (
      <div
        key={light.id || `light-${light.position}`}
        className="p-4 border rounded-lg shadow mb-4">
        <h3 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-200">
          {light.name} (#{light.position})
        </h3>
        <ul className="list-disc list-inside space-y-1">
          {sortedEntries.map(([channelName, channelNumber]) => (
            <li key={channelName} className="flex justify-between gap-2">
              <span className="capitalize text-gray-700 dark:text-gray-300">
                {baseChannelLabel(channelName)}
                {renderChannelAddress(channelNumber)}:
              </span>
              {renderChannelValue(channelNumber)}
            </li>
          ))}
          {/* User-added channels, after the base ones. Labels are already display-formatted so no
              `capitalize` class (it would mangle an acronym like UV). */}
          {(light.extraChannels ?? []).map((extra, i) => (
            <li key={`extra-${i}`} className="flex justify-between gap-2">
              <span className="text-gray-700 dark:text-gray-300">
                {extraChannelDisplayLabel(light, i)}
                {renderChannelAddress(extra.channel)}:
              </span>
              {renderChannelValue(extra.channel)}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  /**
   * Helper function to render a group of lights.
   */
  const renderLightsGroup = (lights: DmxFixture[], title: string) => (
    <div className="mb-6" key={title}>
      <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {lights.map((light) => renderLightChannels(light))}
      </div>
    </div>
  )

  return (
    <div className="pt-6 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-200 rounded-lg">
      {/* Front Lights Group */}
      {lightingConfig?.frontLights.length > 0 &&
        renderLightsGroup(lightingConfig.frontLights, 'Front Lights')}

      {/* Back Lights Group */}
      {lightingConfig?.backLights.length > 0 &&
        renderLightsGroup([...lightingConfig.backLights].reverse(), 'Back Lights')}

      {/* Strobe Lights Group (if strobeType is 'dedicated')
      {lightingConfig.strobeType === 'dedicated' &&
        lightingConfig.strobeLights.length > 0 &&
        renderLightsGroup(lightingConfig.strobeLights, 'Strobe Lights')}
 */}
      {/* Effect Lights Group - not using these right now */}
      {/*lightingConfig.effectLights.length > 0 &&
        renderLightsGroup(lightingConfig.effectLights, 'Effect Lights') */}
    </div>
  )
}

export default LightsDmxChannelsPreview
