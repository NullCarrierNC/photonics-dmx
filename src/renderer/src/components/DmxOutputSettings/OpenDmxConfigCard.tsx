import React from 'react'
import CollapsibleSenderCard from './CollapsibleSenderCard'

interface OpenDmxConfigCardProps {
  comPort: string
  refreshRate: number
  onComPortChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRefreshRateChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  expanded: boolean
  onToggle: () => void
}

export const OpenDmxConfigCard: React.FC<OpenDmxConfigCardProps> = ({
  comPort,
  refreshRate,
  onComPortChange,
  onRefreshRateChange,
  expanded,
  onToggle,
}) => (
  <CollapsibleSenderCard title="OpenDMX USB Configuration" expanded={expanded} onToggle={onToggle}>
    <div className="space-y-3">
      <p className="text-sm text-red-600 dark:text-red-500">
        OpenDMX USB adapters are very poor quality - we <b>HIGHLY</b> recommend against using them!
      </p>
      <p className="text-sm text-red-600 dark:text-red-500">
        If you want to use one, please be aware that:
        <ul className="list-disc list-inside">
          <li>
            They are not electrically isolated between DMX and USB. This increases the chances you
            could damage your computer.
          </li>
          <li>
            You will likely experience DMX drop-outs or other timing issues which will cause
            flickering.
          </li>
          <li>Do NOT use with Moving Heads - drop-outs can cause thrashing of the motors.</li>
          <li>
            <b>These are fundamental issues with the hardware and not something we can fix.</b>
          </li>
        </ul>
      </p>
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-16">COM:</label>
        <input
          type="text"
          value={comPort}
          onChange={onComPortChange}
          className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 w-64 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          placeholder="COM4"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-16">
          Refresh:
        </label>
        <input
          type="number"
          value={refreshRate}
          onChange={onRefreshRateChange}
          min={1}
          max={44}
          className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 w-32 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        />
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-400">
        Default is 40 Hz. Higher values reduce latency but can increase flicker on lower-quality
        adapters.
      </p>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 mt-4">
        Enter the COM port of your OpenDMX USB interface.
        <br />
        On Windows this is usually COM4, COM5, etc.
        <br />
        On macOS it is usually something like /dev/tty.usbserial-XXXX.
      </p>
    </div>
  </CollapsibleSenderCard>
)

export default OpenDmxConfigCard
