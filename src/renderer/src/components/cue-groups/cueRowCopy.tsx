import React from 'react'
import type { CueRowData } from './CueGroupsPanel'

/** A lighting cue carries a description per domain, since the same cue reads differently in each. */
export interface LightingCueInfo extends CueRowData {
  yargDescription: string
  rb3Description: string
  groupName?: string
}

/** The row wording every lighting and audio panel uses: the cue id, then what it does. */
export function cueLabel(id: string, description: string): React.ReactNode {
  return (
    <>
      <span className="font-medium text-gray-800 dark:text-gray-200">{id}:</span> {description}
    </>
  )
}

export const lightingCuesHeading = (count: number): string => `Cues in this group (${count}):`

export const NO_CUES_LABEL = 'No cues found in this group.'
