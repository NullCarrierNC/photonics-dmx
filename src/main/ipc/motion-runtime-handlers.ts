import type { IpcMain } from 'electron'
import type { ControllerManager } from '../controllers/ControllerManager'
import { handleInvoke } from './handleInvoke'
import { ipcError } from './ipcResult'
import { isPlainObject } from './inputValidation'
import { LIGHT } from '../../shared/ipcChannels'
import type { MotionCueChangePayload, MotionRuntimeDomain } from '../../shared/ipc/common'
import { createLogger } from '../../shared/logger'

const log = createLogger('motion-runtime-handlers')

const MOTION_RUNTIME_DOMAINS: readonly string[] = ['yarg', 'rb3', 'audio']

function isMotionRuntimeDomain(value: unknown): value is MotionRuntimeDomain {
  return typeof value === 'string' && MOTION_RUNTIME_DOMAINS.includes(value)
}

/**
 * The motion cue a domain is running right now. A simulation started from the Cue Simulation page
 * answers while it runs, otherwise the domain's live handler on the primary chain does. The
 * renderer seeds its motion labels from this.
 */
function runningMotionCue(
  controllerManager: ControllerManager,
  domain: MotionRuntimeDomain,
): MotionCueChangePayload {
  const sim = controllerManager.getMotionCueSimulator()
  const simulated = domain === 'audio' ? sim.activeAudioCueRef() : sim.activeNetCueRef(domain)
  if (simulated) {
    return { ref: simulated, source: 'auto', manualFallback: false }
  }
  const fanout = controllerManager.getChainFanout()
  return domain === 'audio' ? fanout.audioRunningMotionCue() : fanout.runningMotionCue(domain)
}

export function setupMotionRuntimeHandlers(
  ipcMain: IpcMain,
  controllerManager: ControllerManager,
): void {
  handleInvoke(ipcMain, LIGHT.GET_RUNNING_MOTION_CUE, log, async (_, payload: unknown) => {
    if (!isPlainObject(payload) || !isMotionRuntimeDomain(payload.domain)) {
      return ipcError(new Error('domain must be yarg, rb3 or audio'))
    }
    return runningMotionCue(controllerManager, payload.domain)
  })
}
