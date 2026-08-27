import { ConfigurationManager } from '../../services/configuration/ConfigurationManager'
import { normalizeRb3ProcessingMode } from '../../services/configuration/configurationDefaults'
import { DmxLightManager } from '../../photonics-dmx/controllers/DmxLightManager'
import { DmxPublisher } from '../../photonics-dmx/controllers/DmxPublisher'
import { ILightingController } from '../../photonics-dmx/controllers/sequencer/interfaces'
import { ChainCueRuntime } from '../../photonics-dmx/controllers/ChainCueRuntime'
import type { CueHandler } from '../../photonics-dmx/cueHandlers/CueHandler'
import type { NetCueMode } from '../../photonics-dmx/cues/types/nodeCueTypes'
import type { NodeCueLoader } from '../../photonics-dmx/cues/node/loader/NodeCueLoader'
import type { EffectLoader } from '../../photonics-dmx/cues/node/loader/EffectLoader'
import { sendToAllWindows, mainRuntimeBroadcaster, hasBrowserWindows } from '../utils/windowUtils'
import { RENDERER_RECEIVE } from '../../shared/ipcChannels'
import { RigChain } from './RigChain'
import { ChainFanout } from './ChainFanout'
import { TestEffectRunner } from './TestEffectRunner'
import { MotionCueSimulator } from './MotionCueSimulator'
import { ListenerLifecycleController } from './ListenerLifecycleController'
import { SenderLifecycleController } from './SenderLifecycleController'
import { ConsoleModeController } from './ConsoleModeController'
import { RegistryInitializer } from './RegistryInitializer'
import { VenueFrameProcessor } from '../../photonics-dmx/controllers/VenueFrameProcessor'
import { readMotionPrefs } from './cueRuntimeDomains'

/**
 * The callbacks the controller collaborators need from their owner. ControllerManager implements
 * this against its own state; a test can implement it with fakes to construct any collaborator
 * without the manager.
 */
export interface ControllerHost {
  getConfig(): ConfigurationManager
  getChainFanout(): ChainFanout
  getRigChains(): RigChain[]
  getDmxLightManager(): DmxLightManager | null
  getEffectsController(): ILightingController | null
  getDmxPublisher(): DmxPublisher | null
  getVenueFrameProcessor(): VenueFrameProcessor
  ensureInitialized(): Promise<void>
  ensureChainsHaveHandlersForSimulation(domain: NetCueMode): void
  setCueHandlerRef(handler: CueHandler | null): void
  setRb3CueHandlerRef(handler: CueHandler | null): void
  getNodeCueLoader(): NodeCueLoader | null
  setNodeCueLoader(loader: NodeCueLoader | null): void
  getEffectLoader(): EffectLoader | null
  setEffectLoader(loader: EffectLoader | null): void
  pushValidationError(error: { source: 'node-cue' | 'effect'; errors: string[] }): void
  refreshAudioCueSelection(): void
  getIsAudioEnabled(): boolean
  pauseYarg(): Promise<void>
  pauseRb3(): Promise<void>
  pauseAudio(): Promise<void>
  refreshActiveRigs(): void
  restartControllers(): Promise<void>
}

/** The collaborators ControllerManager runs on, built by {@link buildControllerCollaborators}. */
export interface ControllerCollaborators {
  senderLifecycle: SenderLifecycleController
  testEffectRunner: TestEffectRunner
  rb3TestEffectRunner: TestEffectRunner
  motionCueSimulator: MotionCueSimulator
  listenerLifecycle: ListenerLifecycleController
  registryInit: RegistryInitializer
  consoleMode: ConsoleModeController
}

/**
 * Build the manager's collaborators against a host. Overrides are honored in construction order,
 * so an overridden collaborator is also the one later collaborators close over (e.g. an injected
 * listener lifecycle is the one the console controller snapshots).
 */
