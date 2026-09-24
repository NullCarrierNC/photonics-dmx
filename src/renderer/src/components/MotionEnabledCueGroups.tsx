import React, { useMemo } from 'react'
import {
  getYargMotionCueGroups,
  getAudioMotionCueGroups,
  getEnabledYargMotionCueGroups,
  setEnabledYargMotionCueGroups,
  getAvailableYargMotionCues,
  getDisabledYargMotionCues,
  setDisabledYargMotionCues,
  getEnabledAudioMotionCueGroups,
  setEnabledAudioMotionCueGroups,
  getAvailableAudioMotionCues,
  getDisabledAudioMotionCues,
  setDisabledAudioMotionCues,
  getRb3MotionCueGroups,
  getEnabledRb3MotionCueGroups,
  setEnabledRb3MotionCueGroups,
  getAvailableRb3MotionCues,
  getDisabledRb3MotionCues,
  setDisabledRb3MotionCues,
} from '../ipcApi'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import {
  CueGroupsPanel,
  type CueGroupsDomain,
  type CueGroupRowData,
  type CueRowData,
} from './cue-groups/CueGroupsPanel'

interface MotionCueInfo extends CueRowData {
  name: string
  description: string
}

interface MotionCueGroup extends CueGroupRowData {
  cueCount: number
}

export interface MotionEnabledCueGroupsProps {
  /**
   * YARG motion runs with YARG lighting; audio motion runs alongside audio-reactive lighting;
   * rb3 motion runs with the RB3 StageKit cue-mode look.
   */
  platform: 'yarg' | 'audio' | 'rb3'
}

/** A motion row names the program, then its id, then what it does. */
const motionCueLabel = (cue: MotionCueInfo): React.ReactNode => (
  <>
    <span className="font-medium text-gray-800 dark:text-gray-200">{cue.name}</span>
    <span className="text-gray-500 dark:text-gray-500"> ({cue.id})</span>
    {cue.description ? <> - {cue.description}</> : null}
  </>
)

const MOTION_SHARED = {
  renderCueLabel: motionCueLabel,
  emptyLabel: 'No motion programs found in this group.',
  cuesHeading: (count: number) => `Motion programs in this group (${count}):`,
}

/** Per-platform IPC + copy binding; the three motion domains share identical channel shapes. */
function motionDomain(
  platform: 'yarg' | 'audio' | 'rb3',
): CueGroupsDomain<MotionCueGroup, MotionCueInfo> {
  switch (platform) {
    case 'yarg':
      return {
        ...MOTION_SHARED,
        key: 'motion-yarg',
        label: 'YARG motion',
        title: 'YARG Motion Cue Groups',
        description:
          'YARG motion programs run in parallel with YARG lighting cues and control pan/tilt on moving heads. Enable the groups you want in the random pool. You can disable individual motion programs within an enabled group; the group stays enabled if at least one program remains on.',
        getGroups: getYargMotionCueGroups,
        getEnabled: getEnabledYargMotionCueGroups,
        setEnabled: setEnabledYargMotionCueGroups,
        getDisabled: getDisabledYargMotionCues,
        setDisabled: setDisabledYargMotionCues,
        getCues: getAvailableYargMotionCues,
        changedEvent: RENDERER_RECEIVE.YARG_MOTION_CUE_GROUPS_CHANGED,
      }
    case 'rb3':
      return {
        ...MOTION_SHARED,
        key: 'motion-rb3',
        label: 'RB3 motion',
        title: 'RB3 Motion Cue Groups',
        description:
          'RB3 motion programs run alongside the RB3 StageKit cue-mode look and control pan/tilt on moving heads. Enable the groups you want in the random pool. You can disable individual motion programs within an enabled group; the group stays enabled if at least one program remains on.',
        getGroups: getRb3MotionCueGroups,
        getEnabled: getEnabledRb3MotionCueGroups,
        setEnabled: setEnabledRb3MotionCueGroups,
        getDisabled: getDisabledRb3MotionCues,
        setDisabled: setDisabledRb3MotionCues,
        getCues: getAvailableRb3MotionCues,
        changedEvent: RENDERER_RECEIVE.RB3_MOTION_CUE_GROUPS_CHANGED,
      }
    case 'audio':
    default:
      return {
        ...MOTION_SHARED,
        key: 'motion-audio',
        label: 'audio motion',
        title: 'Audio Motion Cue Groups',
        description:
          'Audio motion programs run alongside audio-reactive lighting cues (same timing as your primary/secondary/strobe layers) and control pan/tilt on moving heads. Enable the groups you want in the random pool. You can disable individual motion programs within an enabled group; the group stays enabled if at least one program remains on.',
        getGroups: getAudioMotionCueGroups,
        getEnabled: getEnabledAudioMotionCueGroups,
        setEnabled: setEnabledAudioMotionCueGroups,
        getDisabled: getDisabledAudioMotionCues,
        setDisabled: setDisabledAudioMotionCues,
        getCues: getAvailableAudioMotionCues,
        changedEvent: RENDERER_RECEIVE.AUDIO_MOTION_CUE_GROUPS_CHANGED,
      }
  }
}

const MotionEnabledCueGroups: React.FC<MotionEnabledCueGroupsProps> = ({ platform }) => {
  const domain = useMemo(() => motionDomain(platform), [platform])
  return <CueGroupsPanel domain={domain} />
}

export default MotionEnabledCueGroups
