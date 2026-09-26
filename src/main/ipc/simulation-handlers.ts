import { handleInvoke } from './handleInvoke'
import { IpcMain } from 'electron'
import { ControllerManager } from '../controllers/ControllerManager'
import { CueRegistry } from '../../photonics-dmx/cues/registries/CueRegistry'
import { getCueRegistry } from '../../photonics-dmx/cues/registries/cueRegistries'
import {
  DrumNoteType,
  InstrumentNoteType,
  type CueData,
} from '../../photonics-dmx/cues/types/cueTypes'
import { AudioCueRegistry } from '../../photonics-dmx/cues/registries/AudioCueRegistry'
import { isPostProcessingState } from '../../photonics-dmx/helpers/venuePostProcessing'
import { sendToAllWindows } from '../utils/windowUtils'
import { ipcError } from './ipcResult'
import { createMockAudioCueData, createMockCueData, type MockCueDataOptions } from './mockCueData'
import { sendMotionSimCleared, sendMotionSimStarted } from './motionSimulationEvents'
import { LIGHT, RENDERER_RECEIVE } from '../../shared/ipcChannels'
import { createLogger } from '../../shared/logger'
import {
  isNonEmptyString,
  isPlainObject,
  validateInstrumentNotePayload,
  validateSimulationContextPayload,
  validateTestEffectPayload,
} from './inputValidation'
import type { MotionRuntimeDomain } from '../../shared/ipc/common'
import type { ChainFanout } from '../controllers/ChainFanout'
import type { ILightingController } from '../../photonics-dmx/controllers/sequencer/interfaces'
import type { DmxLightManager } from '../../photonics-dmx/controllers/DmxLightManager'
const log = createLogger('simulation-handlers')

/** A motion cue the simulator can start on a rig chain, whichever platform it belongs to. */
interface SimulatedMotionCue<TData> {
  execute(
    data: TData,
    sequencer: ILightingController,
    lights: DmxLightManager,
  ): void | Promise<void>
}

/**
 * The motion-cue simulation state now lives in a ControllerManager-owned {@link MotionCueSimulator}
 * so it is reset when the controller graph is rebuilt (each cue is still executed once per active rig
 * chain so secondary rigs see the same motion at the same time).
 */

/**
 * Set up simulation and test-effect IPC handlers (beat/keyframe/measure/instrument, test effects, system status, audio cues).
 */
