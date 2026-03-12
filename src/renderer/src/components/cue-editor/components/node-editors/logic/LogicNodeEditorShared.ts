import type { LogicNode } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'

/** Shared props for all logic sub-editors. */
export interface LogicEditorCommonProps {
  availableVariables: {
    name: string
    type: string
    scope: 'cue' | 'cue-group'
    validValues?: string[]
  }[]
  updateNode: (updates: Partial<LogicNode>) => void
}
