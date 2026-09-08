/**
 * The manual group and cue pickers, with the descriptions of whatever is selected.
 */
import React from 'react'
import type { AudioCueGroupOption, AudioCueOption } from './types'
import { DROPDOWN_WIDTH } from './types'

interface AudioCuePickersProps {
  groupOptions: AudioCueGroupOption[]
  selectedGroupId: string
  onGroupChange: (groupId: string) => void
  cuesForSelectedGroup: AudioCueOption[]
  selectedCueId: string
  activeCue: string | null
  onCueChange: (cueId: string) => void
  saving: boolean
  selectedCue?: AudioCueOption
  selectedGroupInfo?: AudioCueGroupOption
}

const AudioCuePickers: React.FC<AudioCuePickersProps> = ({
  groupOptions,
  selectedGroupId,
  onGroupChange: handleGroupChange,
  cuesForSelectedGroup,
  selectedCueId,
  activeCue,
  onCueChange: handleCueChange,
  saving,
  selectedCue,
  selectedGroupInfo,
}) => (
  <>
    <div className="flex flex-col gap-4 md:flex-row">
      <div className={`${DROPDOWN_WIDTH}`}>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Audio Cue Group
        </label>
        <select
          className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:text-gray-200"
          value={selectedGroupId || ''}
          onChange={(event) => handleGroupChange(event.target.value)}
          disabled={saving || groupOptions.length === 0}>
          <option value="" disabled>
            {groupOptions.length === 0 ? 'No groups available' : 'Choose a group'}
          </option>
          {groupOptions.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </div>

      <div className={`${DROPDOWN_WIDTH}`}>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Audio Cue
        </label>
        <select
          className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:text-gray-200"
          value={selectedCueId || activeCue || ''}
          onChange={(event) => handleCueChange(event.target.value)}
          disabled={saving || cuesForSelectedGroup.length === 0}>
          <option value="" disabled>
            {cuesForSelectedGroup.length === 0 ? 'No cues for this group' : 'Choose a cue'}
          </option>
          {cuesForSelectedGroup.map((cue) => (
            <option key={cue.id} value={cue.id}>
              {cue.label || cue.id}
            </option>
          ))}
        </select>
      </div>
    </div>

    {(selectedGroupInfo || selectedCue) && (
      <div className="">
        {selectedGroupInfo && (
          <div>
            <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              <strong>Group Description:</strong>{' '}
              {selectedGroupInfo.description || 'No description available for this group.'}
            </div>
          </div>
        )}
        {selectedCue && (
          <div>
            <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              <strong>Cue Description:</strong>{' '}
              {selectedCue.description || 'No description available for this cue.'}
            </div>
          </div>
        )}
      </div>
    )}
  </>
)

export default AudioCuePickers
