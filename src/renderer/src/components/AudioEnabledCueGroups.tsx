import React from 'react'
import {
  getAudioCueGroups,
  getEnabledAudioCueGroups,
  setEnabledAudioCueGroups,
  getAvailableAudioCues,
  getDisabledAudioCues,
  setDisabledAudioCues,
} from '../ipcApi'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import {
  CueGroupsPanel,
  type CueGroupsDomain,
  type CueGroupRowData,
  type CueRowData,
} from './cue-groups/CueGroupsPanel'
import { cueLabel, lightingCuesHeading, NO_CUES_LABEL } from './cue-groups/cueRowCopy'

interface AudioCueInfo extends CueRowData {
  description: string
  groupName?: string
}

interface AudioCueGroup extends CueGroupRowData {
  description: string
}

const AUDIO_DOMAIN: CueGroupsDomain<AudioCueGroup, AudioCueInfo> = {
  key: 'audio',
  label: 'audio',
  title: 'Audio Lighting Cue Groups',
  description:
    'Audio cue groups contain different implementations of the audio-reactive effects. Enable the groups you want available when Audio Reactive mode is running. You can disable individual cues within an enabled group; the group stays enabled if at least one cue remains on.',
  getGroups: getAudioCueGroups,
  getEnabled: getEnabledAudioCueGroups,
  setEnabled: setEnabledAudioCueGroups,
  getDisabled: getDisabledAudioCues,
  setDisabled: setDisabledAudioCues,
  getCues: getAvailableAudioCues,
  changedEvent: RENDERER_RECEIVE.AUDIO_CUE_GROUPS_CHANGED,
  renderCueLabel: (cue) => cueLabel(cue.id, cue.description),
  emptyLabel: NO_CUES_LABEL,
  cuesHeading: lightingCuesHeading,
}

const AudioEnabledCueGroups: React.FC = () => <CueGroupsPanel domain={AUDIO_DOMAIN} />

export default AudioEnabledCueGroups
