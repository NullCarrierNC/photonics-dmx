import React from 'react'
import {
  DMX_OUTPUT_REFRESH_RATE_HZ_MAX,
  DMX_OUTPUT_REFRESH_RATE_HZ_MIN,
  ENTTEC_PRO_DEFAULT_REFRESH_RATE_HZ,
} from '../../../../shared/dmxOutputRefresh'
import CollapsibleSenderCard from './CollapsibleSenderCard'
import { DraftNumberField, DraftTextField, type CommitOutcome } from '../controls/DraftField'

interface EnttecProConfigCardProps {
  comPort: string
  refreshRate: number
  onComPortChange: (port: string) => CommitOutcome
  onRefreshRateChange: (hz: number) => CommitOutcome
  expanded: boolean
  onToggle: () => void
}

export const EnttecProConfigCard: React.FC<EnttecProConfigCardProps> = ({
  comPort,
  refreshRate,
  onComPortChange,
  onRefreshRateChange,
  expanded,
  onToggle,
}) => (
  <CollapsibleSenderCard
    title="Enttec Pro USB Configuration"
    expanded={expanded}
    onToggle={onToggle}>
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-20 shrink-0">
          COM:
        </label>
        <DraftTextField
          aria-label="COM"
          value={comPort}
          onCommit={onComPortChange}
          className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 w-64 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          placeholder="COM3"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-20 shrink-0">
          Refresh Rate:
        </label>
        <DraftNumberField
          aria-label="Refresh Rate"
          value={refreshRate}
          onCommit={onRefreshRateChange}
          min={DMX_OUTPUT_REFRESH_RATE_HZ_MIN}
          max={DMX_OUTPUT_REFRESH_RATE_HZ_MAX}
          className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 w-20 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        />
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Hz ({DMX_OUTPUT_REFRESH_RATE_HZ_MIN}-{DMX_OUTPUT_REFRESH_RATE_HZ_MAX})
        </span>
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-400">
        Default is {ENTTEC_PRO_DEFAULT_REFRESH_RATE_HZ} Hz. Lower this only if your adapter or OS
        cannot sustain the default rate.
      </p>
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
