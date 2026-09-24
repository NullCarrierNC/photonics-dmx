import type { ControllerLifecycle } from './ControllerLifecycle'
import type { ListenerLifecycleController } from './ListenerLifecycleController'
import type { ChainFanout } from '../../photonics-dmx/controllers/ChainFanout'
import { isNetworkSendError } from './SenderLifecycleController'
import { createLogger } from '../../shared/logger'

const log = createLogger('uncaughtFault')

/** How long one step of the fault response may take before the next one runs. */
const FAULT_STEP_TIMEOUT_MS = 1000

/** The manager surfaces the fault response drives. */
export interface FaultHost {
  getChainFanout(): ChainFanout
  stopTestEffect(): Promise<void>
  getListenerLifecycle(): ListenerLifecycleController
}

/** Runs `step`, logging a failure, and gives up waiting on it after the step timeout. */
async function boundedStep(name: string, step: () => Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | null = null
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      log.error(`${name} did not finish within ${FAULT_STEP_TIMEOUT_MS} ms, moving on`)
      resolve()
    }, FAULT_STEP_TIMEOUT_MS)
  })
  const run = (async () => step())().catch((error: unknown) => {
    log.error(`${name} failed:`, error)
  })
  try {
    await Promise.race([run, timeout])
  } finally {
    if (timer !== null) clearTimeout(timer)
  }
}

/**
 * The response to an uncaught exception that is not a network sender error.
 *
 * The throw may have left a controller half updated, so the graph is held `failed`: the renderer
 * shows its retry banner and input enables are refused until a restart rebuilds the graph. The rig
 * is blacked out and every input stopped, each step bounded so a wedged one cannot hold up the
 * rest. The process carries on, since DMX receivers hold the last frame they got and an exit would
 * leave the rig lit.
 */
export async function holdFailedAfterFault(
  error: unknown,
  lifecycle: ControllerLifecycle,
  host: FaultHost,
): Promise<void> {
  if (isNetworkSendError(error) || !lifecycle.markFaulted()) return
  log.error('Holding the lighting controllers failed and dark until they are restarted')

  const listeners = host.getListenerLifecycle()
  await boundedStep('Blackout', () => host.getChainFanout().blackout(0))
  await boundedStep('Waiting for the running toggle', () => lifecycle.awaitActiveOp())
  await boundedStep('Stopping the test effect', () => host.stopTestEffect())
  await boundedStep('Disabling YARG', () => listeners.yargRb3.disableYarg())
  await boundedStep('Disabling RB3', () => listeners.yargRb3.disableRb3())
  await boundedStep('Disabling audio', () => listeners.audio.disableAudio())
}
