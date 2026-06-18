import React from 'react'
import { OPEN_DMX_DEFAULT_REFRESH_RATE_HZ } from '../../../../shared/dmxOutputRefresh'
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
        OpenDMX USB adapters rely on your PC for timing, this can cause flickering or other issues
        on some systems.
      </p>
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-20 shrink-0">
          COM:
        </label>
        <input
          type="text"
          value={comPort}
          onChange={onComPortChange}
          className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 w-64 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          placeholder="COM4"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-20 shrink-0">
          Refresh Rate:
        </label>
        <input
          type="number"
          value={refreshRate}
          onChange={onRefreshRateChange}
          min={1}
          max={44}
          className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 w-20 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        />
        <span className="text-xs text-gray-500 dark:text-gray-400">Hz (1–44)</span>
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-400">
        Default is {OPEN_DMX_DEFAULT_REFRESH_RATE_HZ} Hz. If you see flickering, try seting your
        FTDI adapter&apos;s latency timer to 1 ms rather than lowering this rate. Failing that, try
        turning this down to 20 Hz.
        <br />
        Strobes may not work as expected if the value is too low.
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
