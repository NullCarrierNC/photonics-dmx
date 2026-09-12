import React from 'react'
import CollapsibleSenderCard from './CollapsibleSenderCard'
import { DraftNumberField, DraftTextField } from '../controls/DraftField'

export interface ArtNetConfig {
  host: string
  net: number
  subnet: number
  universe: number
  subuni: number
  port: number
  /** Unified refresh rate (Hz); 10–44. */
  refreshRateHz: number
}

const FIELD_CLASS =
  'border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white'

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
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-20 shrink-0">
          Host:
        </label>
        <DraftTextField
          aria-label="Host"
          value={config.host}
          onCommit={(host) => onConfigChange('host', host)}
          className={`${FIELD_CLASS} w-32`}
          placeholder="127.0.0.1"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-20 shrink-0">
            Net:
          </label>
          <DraftNumberField
            aria-label="Net"
            value={config.net}
            onCommit={(value) => onConfigChange('net', value)}
            className={`${FIELD_CLASS} w-32`}
            min={0}
            max={255}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-20 shrink-0">
            Subnet:
          </label>
          <DraftNumberField
            aria-label="Subnet"
            value={config.subnet}
            onCommit={(value) => onConfigChange('subnet', value)}
            className={`${FIELD_CLASS} w-32`}
            min={0}
            max={255}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-20 shrink-0">
            Universe:
          </label>
          <DraftNumberField
            aria-label="Universe"
            value={config.universe}
            onCommit={(value) => onConfigChange('universe', value)}
            className={`${FIELD_CLASS} w-32`}
            min={0}
            max={255}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 ml-2">
            (ArtNet universes start at 0)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-20 shrink-0">
            Sub Universe:
          </label>
          <DraftNumberField
            aria-label="Sub Universe"
            value={config.subuni}
            onCommit={(value) => onConfigChange('subuni', value)}
            className={`${FIELD_CLASS} w-32`}
            min={0}
            max={255}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-20 shrink-0">
          Port:
        </label>
        <DraftNumberField
          aria-label="Port"
          value={config.port}
          onCommit={(port) => onConfigChange('port', port)}
          className={`${FIELD_CLASS} w-32`}
          min={1024}
          max={65535}
        />
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-20 shrink-0">
            Refresh Rate:
          </label>
          <DraftNumberField
            aria-label="Refresh Rate"
            value={config.refreshRateHz}
            onCommit={(hz) => onConfigChange('refreshRateHz', hz)}
            className={`${FIELD_CLASS} w-20`}
            min={10}
            max={44}
          />
          <span className="text-xs text-gray-500 dark:text-gray-400">Hz (10–44)</span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 ml-[5.5rem] max-w-lg leading-snug">
          If you see flickering, try lowering this value to 20.
        </p>
      </div>
    </div>
  </CollapsibleSenderCard>
)

export default ArtNetConfigCard
