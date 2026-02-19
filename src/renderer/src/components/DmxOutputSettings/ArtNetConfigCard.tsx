import React from 'react'
import CollapsibleSenderCard from './CollapsibleSenderCard'

export interface ArtNetConfig {
  host: string
  net: number
  subnet: number
  universe: number
  subuni: number
  port: number
}

interface ArtNetConfigCardProps {
  config: ArtNetConfig
  expanded: boolean
  onToggle: () => void
  onConfigChange: (field: keyof ArtNetConfig, value: string | number) => void
}

export const ArtNetConfigCard: React.FC<ArtNetConfigCardProps> = ({
  config,
  expanded,
  onToggle,
  onConfigChange,
}) => (
  <CollapsibleSenderCard title="ArtNet Configuration" expanded={expanded} onToggle={onToggle}>
    <div className="space-y-3">
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 mb-4">
        ArtNet requires you to specify the host IP address of the ArtNet device you are using.
        <br />
        Net, subnet, universe, and sub universe are usually 0 unless you&apos;ve modified them. The
        default port is 6454.
      </p>
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-16">Host:</label>
        <input
          type="text"
          value={config.host}
          onChange={(e) => onConfigChange('host', e.target.value)}
          className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 w-32 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          placeholder="127.0.0.1"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-16">Net:</label>
          <input
            type="number"
            value={config.net}
            onChange={(e) => onConfigChange('net', parseInt(e.target.value) || 0)}
            className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 w-32 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            min="0"
            max="255"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-16">
            Subnet:
          </label>
          <input
            type="number"
            value={config.subnet}
            onChange={(e) => onConfigChange('subnet', parseInt(e.target.value) || 0)}
            className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 w-32 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            min="0"
            max="255"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-16">
            Universe:
          </label>
          <input
            type="number"
            value={config.universe}
            onChange={(e) => onConfigChange('universe', parseInt(e.target.value) || 0)}
            className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 w-32 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            min="0"
            max="255"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 ml-2">
            (ArtNet universes start at 0)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-16">
            Sub Universe:
          </label>
          <input
            type="number"
            value={config.subuni}
            onChange={(e) => onConfigChange('subuni', parseInt(e.target.value) || 0)}
            className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 w-32 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            min="0"
            max="255"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-16">Port:</label>
        <input
          type="number"
          value={config.port}
          onChange={(e) => onConfigChange('port', parseInt(e.target.value) || 6454)}
          className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 w-32 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          min="1024"
          max="65535"
        />
      </div>
    </div>
  </CollapsibleSenderCard>
)

export default ArtNetConfigCard
