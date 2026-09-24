import { jest } from '@jest/globals'
import { ControllerLifecycle } from '../../controllers/ControllerLifecycle'
import { ControllerManager } from '../../controllers/ControllerManager'
import type { ControllerGraph } from '../../controllers/ControllerGraph'
import type { ConfigurationManager } from '../../../services/configuration/ConfigurationManager'
import type { LifecyclePhase } from '../../../shared/ipcTypes'

/**
 * A lifecycle already sitting in `phase`, for a manager built by {@link stubbedManager} or a suite
 * that drives the lifecycle alone. Phase broadcasts go nowhere, so no renderer stub is needed.
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
      refreshAudioCueSelection: jest.fn(),
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
    buildChains: jest.fn(),
    buildPrimaryYargHandler: jest.fn(),
    getChains: jest.fn().mockReturnValue([]),
    getDmxPublisher: jest.fn().mockReturnValue(null),
  } as unknown as ControllerGraph
}

/** Preferences a manager reads while it wires its collaborators. */
export function stubConfig(prefs: Record<string, unknown> = {}): ConfigurationManager {
  return {
    getPreference: (key: string) => prefs[key],
    getAllPreferences: () => prefs,
    getCueGroupSelectionMode: () => 'withinSong',
    getDmxRig: (id: string) => ({ id }),
  } as unknown as ConfigurationManager
}

/** The sender surface a restart snapshots, resets and restores, and a shutdown stops. */
export function senderLifecycleStub() {
  return {
    getActiveOutputSenderSnapshotIfAny: jest.fn().mockReturnValue(null),
    resetSenderForControllerRestart: jest.fn(async () => {}),
    restoreRunningSenders: jest.fn(async (_snapshot: unknown) => {}),
    shutdownSenderOnAppExit: jest.fn(async () => {}),
    getSenderManager: jest.fn(),
    ensureSenderManager: jest.fn(),
    setSenderErrorTrackingCallback: jest.fn(),
  }
}

/** The console surface a restart reads and hands back to. */
export function consoleModeStub() {
  return {
    getConsoleRestore: jest.fn().mockReturnValue(null),
    onControllersReinitializedWhileConsoleOpen: jest.fn(),
  }
}

export interface StubbedManagerOptions {
  lifecycle?: ControllerLifecycle
  graph?: ControllerGraph
  listeners?: ReturnType<typeof listenerStub>
  senders?: ReturnType<typeof senderLifecycleStub>
  consoleMode?: ReturnType<typeof consoleModeStub>
  /** Let the manager build its own console controller over the stub listeners. */
  ownConsoleMode?: boolean
  /**
   * Stands in for the graph build. Brings the lifecycle to running unless a suite says otherwise.
   */
  init?: (lifecycle: ControllerLifecycle) => Promise<void>
  /** The registry loaders and `config` for the manager's own graph build over the stubs. */
  ownInit?: { registryInit: Record<string, unknown>; config: ConfigurationManager }
}

export interface StubbedManager {
  manager: ControllerManager
  lifecycle: ControllerLifecycle
  graph: ControllerGraph
  listeners: ReturnType<typeof listenerStub>
  senders: ReturnType<typeof senderLifecycleStub>
  consoleMode: ReturnType<typeof consoleModeStub>
  init: jest.Mock<(lifecycle: ControllerLifecycle) => Promise<void>>
}

/**
 * A ControllerManager built through its dependencies, with stub collaborators and graph, for
 * suites that drive a restart, a shutdown or a toggle. It starts initialized, as a running app is.
 */
export function stubbedManager(options: StubbedManagerOptions = {}): StubbedManager {
  const lifecycle = options.lifecycle ?? lifecycleAt('running')
  const graph = options.graph ?? restartGraph()
  const listeners = options.listeners ?? listenerStub()
  const senders = options.senders ?? senderLifecycleStub()
  const consoleMode = options.consoleMode ?? consoleModeStub()
  const testEffects = () => ({ cancel: jest.fn(), stopTestEffect: jest.fn(async () => {}) })
  const manager = new ControllerManager({
    config: options.ownInit?.config ?? stubConfig(),
    lifecycle,
    graph,
    collaborators: {
      listenerLifecycle: listeners,
      senderLifecycle: senders,
      ...(options.ownConsoleMode ? {} : { consoleMode }),
      motionCueSimulator: { reset: jest.fn() },
      testEffectRunner: testEffects(),
      rb3TestEffectRunner: testEffects(),
      registryInit: options.ownInit?.registryInit ?? {},
    } as never,
  })
  const init = jest.fn(
    options.init ??
      (async (current: ControllerLifecycle) => {
        current.setPhase('running')
      }),
  )
  const internals = manager as unknown as { isInitialized: boolean; init: () => Promise<void> }
  internals.isInitialized = true
  if (!options.ownInit) {
    internals.init = async () => {
      await init(lifecycle)
      internals.isInitialized = true
    }
  }
  return { manager, lifecycle, graph, listeners, senders, consoleMode, init }
}
