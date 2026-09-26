import { useCallback, useEffect, useState } from 'react'
import {
  getAudioMotionCueGroups,
  getAvailableAudioMotionCues,
  getAvailableRb3MotionCues,
  getAvailableYargMotionCues,
  getMotionEnabled,
  getRb3MotionCueGroups,
  getRunningMotionCue,
  getYargMotionCueGroups,
} from '../ipcApi'
import { addIpcListener, removeIpcListener } from '../utils/ipcHelpers'
import { useLatestGenerationGate } from './useLatestGenerationGate'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import type { MotionCueChangePayload, MotionRuntimeDomain } from '../../../shared/ipc/common'

type MotionRef = NonNullable<MotionCueChangePayload['ref']>

/** Where one platform's motion names come from, and the events that change them. */
interface MotionLabelSource {
  getGroups: () => Promise<Array<{ id: string; name: string }> | undefined>
  getCues: (groupId: string) => Promise<Array<{ id: string; name: string }>>
  /** Whether motion counts as on before main answers, and when the read fails. */
  motionAssumed: boolean
  /** Main names the new running cue on this channel. */
  cueChanged:
    | typeof RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE
    | typeof RENDERER_RECEIVE.RB3_MOTION_CUE_CHANGE
    | typeof RENDERER_RECEIVE.AUDIO_MOTION_CUE_CHANGE
  /** Events after which the running cue is read again. */
  reloadOn: ReadonlyArray<
    | typeof RENDERER_RECEIVE.MOTION_ENABLED_CHANGED
    | typeof RENDERER_RECEIVE.YARG_MOTION_CUE_GROUPS_CHANGED
    | typeof RENDERER_RECEIVE.RB3_MOTION_CUE_GROUPS_CHANGED
    | typeof RENDERER_RECEIVE.AUDIO_MOTION_CUE_GROUPS_CHANGED
    | typeof RENDERER_RECEIVE.AUDIO_ENABLE
    | typeof RENDERER_RECEIVE.AUDIO_DISABLE
  >
}

const SOURCES: Record<MotionRuntimeDomain, MotionLabelSource> = {
  yarg: {
    getGroups: getYargMotionCueGroups,
    getCues: getAvailableYargMotionCues,
    motionAssumed: true,
    cueChanged: RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE,
    reloadOn: [
      RENDERER_RECEIVE.MOTION_ENABLED_CHANGED,
      RENDERER_RECEIVE.YARG_MOTION_CUE_GROUPS_CHANGED,
    ],
  },
  rb3: {
    getGroups: getRb3MotionCueGroups,
    getCues: getAvailableRb3MotionCues,
    // The RB3 preview keeps its motion block hidden until main says motion is on.
    motionAssumed: false,
    cueChanged: RENDERER_RECEIVE.RB3_MOTION_CUE_CHANGE,
    reloadOn: [
      RENDERER_RECEIVE.MOTION_ENABLED_CHANGED,
      RENDERER_RECEIVE.RB3_MOTION_CUE_GROUPS_CHANGED,
    ],
  },
  audio: {
    getGroups: getAudioMotionCueGroups,
    getCues: getAvailableAudioMotionCues,
    motionAssumed: true,
    cueChanged: RENDERER_RECEIVE.AUDIO_MOTION_CUE_CHANGE,
    reloadOn: [
      RENDERER_RECEIVE.MOTION_ENABLED_CHANGED,
      RENDERER_RECEIVE.AUDIO_MOTION_CUE_GROUPS_CHANGED,
      RENDERER_RECEIVE.AUDIO_ENABLE,
      RENDERER_RECEIVE.AUDIO_DISABLE,
    ],
  },
}

export interface RunningMotionLabels {
  /**
   * Whether motion is on, the platform's assumed value until main answers. The labels are null
   * while it is off.
   */
  motionEnabled: boolean
  groupLabel: string | null
  cueLabel: string | null
}

const NOTHING_RUNNING = { groupLabel: null, cueLabel: null }

/** The names of a running cue and its group, or the ids when the names cannot be read. */
async function resolveLabels(
  source: MotionLabelSource,
  ref: MotionRef | null,
): Promise<Pick<RunningMotionLabels, 'groupLabel' | 'cueLabel'>> {
  if (!ref) return NOTHING_RUNNING
  try {
    const [groups, cues] = await Promise.all([source.getGroups(), source.getCues(ref.groupId)])
    return {
      groupLabel: groups?.find((g) => g.id === ref.groupId)?.name ?? ref.groupId,
      cueLabel: cues.find((c) => c.id === ref.cueId)?.name ?? ref.cueId,
    }
  } catch {
    return { groupLabel: ref.groupId, cueLabel: ref.cueId }
  }
}

/**
 * The motion cue main reports as running on one platform, named. Seeded from the running cue,
 * then kept current from main's change events. Group and cue are resolved together and only the
 * latest answer is shown, so two changes close together never mix one's group with the other's cue.
 */
export function useRunningMotionLabels(platform: MotionRuntimeDomain): RunningMotionLabels {
  const source = SOURCES[platform]
  const [labels, setLabels] = useState<RunningMotionLabels>({
    motionEnabled: source.motionAssumed,
    ...NOTHING_RUNNING,
  })
  const { nextGeneration, isCurrentGeneration } = useLatestGenerationGate()

  const showRef = useCallback(
    async (ref: MotionRef | null): Promise<void> => {
      const token = nextGeneration()
      const resolved = await resolveLabels(source, ref)
      if (isCurrentGeneration(token)) setLabels((prev) => ({ ...prev, ...resolved }))
    },
    [source, nextGeneration, isCurrentGeneration],
  )

  const reload = useCallback(async (): Promise<void> => {
    const token = nextGeneration()
    const motionEnabled = await getMotionEnabled().then(
      (enabled) => enabled === true,
      () => source.motionAssumed,
    )
    const running = motionEnabled ? await getRunningMotionCue(platform).catch(() => null) : null
    const resolved = await resolveLabels(source, running && 'ref' in running ? running.ref : null)
    if (isCurrentGeneration(token)) setLabels({ motionEnabled, ...resolved })
  }, [platform, source, nextGeneration, isCurrentGeneration])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async, setState runs only after the awaited IPC
    void reload()
    const onReload = () => void reload()
    const onCueChanged = (payload: MotionCueChangePayload) => void showRef(payload.ref)
    for (const channel of source.reloadOn) addIpcListener(channel, onReload)
    addIpcListener(source.cueChanged, onCueChanged)
    return () => {
      for (const channel of source.reloadOn) removeIpcListener(channel, onReload)
      removeIpcListener(source.cueChanged, onCueChanged)
    }
  }, [source, reload, showRef])

  return labels
}
