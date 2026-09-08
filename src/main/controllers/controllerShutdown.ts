/**
 * App-exit teardown, the mirror of `controllerRestart` for the path that does not come back up.
 */
import type { ControllerLifecycle } from './ControllerLifecycle'
import type { ControllerGraph } from './ControllerGraph'
import type { ListenerLifecycleController } from './ListenerLifecycleController'
import type { SenderLifecycleController } from './SenderLifecycleController'
import { createLogger } from '../../shared/logger'

const log = createLogger('ControllerManager')

/** The manager surfaces the shutdown routine drives. */
export interface ControllerShutdownContext {
  lifecycle: ControllerLifecycle
  graph: ControllerGraph
  listenerLifecycle: ListenerLifecycleController
  senderLifecycle: SenderLifecycleController
  setInitialized(value: boolean): void
}

/**
 * Tears down every controller in reverse order of initialization.
 *
 * Each listener is disabled in its own try so one failure does not strand the rest, and the phase
 * allows 'shuttingDown' as a starting point so a retry after a failed teardown can run again.
 */
export async function runControllerShutdown(ctx: ControllerShutdownContext): Promise<void> {
  ctx.lifecycle.assertPhase(
    ['initializing', 'running', 'restarting', 'consoleMode', 'failed', 'shuttingDown'],
    'shutdown',
  )
  ctx.lifecycle.setPhase('shuttingDown')
  log.info('ControllerManager shutdown: starting')

  try {
    await ctx.listenerLifecycle.yargRb3.disableYarg()
    log.info('ControllerManager shutdown: YARG disabled')
  } catch (err) {
    log.error('Error disabling YARG:', err)
  }

  try {
    await ctx.listenerLifecycle.yargRb3.disableRb3()
    log.info('ControllerManager shutdown: RB3 disabled')
  } catch (err) {
    log.error('Error disabling RB3:', err)
  }

  try {
    await ctx.listenerLifecycle.audio.disableAudio()
    log.info('ControllerManager shutdown: Audio disabled')
  } catch (err) {
    log.error('Error disabling Audio:', err)
  }

  await ctx.graph.disposeLoaders()
  ctx.graph.shutdownDomainCueHandlerRefs()
  await ctx.graph.disposeChainsForShutdown()
  await ctx.graph.shutdownPublisherSafe()
  ctx.graph.destroyClock()

  try {
    await ctx.senderLifecycle.shutdownSenderOnAppExit()
    log.info('ControllerManager shutdown: sender manager stopped')
  } catch (err) {
    log.error('Error shutting down sender manager:', err)
  }

  ctx.setInitialized(false)
  log.info('ControllerManager shutdown: completed')
}
