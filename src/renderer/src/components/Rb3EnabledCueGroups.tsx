import React from 'react'
import {
  getRb3CueGroups,
  getEnabledRb3CueGroups,
  setEnabledRb3CueGroups,
  getAvailableRb3Cues,
  getDisabledRb3Cues,
  setDisabledRb3Cues,
} from '../ipcApi'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { CueGroupsPanel, type CueGroupsDomain } from './cue-groups/CueGroupsPanel'
import {
  cueLabel,
  lightingCuesHeading,
  NO_CUES_LABEL,
  type LightingCueInfo,
} from './cue-groups/cueRowCopy'
import type { CueGroup } from '../../../photonics-dmx/types'

const RB3_DOMAIN: CueGroupsDomain<CueGroup, LightingCueInfo> = {
  key: 'rb3',
  label: 'RB3',
  title: 'RB3 Lighting Cue Groups',
  description:
    'Cue groups contain different implementations of the same cue triggered by the RB3 StageKit stream in cue mode. Having multiple groups enabled allows for a wider range of visual effects during gameplay. You can disable individual cues within an enabled group; the group stays enabled if at least one cue remains on.',
  getGroups: getRb3CueGroups,
  getEnabled: getEnabledRb3CueGroups,
  setEnabled: setEnabledRb3CueGroups,
  getDisabled: getDisabledRb3Cues,
  setDisabled: setDisabledRb3Cues,
  getCues: getAvailableRb3Cues,
  changedEvent: RENDERER_RECEIVE.RB3_CUE_GROUPS_CHANGED,
  // RB3 cues carry their own wording where they have it, and fall back to the YARG description.
  renderCueLabel: (cue) => cueLabel(cue.id, cue.rb3Description || cue.yargDescription),
  emptyLabel: NO_CUES_LABEL,
  cuesHeading: lightingCuesHeading,
}

const Rb3EnabledCueGroups: React.FC = () => <CueGroupsPanel domain={RB3_DOMAIN} />

export default Rb3EnabledCueGroups
