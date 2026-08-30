import { getStrobeStateManager } from '../../photonics-dmx/controllers/StrobeStateManager'
import { sendToAllWindows } from '../utils/windowUtils'
import { RENDERER_RECEIVE } from '../../shared/ipcChannels'
import type { LifecyclePhase } from '../../shared/ipcTypes'
import { ControllerLifecycle, LifecycleAbortedError } from './ControllerLifecycle'
import type { ControllerGraph } from './ControllerGraph'
import type { ListenerLifecycleController } from './ListenerLifecycleController'
import type { SenderLifecycleController } from './SenderLifecycleController'
import type { ConsoleModeController } from './ConsoleModeController'
import type { MotionCueSimulator } from './MotionCueSimulator'
import { createLogger } from '../../shared/logger'

const log = createLogger('ControllerManager')

/** The manager surfaces the restart routine drives. */
export interface ControllerRestartContext {
  lifecycle: ControllerLifecycle
  graph: ControllerGraph
  listenerLifecycle: ListenerLifecycleController
  senderLifecycle: SenderLifecycleController
  consoleMode: ConsoleModeController
  motionCueSimulator: MotionCueSimulator
  init(): Promise<void>
  isInitialized(): boolean
  setInitialized(value: boolean): void
  /** Snapshot of the restart-teardown callbacks registered with the manager. */
  restartTeardownListeners(): ReadonlyArray<() => void>
}

/**
 * The restart routine: dequeue race checks, listener and graph teardown, restart-listener fan-out,
 * reinit, and listener/sender/console restore. Runs inside the lifecycle's shared-restart
 * operation on the op queue; the context carries the manager surfaces it drives.
 */
