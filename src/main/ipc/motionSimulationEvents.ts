import { RENDERER_RECEIVE } from '../../shared/ipcChannels'
import type { MotionCueChangePayload, MotionRuntimeDomain } from '../../shared/ipc/common'
import { sendToAllWindows } from '../utils/windowUtils'
import type { ActiveMotionSimDomains } from '../controllers/MotionCueSimulator'

/** The motion-change channel each domain's preview listens on. */
const CHANGE_CHANNEL: Record<MotionRuntimeDomain, string> = {
  yarg: RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE,
  rb3: RENDERER_RECEIVE.RB3_MOTION_CUE_CHANGE,
  audio: RENDERER_RECEIVE.AUDIO_MOTION_CUE_CHANGE,
}

/** Tell the renderer a simulated motion cue has started in `domain`. */
export function sendMotionSimStarted(
  domain: MotionRuntimeDomain,
  ref: { groupId: string; cueId: string },
): void {
  const payload: MotionCueChangePayload = { ref, source: 'auto', manualFallback: false }
  sendToAllWindows(CHANGE_CHANNEL[domain], payload)
}

/** Tell the renderer which domains' simulated motion cues have just stopped. */
export function sendMotionSimCleared(active: ActiveMotionSimDomains): void {
  const payload: MotionCueChangePayload = { ref: null, source: 'cleared', manualFallback: false }
  for (const domain of Object.keys(active) as MotionRuntimeDomain[]) {
    if (active[domain]) {
      sendToAllWindows(CHANGE_CHANNEL[domain], payload)
    }
  }
}
