import React from 'react'
import CollapsibleSenderCard from './CollapsibleSenderCard'
import { DraftNumberField, DraftTextField, type CommitOutcome } from '../controls/DraftField'
import { SACN_UNIVERSE_MAX, SACN_UNIVERSE_MIN } from '../../../../shared/sacnUniverse'

export interface SacnConfig {
  universe: number
  networkInterface?: string
  useUnicast?: boolean
  unicastDestination?: string
  /** Unified refresh rate (Hz); 10–44. */
  refreshRateHz: number
}

const FIELD_CLASS =
  'border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white'

interface SacnConfigCardProps {
  config: SacnConfig
  networkInterfaces: Array<{ name: string; value: string; family: string }>
  expanded: boolean
  onToggle: () => void
  onConfigChange: (field: keyof SacnConfig, value: string | number | boolean) => CommitOutcome
}

export const SacnConfigCard: React.FC<SacnConfigCardProps> = ({
  config,
  networkInterfaces,
  expanded,
  onToggle,
  onConfigChange,
}) => (
  <CollapsibleSenderCard title="sACN Configuration" expanded={expanded} onToggle={onToggle}>
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Configure sACN network settings. By default, sACN broadcasts to the entire network. You can
        specify a network interface or unicast destination for specific targeting.
      </p>
      <div className="grid grid-cols-1 gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-20 shrink-0">
            Universe:
          </label>
          <DraftNumberField
            aria-label="Universe"
            value={config.universe}
            onCommit={(universe) => onConfigChange('universe', universe)}
            className={`${FIELD_CLASS} w-20`}
            min={SACN_UNIVERSE_MIN}
            max={SACN_UNIVERSE_MAX}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 ml-2">
            ({SACN_UNIVERSE_MIN} to {SACN_UNIVERSE_MAX})
          </p>
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
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-20 shrink-0">
            Network Interface:
          </label>
          <select
            value={config.networkInterface ?? ''}
            onChange={(e) => void onConfigChange('networkInterface', e.target.value)}
            className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 w-64 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
            <option value="">Auto-detect (recommended)</option>
            {networkInterfaces.map((iface) => (
              <option key={iface.value} value={iface.value}>
                {iface.name} ({iface.family})
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="sacn-unicast"
              checked={config.useUnicast ?? false}
              onChange={(e) => void onConfigChange('useUnicast', e.target.checked)}
              className="form-checkbox h-4 w-4 text-blue-600 rounded"
            />
            <label
              htmlFor="sacn-unicast"
              className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Use Unicast Destination
            </label>
          </div>
          {config.useUnicast && (
            <div className="flex items-center gap-2 ml-6">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-20 shrink-0">
                Destination IP:
              </label>
              <DraftTextField
                aria-label="Destination IP"
                value={config.unicastDestination ?? ''}
                onCommit={(destination) => onConfigChange('unicastDestination', destination)}
                className={`${FIELD_CLASS} w-48`}
                placeholder="192.168.1.100"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  </CollapsibleSenderCard>
)

export default SacnConfigCard