export async function runControllerRestart(ctx: ControllerRestartContext): Promise<void> {
  // A shutdown may have started while this restart waited its turn on the queue; abort cleanly
  // (typed) rather than failing assertPhase with a generic invalid-lifecycle error. Snapshot into
  // a local so the check doesn't narrow `ctx.lifecycle.phase` for the post-teardown guard below.
  const phaseAtDequeue: LifecyclePhase = ctx.lifecycle.phase
  if (
    phaseAtDequeue === 'shuttingDown' ||
    phaseAtDequeue === 'stopped' ||
    ctx.lifecycle.isShutdownInFlight()
  ) {
    throw new LifecycleAbortedError('restartControllers aborted: shutdown in progress')
  }
  ctx.lifecycle.assertPhase(['running', 'consoleMode', 'failed'], 'restartControllers')
  ctx.lifecycle.setPhase('restarting')
  log.info('Restarting controllers to apply configuration changes')

  // The lifecycle queue guarantees no listener toggle is mid-flight here, so the was-enabled
  // snapshot is stable and rig chains can't be disposed under an in-flight enable.
  const wasYargEnabled = ctx.listenerLifecycle.yargRb3.getIsYargEnabled()
  const wasRb3Enabled = ctx.listenerLifecycle.yargRb3.getIsRb3Enabled()
  const wasAudioEnabled = ctx.listenerLifecycle.audio.getIsAudioEnabled()
  const activeSendersBeforeRestart = ctx.senderLifecycle.getActiveOutputSenderSnapshotIfAny()
  const wasConsoleMode = ctx.consoleMode.getConsoleRestore() !== null

  let teardownSucceeded = false
  try {
    if (wasYargEnabled) {
      await ctx.listenerLifecycle.yargRb3.disableYarg()
    }
    if (wasRb3Enabled) {
      await ctx.listenerLifecycle.yargRb3.disableRb3()
    }
    if (wasAudioEnabled) {
      await ctx.listenerLifecycle.audio.disableAudio()
    }

    await ctx.graph.disposeChainsForRestart()

    await ctx.graph.shutdownPublisher()
    await ctx.senderLifecycle.resetSenderForControllerRestart()

    ctx.graph.shutdownDomainCueHandlerRefs()

    // Gguarantee the process-wide strobe state is cleared on every restart,
    // even if no cue handler was active to clear it during its own shutdown.
    // Prevents a stale strobe slot from driving hardware-strobe-channel
    // lights after an input-platform switch.
    getStrobeStateManager().setActive(null)

    // Drop process-scoped state bound to the engine/registry being rebuilt (e.g. an active laser sim
    // cue + its render tick). Each callback is wrapped so one consumer's failure can neither abort the
    // restart nor skip the others. Iterate a snapshot so a listener that unregisters during the loop
    // cannot shift the array under the iterator and skip its neighbour.
    for (const listener of ctx.restartTeardownListeners()) {
      try {
        listener()
      } catch (err) {
        log.error('Error running controller-restart callback:', err)
      }
    }

    // Drop any active simulated motion cue — the chains it drove are being rebuilt, so a held cue
    // would otherwise execute against torn-down sequencers on the next simulate tick. Wrapped so a
    // reset failure can never abort the controller restart.
    try {
      ctx.motionCueSimulator.reset()
    } catch (err) {
      log.error('Error resetting motion cue simulator during restart:', err)
    }

    // Clear the shared tick source so `init()` builds a fresh one rather than reusing
    // a clock whose tick callbacks have been unregistered.
    ctx.graph.destroyClock()

    ctx.graph.clearBuildRefs()

    ctx.setInitialized(false)

    teardownSucceeded = true
    log.info('Controllers shutdown completed, reinitializing')
  } catch (error) {
    log.error('Error shutting down controllers:', error)
  }

  // If shutdown began while we were tearing down, do not reinitialize. The shutdown promise
  // owns the next phase transition; restartControllers exits with a typed abort.
  if (
    ctx.lifecycle.phase === 'shuttingDown' ||
    ctx.lifecycle.phase === 'stopped' ||
    ctx.lifecycle.isShutdownInFlight()
  ) {
    log.info('Restart aborted: shutdown started during teardown')
    throw new LifecycleAbortedError(
      'restartControllers aborted: shutdown started before reinitialization',
    )
  }

  // A teardown failure (with no concurrent shutdown) leaves controllers partially torn down.
  // Reinitializing on top of that risks dangling listeners/timers and double-published state,
  // so fail the restart instead of building a fresh graph over a broken one.
  if (!teardownSucceeded) {
    log.error('Restart aborted: controller teardown did not complete; not reinitializing')
    ctx.lifecycle.setPhase('failed')
    ctx.setInitialized(false)
    throw new Error('Controller teardown failed during restart; reinitialization aborted')
  }

  try {
    await ctx.init()
    ctx.lifecycle.setPhase(wasConsoleMode ? 'consoleMode' : 'running')
    ctx.consoleMode.onControllersReinitializedWhileConsoleOpen()

    if (wasYargEnabled) {
      // Drive the listener directly: the public toggles are queued lifecycle ops and would
      // deadlock behind this restart's own queue slot.
      await ctx.listenerLifecycle.yargRb3.enableYarg(ctx.isInitialized(), () => ctx.init())
    } else if (wasRb3Enabled) {
      await ctx.listenerLifecycle.yargRb3.enableRb3(ctx.isInitialized(), () => ctx.init())
    }

    if (wasAudioEnabled) {
      await ctx.listenerLifecycle.audio.enableAudio(ctx.isInitialized(), () => ctx.init())
    }

    // Restore DMX output senders from persisted preferences so that output
    // continues without requiring a manual toggle after any config change.
    await ctx.senderLifecycle.restoreSenderOutputsFromPrefs(activeSendersBeforeRestart ?? undefined)

    // Single source of the restart broadcast: every caller of restartControllers() used to fire
    // this itself (and SET_CLOCK_RATE forgot to), so broadcast once here after a successful restart
    // and let the callers drop their copies.
    sendToAllWindows(RENDERER_RECEIVE.CONTROLLERS_RESTARTED, undefined)

    log.info('Controllers restarted successfully')
  } catch (error) {
    if (error instanceof LifecycleAbortedError) {
      // Shutdown raced reinit; let the shutdown promise own the final state.
      log.info('Reinit aborted by concurrent shutdown')
      throw error
    }
    log.error('Error reinitializing controllers:', error)
    ctx.lifecycle.setPhase('failed')
    ctx.setInitialized(false)
    throw error
  }
}
