/**
 * Shapes the audio cue panel shares with its pickers and summary.
 */

export interface AudioCueOption {
  id: string
  label: string
  description: string
  groupId: string
  groupName: string
  groupDescription?: string
}

export interface AudioCueGroupOption {
  id: string
  name: string
  description?: string
}

export interface AudioMotionGroup {
  id: string
  name: string
  description?: string
  cueCount: number
}

export interface AudioMotionCue {
  id: string
  name: string
}

/** Shared width so the audio and motion pickers line up across both rows. */
export const DROPDOWN_WIDTH = 'min-w-[220px] md:w-[240px]'
