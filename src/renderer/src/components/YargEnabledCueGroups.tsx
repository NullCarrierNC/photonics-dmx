import React from 'react'
import {
  getCueGroups,
  getEnabledCueGroups,
  setEnabledCueGroups,
  getAvailableCues,
  getDisabledYargCues,
  setDisabledYargCues,
} from '../ipcApi'
import {
  LightingCueGroupsPanel,
  type LightingCueGroupsDomain,
} from './cue-groups/LightingCueGroupsPanel'

const YARG_DOMAIN: LightingCueGroupsDomain = {
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
  describeCue: (cue) => cue.yargDescription,
}

const YargEnabledCueGroups: React.FC = () => <LightingCueGroupsPanel domain={YARG_DOMAIN} />

export default YargEnabledCueGroups