export function setupSimulationHandlers(
  ipcMain: IpcMain,
  controllerManager: ControllerManager,
): void {
  const sim = controllerManager.getMotionCueSimulator()

  const stopMotionSimAndNotify = (): void => {
    sendMotionSimCleared(sim.stop())
  }

  controllerManager.getConsoleModeController().setOnConsoleEnter(stopMotionSimAndNotify)
  // Enabling an input hands it the rig chains. Stop any running simulation with the same teardown,
  // so the renderer's motion-sim state clears too.
  controllerManager.setOnSimulationPreempt(stopMotionSimAndNotify)

  // Every simulated frame reports the venue effect output is actually getting, the same way a real
  // YARG frame does. The publisher holds it, so the preview cannot disagree with the lights.
  const simCueData = (options: MockCueDataOptions = {}): CueData =>
    createMockCueData({
      postProcessing: controllerManager.getVenueFrameProcessor().getVenuePostProcessing(),
      ...options,
    })

  // Simulation dispatches through the same chains a live input drives, so simulation requests are
  // refused while YARG, RB3E or audio is enabled, and while the controllers are held failed.
  const liveInput = (): 'YARG' | 'RB3E' | 'Audio' | null => {
    if (controllerManager.getIsRb3Enabled()) return 'RB3E'
    if (controllerManager.getIsYargEnabled()) return 'YARG'
    return controllerManager.getIsAudioEnabled() ? 'Audio' : null
  }
  const simulationRefusal = (): { success: false; error: string } | null => {
    const live = liveInput()
    if (live) return { success: false, error: `Disable ${live} before simulating cues` }
    return controllerManager.getLifecyclePhase() === 'failed'
      ? { success: false, error: 'Restart the lighting controllers before simulating cues' }
      : null
  }

  handleInvoke(ipcMain, LIGHT.GET_AUDIO_CUE_GROUPS, log, async () => {
    try {
      const registry = AudioCueRegistry.getInstance()
      return registry.getGroupSummaries()
    } catch (error) {
      log.error('Error getting audio cue groups:', error)
      return []
    }
  })

  handleInvoke(ipcMain, LIGHT.GET_AVAILABLE_AUDIO_CUES, log, async (_, groupId?: unknown) => {
    try {
      const registry = AudioCueRegistry.getInstance()
      const resolvedGroupId = typeof groupId === 'string' ? groupId : undefined
      const targetGroupId =
        resolvedGroupId || registry.getDefaultGroupId() || registry.getEnabledGroups()[0]
      if (!targetGroupId) return []
      return registry.getCueDetails(targetGroupId)
    } catch (error) {
      log.error('Error getting available audio cues:', error)
      return []
    }
  })

  handleInvoke(ipcMain, LIGHT.START_TEST_EFFECT, log, async (_, data: unknown) => {
    try {
      const refused = simulationRefusal()
      if (refused) return refused
      const request = validateTestEffectPayload(data)
      if (!request.ok) {
        return { success: false, error: request.error }
      }
      const { effectId, venueSize, bpm, cueGroup } = request.value
      log.info(
        `IPC start-test-effect called with effectId: ${effectId}, venueSize: ${venueSize}, BPM: ${bpm}, cueGroup: ${cueGroup ?? 'none'}`,
      )
      if (!controllerManager.getIsInitialized()) {
        log.info('System not initialized, initializing now before testing effect')
        await controllerManager.init()
      }
      const runner = controllerManager.getTestEffectRunner('yarg')
      runner.startTestEffect(effectId, venueSize, bpm, cueGroup)
      return { success: true }
    } catch (error) {
      log.error('Error starting test effect:', error)
      return ipcError(error)
    }
  })

  // RB3 twin of START_TEST_EFFECT: dispatches the selected RB3 cue through the RB3 chain runtime
  // (own registry / rb3CueHandler slots) rather than the YARG test-effect runner. The runner
  // re-dispatches on an interval so a held strobe re-fires `cue-called` continuously (a single
  // dispatch would flash once). Firing is refused while the live RB3E listener owns the rig chains
  // (same guard as every simulate handler).
  handleInvoke(ipcMain, LIGHT.START_RB3_TEST_EFFECT, log, async (_, data: unknown) => {
    try {
      const refused = simulationRefusal()
      if (refused) return refused
      const request = validateTestEffectPayload(data)
      if (!request.ok) {
        return { success: false, error: request.error }
      }
      const { effectId, venueSize, bpm, cueGroup } = request.value
      const runner = controllerManager.getTestEffectRunner('rb3')
      runner.startTestEffect(effectId, venueSize, bpm, cueGroup)
      return { success: true }
    } catch (error) {
      log.error('Error starting RB3 test effect:', error)
      return ipcError(error)
    }
  })

  handleInvoke(ipcMain, LIGHT.SET_RB3_SIM_LED_STATE, log, async (_, data: unknown) => {
    try {
      const refused = simulationRefusal()
      if (refused) return refused
      // Clamp each bank to a valid 8-bit mask, reading non-numeric input as 0.
      const mask = (v: unknown): number => {
        const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : 0
        return Math.max(0, Math.min(255, n))
      }
      const banks = isPlainObject(data) ? data : {}
      controllerManager.getTestEffectRunner('rb3').setRb3LedState({
        red: mask(banks.red),
        green: mask(banks.green),
        blue: mask(banks.blue),
        yellow: mask(banks.yellow),
        fog: banks.fog === true,
      })
      return { success: true }
    } catch (error) {
      log.error('Error setting RB3 simulation LED state:', error)
      return ipcError(error)
    }
  })

  handleInvoke(ipcMain, LIGHT.STOP_TEST_EFFECT, log, async () => {
    try {
      await controllerManager.stopTestEffect()
      return true
    } catch (error) {
      log.error('Error stopping test effect:', error)
      return false
    }
  })

  // Drives the same publisher state the YARG listener feeds, so a real packet arriving later
  // simply takes over.
  handleInvoke(ipcMain, LIGHT.SIMULATE_POST_PROCESSING, log, async (_, data: unknown) => {
    if (simulationRefusal() || !controllerManager.getIsInitialized()) return false
    const state = isPlainObject(data) ? data.state : undefined
    if (!isPostProcessingState(state)) {
      log.warn(`Ignoring unknown post-processing state: ${String(state)}`)
      return false
    }
    controllerManager.getVenueFrameProcessor().setVenuePostProcessing(state)
    return true
  })

  /** The timing events the simulate buttons fire, and what each tells the chains. */
  const SIMULATED_TIMING = [
    {
      channel: LIGHT.SIMULATE_BEAT,
      beat: 'Strong',
      keyframe: 'Unknown',
      what: 'beat',
      fire: (fanout) => fanout.onBeat(),
    },
    {
      channel: LIGHT.SIMULATE_KEYFRAME,
      beat: 'Unknown',
      keyframe: 'Next',
      what: 'keyframe',
      fire: (fanout) => fanout.onKeyframe(),
    },
    {
      channel: LIGHT.SIMULATE_MEASURE,
      beat: 'Measure',
      keyframe: 'Unknown',
      what: 'measure',
      fire: (fanout) => fanout.onMeasure(),
    },
  ] as const satisfies ReadonlyArray<
    MockCueDataOptions & { channel: string; what: string; fire: (fanout: ChainFanout) => void }
  >

  for (const timing of SIMULATED_TIMING) {
    handleInvoke(
      ipcMain,
      timing.channel,
      log,
      // Answers true once the event fired and false for anything else, a throw included, since the
      // renderer reads the answer as a boolean.
      async (_, data: unknown) => {
        if (simulationRefusal() || !controllerManager.getIsInitialized()) return false
        const context = validateSimulationContextPayload(data)
        if (!context.ok) {
          log.warn(`Refusing a simulated ${timing.what}: ${context.error}`)
          return false
        }
        const request = context.value
        try {
          // Make sure every chain has a YARG handler so the fanout `handleCue` actually
          // reaches secondary rigs even when no real network listener has run.
          controllerManager.ensureChainsHaveHandlersForSimulation('yarg')
          const fanout = controllerManager.getChainFanout()

          const mockCueData = simCueData({
            ...(data !== undefined && {
              venueSize: request.venueSize ?? 'Small',
              bpm: request.bpm ?? 120,
              effectId: request.effectId,
              simulationCueGroup: request.cueGroup,
            }),
            beat: timing.beat,
            keyframe: timing.keyframe,
          })

          if (request.effectId) {
            try {
              await fanout.handleCue(request.effectId, mockCueData)
            } catch (error) {
              log.error(`Error handling cue in simulate ${timing.what}:`, error)
            }
          }
          sendToAllWindows(RENDERER_RECEIVE.CUE_HANDLED, mockCueData)
          await sim.runAll(mockCueData)
          timing.fire(fanout)
          return true
        } catch (error) {
          log.error(`Error simulating a ${timing.what}:`, error)
          return false
        }
      },
    )
  }

  handleInvoke(ipcMain, LIGHT.SIMULATE_INSTRUMENT_NOTE, log, async (_, data: unknown) => {
    try {
      const payload = validateInstrumentNotePayload(data)
      if (!payload.ok) {
        return { success: false, error: payload.error }
      }
      const { instrument, noteType, venueSize = 'Small', bpm = 120, cueGroup } = payload.value
      const effectId = payload.value.effectId
      const refused = simulationRefusal()
      if (refused) return refused
      if (!controllerManager.getIsInitialized()) {
        return { success: false, error: 'Lighting system not initialized' }
      }
      controllerManager.ensureChainsHaveHandlersForSimulation('yarg')
      const fanout = controllerManager.getChainFanout()

      const mockCueData = simCueData({
        venueSize,
        bpm,
        effectId: effectId ?? undefined,
        beat: 'Unknown',
        keyframe: 'Unknown',
        simulationCueGroup: cueGroup,
      })
      switch (instrument) {
        case 'guitar': {
          const normalizedNote = String(noteType) as InstrumentNoteType
          mockCueData.guitarNotes = [normalizedNote]
          fanout.handleGuitarNote(normalizedNote, mockCueData)
          break
        }
        case 'bass': {
          const normalizedNote = String(noteType) as InstrumentNoteType
          mockCueData.bassNotes = [normalizedNote]
          fanout.handleBassNote(normalizedNote, mockCueData)
          break
        }
        case 'keys': {
          const normalizedNote = String(noteType) as InstrumentNoteType
          mockCueData.keysNotes = [normalizedNote]
          fanout.handleKeysNote(normalizedNote, mockCueData)
          break
        }
        case 'drums': {
          const normalizedNote = String(noteType) as DrumNoteType
          mockCueData.drumNotes = [normalizedNote]
          fanout.handleDrumNote(normalizedNote, mockCueData)
          break
        }
        default:
          log.warn(`Unknown instrument: ${instrument}`)
          return { success: false, error: `Unknown instrument: ${instrument}` }
      }

      // Run the current test cue with CueData that includes the note so the node graph
      // runs the instrument-event branch (e.g. drum-red).
      if (effectId && cueGroup) {
        await fanout.handleCue(effectId, mockCueData)
      }

      sendToAllWindows(RENDERER_RECEIVE.CUE_HANDLED, mockCueData)
      return { success: true }
    } catch (error) {
      log.error('Error simulating instrument note:', error)
      return ipcError(error)
    }
  })

  /**
   * Starts one motion cue on every rig chain, for any platform: checks the payload, finds the cue
   * in the platform's registry, clears the running simulation and runs the cue once per chain.
   */
  async function startMotionSimulation<TData, TCue extends SimulatedMotionCue<TData>>(
    data: unknown,
    domain: MotionRuntimeDomain,
    label: string,
    findGroup: (groupId: string) => { motionCues?: Map<string, TCue> } | undefined,
    cueDataFor: (groupId: string) => TData,
    remember: (cue: TCue) => void,
  ) {
    const refused = simulationRefusal()
    if (refused) return refused
    if (!isPlainObject(data)) {
      return ipcError(new Error('Invalid motion simulation payload'))
    }
    const groupId = data.groupId
    const cueId = data.cueId
    if (!isNonEmptyString(groupId) || !isNonEmptyString(cueId)) {
      return ipcError(new Error('groupId and cueId are required'))
    }
    if (!controllerManager.getIsInitialized()) {
      await controllerManager.init()
    }
    const fanout = controllerManager.getChainFanout()
    if (fanout.getChains().length === 0) {
      return ipcError(new Error('Lighting system not available'))
    }
    const group = findGroup(groupId)
    if (!group) {
      return ipcError(new Error(`${label} motion group not found: ${groupId}`))
    }
    const cue = group.motionCues?.get(cueId)
    if (!cue) {
      return ipcError(new Error(`${label} motion cue not found: ${groupId}/${cueId}`))
    }
    sendMotionSimCleared(sim.clearActive())
    // Cancel pending pan/tilt clears on every chain, so a secondary rig does not clear pan/tilt
    // mid-motion after the previous simulation stopped.
    fanout.cancelPanTiltClear()
    const cueData = cueDataFor(groupId)
    // The cue instance is shared, and each chain's call binds a per-sequencer engine internally.
    for (const chain of fanout.getChains()) {
      await cue.execute(cueData, chain.sequencer, chain.dmxLightManager)
    }
    remember(cue)
    sendMotionSimStarted(domain, { groupId, cueId })
    return { success: true as const }
  }

  const netMotionCueData = (groupId: string): CueData =>
    simCueData({ venueSize: 'Small', bpm: 120, simulationCueGroup: groupId })

  handleInvoke(ipcMain, LIGHT.START_YARG_MOTION_CUE_SIMULATION, log, (_, data: unknown) =>
    startMotionSimulation(
      data,
      'yarg',
      'YARG',
      (groupId) => CueRegistry.getInstance().getGroup(groupId),
      netMotionCueData,
      (cue) => sim.setNetCue('yarg', cue),
    ),
  )

  // RB3 motion has no beat to re-run on, so the one start drives its time-based motion.
  handleInvoke(ipcMain, LIGHT.START_RB3_MOTION_CUE_SIMULATION, log, (_, data: unknown) =>
    startMotionSimulation(
      data,
      'rb3',
      'RB3',
      (groupId) => getCueRegistry('rb3').getGroup(groupId),
      netMotionCueData,
      (cue) => sim.setNetCue('rb3', cue),
    ),
  )

  handleInvoke(ipcMain, LIGHT.START_AUDIO_MOTION_CUE_SIMULATION, log, (_, data: unknown) =>
    startMotionSimulation(
      data,
      'audio',
      'Audio',
      (groupId) => AudioCueRegistry.getInstance().getGroup(groupId),
      () => createMockAudioCueData(1),
      (cue) => sim.setAudioCue(cue),
    ),
  )

  handleInvoke(ipcMain, LIGHT.STOP_MOTION_CUE_SIMULATION, log, async () => {
    sendMotionSimCleared(sim.stop())
    return { success: true as const }
  })

  handleInvoke(ipcMain, LIGHT.GET_SYSTEM_STATUS, log, async () => {
    return {
      success: true,
      isYargEnabled: controllerManager.getIsYargEnabled(),
      isRb3Enabled: controllerManager.getIsRb3Enabled(),
      senderStatus: controllerManager.getSenderLifecycle().getOutputSenderStatus(),
    }
  })
}