export function buildControllerCollaborators(
  host: ControllerHost,
  overrides: Partial<ControllerCollaborators> = {},
): ControllerCollaborators {
  const senderLifecycle =
    overrides.senderLifecycle ??
    new SenderLifecycleController(() => host.getConfig(), {
      broadcaster: mainRuntimeBroadcaster,
      hasReceivers: hasBrowserWindows,
    })

  const testEffectCtx = {
    getChainFanout: () => host.getChainFanout(),
    ensureInitialized: () => host.ensureInitialized(),
    getVenuePostProcessing: () => host.getVenueFrameProcessor().getVenuePostProcessing(),
  }
  const testEffectRunner =
    overrides.testEffectRunner ??
    new TestEffectRunner(testEffectCtx, {
      ensureHandlers: () => host.ensureChainsHaveHandlersForSimulation('yarg'),
      dispatch: (cue, data) => void host.getChainFanout().handleCue(cue, data),
      stopActiveCue: () => host.getChainFanout().stopActiveCue(),
    })

  // Reused RB3 dispatch surface for the RB3 test-effect runner (the fanout is stable).
  const rb3SimRuntime = new ChainCueRuntime(host.getChainFanout(), 'rb3')
  const rb3TestEffectRunner =
    overrides.rb3TestEffectRunner ??
    new TestEffectRunner(testEffectCtx, {
      ensureHandlers: () => host.ensureChainsHaveHandlersForSimulation('rb3'),
      dispatch: (cue, data) => void rb3SimRuntime.handleCue(cue, data),
      stopActiveCue: () => rb3SimRuntime.stopActiveCue(),
      songEvent: (condition) => rb3SimRuntime.handleSongEvent(condition),
    })

  const motionCueSimulator =
    overrides.motionCueSimulator ??
    new MotionCueSimulator({
      getChainFanout: () => host.getChainFanout(),
    })

  const listenerLifecycle =
    overrides.listenerLifecycle ??
    new ListenerLifecycleController(
      {
        getDmxLightManager: () => host.getDmxLightManager(),
        getEffectsController: () => host.getEffectsController(),
        getRigChains: () => host.getRigChains(),
        getChainFanout: () => host.getChainFanout(),
        getMotionEnabled: () => host.getConfig().getPreference('motionEnabled') ?? true,
        getActiveYargMotionCueRef: () => readMotionPrefs(host.getConfig(), 'yarg').activeCueRef,
        getMotionCueMinimumHoldMs: () => readMotionPrefs(host.getConfig(), 'yarg').minimumHoldMs,
        getMotionCueProbabilityPercent: () =>
          readMotionPrefs(host.getConfig(), 'yarg').probabilityPercent,
        getActiveRb3MotionCueRef: () => readMotionPrefs(host.getConfig(), 'rb3').activeCueRef,
        getRb3MotionCueMinimumHoldMs: () => readMotionPrefs(host.getConfig(), 'rb3').minimumHoldMs,
        getRb3MotionCueProbabilityPercent: () =>
          readMotionPrefs(host.getConfig(), 'rb3').probabilityPercent,
        getRb3MotionCueDurationRangeSec: () => {
          const d = readMotionPrefs(host.getConfig(), 'rb3')
          return { min: d.cueDurationMin, max: d.cueDurationMax }
        },
        getFallbackCueTimeMs: () =>
          host.getConfig().getPreference('yargFallbackCueTimeMs') ?? 20000,
        setVenuePostProcessing: (state) => {
          host.getVenueFrameProcessor().setVenuePostProcessing(state)
        },
        sendSenderError: (message: string) => {
          sendToAllWindows(RENDERER_RECEIVE.SENDER_ERROR, message)
        },
        sendToAllWindows,
        runtimeBroadcaster: mainRuntimeBroadcaster,
        setCueHandlerRef: (h) => host.setCueHandlerRef(h),
        setRb3CueHandlerRef: (h) => host.setRb3CueHandlerRef(h),
        getRb3ProcessingMode: () =>
          normalizeRb3ProcessingMode(host.getConfig().getPreference('rb3Prefs')?.processingMode),
      },
      {
        getDmxLightManager: () => host.getDmxLightManager(),
        getEffectsController: () => host.getEffectsController(),
        getRigChains: () => host.getRigChains(),
        getChainFanout: () => host.getChainFanout(),
        config: host.getConfig(),
        sendToAllWindows,
        runtimeBroadcaster: mainRuntimeBroadcaster,
      },
    )

  const registryInit =
    overrides.registryInit ??
    new RegistryInitializer({
      getConfig: () => host.getConfig(),
      sendToAllWindows,
      pushValidationError: (e) => host.pushValidationError(e),
      refreshAudioCueSelection: () => host.refreshAudioCueSelection(),
      getNodeCueLoader: () => host.getNodeCueLoader(),
      setNodeCueLoader: (l) => host.setNodeCueLoader(l),
      getEffectLoader: () => host.getEffectLoader(),
      setEffectLoader: (l) => host.setEffectLoader(l),
      runtimeBroadcaster: mainRuntimeBroadcaster,
    })

  const consoleMode =
    overrides.consoleMode ??
    new ConsoleModeController({
      getConfig: () => host.getConfig(),
      ensureInitialized: () => host.ensureInitialized(),
      getDmxPublisher: () => host.getDmxPublisher(),
      getListenerSnapshot: () => ({
        yarg: listenerLifecycle.yargRb3.getIsYargEnabled(),
        rb3: listenerLifecycle.yargRb3.getIsRb3Enabled(),
      }),
      getIsAudioEnabled: () => host.getIsAudioEnabled(),
      pauseYarg: () => host.pauseYarg(),
      pauseRb3: () => host.pauseRb3(),
      pauseAudio: () => host.pauseAudio(),
      refreshActiveRigs: () => host.refreshActiveRigs(),
      restartControllers: () => host.restartControllers(),
    })

  return {
    senderLifecycle,
    testEffectRunner,
    rb3TestEffectRunner,
    motionCueSimulator,
    listenerLifecycle,
    registryInit,
    consoleMode,
  }
}
