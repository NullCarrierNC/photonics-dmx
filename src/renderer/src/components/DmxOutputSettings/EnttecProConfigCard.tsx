import React from 'react'
import CollapsibleSenderCard from './CollapsibleSenderCard'

interface EnttecProConfigCardProps {
  comPort: string
  universe: number
  onComPortChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onUniverseChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  expanded: boolean
  onToggle: () => void
}

export const EnttecProConfigCard: React.FC<EnttecProConfigCardProps> = ({
  comPort,
  universe,
  onComPortChange,
  onUniverseChange,
  expanded,
  onToggle,
}) => (
  <CollapsibleSenderCard
    title="Enttec Pro USB Configuration"
    expanded={expanded}
    onToggle={onToggle}>
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-16">COM:</label>
        <input
          type="text"
          value={comPort}
          onChange={onComPortChange}
          className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 w-64 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          placeholder="COM3"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-16">
          Universe:
        </label>
        <input
          type="number"
          value={universe}
          onChange={onUniverseChange}
          min={0}
          className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 w-32 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 ml-2">
          (Enttec Pro universes start at 0)
        </p>
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 mt-4">
        Enter the COM port of your Enttec Pro USB DMX interface.
        <br />
        On PC this is usually COM3, COM4, etc.
        <br />
        On Mac it is usually something like /dev/tty.usbserial-A9000001.
      </p>
    </div>
  </CollapsibleSenderCard>
)

export default EnttecProConfigCard
