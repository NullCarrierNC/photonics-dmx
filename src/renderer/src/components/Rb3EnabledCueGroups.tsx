import React from 'react'
import {
  getRb3CueGroups,
  getEnabledRb3CueGroups,
  setEnabledRb3CueGroups,
  getAvailableRb3Cues,
  getDisabledRb3Cues,
  setDisabledRb3Cues,
} from '../ipcApi'
import {
  LightingCueGroupsPanel,
  type LightingCueGroupsDomain,
} from './cue-groups/LightingCueGroupsPanel'

const RB3_DOMAIN: LightingCueGroupsDomain = {
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
  // RB3 cues carry their own wording where they have it, and fall back to the YARG description.
  describeCue: (cue) => cue.rb3Description || cue.yargDescription,
}

const Rb3EnabledCueGroups: React.FC = () => <LightingCueGroupsPanel domain={RB3_DOMAIN} />

export default Rb3EnabledCueGroups
