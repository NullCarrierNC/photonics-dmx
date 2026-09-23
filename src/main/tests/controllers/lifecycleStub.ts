import { jest } from '@jest/globals'
import { ControllerLifecycle } from '../../controllers/ControllerLifecycle'
import type { ControllerGraph } from '../../controllers/ControllerGraph'
import type { LifecyclePhase } from '../../../shared/ipcTypes'

/**
 * A lifecycle already sitting in `phase`, for tests that drive ControllerManager methods against a
 * partial prototype stub. Phase broadcasts go nowhere, so no renderer stub is needed.
 */
export function lifecycleAt(phase: LifecyclePhase): ControllerLifecycle {
  const lifecycle = new ControllerLifecycle(() => {})
  lifecycle.setPhase(phase)
  return lifecycle
}

/**
 * A lifecycle whose operation queue is occupied until `barrier` settles, so a test can observe what
 * a caller does while another lifecycle op holds the queue.
 */
export function lifecycleBlockedOn(
  barrier: Promise<void>,
  phase: LifecyclePhase = 'running',
): ControllerLifecycle {
  const lifecycle = lifecycleAt(phase)
  void lifecycle.runOp(() => barrier)
  return lifecycle
}

/**
 * A lifecycle with a shutdown in flight until `barrier` settles, so a test can observe how a
 * caller yields to (or aborts against) an ongoing shutdown.
 */
export function lifecycleShuttingDownOn(
  barrier: Promise<void>,
  phase: LifecyclePhase = 'shuttingDown',
): ControllerLifecycle {
  const lifecycle = lifecycleAt(phase)
  lifecycle.runExclusiveShutdown(() => barrier).catch(() => {})
  return lifecycle
}

/** Listener controllers that report everything off and toggle as resolved no-op mocks. */
export function listenerStub() {
  return {
    yargRb3: {
      getIsYargEnabled: jest.fn().mockReturnValue(false),
      getIsRb3Enabled: jest.fn().mockReturnValue(false),
      disableYarg: jest.fn().mockImplementation(() => Promise.resolve()),
      disableRb3: jest.fn().mockImplementation(() => Promise.resolve()),
      enableYarg: jest.fn().mockImplementation(() => Promise.resolve()),
      enableRb3: jest.fn().mockImplementation(() => Promise.resolve()),
    },
    audio: {
      getIsAudioEnabled: jest.fn().mockReturnValue(false),
      disableAudio: jest.fn().mockImplementation(() => Promise.resolve()),
      enableAudio: jest.fn().mockImplementation(() => Promise.resolve()),
    },
  }
}

/** A graph whose build/teardown steps are observable no-op mocks. */
export function restartGraph(): ControllerGraph {
  return {
    disposeChainsForRestart: jest.fn(),
    disposeChainsForShutdown: jest.fn(),
    disposeLoaders: jest.fn().mockImplementation(() => Promise.resolve()),
    shutdownPublisher: jest.fn(),
    shutdownPublisherSafe: jest.fn(),
    shutdownDomainCueHandlerRefs: jest.fn(),
    resetStrobeState: jest.fn(),
    destroyClock: jest.fn(),
    clearBuildRefs: jest.fn(),
    getChains: jest.fn().mockReturnValue([]),
  } as unknown as ControllerGraph
}
