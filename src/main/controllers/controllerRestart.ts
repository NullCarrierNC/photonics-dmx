import { sendToAllWindows } from '../utils/windowUtils'
import { RENDERER_RECEIVE } from '../../shared/ipcChannels'
import { ControllerLifecycle, LifecycleAbortedError } from './ControllerLifecycle'
import type { ControllerGraph } from './ControllerGraph'
import type { ListenerLifecycleController } from './ListenerLifecycleController'
import type { SenderLifecycleController } from './SenderLifecycleController'
import type { MotionCueSimulator } from './MotionCueSimulator'
import { createLogger } from '../../shared/logger'
import { TeardownSteps } from '../../photonics-dmx/helpers/teardownSteps'

const log = createLogger('ControllerManager')

/** The manager surfaces the restart routine drives. */
export interface ControllerRestartContext {
  lifecycle: ControllerLifecycle
  graph: ControllerGraph
  listenerLifecycle: ListenerLifecycleController
  senderLifecycle: SenderLifecycleController
  motionCueSimulator: MotionCueSimulator
  init(): Promise<void>
  isInitialized(): boolean
  setInitialized(value: boolean): void
  /** Snapshot of the restart-teardown callbacks registered with the manager. */
  restartTeardownListeners(): ReadonlyArray<() => void>
}

/**
 * The restart routine: dequeue race checks, listener and graph teardown, restart-listener fan-out,
 * reinit, and listener and sender restore. Runs inside the lifecycle's shared-restart
 * operation on the op queue; the context carries the manager surfaces it drives.
 */
/**
 * A shutdown owns the next phase transition once it has begun, so a restart checks before each
 * step that would reopen something and stops with a typed abort.
 */
function abortIfShuttingDown(lifecycle: ControllerLifecycle, stage: string): void {
  if (lifecycle.isShuttingDown()) {
    log.info(`Restart aborted: shutdown started ${stage}`)
    throw new LifecycleAbortedError(`restartControllers aborted: shutdown started ${stage}`)
  }
}

export async function runControllerRestart(ctx: ControllerRestartContext): Promise<void> {
  // A shutdown may have started while this restart waited its turn on the queue.
  abortIfShuttingDown(ctx.lifecycle, 'before the restart ran')
  ctx.lifecycle.assertPhase(['running', 'consoleMode', 'failed'], 'restartControllers')
  ctx.lifecycle.setPhase('restarting')
  const faultMark = ctx.lifecycle.faultMark()
  log.info('Restarting controllers to apply configuration changes')

  // The lifecycle queue guarantees no listener toggle is mid-flight here, so the was-enabled
  // snapshot is stable and rig chains can't be disposed under an in-flight enable. An RB3 runtime
  // error tears its session down outside the queue and reports RB3 disabled as soon as it starts,
  // so the teardown below always calls disableRb3, which waits that teardown out.
  const wasYargEnabled = ctx.listenerLifecycle.yargRb3.getIsYargEnabled()
  const wasRb3Enabled = ctx.listenerLifecycle.yargRb3.getIsRb3Enabled()
  const wasAudioEnabled = ctx.listenerLifecycle.audio.getIsAudioEnabled()
  const activeSendersBeforeRestart = ctx.senderLifecycle.getActiveOutputSenderSnapshotIfAny()

  let teardownSucceeded = false
  try {
    if (wasYargEnabled) {
      await ctx.listenerLifecycle.yargRb3.disableYarg()
    }
    await ctx.listenerLifecycle.yargRb3.disableRb3()
    if (wasAudioEnabled) {
      await ctx.listenerLifecycle.audio.disableAudio()
    }

    ctx.graph.disposeChainsForRestart()

    ctx.graph.shutdownPublisher()
    await ctx.senderLifecycle.resetSenderForControllerRestart()

    ctx.graph.shutdownDomainCueHandlerRefs()

    // Clear the shared strobe state even when no cue handler was active to clear it on shutdown,
    // so a stale strobe slot never drives hardware-strobe-channel lights after an input switch.
    ctx.graph.resetStrobeState()

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
    // The graph is not rebuilt over a failed teardown, so nothing it left running may keep driving
    // the rig: the strobe slot clears, the publisher sends its final blackout and the clock stops.
    const safety = new TeardownSteps(log)
    safety.run('clearing the strobe slot', () => ctx.graph.resetStrobeState())
    safety.run('stopping the DMX publisher', () => ctx.graph.shutdownPublisherSafe())
    safety.run('stopping the clock', () => ctx.graph.destroyClock())
  }

  abortIfShuttingDown(ctx.lifecycle, 'during teardown')

  // A teardown failure (with no concurrent shutdown) leaves controllers partially torn down.
  // Reinitializing on top of that risks dangling listeners/timers and double-published state,
  // so fail the restart instead of building a fresh graph over a broken one.
  if (!teardownSucceeded) {
    log.error('Restart aborted: controller teardown did not complete; not reinitializing')
    ctx.lifecycle.setPhase('failed')
    ctx.setInitialized(false)
    throw new Error('Controller teardown failed during restart; reinitialization aborted')
  }

  // From here the rebuild reads the configuration, so a later request needs a restart of its own.
  ctx.lifecycle.markRestartRebuildStarted()
  try {
    await ctx.init()
    abortIfShuttingDown(ctx.lifecycle, 'during reinitialization')

    // A fault that arose during this restart holds the graph failed, so the inputs it snapshotted
    // stay off.
    if (!ctx.lifecycle.faultedSince(faultMark)) {
      if (wasYargEnabled) {
        // Drive the listener directly: the public toggles are queued lifecycle ops and would
        // deadlock behind this restart's own queue slot.
        await ctx.listenerLifecycle.yargRb3.enableYarg(ctx.isInitialized(), () => ctx.init())
      } else if (wasRb3Enabled) {
        await ctx.listenerLifecycle.yargRb3.enableRb3(ctx.isInitialized(), () => ctx.init())
      }

      // One input drives the rig at a time, so a snapshot holding audio beside a network listener
      // comes back as the listener alone.
      abortIfShuttingDown(ctx.lifecycle, 'while listeners were restored')
      if (wasAudioEnabled && !wasYargEnabled && !wasRb3Enabled) {
        await ctx.listenerLifecycle.audio.enableAudio(ctx.isInitialized(), () => ctx.init())
      }
    }

    abortIfShuttingDown(ctx.lifecycle, 'before senders were restored')
    if (activeSendersBeforeRestart) {
      await ctx.senderLifecycle.restoreRunningSenders(activeSendersBeforeRestart)
    }

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
