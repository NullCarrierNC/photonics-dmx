/**
 * The read-only summary above the pickers. Game mode reports what the rotation is playing, manual
 * mode reports what the user selected, and both carry the motion cue underneath.
 */
import React from 'react'
import type { AudioGameModeSchedulePayload } from '../../../../shared/ipcTypes'
import type { AudioCueGroupOption, AudioCueOption } from './types'

interface CurrentCueSummaryProps {
  gameModeEnabled: boolean
  gameModeSchedule: AudioGameModeSchedulePayload | null
  gameModeRemainingSec: number
  availableCues: AudioCueOption[]
  activeCue: string | null
  activeCueForGameMode?: AudioCueOption
  secondaryCueType: string | null
  secondaryCueForGameMode?: AudioCueOption
  strobeFiringDisplay: boolean
  strobeCueType: string | null
  selectedCue?: AudioCueOption
  selectedCueId: string
  selectedGroupInfo?: AudioCueGroupOption
  motionGlobalEnabled: boolean
  motionPlayingGroupLabel: string | null
  motionPlayingLabel: string | null
}

const CurrentCueSummary: React.FC<CurrentCueSummaryProps> = ({
  gameModeEnabled,
  gameModeSchedule,
  gameModeRemainingSec,
  availableCues,
  activeCue,
  activeCueForGameMode,
  secondaryCueType,
  secondaryCueForGameMode,
  strobeFiringDisplay,
  strobeCueType,
  selectedCue,
  selectedCueId,
  selectedGroupInfo,
  motionGlobalEnabled,
  motionPlayingGroupLabel,
  motionPlayingLabel,
}) => (
  <div className="p-3 bg-gray-200 dark:bg-gray-700 rounded-lg">
    <div className="flex justify-between items-center mb-2">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Current cue</h3>
      {gameModeEnabled && gameModeSchedule && (
        <span
          className="shrink-0 text-sm font-medium tabular-nums text-gray-600 dark:text-gray-300"
          aria-live="polite">
          {gameModeSchedule.pending
            ? 'Waiting for beat...'
            : gameModeSchedule.deadlineMs != null
              ? `Next cue in ${gameModeRemainingSec}s`
              : null}
        </span>
      )}
    </div>
    <div className="overflow-x-auto">
      {gameModeEnabled ? (
        <div className="grid w-full min-w-[36rem] grid-cols-4 gap-3 sm:gap-4">
          <div className="min-w-0">
            <p className="font-medium text-gray-800 dark:text-gray-200">Lighting Cue Group</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {activeCueForGameMode?.groupName ?? '—'}
            </p>
          </div>
          <div className="min-w-0">
            <p className="font-medium text-gray-800 dark:text-gray-200">Primary cue</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {activeCueForGameMode?.label ?? activeCue ?? '—'}
            </p>
          </div>
          <div className="min-w-0">
            <p className="font-medium text-gray-800 dark:text-gray-200">Secondary cue</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {secondaryCueForGameMode?.label ?? secondaryCueType ?? 'None'}
            </p>
          </div>
          <div className="min-w-0">
            <p className="font-medium text-gray-800 dark:text-gray-200">Strobe</p>
            <p
              className={`text-sm ${
                strobeFiringDisplay
                  ? 'text-gray-900 dark:text-white'
                  : 'text-gray-500 dark:text-gray-400'
              }`}>
              {strobeFiringDisplay
                ? strobeCueType
                  ? availableCues.find((c) => c.id === strobeCueType)?.label ?? strobeCueType
                  : 'Active'
                : 'Inactive'}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid w-full grid-cols-2 gap-3 sm:gap-4">
          <div className="min-w-0">
            <p className="font-medium text-gray-800 dark:text-gray-200">Lighting Cue Group</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {selectedCue?.groupName ?? selectedGroupInfo?.name ?? '—'}
            </p>
          </div>
          <div className="min-w-0">
            <p className="font-medium text-gray-800 dark:text-gray-200">Audio Cue</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {selectedCue?.label ?? selectedCueId ?? activeCue ?? '—'}
            </p>
          </div>
        </div>
      )}
    </div>
    {motionGlobalEnabled && (
      <div className="mt-3 pt-3 border-t border-gray-300 dark:border-gray-600">
        <div className="overflow-x-auto">
          {gameModeEnabled ? (
            <div className="grid w-full min-w-[36rem] grid-cols-4 gap-3 sm:gap-4">
              <div className="min-w-0">
                <p className="font-medium text-gray-800 dark:text-gray-200">Motion Cue Group</p>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {motionPlayingGroupLabel ?? '—'}
                </p>
              </div>
              <div className="min-w-0">
                <p className="font-medium text-gray-800 dark:text-gray-200">Motion Cue</p>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {motionPlayingLabel ?? '—'}
                </p>
              </div>
              <div className="min-w-0" aria-hidden />
              <div className="min-w-0" aria-hidden />
            </div>
          ) : (
            <div className="grid w-full grid-cols-2 gap-3 sm:gap-4">
              <div className="min-w-0">
                <p className="font-medium text-gray-800 dark:text-gray-200">Motion Cue Group</p>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {motionPlayingGroupLabel ?? '—'}
                </p>
              </div>
              <div className="min-w-0">
                <p className="font-medium text-gray-800 dark:text-gray-200">Motion Cue</p>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {motionPlayingLabel ?? '—'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    )}
  </div>
)

export default CurrentCueSummary
