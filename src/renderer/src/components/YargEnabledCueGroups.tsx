import React from 'react'
import {
  getCueGroups,
  getEnabledCueGroups,
  setEnabledCueGroups,
  getAvailableCues,
  getDisabledYargCues,
  setDisabledYargCues,
} from '../ipcApi'
import { CueGroupsPanel, type CueGroupsDomain } from './cue-groups/CueGroupsPanel'
import {
  cueLabel,
  lightingCuesHeading,
  NO_CUES_LABEL,
  type LightingCueInfo,
} from './cue-groups/cueRowCopy'
import type { CueGroup } from '../../../photonics-dmx/types'

const YARG_DOMAIN: CueGroupsDomain<CueGroup, LightingCueInfo> = {
  key: 'yarg',
  label: 'YARG',
  title: 'YARG Lighting Cue Groups',
  description:
    'Cue groups contain different implementations of the same cue triggered by YARG. Having multiple groups enabled allows for a wider range of visual effects during gameplay. The Stage Kit group is used as a fallback if no other group contains the necessary cue. You can disable individual cues within an enabled group; the group stays enabled if at least one cue remains on.',
  getGroups: getCueGroups,
  getEnabled: getEnabledCueGroups,
  setEnabled: setEnabledCueGroups,
  getDisabled: getDisabledYargCues,
  setDisabled: setDisabledYargCues,
  getCues: getAvailableCues,
  renderCueLabel: (cue) => cueLabel(cue.id, cue.yargDescription),
  emptyLabel: NO_CUES_LABEL,
  cuesHeading: lightingCuesHeading,
}

const YargEnabledCueGroups: React.FC = () => <CueGroupsPanel domain={YARG_DOMAIN} />

export default YargEnabledCueGroups
