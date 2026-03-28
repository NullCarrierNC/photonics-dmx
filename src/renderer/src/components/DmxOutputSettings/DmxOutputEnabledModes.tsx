import React from 'react'

interface DmxOutputEnabledModesProps {
  sacnEnabled: boolean
  onSacnToggle: () => void
  artNetEnabled: boolean
  onArtNetToggle: () => void
  enttecProEnabled: boolean
  onEnttecProToggle: () => void
  openDmxEnabled: boolean
  onOpenDmxToggle: () => void
}

const DmxOutputEnabledModes: React.FC<DmxOutputEnabledModesProps> = ({
  sacnEnabled,
  onSacnToggle,
  artNetEnabled,
  onArtNetToggle,
  enttecProEnabled,
  onEnttecProToggle,
  openDmxEnabled,
  onOpenDmxToggle,
}) => (
  <div className="mb-8">
    <h3 className="text-lg font-medium mb-3 text-gray-800 dark:text-gray-200">
      Enabled DMX Output Modes
    </h3>
    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
      Select the DMX modes you want to use. This will make them available for use in Game Settings
      on the Status page.
    </p>
    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
      Each sender can be configured individually below.
    </p>
    <div className="flex items-center space-x-6 flex-wrap">
      <label className="flex items-center space-x-2">
        <input
          type="checkbox"
          checked={sacnEnabled}
          onChange={onSacnToggle}
          className="form-checkbox h-4 w-4 text-blue-600 rounded"
        />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">sACN</span>
      </label>
      <label className="flex items-center space-x-2">
        <input
          type="checkbox"
          checked={artNetEnabled}
          onChange={onArtNetToggle}
          className="form-checkbox h-4 w-4 text-blue-600 rounded"
        />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">ArtNet</span>
      </label>
      <label className="flex items-center space-x-2">
        <input
          type="checkbox"
          checked={enttecProEnabled}
          onChange={onEnttecProToggle}
          className="form-checkbox h-4 w-4 text-blue-600 rounded"
        />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Enttec Pro USB</span>
      </label>
      <label className="flex items-center space-x-2">
        <input
          type="checkbox"
          checked={openDmxEnabled}
          onChange={onOpenDmxToggle}
          className="form-checkbox h-4 w-4 text-blue-600 rounded"
        />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">OpenDMX USB</span>
      </label>
    </div>
  </div>
)

export default DmxOutputEnabledModes
