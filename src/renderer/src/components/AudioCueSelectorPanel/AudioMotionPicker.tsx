/**
 * The motion group and cue pickers. An empty group hands motion selection back to the rotation.
 */
import React from 'react'
import type { AudioMotionCue, AudioMotionGroup } from './types'
import { DROPDOWN_WIDTH } from './types'

interface AudioMotionPickerProps {
  motionGroups: AudioMotionGroup[]
  motionGroupId: string
  onGroupChange: (groupId: string) => void
  motionCuesOptions: AudioMotionCue[]
  motionCueId: string
  onCueChange: (cueId: string) => void
  savingMotion: boolean
}

const AudioMotionPicker: React.FC<AudioMotionPickerProps> = ({
  motionGroups,
  motionGroupId,
  onGroupChange: handleMotionGroupChange,
  motionCuesOptions,
  motionCueId,
  onCueChange: handleMotionCueChange,
  savingMotion,
}) => (
  <div className="flex flex-col gap-4 md:flex-row">
    <div className={`${DROPDOWN_WIDTH}`}>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Motion cue group
      </label>
      <select
        className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:text-gray-200"
        value={motionGroupId}
        onChange={(e) => void handleMotionGroupChange(e.target.value)}
        disabled={savingMotion || motionGroups.length === 0}>
        <option value="">Auto (random per primary cue change)</option>
        {motionGroups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
    </div>
    <div className={`${DROPDOWN_WIDTH}`}>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Motion cue
      </label>
      <select
        className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:text-gray-200"
        value={motionCueId}
        onChange={(e) => void handleMotionCueChange(e.target.value)}
        disabled={savingMotion || !motionGroupId || motionCuesOptions.length === 0}>
        <option value="" disabled>
          {!motionGroupId ? 'Choose Auto or a group first' : 'Choose a motion cue'}
        </option>
        {motionCuesOptions.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name || c.id}
          </option>
        ))}
      </select>
    </div>
  </div>
)

export default AudioMotionPicker
