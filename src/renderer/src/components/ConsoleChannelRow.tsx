/** One channel of a light in the DMX Console: its name, its DMX number and its value slider. */
import React from 'react'
import { isValidDmxChannel } from '../../../photonics-dmx/types'

interface ConsoleChannelRowProps {
  /** The channel's name, as the row heads it. */
  label: React.ReactNode
  channel: number
  /** The box that shows, and may edit, the DMX number of an assigned channel. */
  channelBox: React.ReactNode
  consoleEnabled: boolean
  /** What the console sends while it is on. */
  consoleBuffer: Record<number, number>
  /** What the rig is outputting. */
  dmxValues: Record<number, number>
  onValueChange: (value: number) => void
  className?: string
}

/**
 * A channel with no DMX number has no value to show or move, so its row shows an empty, disabled
 * box and no slider.
 */
const ConsoleChannelRow: React.FC<ConsoleChannelRowProps> = ({
  label,
  channel,
  channelBox,
  consoleEnabled,
  consoleBuffer,
  dmxValues,
  onValueChange,
  className,
}) => {
  const assigned = isValidDmxChannel(channel)
  return (
    <li className={`flex flex-col gap-0.5${className ? ` ${className}` : ''}`}>
      <div className="flex justify-between items-center gap-2">
        {label}
        {assigned && (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Value: {dmxValues[channel] ?? 0}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-gray-600 dark:text-gray-400 shrink-0">DMX ch</label>
        {assigned ? (
          channelBox
        ) : (
          <input
            type="number"
            value=""
            placeholder="Not set"
            disabled
            readOnly
            className="w-20 p-1 border rounded text-sm border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
          />
        )}
        {assigned && (
          <input
            type="range"
            min={0}
            max={255}
            value={consoleEnabled ? consoleBuffer[channel] ?? 0 : dmxValues[channel] ?? 0}
            disabled={!consoleEnabled}
            onChange={(e) => onValueChange(parseInt(e.target.value, 10))}
            className="flex-1 min-w-[120px] slider"
          />
        )}
      </div>
    </li>
  )
}

export default ConsoleChannelRow
