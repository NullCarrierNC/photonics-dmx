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
  disableConsoleMode(): Promise<unknown>
  preemptSimulation(): Promise<void>
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
 * shows its retry banner, and input enables and console entry are refused until a restart rebuilds
 * the graph. The console is left first, since the publisher ignores cue frames while it holds a
 * manual buffer. The simulations run off the queue, so they stop before the blackout and the rig
 * stays dark while the inputs wait on a running toggle. Each step is bounded so a wedged one
 * cannot hold up the rest. The process carries on, since DMX receivers hold the last frame they
 * got and an exit would leave the rig lit.
 */
export async function holdFailedAfterFault(
  error: unknown,
  lifecycle: ControllerLifecycle,
  host: FaultHost,
): Promise<void> {
  if (isNetworkSendError(error) || !lifecycle.markFaulted()) return
  log.error('Holding the lighting controllers failed and dark until they are restarted')

  const listeners = host.getListenerLifecycle()
  const stopInputs = async (): Promise<void> => {
    await boundedStep('Disabling YARG', () => listeners.yargRb3.disableYarg())
    await boundedStep('Disabling RB3', () => listeners.yargRb3.disableRb3())
    await boundedStep('Disabling audio', () => listeners.audio.disableAudio())
  }
  await boundedStep('Leaving the console', async () => {
    await host.disableConsoleMode()
  })
  await boundedStep('Stopping the simulations', () => host.preemptSimulation())
  await boundedStep('Blackout', () => host.getChainFanout().blackout(0))
  await boundedStep('Waiting for the running toggle', () => lifecycle.awaitActiveOp())
  await stopInputs()

  // An enable or restart that outlasted its wait binds its input as it lands, so the inputs are
  // stopped again once it settles, unless a restart has cleared the fault by then.
  await lifecycle.awaitActiveOp()
  if (lifecycle.isFaulted()) await stopInputs()
}
